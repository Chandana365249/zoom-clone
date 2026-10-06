from datetime import UTC, datetime, timedelta


def future(**delta) -> str:
    return (datetime.now(UTC) + timedelta(**delta)).isoformat()


def schedule(client, **overrides):
    payload = {
        "title": "Design Review",
        "description": "Walkthrough",
        "scheduled_start": future(hours=2),
        "duration_minutes": 45,
    }
    payload.update(overrides)
    return client.post("/api/meetings", json=payload)


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_current_user(client):
    response = client.get("/api/users/me")
    assert response.status_code == 200
    assert response.json()["email"] == "host@example.com"


def test_instant_meeting_has_unique_code_and_invite_link(client):
    first = client.post("/api/meetings/instant").json()
    second = client.post("/api/meetings/instant").json()

    assert first["meeting_code"] != second["meeting_code"]
    assert len(first["meeting_code"]) == 11 and first["meeting_code"].isdigit()
    assert first["join_url"].endswith(f"/j/{first['meeting_code']}")
    assert first["meeting_type"] == "instant"
    assert first["title"] == "Test Host's Zoom Meeting"


def test_get_meeting_and_404(client):
    created = client.post("/api/meetings/instant").json()
    assert client.get(f"/api/meetings/{created['meeting_code']}").status_code == 200

    missing = client.get("/api/meetings/12345678901")
    assert missing.status_code == 404
    assert missing.json()["code"] == "not_found"


def test_schedule_meeting_appears_in_upcoming(client):
    response = schedule(client)
    assert response.status_code == 201
    code = response.json()["meeting_code"]

    upcoming = client.get("/api/meetings", params={"scope": "upcoming"}).json()
    assert [m["meeting_code"] for m in upcoming] == [code]


def test_instant_meetings_are_not_listed_as_upcoming_until_live(client):
    client.post("/api/meetings/instant")
    assert client.get("/api/meetings").json() == []


def test_schedule_rejects_past_start_and_bad_input(client):
    past = schedule(client, scheduled_start=future(hours=-1))
    assert past.status_code == 422
    assert "future" in past.json()["detail"]

    assert schedule(client, title="   ").status_code == 422
    assert schedule(client, duration_minutes=5).status_code == 422
    # Timezone-less datetimes are ambiguous and rejected.
    assert schedule(client, scheduled_start="2030-01-01T10:00:00").status_code == 422


def test_update_and_delete_scheduled_meeting(client):
    code = schedule(client).json()["meeting_code"]

    updated = client.patch(f"/api/meetings/{code}", json={"title": "Renamed", "duration_minutes": 60})
    assert updated.status_code == 200
    assert updated.json()["title"] == "Renamed"
    assert updated.json()["duration_minutes"] == 60
    assert updated.json()["description"] == "Walkthrough"

    assert client.delete(f"/api/meetings/{code}").status_code == 204
    assert client.get(f"/api/meetings/{code}").status_code == 404


def test_upcoming_is_sorted_by_start(client):
    later = schedule(client, title="Later", scheduled_start=future(days=2)).json()
    sooner = schedule(client, title="Sooner", scheduled_start=future(hours=1)).json()
    titles = [m["title"] for m in client.get("/api/meetings").json()]
    assert titles == [sooner["title"], later["title"]]
