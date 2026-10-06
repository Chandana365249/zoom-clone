from fastapi import APIRouter

from app.dependencies import CurrentUser
from app.schemas import UserOut

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/me", response_model=UserOut)
def get_me(user: CurrentUser):
    return user
