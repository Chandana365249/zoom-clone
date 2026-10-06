"""Application settings, read once from environment variables (and an optional .env file)."""

import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


def _parse_bool(value: str) -> bool:
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    database_url: str
    frontend_url: str
    cors_origins: list[str]
    seed_on_startup: bool
    # TURN relay for WebRTC (see services/ice.py). Either Cloudflare (short-lived credentials)...
    cloudflare_turn_key_id: str
    cloudflare_turn_api_token: str
    # ...or our own coturn (TURN_URLS + TURN_SECRET -> short-lived HMAC credentials)
    # ...or any provider's fixed credentials (TURN_URLS + TURN_USERNAME + TURN_CREDENTIAL).
    turn_secret: str
    turn_urls: list[str]
    turn_username: str
    turn_credential: str


def load_settings() -> Settings:
    return Settings(
        database_url=os.getenv("DATABASE_URL", "sqlite:///./zoom_clone.db"),
        frontend_url=os.getenv("FRONTEND_URL", "http://localhost:3000").rstrip("/"),
        cors_origins=[
            origin.strip()
            for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
            if origin.strip()
        ],
        seed_on_startup=_parse_bool(os.getenv("SEED_ON_STARTUP", "true")),
        cloudflare_turn_key_id=os.getenv("CLOUDFLARE_TURN_KEY_ID", "").strip(),
        cloudflare_turn_api_token=os.getenv("CLOUDFLARE_TURN_API_TOKEN", "").strip(),
        turn_secret=os.getenv("TURN_SECRET", "").strip(),
        turn_urls=[url.strip() for url in os.getenv("TURN_URLS", "").split(",") if url.strip()],
        turn_username=os.getenv("TURN_USERNAME", "").strip(),
        turn_credential=os.getenv("TURN_CREDENTIAL", "").strip(),
    )


settings = load_settings()
