"""Participant-session endpoints used from inside the meeting room."""

from fastapi import APIRouter, Query, Response, status

from app.dependencies import CurrentUser, DbSession
from app.schemas import (
    HostActionRequest,
    MediaStateUpdate,
    MeetingOut,
    ParticipantOut,
    RoomState,
    SignalIn,
    SignalOut,
)
from app.services import participants as participant_service
from app.services import signaling as signaling_service

router = APIRouter(prefix="/api/participants", tags=["participants"])


@router.post("/{participant_id}/heartbeat", response_model=RoomState)
def heartbeat(participant_id: int, db: DbSession):
    """Called by the room every few seconds. Keeps the session alive and returns the latest
    room state, so one request covers presence, the participant list and host actions."""
    me = participant_service.get_participant(db, participant_id)
    participant_service.heartbeat(db, me)
    others = participant_service.list_active_participants(db, me.meeting)
    db.refresh(me.meeting)
    return RoomState(
        me=ParticipantOut.model_validate(me),
        meeting=MeetingOut.model_validate(me.meeting),
        participants=[ParticipantOut.model_validate(p) for p in others],
    )


@router.patch("/{participant_id}", response_model=ParticipantOut)
def update_media_state(participant_id: int, data: MediaStateUpdate, db: DbSession):
    participant = participant_service.get_participant(db, participant_id)
    return participant_service.update_media_state(db, participant, data)


@router.post("/{participant_id}/leave", status_code=status.HTTP_204_NO_CONTENT)
def leave(participant_id: int, db: DbSession):
    participant = participant_service.get_participant(db, participant_id)
    participant_service.leave_meeting(db, participant)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{participant_id}/mute", response_model=ParticipantOut)
def mute_participant(
    participant_id: int, data: HostActionRequest, db: DbSession, user: CurrentUser
):
    target = participant_service.get_participant(db, participant_id)
    participant_service.require_host(db, target.meeting, data.host_participant_id, user)
    return participant_service.mute_participant(db, target)


@router.post("/{participant_id}/remove", response_model=ParticipantOut)
def remove_participant(
    participant_id: int, data: HostActionRequest, db: DbSession, user: CurrentUser
):
    target = participant_service.get_participant(db, participant_id)
    host = participant_service.require_host(db, target.meeting, data.host_participant_id, user)
    return participant_service.remove_participant(db, target, host)


@router.post("/{participant_id}/signals", response_model=SignalOut, status_code=status.HTTP_201_CREATED)
def send_signal(participant_id: int, data: SignalIn, db: DbSession):
    """Relay a WebRTC offer/answer/ICE candidate to another participant in the same meeting."""
    sender = participant_service.get_participant(db, participant_id)
    return signaling_service.send_signal(db, sender, data)


@router.get("/{participant_id}/signals", response_model=list[SignalOut])
def fetch_signals(participant_id: int, db: DbSession, after: int = Query(default=0, ge=0)):
    """Messages for this participant newer than `after`; older ones are acknowledged and deleted."""
    recipient = participant_service.get_participant(db, participant_id)
    return signaling_service.fetch_signals(db, recipient, after)
