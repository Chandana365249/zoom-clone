"""Participant business logic: joining, presence, media state and host controls."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import (
    ConflictError,
    ForbiddenError,
    MeetingEndedError,
    NotFoundError,
    UnauthorizedError,
)
from app.models import (
    Meeting,
    MeetingStatus,
    Participant,
    ParticipantRole,
    ParticipantStatus,
    User,
    utc_now,
)
from app.schemas import JoinMeetingRequest, MediaStateUpdate
from app.services.meetings import end_meeting, expire_stale_sessions


def join_meeting(
    db: Session, meeting: Meeting, user: User | None, data: JoinMeetingRequest
) -> Participant:
    """`user` is None for guests who opened an invite link without signing in."""
    if data.as_host:
        if user is None:
            raise UnauthorizedError("Sign in to start this meeting.")
        if meeting.host_id != user.id:
            raise ForbiddenError("Only the meeting host can start this meeting.")

    if meeting.status == MeetingStatus.ENDED:
        if not data.as_host:
            raise MeetingEndedError("This meeting has ended.")
        # Like Zoom, the host can start the same meeting ID again.
        meeting.ended_at = None

    now = utc_now()
    if meeting.status != MeetingStatus.LIVE:
        meeting.status = MeetingStatus.LIVE
        meeting.started_at = meeting.started_at or now

    participant = Participant(
        meeting=meeting,
        user_id=user.id if user else None,
        display_name=data.display_name,
        role=ParticipantRole.HOST if data.as_host else ParticipantRole.ATTENDEE,
        status=ParticipantStatus.JOINED,
        is_muted=data.is_muted,
        is_video_on=data.is_video_on,
        joined_at=now,
        last_seen_at=now,
    )
    db.add(participant)
    db.commit()
    db.refresh(participant)
    db.refresh(meeting)
    return participant


def get_participant(db: Session, participant_id: int) -> Participant:
    participant = db.get(Participant, participant_id)
    if participant is None:
        raise NotFoundError("Participant not found.")
    return participant


def list_active_participants(db: Session, meeting: Meeting) -> list[Participant]:
    expire_stale_sessions(db)
    return list(
        db.scalars(
            select(Participant)
            .where(
                Participant.meeting_id == meeting.id,
                Participant.status == ParticipantStatus.JOINED,
            )
            # Host first, then in the order people joined.
            .order_by(Participant.role != ParticipantRole.HOST, Participant.joined_at)
        ).all()
    )


def heartbeat(db: Session, participant: Participant) -> Participant:
    """Marks the session as alive. Removed/left sessions are returned unchanged so the
    client can find out what happened to it (e.g. it was removed by the host)."""
    if participant.status == ParticipantStatus.JOINED:
        participant.last_seen_at = utc_now()
        db.commit()
    return participant


def _require_joined(participant: Participant) -> None:
    if participant.status != ParticipantStatus.JOINED:
        raise ConflictError("You are no longer in this meeting.")


def update_media_state(db: Session, participant: Participant, data: MediaStateUpdate) -> Participant:
    _require_joined(participant)
    if data.is_muted is not None:
        participant.is_muted = data.is_muted
    if data.is_video_on is not None:
        participant.is_video_on = data.is_video_on
    participant.last_seen_at = utc_now()
    db.commit()
    return participant


def leave_meeting(db: Session, participant: Participant) -> None:
    if participant.status != ParticipantStatus.JOINED:
        return  # leaving twice is harmless (e.g. tab close after clicking Leave)

    participant.status = ParticipantStatus.LEFT
    participant.left_at = utc_now()
    db.flush()

    meeting = participant.meeting
    someone_still_here = any(p.status == ParticipantStatus.JOINED for p in meeting.participants)
    if not someone_still_here:
        end_meeting(db, meeting)
    else:
        db.commit()


# ---------- Host controls ----------


def require_host(db: Session, meeting: Meeting, host_participant_id: int, user: User) -> Participant:
    """The acting session must be the joined host of this meeting AND belong to the signed-in
    user, so knowing someone else's participant ID isn't enough to use host controls."""
    acting = db.get(Participant, host_participant_id)
    if (
        acting is None
        or acting.meeting_id != meeting.id
        or acting.role != ParticipantRole.HOST
        or acting.status != ParticipantStatus.JOINED
        or acting.user_id != user.id
    ):
        raise ForbiddenError("Only the host can do this.")
    return acting


def mute_all(db: Session, meeting: Meeting, host: Participant) -> int:
    """Mutes every attendee (not the host). Returns how many were muted."""
    attendees = [
        p
        for p in meeting.participants
        if p.status == ParticipantStatus.JOINED and p.id != host.id and not p.is_muted
    ]
    for participant in attendees:
        participant.is_muted = True
    db.commit()
    return len(attendees)


def mute_participant(db: Session, target: Participant) -> Participant:
    # Hosts can mute others but not unmute them (privacy): attendees unmute themselves.
    _require_joined(target)
    target.is_muted = True
    db.commit()
    return target


def remove_participant(db: Session, target: Participant, host: Participant) -> Participant:
    if target.id == host.id:
        raise ConflictError("The host cannot remove themselves. Use End meeting instead.")
    _require_joined(target)
    target.status = ParticipantStatus.REMOVED
    target.left_at = utc_now()
    db.commit()
    return target
