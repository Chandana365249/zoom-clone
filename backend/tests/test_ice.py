import dataclasses

from app.services import ice


def with_settings(monkeypatch, **overrides):
    monkeypatch.setattr(ice, "settings", dataclasses.replace(ice.settings, **overrides))
    monkeypatch.setitem(ice._cache, "servers", None)


def test_stun_only_by_default(client, monkeypatch):
    with_settings(monkeypatch, cloudflare_turn_key_id="", cloudflare_turn_api_token="", turn_urls=[], turn_secret="")
    assert client.get("/api/ice-servers").json() == {"ice_servers": ice.STUN_SERVERS}


def test_fixed_turn_credentials(anon_client, monkeypatch):
    with_settings(
        monkeypatch,
        cloudflare_turn_key_id="",
        turn_secret="",
        turn_urls=["turn:turn.example.com:3478"],
        turn_username="user",
        turn_credential="secret",
    )
    servers = anon_client.get("/api/ice-servers").json()["ice_servers"]
    assert servers[-1] == {"urls": ["turn:turn.example.com:3478"], "username": "user", "credential": "secret"}


def test_cloudflare_credentials_are_cached_and_fall_back_to_stun(anon_client, monkeypatch):
    with_settings(monkeypatch, cloudflare_turn_key_id="key", cloudflare_turn_api_token="token")
    calls = []
    turn = [{"urls": ["turn:turn.cloudflare.com:3478"], "username": "u", "credential": "c"}]
    monkeypatch.setattr(ice, "_cloudflare_ice_servers", lambda: calls.append(1) or turn)

    assert anon_client.get("/api/ice-servers").json()["ice_servers"] == turn
    assert anon_client.get("/api/ice-servers").json()["ice_servers"] == turn
    assert len(calls) == 1  # second request served from the cache

    def broken():
        raise OSError("cloudflare down")

    monkeypatch.setitem(ice._cache, "servers", None)
    monkeypatch.setattr(ice, "_cloudflare_ice_servers", broken)
    assert anon_client.get("/api/ice-servers").json()["ice_servers"] == ice.STUN_SERVERS


def test_shared_secret_turn_credentials_are_short_lived_hmacs(anon_client, monkeypatch):
    import base64
    import hashlib
    import hmac
    import time

    with_settings(monkeypatch, cloudflare_turn_key_id="", turn_urls=["turn:relay.example.com:3478?transport=tcp"], turn_secret="s3cret")
    turn = anon_client.get("/api/ice-servers").json()["ice_servers"][-1]

    expiry, _ = turn["username"].split(":")
    assert time.time() < int(expiry) <= time.time() + ice.CREDENTIAL_TTL_SECONDS + 5
    expected = base64.b64encode(hmac.new(b"s3cret", turn["username"].encode(), hashlib.sha1).digest()).decode()
    assert turn["credential"] == expected
    assert "s3cret" not in str(turn)  # the secret itself never leaves the server
