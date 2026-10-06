from datetime import timedelta

from app.models import Participant, utc_now


def create_meeting(client) -> str:
    return client.post("/api/meetings/instant").json()["meeting_code"]


def join(client, code, name="Guest", **extra):
    return client.post(f"/api/meetings/{code}/join", json={"display_name": name, **extra})


def test_join_makes_meeting_live(client):
    code = create_meeting(client)
    response = join(client, code, "Alex", as_host=True)

    assert response.status_code == 200
    body = response.json()
    assert body["participant"]["role"] == "host"
    assert body["meeting"]["status"] == "live"
    assert body["meeting"]["started_at"] is not None


def test_join_validation(client):
    code = create_meeting(client)
    assert join(client, code, "   ").status_code == 422
    assert join(client, "99999999999").status_code == 404


def test_participants_list_and_media_state(client):
    code = create_meeting(client)
    host = join(client, code, "Alex", as_host=True).json()["participant"]
    guest = join(client, code, "Sam", is_muted=True, is_video_on=False).json()["participant"]

    names = [p["display_name"] for p in client.get(f"/api/meetings/{code}/participants").json()]
    assert names == ["Alex", "Sam"]  # host listed first

    updated = client.patch(f"/api/participants/{guest['id']}", json={"is_muted": False})
    assert updated.json()["is_muted"] is False
    assert updated.json()["is_video_on"] is False

    state = client.post(f"/api/participants/{host['id']}/heartbeat").json()
    assert state["me"]["id"] == host["id"]
    assert len(state["participants"]) == 2


def test_last_person_leaving_ends_meeting(client):
    code = create_meeting(client)
    host = join(client, code, "Alex", as_host=True).json()["participant"]
    guest = join(client, code, "Sam").json()["participant"]

    assert client.post(f"/api/participants/{guest['id']}/leave").status_code == 204
    assert client.get(f"/api/meetings/{code}").json()["status"] == "live"

    client.post(f"/api/participants/{host['id']}/leave")
    meeting = client.get(f"/api/meetings/{code}").json()
    assert meeting["status"] == "ended"

    recent = client.get("/api/meetings", params={"scope": "recent"}).json()
    assert recent[0]["meeting_code"] == code
    assert recent[0]["participant_count"] == 2

    # Guests can't join an ended meeting, but the host can start it again.
    assert join(client, code, "Late").status_code == 410
    assert join(client, code, "Alex", as_host=True).json()["meeting"]["status"] == "live"


def test_host_controls(client):
    code = create_meeting(client)
    host = join(client, code, "Alex", as_host=True).json()["participant"]
    guest = join(client, code, "Sam").json()["participant"]
    other = join(client, code, "Jo").json()["participant"]
    host_action = {"host_participant_id": host["id"]}

    # Attendees can't use host controls.
    forbidden = client.post(f"/api/meetings/{code}/mute-all", json={"host_participant_id": guest["id"]})
    assert forbidden.status_code == 403

    assert client.post(f"/api/meetings/{code}/mute-all", json=host_action).json() == {"muted": 2}
    host_state = client.post(f"/api/participants/{host['id']}/heartbeat").json()["me"]
    assert host_state["is_muted"] is False  # host is never muted by mute-all

    removed = client.post(f"/api/participants/{guest['id']}/remove", json=host_action)
    assert removed.json()["status"] == "removed"
    # The removed client learns about it on its next heartbeat...
    assert client.post(f"/api/participants/{guest['id']}/heartbeat").json()["me"]["status"] == "removed"
    # ...and can no longer change its media state.
    assert client.patch(f"/api/participants/{guest['id']}", json={"is_muted": False}).status_code == 409

    ended = client.post(f"/api/meetings/{code}/end", json=host_action).json()
    assert ended["status"] == "ended"
    assert client.post(f"/api/participants/{other['id']}/heartbeat").json()["me"]["status"] == "left"


def test_stale_participants_expire(client, db_session):
    code = create_meeting(client)
    guest = join(client, code, "Ghost").json()["participant"]

    with db_session() as db:
        row = db.get(Participant, guest["id"])
        row.last_seen_at = utc_now() - timedelta(minutes=5)
        db.commit()

    assert client.get(f"/api/meetings/{code}/participants").json() == []
    assert client.get(f"/api/meetings/{code}").json()["status"] == "ended"
