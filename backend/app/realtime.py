import asyncio
from datetime import datetime, timezone
import json
import secrets
from http.cookies import SimpleCookie
from typing import Any

import jwt
import socketio
from jwt import InvalidTokenError
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings
from app.models.call import CallRecord
from app.models.user import User

settings = get_settings()
sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins=[])
user_sids: dict[str, set[str]] = {}
sid_users: dict[str, str] = {}
active_calls: dict[str, dict[str, Any]] = {}
user_calls: dict[str, str] = {}
db_session_factory: sessionmaker[Session] | None = None
RING_TIMEOUT_SECONDS = 30


def _session_factory() -> sessionmaker[Session]:
    if db_session_factory is None:
        raise RuntimeError("Socket.IO database session factory is not configured.")
    return db_session_factory


def _cookie_from_environ(environ: dict[str, Any]) -> str | None:
    scope = environ.get("asgi.scope", {})
    headers = dict(scope.get("headers", []))
    cookie_header = headers.get(b"cookie", b"").decode("latin-1")
    cookies = SimpleCookie()
    cookies.load(cookie_header)
    morsel = cookies.get(settings.session_cookie_name)
    return morsel.value if morsel else None


def _authenticated_user_id(
    environ: dict[str, Any],
    auth: dict[str, Any] | None = None,
) -> str | None:
    token = auth.get("token") if isinstance(auth, dict) else None
    if not isinstance(token, str) or not token:
        token = _cookie_from_environ(environ)
    if not token:
        return None
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
    except InvalidTokenError:
        return None
    user_id = payload.get("sub")
    return user_id if isinstance(user_id, str) else None


def _finish_record(call: dict[str, Any], status: str) -> None:
    now = datetime.now(timezone.utc)
    with _session_factory()() as db:
        record = db.scalar(select(CallRecord).where(CallRecord.call_id == call["call_id"]))
        if record is None:
            raise RuntimeError("Call history record could not be found.")
        record.status = status
        record.ended_at = now
        if call["started_at"] is not None:
            record.duration_seconds = max(
                0,
                int((now - call["started_at"]).total_seconds()),
            )
        db.commit()


def _release_call(call_id: str) -> dict[str, Any] | None:
    call = active_calls.pop(call_id, None)
    if call is None:
        return None
    for participant in (call["caller_user_id"], call["receiver_user_id"]):
        if user_calls.get(participant) == call_id:
            user_calls.pop(participant, None)
    timeout_task = call.get("timeout_task")
    try:
        current_task = asyncio.current_task()
    except RuntimeError:
        current_task = None
    if timeout_task and timeout_task is not current_task:
        timeout_task.cancel()
    return call


def _call_id_from_data(data: Any) -> str | None:
    if not isinstance(data, dict):
        return None
    call_id = data.get("call_id")
    return call_id if isinstance(call_id, str) else None


async def _expire_call(call_id: str) -> None:
    await asyncio.sleep(RING_TIMEOUT_SECONDS)
    call = active_calls.get(call_id)
    if call is None or call["status"] != "ringing":
        return
    _finish_record(call, "missed")
    _release_call(call_id)
    await _notify_participants(
        call,
        "call:ended",
        {"call_id": call_id, "status": "missed", "reason": "no_answer"},
    )


async def _notify_participants(
    call: dict[str, Any],
    event: str,
    data: dict[str, Any],
) -> None:
    for participant in (call["caller_user_id"], call["receiver_user_id"]):
        for sid in list(user_sids.get(participant, set())):
            await sio.emit(event, data, to=sid)


@sio.event
async def connect(sid: str, environ: dict[str, Any], auth: dict[str, Any] | None = None):
    user_id = _authenticated_user_id(environ, auth)
    if user_id is None:
        return False
    with _session_factory()() as db:
        user = db.scalar(select(User).where(User.user_id == user_id))
        if user is None:
            return False
    sid_users[sid] = user_id
    user_sids.setdefault(user_id, set()).add(sid)
    for online_user_id in list(user_sids):
        if online_user_id != user_id:
            await sio.emit(
                "presence:update",
                {"user_id": online_user_id, "online": True},
                to=sid,
            )
    await sio.emit("presence:update", {"user_id": user_id, "online": True})


