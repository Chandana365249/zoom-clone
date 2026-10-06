"""Authentication: password hashing, signup/login and token-based sessions.

Uses only the standard library:
- Passwords are hashed with scrypt (memory-hard, salted per user).
- Sessions are random tokens. The client sends the token as `Authorization: Bearer <token>`;
  the database stores only its SHA-256, so logging out (deleting the row) revokes it at once.
"""

import hashlib
import hmac
import secrets
from datetime import timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.errors import ConflictError, UnauthorizedError
from app.models import AuthSession, User, utc_now
from app.schemas import LoginRequest, SignupRequest

SESSION_LIFETIME = timedelta(days=7)
_SCRYPT_PARAMS = {"n": 2**14, "r": 8, "p": 1, "dklen": 32}


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, **_SCRYPT_PARAMS)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, salt_hex, digest_hex = stored.split("$")
    except ValueError:
        return False
    if scheme != "scrypt":
        return False
    digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt_hex), **_SCRYPT_PARAMS)
    # Constant-time comparison so response timing doesn't leak how many bytes matched.
    return hmac.compare_digest(digest.hex(), digest_hex)


# Checked against when the email doesn't exist, so "unknown email" and "wrong password"
# take the same time and can't be told apart.
_DUMMY_HASH = hash_password(secrets.token_hex(16))


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_session(db: Session, user: User) -> str:
    token = secrets.token_urlsafe(32)
    db.add(
        AuthSession(
            user=user,
            token_hash=_hash_token(token),
            expires_at=utc_now() + SESSION_LIFETIME,
        )
    )
    db.commit()
    return token


def signup(db: Session, data: SignupRequest) -> tuple[User, str]:
    if db.scalar(select(User.id).where(User.email == data.email)):
        raise ConflictError("An account with this email already exists. Sign in instead.")
    user = User(name=data.name, email=data.email, password_hash=hash_password(data.password))
    db.add(user)
    db.flush()
    return user, create_session(db, user)


def login(db: Session, data: LoginRequest) -> tuple[User, str]:
    user = db.scalar(select(User).where(User.email == data.email))
    password_ok = verify_password(data.password, user.password_hash if user else _DUMMY_HASH)
    if user is None or not password_ok:
        raise UnauthorizedError("Incorrect email or password.")
    return user, create_session(db, user)


def logout(db: Session, token: str) -> None:
    db.execute(delete(AuthSession).where(AuthSession.token_hash == _hash_token(token)))
    db.commit()


def user_from_token(db: Session, token: str) -> User | None:
    session = db.scalar(select(AuthSession).where(AuthSession.token_hash == _hash_token(token)))
    if session is None:
        return None
    if session.expires_at <= utc_now():
        db.delete(session)
        db.commit()
        return None
    return session.user
