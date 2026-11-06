from fastapi.testclient import TestClient

from app.main import create_app


def make_client(tmp_path):
    database_path = (tmp_path / "test.db").as_posix()
    return TestClient(create_app(f"sqlite:///{database_path}"))


def register(client: TestClient, mobile_number: str = "+1 (202) 555-0198") -> str:
    response = client.post(
        "/api/auth/register",
        json={
            "full_name": "Avery Example",
            "mobile_number": mobile_number,
            "password": "a-strong-password",
        },
    )
    assert response.status_code == 201
    return response.json()["user_id"]


def test_registration_generates_user_id_and_keeps_email_optional(tmp_path):
    with make_client(tmp_path) as client:
        user_id = register(client)
        assert user_id.startswith("LC")
        assert len(user_id) == 12


def test_login_works_with_mobile_and_user_id_and_protects_me(tmp_path):
    with make_client(tmp_path) as client:
        user_id = register(client)

        mobile_login = client.post(
            "/api/auth/login",
            json={"identifier": "+12025550198", "password": "a-strong-password"},
        )
        assert mobile_login.status_code == 200
        assert mobile_login.json()["user_id"] == user_id
        assert client.get("/api/auth/me").status_code == 200

        client.post("/api/auth/logout")
        user_id_login = client.post(
            "/api/auth/login",
            json={"identifier": user_id.lower(), "password": "a-strong-password"},
        )
        assert user_id_login.status_code == 200


def test_duplicate_mobile_and_incorrect_password_are_rejected(tmp_path):
    with make_client(tmp_path) as client:
        register(client)

        duplicate = client.post(
            "/api/auth/register",
            json={
                "full_name": "Another Example",
                "mobile_number": "12025550198",
                "password": "another-strong-password",
            },
        )
        assert duplicate.status_code == 409

        incorrect = client.post(
            "/api/auth/login",
            json={"identifier": "+12025550198", "password": "not-the-password"},
        )
        assert incorrect.status_code == 401


def test_protected_endpoint_requires_authentication(tmp_path):
    with make_client(tmp_path) as client:
        response = client.get("/api/auth/me")
        assert response.status_code == 401


def test_profile_can_be_viewed_and_edited_without_exposing_other_users(tmp_path):
    with make_client(tmp_path) as client:
        register(client)
        assert client.post(
            "/api/auth/login",
            json={"identifier": "+12025550198", "password": "a-strong-password"},
        ).status_code == 200

        updated = client.patch(
            "/api/auth/profile",
            json={
                "full_name": "Avery Updated",
                "email": "avery@example.com",
                "preferred_language": "Hindi",
                "country": "India",
                "profile_picture_url": "https://example.com/avatar.png",
            },
        )
        assert updated.status_code == 200
        assert updated.json()["full_name"] == "Avery Updated"
        assert updated.json()["preferred_language"] == "Hindi"
        assert updated.json()["country"] == "India"
        assert updated.json()["mobile_number"] == "+12025550198"

        profile = client.get("/api/auth/profile")
        assert profile.json()["email"] == "avery@example.com"
        assert profile.json()["profile_picture_url"] == "https://example.com/avatar.png"


def test_profile_rejects_empty_name_and_invalid_picture_url(tmp_path):
    with make_client(tmp_path) as client:
        register(client)
        client.post(
            "/api/auth/login",
            json={"identifier": "+12025550198", "password": "a-strong-password"},
        )

        empty_name = client.patch("/api/auth/profile", json={"full_name": "  "})
        invalid_picture = client.patch(
            "/api/auth/profile",
            json={"profile_picture_url": "javascript:alert(1)"},
        )
        assert empty_name.status_code == 422
        assert invalid_picture.status_code == 422
