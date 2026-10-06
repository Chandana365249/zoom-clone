import json


def setup_call(client):
    code = client.post("/api/meetings/instant").json()["meeting_code"]
    host = client.post(f"/api/meetings/{code}/join", json={"display_name": "Host", "as_host": True}).json()
    guest = client.post(f"/api/meetings/{code}/join", json={"display_name": "Guest"}).json()
    return code, host["participant"]["id"], guest["participant"]["id"]


def send(client, sender, recipient, kind="offer", payload=None):
    body = {"recipient_id": recipient, "kind": kind, "payload": payload or json.dumps({"type": kind, "sdp": "v=0"})}
    return client.post(f"/api/participants/{sender}/signals", json=body)


def test_signals_are_relayed_in_order_and_acknowledged(client):
    _, host, guest = setup_call(client)
    assert send(client, guest, host, "offer").status_code == 201
    assert send(client, guest, host, "ice", json.dumps({"candidate": "c1"})).status_code == 201

    inbox = client.get(f"/api/participants/{host}/signals").json()
    assert [(s["sender_id"], s["kind"]) for s in inbox] == [(guest, "offer"), (guest, "ice")]
    assert json.loads(inbox[1]["payload"]) == {"candidate": "c1"}

    # Messages are only for their recipient.
    assert client.get(f"/api/participants/{guest}/signals").json() == []

    # Polling with the last seen id acknowledges (deletes) everything up to it.
    last = inbox[-1]["id"]
    assert client.get(f"/api/participants/{host}/signals", params={"after": last}).json() == []
    assert client.get(f"/api/participants/{host}/signals").json() == []


def test_signals_only_between_joined_participants_of_the_same_meeting(client):
    _, host, guest = setup_call(client)
    _, other_host, _ = setup_call(client)

    assert send(client, guest, other_host).status_code == 404  # different meeting
    assert send(client, guest, guest).status_code == 404  # yourself
    assert send(client, guest, host, kind="bogus").status_code == 422

    client.post(f"/api/participants/{host}/leave")
    assert send(client, guest, host).status_code == 409  # recipient has left


def test_signals_are_removed_with_the_meeting(client, db_session):
    from app.models import Signal

    code, host, guest = setup_call(client)
    send(client, guest, host)
    client.post(f"/api/participants/{guest}/leave")
    client.post(f"/api/participants/{host}/leave")
    assert client.delete(f"/api/meetings/{code}").status_code == 204
    with db_session() as db:
        assert db.query(Signal).count() == 0


def test_signal_ids_never_go_backwards_after_delivery(client):
    """Regression: SQLite reuses deleted rowids unless AUTOINCREMENT is set. A message created
    after older ones were acknowledged must still get an id above the recipient's cursor."""
    _, host, guest = setup_call(client)
    for _ in range(3):
        send(client, guest, host, "ice")
    cursor = client.get(f"/api/participants/{host}/signals").json()[-1]["id"]
    client.get(f"/api/participants/{host}/signals", params={"after": cursor})  # acknowledge -> deleted

    send(client, guest, host, "offer")
    fresh = client.get(f"/api/participants/{host}/signals", params={"after": cursor}).json()
    assert [s["kind"] for s in fresh] == ["offer"]
    assert fresh[0]["id"] > cursor
