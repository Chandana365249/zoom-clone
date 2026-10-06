"""Meeting endpoints. Handlers stay thin: validate input (Pydantic), call a service, return."""

from typing import Literal

from fastapi import APIRouter, Query, Response, status

from app.dependencies import CurrentUser, DbSession, OptionalUser
from app.schemas import (
    HostActionRequest,
    JoinMeetingRequest,
    JoinMeetingResponse,
    MeetingOut,
    ParticipantOut,
    ScheduleMeetingRequest,
    UpdateMeetingRequest,
)
from app.services import meetings as meeting_service
from app.services import participants as participant_service

router = APIRouter(prefix="/api/meetings", tags=["meetings"])


@router.get("", response_model=list[MeetingOut])
def list_meetings(
    db: DbSession,
    user: CurrentUser,
    scope: Literal["upcoming", "recent"] = Query(default="upcoming"),
):
    meeting_service.expire_stale_sessions(db)
    if scope == "recent":
        return meeting_service.list_recent_meetings(db, user)
    return meeting_service.list_upcoming_meetings(db, user)


@router.post("/instant", response_model=MeetingOut, status_code=status.HTTP_201_CREATED)
def create_instant_meeting(db: DbSession, user: CurrentUser):
    return meeting_service.create_instant_meeting(db, user)


@router.post("", response_model=MeetingOut, status_code=status.HTTP_201_CREATED)
def schedule_meeting(data: ScheduleMeetingRequest, db: DbSession, user: CurrentUser):
    return meeting_service.schedule_meeting(db, user, data)


@router.get("/{meeting_code}", response_model=MeetingOut)
def get_meeting(meeting_code: str, db: DbSession):
    return meeting_service.get_meeting(db, meeting_code)


@router.patch("/{meeting_code}", response_model=MeetingOut)
def update_meeting(
    meeting_code: str, data: UpdateMeetingRequest, db: DbSession, user: CurrentUser
):
    meeting = meeting_service.get_meeting(db, meeting_code)
    meeting_service.require_owner(meeting, user)
    return meeting_service.update_meeting(db, meeting, data)


@router.delete("/{meeting_code}", status_code=status.HTTP_204_NO_CONTENT)
def delete_meeting(meeting_code: str, db: DbSession, user: CurrentUser):
    meeting = meeting_service.get_meeting(db, meeting_code)
    meeting_service.require_owner(meeting, user)
    meeting_service.delete_meeting(db, meeting)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{meeting_code}/join", response_model=JoinMeetingResponse)
def join_meeting(
    meeting_code: str, data: JoinMeetingRequest, db: DbSession, user: OptionalUser
):
    """Guests may join without an account; starting as host requires signing in."""
    meeting = meeting_service.get_meeting(db, meeting_code)
    participant = participant_service.join_meeting(db, meeting, user, data)
    return JoinMeetingResponse(
        participant=ParticipantOut.model_validate(participant),
        meeting=MeetingOut.model_validate(meeting),
    )


@router.get("/{meeting_code}/participants", response_model=list[ParticipantOut])
def list_participants(meeting_code: str, db: DbSession):
    meeting = meeting_service.get_meeting(db, meeting_code)
    return participant_service.list_active_participants(db, meeting)


@router.post("/{meeting_code}/end", response_model=MeetingOut)
def end_meeting(meeting_code: str, data: HostActionRequest, db: DbSession, user: CurrentUser):
    meeting = meeting_service.get_meeting(db, meeting_code)
    participant_service.require_host(db, meeting, data.host_participant_id, user)
    return meeting_service.end_meeting(db, meeting)


@router.post("/{meeting_code}/mute-all")
def mute_all(
    meeting_code: str, data: HostActionRequest, db: DbSession, user: CurrentUser
) -> dict[str, int]:
    meeting = meeting_service.get_meeting(db, meeting_code)
    host = participant_service.require_host(db, meeting, data.host_participant_id, user)
    return {"muted": participant_service.mute_all(db, meeting, host)}