@sio.event
async def disconnect(sid: str, reason: str | None = None):
    user_id = sid_users.pop(sid, None)
    if user_id is None:
        return
    user_sids.get(user_id, set()).discard(sid)
    if not user_sids.get(user_id):
        user_sids.pop(user_id, None)
        await sio.emit("presence:update", {"user_id": user_id, "online": False})

    call_id = user_calls.get(user_id)
    call = active_calls.get(call_id) if call_id else None
    if call is None or sid not in (call["caller_sid"], call.get("receiver_sid")):
        return
    final_status = "missed" if call["status"] == "ringing" else "accepted"
    _finish_record(call, final_status)
    _release_call(call_id)
    await _notify_participants(
        call,
        "call:ended",
        {"call_id": call_id, "status": final_status, "reason": "disconnected"},
    )


@sio.on("call:invite")
async def invite_call(sid: str, data: dict[str, Any]):
    caller_user_id = sid_users.get(sid)
    if caller_user_id is None:
        return {"error": "Authentication required."}
    if not isinstance(data, dict):
        return {"error": "Invalid call request."}
    receiver_user_id = str(data.get("target_user_id", "")).strip().upper()
    call_type = data.get("call_type")
    if call_type != "voice":
        return {"error": "Only voice calls are currently supported."}
    if receiver_user_id == caller_user_id:
        return {"error": "You cannot call your own account."}
    if receiver_user_id not in user_sids:
        return {"error": "This user is offline."}
    if caller_user_id in user_calls or receiver_user_id in user_calls:
        return {"error": "One of the users is already in a call."}

    with _session_factory()() as db:
        receiver = db.scalar(
            select(User).where(User.user_id == receiver_user_id)
        )
        caller = db.scalar(select(User).where(User.user_id == caller_user_id))
        if receiver is None or caller is None:
            return {"error": "The selected user could not be found."}
        call_id = secrets.token_hex(12)
        call = {
            "call_id": call_id,
            "caller_user_id": caller_user_id,
            "receiver_user_id": receiver_user_id,
            "call_type": call_type,
            "status": "ringing",
            "started_at": None,
            "caller_sid": sid,
            "receiver_sid": None,
            "ready_users": set(),
        }
        db.add(
            CallRecord(
                call_id=call_id,
                caller_user_id=caller_user_id,
                receiver_user_id=receiver_user_id,
                call_type=call_type,
                status="ringing",
            )
        )
        db.commit()

    active_calls[call_id] = call
    user_calls[caller_user_id] = call_id
    user_calls[receiver_user_id] = call_id
    call["timeout_task"] = asyncio.create_task(_expire_call(call_id))
    await sio.enter_room(sid, f"call:{call_id}")
    await _notify_user(
        receiver_user_id,
        "call:incoming",
        {
            "call_id": call_id,
            "call_type": call_type,
            "caller": {
                "user_id": caller.user_id,
                "full_name": caller.full_name,
                "profile_picture_url": caller.profile_picture_url,
            },
        },
    )
    return {"call_id": call_id}


async def _notify_user(user_id: str, event: str, data: dict[str, Any]) -> None:
    for sid in list(user_sids.get(user_id, set())):
        await sio.emit(event, data, to=sid)


