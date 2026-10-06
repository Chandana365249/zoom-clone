from datetime import timedelta

from app.models import AuthSession, utc_now
from app.services.auth import hash_password, verify_password
from tests.conftest import PASSWORD


def test_password_hashing():
    stored = hash_password("s3cret-pass")
    assert stored.startswith("scrypt$") and "s3cret-pass" not in stored
    assert verify_password("s3cret-pass", stored)
    assert not verify_password("wrong", stored)
    # Same password, different salt -> different hash.
    assert hash_password("s3cret-pass") != stored


def test_signup_returns_token_and_normalises_email(anon_client):
    response = anon_client.post(
        "/api/auth/signup",
        json={"name": "  Jane Doe ", "email": " Jane@Example.COM ", "password": PASSWORD},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["token"]
    assert body["user"] == {"id": body["user"]["id"], "name": "Jane Doe", "email": "jane@example.com", "job_title": None}

    me = anon_client.get("/api/users/me", headers={"Authorization": f"Bearer {body['token']}"})
    assert me.json()["email"] == "jane@example.com"


def test_signup_validation(anon_client):
    def signup(**overrides):
        payload = {"name": "Jane", "email": "jane@example.com", "password": PASSWORD, **overrides}
        return anon_client.post("/api/auth/signup", json=payload)

    assert signup(email="not-an-email").json()["detail"] == "email: Enter a valid email address"
    assert signup(password="short").status_code == 422
    assert signup(name="   ").status_code == 422
    assert signup().status_code == 201
    duplicate = signup(email="JANE@example.com")
    assert duplicate.status_code == 409
    assert duplicate.json()["code"] == "conflict"


def test_login_and_logout(anon_client, client):
    wrong = anon_client.post("/api/auth/login", json={"email": "host@example.com", "password": "nope"})
    unknown = anon_client.post("/api/auth/login", json={"email": "ghost@example.com", "password": PASSWORD})
    # Same message either way, so the API doesn't reveal which emails have accounts.
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json()["detail"] == unknown.json()["detail"] == "Incorrect email or password."

    login = anon_client.post("/api/auth/login", json={"email": "HOST@example.com", "password": PASSWORD})
    assert login.status_code == 200
    headers = {"Authorization": f"Bearer {login.json()['token']}"}
    assert anon_client.get("/api/users/me", headers=headers).status_code == 200

    assert anon_client.post("/api/auth/logout", headers=headers).status_code == 204
    # The token is revoked server-side immediately.
    assert anon_client.get("/api/users/me", headers=headers).status_code == 401


def test_protected_routes_require_auth(anon_client):
    assert anon_client.get("/api/users/me").json()["code"] == "unauthorized"
    assert anon_client.get("/api/meetings").status_code == 401
    assert anon_client.post("/api/meetings/instant").status_code == 401
    bad_token = {"Authorization": "Bearer not-a-real-token"}
    assert anon_client.get("/api/meetings", headers=bad_token).status_code == 401


def test_expired_session_is_rejected(client, db_session):
    with db_session() as db:
        session = db.query(AuthSession).one()
        session.expires_at = utc_now() - timedelta(minutes=1)
        db.commit()
    assert client.get("/api/users/me").status_code == 401


def test_users_only_see_and_change_their_own_meetings(client, other_client):
    code = client.post("/api/meetings/instant").json()["meeting_code"]
    scheduled = client.post(
        "/api/meetings",
        json={"title": "Private", "scheduled_start": (utc_now() + timedelta(hours=2)).isoformat(), "duration_minutes": 30},
    ).json()["meeting_code"]

    assert other_client.get("/api/meetings").json() == []
    assert other_client.patch(f"/api/meetings/{scheduled}", json={"title": "Hijacked"}).status_code == 403
    assert other_client.delete(f"/api/meetings/{scheduled}").status_code == 403
    # Starting someone else's meeting as host is refused...
    assert other_client.post(f"/api/meetings/{code}/join", json={"display_name": "X", "as_host": True}).status_code == 403
    # ...but anyone can look a meeting up and join it as a guest.
    assert other_client.get(f"/api/meetings/{code}").status_code == 200
    assert other_client.post(f"/api/meetings/{code}/join", json={"display_name": "X"}).status_code == 200


def test_guests_join_without_an_account(client, anon_client):
    code = client.post("/api/meetings/instant").json()["meeting_code"]
    guest = anon_client.post(f"/api/meetings/{code}/join", json={"display_name": "Guest"})
    assert guest.status_code == 200
    assert guest.json()["participant"]["role"] == "attendee"

    as_host = anon_client.post(f"/api/meetings/{code}/join", json={"display_name": "Guest", "as_host": True})
    assert as_host.status_code == 401


def test_host_controls_need_the_hosts_own_account(client, other_client):
    code = client.post("/api/meetings/instant").json()["meeting_code"]
    host = client.post(f"/api/meetings/{code}/join", json={"display_name": "Host", "as_host": True}).json()["participant"]
    other_client.post(f"/api/meetings/{code}/join", json={"display_name": "Sam"})

    # Knowing the host's participant ID is not enough without the host's login.
    stolen = {"host_participant_id": host["id"]}
    assert other_client.post(f"/api/meetings/{code}/mute-all", json=stolen).status_code == 403
    assert other_client.post(f"/api/meetings/{code}/end", json=stolen).status_code == 403
    assert client.post(f"/api/meetings/{code}/mute-all", json=stolen).json() == {"muted": 1}
