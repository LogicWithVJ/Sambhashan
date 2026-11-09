import asyncio
import socket
import threading
import time
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
from sqlalchemy import select
import socketio
import uvicorn

import app.realtime as realtime
from app.main import create_app
from app.models.call import CallRecord
from app.models.user import User


def make_client(tmp_path):
    database_path = (tmp_path / "calls.db").as_posix()
    return TestClient(create_app(f"sqlite:///{database_path}"))


def register(client: TestClient, full_name: str, mobile_number: str) -> str:
    response = client.post(
        "/api/auth/register",
        json={
            "full_name": full_name,
            "mobile_number": mobile_number,
            "password": "a-strong-password",
        },
    )
    assert response.status_code == 201
    return response.json()["user_id"]


def test_call_signaling_persists_history_for_participants(tmp_path):
    with make_client(tmp_path) as client:
        caller_id = register(client, "Caller Example", "+12025550198")
        receiver_id = register(client, "Receiver Example", "+14155550132")
        assert client.post(
            "/api/auth/login",
            json={"identifier": caller_id, "password": "a-strong-password"},
        ).status_code == 200

        realtime.db_session_factory = client.app.state.session_factory
        realtime.sid_users.update({"caller-sid": caller_id, "receiver-sid": receiver_id})
        realtime.user_sids.update(
            {caller_id: {"caller-sid"}, receiver_id: {"receiver-sid"}}
        )
        with patch.object(realtime.sio, "enter_room", new_callable=AsyncMock):
            try:
                invite = asyncio.run(
                    realtime.invite_call(
                        "caller-sid",
                        {"target_user_id": receiver_id, "call_type": "voice"},
                    )
                )
                assert "call_id" in invite
                call_id = invite["call_id"]

                accepted = asyncio.run(
                    realtime.accept_call("receiver-sid", {"call_id": call_id})
                )
                assert accepted["ok"] is True
                assert asyncio.run(
                    realtime.relay_signal(
                        "caller-sid",
                        {
                            "call_id": call_id,
                            "signal": {
                                "type": "description",
                                "description": {"type": "offer"},
                            },
                        },
                    )
                ) == {"ok": True}
                assert asyncio.run(
                    realtime.end_call("receiver-sid", {"call_id": call_id})
                ) == {"ok": True}

                history = client.get("/api/calls/history")
                assert history.status_code == 200
                assert len(history.json()) == 1
                assert history.json()[0]["call_id"] == call_id
                assert history.json()[0]["status"] == "accepted"
                assert history.json()[0]["call_type"] == "voice"

                with client.app.state.session_factory() as db:
                    record = db.scalar(
                        select(CallRecord).where(CallRecord.call_id == call_id)
                    )
                    assert record is not None
                    assert record.caller_user_id == caller_id
                    assert record.receiver_user_id == receiver_id
                    assert record.started_at is not None
                    assert record.ended_at is not None
            finally:
                for call_id in list(realtime.active_calls):
                    realtime._release_call(call_id)
                realtime.sid_users.pop("caller-sid", None)
                realtime.sid_users.pop("receiver-sid", None)
                realtime.user_sids.pop(caller_id, None)
                realtime.user_sids.pop(receiver_id, None)


def test_call_history_does_not_show_an_unrelated_user_calls(tmp_path):
    with make_client(tmp_path) as client:
        caller_id = register(client, "Caller Example", "+12025550198")
        receiver_id = register(client, "Receiver Example", "+14155550132")
        outsider_id = register(client, "Other Example", "+16175550120")

        with client.app.state.session_factory() as db:
            db.add(
                CallRecord(
                    call_id="history-call-id",
                    caller_user_id=caller_id,
                    receiver_user_id=receiver_id,
                    call_type="voice",
                    status="missed",
                )
            )
            db.commit()

        client.post(
            "/api/auth/login",
            json={"identifier": outsider_id, "password": "a-strong-password"},
        )
        assert client.get("/api/calls/history").json() == []


def test_rejected_call_is_saved_in_history(tmp_path):
    with make_client(tmp_path) as client:
        caller_id = register(client, "Caller Example", "+12025550198")
        receiver_id = register(client, "Receiver Example", "+14155550132")
        client.post(
            "/api/auth/login",
            json={"identifier": caller_id, "password": "a-strong-password"},
        )
        realtime.db_session_factory = client.app.state.session_factory
        realtime.sid_users.update({"caller-sid": caller_id, "receiver-sid": receiver_id})
        realtime.user_sids.update(
            {caller_id: {"caller-sid"}, receiver_id: {"receiver-sid"}}
        )
        with patch.object(realtime.sio, "enter_room", new_callable=AsyncMock):
            try:
                invite = asyncio.run(
                    realtime.invite_call(
                        "caller-sid",
                        {"target_user_id": receiver_id, "call_type": "voice"},
                    )
                )
                response = asyncio.run(
                    realtime.reject_call(
                        "receiver-sid",
                        {"call_id": invite["call_id"]},
                    )
                )
                assert response["ok"] is True
                history = client.get("/api/calls/history").json()
                assert history[0]["status"] == "rejected"
                assert history[0]["ended_at"] is not None
            finally:
                for call_id in list(realtime.active_calls):
                    realtime._release_call(call_id)
                realtime.sid_users.pop("caller-sid", None)
                realtime.sid_users.pop("receiver-sid", None)
                realtime.user_sids.pop(caller_id, None)
                realtime.user_sids.pop(receiver_id, None)