@sio.on("call:accept")
async def accept_call(sid: str, data: dict[str, Any]):
    user_id = sid_users.get(sid)
    call_id = _call_id_from_data(data)
    call = active_calls.get(call_id)
    if (
        user_id is None
        or call is None
        or user_id != call["receiver_user_id"]
        or call["status"] != "ringing"
    ):
        return {"error": "This call is no longer available."}
    call["status"] = "accepted"
    call["started_at"] = datetime.now(timezone.utc)
    call["receiver_sid"] = sid
    with _session_factory()() as db:
        record = db.scalar(select(CallRecord).where(CallRecord.call_id == call_id))
        if record is None:
            raise RuntimeError("Call history record could not be found.")
        record.status = "accepted"
        record.started_at = call["started_at"]
        db.commit()
    await sio.enter_room(sid, f"call:{call_id}")
    await _notify_user(
        call["caller_user_id"],
        "call:accepted",
        {
            "call_id": call_id,
            "call_type": call["call_type"],
            "started_at": call["started_at"].isoformat(),
        },
    )
    return {
        "ok": True,
        "call_id": call_id,
        "started_at": call["started_at"].isoformat(),
    }


@sio.on("call:reject")
async def reject_call(sid: str, data: dict[str, Any]):
    user_id = sid_users.get(sid)
    call_id = _call_id_from_data(data)
    call = active_calls.get(call_id)
    if (
        user_id is None
        or call is None
        or user_id != call["receiver_user_id"]
        or call["status"] != "ringing"
    ):
        return {"error": "This call is no longer available."}
    _finish_record(call, "rejected")
    _release_call(call_id)
    await _notify_participants(
        call,
        "call:rejected",
        {"call_id": call_id, "status": "rejected"},
    )
    return {"ok": True}


@sio.on("call:end")
async def end_call(sid: str, data: dict[str, Any]):
    user_id = sid_users.get(sid)
    call_id = _call_id_from_data(data)
    call = active_calls.get(call_id)
    if user_id is None or call is None or user_id not in (
        call["caller_user_id"],
        call["receiver_user_id"],
    ):
        return {"error": "This call is no longer available."}
    final_status = "missed" if call["status"] == "ringing" else "accepted"
    _finish_record(call, final_status)
    _release_call(call_id)
    await _notify_participants(
        call,
        "call:ended",
        {"call_id": call_id, "status": final_status, "reason": "ended"},
    )
    return {"ok": True}


@sio.on("call:ready")
async def peer_ready(sid: str, data: dict[str, Any]):
    user_id = sid_users.get(sid)
    call_id = _call_id_from_data(data)
    call = active_calls.get(call_id)
    if (
        user_id is None
        or call is None
        or call["status"] != "accepted"
        or user_id not in (call["caller_user_id"], call["receiver_user_id"])
    ):
        return {"error": "This call is no longer available."}
    call["ready_users"].add(user_id)
    if {
        call["caller_user_id"],
        call["receiver_user_id"],
    }.issubset(call["ready_users"]):
        await _notify_user(
            call["caller_user_id"],
            "call:peer-ready",
            {"call_id": call_id},
        )
    return {"ok": True}


@sio.on("call:signal")
async def relay_signal(sid: str, data: dict[str, Any]):
    user_id = sid_users.get(sid)
    call_id = _call_id_from_data(data)
    signal = data.get("signal") if isinstance(data, dict) else None
    call = active_calls.get(call_id)
    if (
        user_id is None
        or call is None
        or call["status"] != "accepted"
        or user_id not in (call["caller_user_id"], call["receiver_user_id"])
    ):
        return {"error": "This call is no longer available."}
    if not isinstance(signal, dict) or len(json.dumps(signal)) > 200_000:
        return {"error": "Invalid call signaling data."}
    target_user_id = (
        call["receiver_user_id"]
        if user_id == call["caller_user_id"]
        else call["caller_user_id"]
    )
    await _notify_user(
        target_user_id,
        "call:signal",
        {"call_id": call_id, "signal": signal},
    )
    return {"ok": True}


def create_socket_app(api_app):
    global db_session_factory
    db_session_factory = api_app.state.session_factory
    return socketio.ASGIApp(sio, other_asgi_app=api_app)
