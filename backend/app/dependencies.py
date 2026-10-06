"""Shared FastAPI dependencies."""

from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.errors import UnauthorizedError
from app.models import User
from app.services.auth import user_from_token

DbSession = Annotated[Session, Depends(get_db)]

# auto_error=False: a missing header yields None so we can return our own JSON error shape
# (and so routes can treat authentication as optional).
_bearer = HTTPBearer(auto_error=False)
BearerToken = Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)]


def get_optional_user(db: DbSession, credentials: BearerToken) -> User | None:
    """The signed-in user, or None for anonymous requests (e.g. a guest opening an invite link)."""
    if credentials is None:
        return None
    return user_from_token(db, credentials.credentials)


def get_current_user(user: Annotated[User | None, Depends(get_optional_user)]) -> User:
    """Requires a valid `Authorization: Bearer <token>` header."""
    if user is None:
        raise UnauthorizedError("Please sign in to continue.")
    return user


OptionalUser = Annotated[User | None, Depends(get_optional_user)]
CurrentUser = Annotated[User, Depends(get_current_user)]
