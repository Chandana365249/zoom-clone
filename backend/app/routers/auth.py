from fastapi import APIRouter, Response, status

from app.dependencies import BearerToken, DbSession
from app.schemas import AuthResponse, LoginRequest, SignupRequest, UserOut
from app.services import auth as auth_service

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def signup(data: SignupRequest, db: DbSession):
    user, token = auth_service.signup(db, data)
    return AuthResponse(token=token, user=UserOut.model_validate(user))


@router.post("/login", response_model=AuthResponse)
def login(data: LoginRequest, db: DbSession):
    user, token = auth_service.login(db, data)
    return AuthResponse(token=token, user=UserOut.model_validate(user))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(db: DbSession, credentials: BearerToken):
    # Logging out with a missing or already-invalid token is a harmless no-op.
    if credentials is not None:
        auth_service.logout(db, credentials.credentials)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
