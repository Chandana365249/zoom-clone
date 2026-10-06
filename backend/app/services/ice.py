"""ICE servers for WebRTC: how browsers find a network path to each other.

- STUN (free, public) lets a browser discover its public address; enough on most home networks.
- TURN relays the media when no direct path exists (mobile carriers, campus/corporate Wi-Fi).
  TURN credentials are secrets, so they're handed out here instead of being baked into the
  frontend. With Cloudflare they are short-lived, generated per request (and cached briefly).
"""

import base64
import hashlib
import hmac
import json
import logging
import time
import urllib.request

from app.config import settings

logger = logging.getLogger(__name__)

STUN_SERVERS = [{"urls": ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"]}]
CLOUDFLARE_URL = "https://rtc.live.cloudflare.com/v1/turn/keys/{key_id}/credentials/generate-ice-servers"
CREDENTIAL_TTL_SECONDS = 24 * 60 * 60
# Reuse generated credentials for a while instead of calling Cloudflare on every join.
CACHE_SECONDS = 60 * 60

_cache: dict[str, object] = {"servers": None, "expires_at": 0.0}


def _cloudflare_ice_servers() -> list[dict]:
    request = urllib.request.Request(
        CLOUDFLARE_URL.format(key_id=settings.cloudflare_turn_key_id),
        data=json.dumps({"ttl": CREDENTIAL_TTL_SECONDS}).encode(),
        headers={
            "Authorization": f"Bearer {settings.cloudflare_turn_api_token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=5) as response:
        servers = json.load(response)["iceServers"]
    # Cloudflare returns a single object in some API versions and a list in others.
    return servers if isinstance(servers, list) else [servers]


def _shared_secret_credentials() -> dict:
    """coturn's "TURN REST API" scheme (`use-auth-secret`): the username carries an expiry time
    and the password is HMAC-SHA1(secret, username). coturn recomputes it, so it never needs a
    user database, and a leaked credential stops working when it expires."""
    username = f"{int(time.time()) + CREDENTIAL_TTL_SECONDS}:zoom-clone"
    digest = hmac.new(settings.turn_secret.encode(), username.encode(), hashlib.sha1).digest()
    return {"urls": settings.turn_urls, "username": username, "credential": base64.b64encode(digest).decode()}


def get_ice_servers() -> list[dict]:
    if settings.cloudflare_turn_key_id and settings.cloudflare_turn_api_token:
        now = time.time()
        if _cache["servers"] and now < _cache["expires_at"]:
            return _cache["servers"]  # type: ignore[return-value]
        try:
            servers = _cloudflare_ice_servers()
            _cache.update(servers=servers, expires_at=now + CACHE_SECONDS)
            return servers
        except Exception:  # network/API failure: degrade to STUN rather than break calls
            logger.exception("Could not get TURN credentials from Cloudflare; falling back to STUN")
            return STUN_SERVERS

    if settings.turn_urls and settings.turn_secret:
        return STUN_SERVERS + [_shared_secret_credentials()]

    if settings.turn_urls:
        return STUN_SERVERS + [
            {"urls": settings.turn_urls, "username": settings.turn_username, "credential": settings.turn_credential}
        ]

    return STUN_SERVERS