def test_video_call_invites_are_rejected(tmp_path):
    with make_client(tmp_path) as client:
        caller_id = register(client, "Caller Example", "+12025550198")
        receiver_id = register(client, "Receiver Example", "+14155550132")
        realtime.db_session_factory = client.app.state.session_factory
        realtime.sid_users["caller-sid"] = caller_id
        realtime.user_sids[receiver_id] = {"receiver-sid"}
        try:
            response = asyncio.run(
                realtime.invite_call(
                    "caller-sid",
                    {"target_user_id": receiver_id, "call_type": "video"},
                )
            )
            assert response == {"error": "Only voice calls are currently supported."}
            assert realtime.active_calls == {}
        finally:
            realtime.sid_users.pop("caller-sid", None)
            realtime.user_sids.pop(receiver_id, None)


def test_authenticated_socket_clients_can_signal_a_call(tmp_path):
    database_path = (tmp_path / "socket-calls.db").as_posix()
    api_app = create_app(f"sqlite:///{database_path}")
    asgi_app = realtime.create_socket_app(api_app)
    with TestClient(api_app) as caller_client, TestClient(api_app) as receiver_client:
        caller_id = register(caller_client, "Caller Example", "+12025550198")
        receiver_id = register(receiver_client, "Receiver Example", "+14155550132")
        caller_client.post(
            "/api/auth/login",
            json={"identifier": caller_id, "password": "a-strong-password"},
        )
        receiver_client.post(
            "/api/auth/login",
            json={"identifier": receiver_id, "password": "a-strong-password"},
        )
        caller_token = caller_client.post(
            "/api/auth/mobile-login",
            json={"identifier": caller_id, "password": "a-strong-password"},
        ).json()["access_token"]
        receiver_token = receiver_client.post(
            "/api/auth/mobile-login",
            json={"identifier": receiver_id, "password": "a-strong-password"},
        ).json()["access_token"]

    with socket.socket() as available_port:
        available_port.bind(("127.0.0.1", 0))
        port = available_port.getsockname()[1]
    server = uvicorn.Server(
        uvicorn.Config(
            asgi_app,
            host="127.0.0.1",
            port=port,
            log_level="error",
            access_log=False,
            lifespan="off",
        )
    )
    server_thread = threading.Thread(target=server.run, daemon=True)
    server_thread.start()
    try:
        deadline = time.monotonic() + 10
        while not server.started and server_thread.is_alive() and time.monotonic() < deadline:
            time.sleep(0.05)
        assert server.started, "Socket.IO test server failed to start."

        async def exercise_call():
            unauthenticated = socketio.AsyncClient()
            try:
                await unauthenticated.connect(
                    f"http://127.0.0.1:{port}",
                    transports=["websocket"],
                )
            except socketio.exceptions.ConnectionError:
                pass
            else:
                raise AssertionError("An unauthenticated Socket.IO client connected.")
            finally:
                if unauthenticated.connected:
                    await unauthenticated.disconnect()

            caller = socketio.AsyncClient()
            receiver = socketio.AsyncClient()
            events = {}
            for event_name in ("call:incoming", "call:signal", "call:accepted", "call:peer-ready", "call:ended"):
                events[event_name] = asyncio.Event()

            @receiver.on("call:incoming")
            async def incoming_event(_data):
                events["call:incoming"].set()

            @caller.on("call:accepted")
            async def accepted_event(_data):
                events["call:accepted"].set()

            @caller.on("call:peer-ready")
            async def peer_ready_event(_data):
                events["call:peer-ready"].set()

            @receiver.on("call:signal")
            async def signal_event(_data):
                events["call:signal"].set()

            @caller.on("call:ended")
            async def ended_event(_data):
                events["call:ended"].set()

            await caller.connect(
                f"http://127.0.0.1:{port}",
                auth={"token": caller_token},
                transports=["websocket"],
            )
            await receiver.connect(
                f"http://127.0.0.1:{port}",
                auth={"token": receiver_token},
                transports=["websocket"],
            )
            invite = await caller.call(
                "call:invite",
                {"target_user_id": receiver_id, "call_type": "voice"},
                timeout=5,
            )
            assert invite["call_id"]
            await asyncio.wait_for(events["call:incoming"].wait(), timeout=5)

            call_id = invite["call_id"]
            accepted = await receiver.call("call:accept", {"call_id": call_id}, timeout=5)
            assert accepted["ok"] is True
            await asyncio.wait_for(events["call:accepted"].wait(), timeout=5)

            assert (await caller.call("call:ready", {"call_id": call_id}, timeout=5))["ok"]
            assert (await receiver.call("call:ready", {"call_id": call_id}, timeout=5))["ok"]
            await asyncio.wait_for(events["call:peer-ready"].wait(), timeout=5)
            assert (
                await caller.call(
                    "call:signal",
                    {"call_id": call_id, "signal": {"type": "offer"}},
                    timeout=5,
                )
            )["ok"]
            await asyncio.wait_for(events["call:signal"].wait(), timeout=5)
            assert (await receiver.call("call:end", {"call_id": call_id}, timeout=5))["ok"]
            await asyncio.wait_for(events["call:ended"].wait(), timeout=5)
            await caller.disconnect()
            await receiver.disconnect()

        asyncio.run(exercise_call())
    finally:
        server.should_exit = True
        server_thread.join(timeout=10)
