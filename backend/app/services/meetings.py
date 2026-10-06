"""Meeting business logic: creation, scheduling, listing and lifecycle."""

import secrets
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.errors import ConflictError, ForbiddenError, NotFoundError
from app.models import (
    Meeting,
    MeetingStatus,
    MeetingType,
    Participant,
    ParticipantStatus,
    User,
    utc_now,
)
from app.schemas import MAX_DURATION_MINUTES, ScheduleMeetingRequest, UpdateMeetingRequest

MEETING_CODE_LENGTH = 11
INSTANT_MEETING_DURATION = 40
RECENT_MEETINGS_LIMIT = 20
# A participant that has not sent a heartbeat for this long is considered disconnected.
HEARTBEAT_TIMEOUT = timedelta(seconds=30)


def generate_meeting_code() -> str:
    """Random 11-digit numeric ID (like Zoom's), never starting with 0."""
    first = str(secrets.randbelow(9) + 1)
    rest = "".join(str(secrets.randbelow(10)) for _ in range(MEETING_CODE_LENGTH - 1))
    return first + rest


def _unique_meeting_code(db: Session) -> str:
    # With 9 * 10^10 possible codes a collision is astronomically unlikely, but we still check;
    # the UNIQUE constraint on meeting_code is the final safety net.
    for _ in range(10):
        code = generate_meeting_code()
        if not db.scalar(select(Meeting.id).where(Meeting.meeting_code == code)):
            return code
    raise RuntimeError("Could not generate a unique meeting code")


def _meeting_query():
    return select(Meeting).options(joinedload(Meeting.host))


def get_meeting(db: Session, meeting_code: str) -> Meeting:
    meeting = db.scalar(_meeting_query().where(Meeting.meeting_code == meeting_code))
    if meeting is None:
        raise NotFoundError("This meeting ID is not valid. Please check and try again.")
    return meeting


def require_owner(meeting: Meeting, user: User) -> None:
    if meeting.host_id != user.id:
        raise ForbiddenError("Only the host can change this meeting.")


def create_instant_meeting(db: Session, host: User) -> Meeting:
    meeting = Meeting(
        meeting_code=_unique_meeting_code(db),
        host=host,
        title=f"{host.name}'s Zoom Meeting",
        meeting_type=MeetingType.INSTANT,
        status=MeetingStatus.SCHEDULED,
        scheduled_start=utc_now(),
        duration_minutes=INSTANT_MEETING_DURATION,
    )
    db.add(meeting)
    db.commit()
    db.refresh(meeting)
    return meeting


def schedule_meeting(db: Session, host: User, data: ScheduleMeetingRequest) -> Meeting:
    meeting = Meeting(
        meeting_code=_unique_meeting_code(db),
        host=host,
        title=data.title,
        description=data.description or None,
        meeting_type=MeetingType.SCHEDULED,
        status=MeetingStatus.SCHEDULED,
        scheduled_start=data.scheduled_start,
        duration_minutes=data.duration_minutes,
    )
    db.add(meeting)
    db.commit()
    db.refresh(meeting)
    return meeting


def update_meeting(db: Session, meeting: Meeting, data: UpdateMeetingRequest) -> Meeting:
    if meeting.status != MeetingStatus.SCHEDULED:
        raise ConflictError("Only meetings that have not started yet can be edited.")

    changes = data.model_dump(exclude_unset=True)
    if "description" in changes:
        changes["description"] = changes["description"] or None
    for field, value in changes.items():
        if value is None and field != "description":
            continue  # title/start/duration cannot be cleared
        setattr(meeting, field, value)

    db.commit()
    db.refresh(meeting)
    return meeting


def delete_meeting(db: Session, meeting: Meeting) -> None:
    if meeting.status == MeetingStatus.LIVE:
        raise ConflictError("This meeting is in progress. End it before deleting.")
    db.delete(meeting)
    db.commit()


def _meeting_end(meeting: Meeting) -> datetime:
    return meeting.scheduled_start + timedelta(minutes=meeting.duration_minutes)


def list_upcoming_meetings(db: Session, host: User) -> list[Meeting]:
    """Live meetings first, then scheduled meetings whose time window has not passed yet."""
    now = utc_now()
    # SQL pre-filter: anything that started more than the max duration ago can't still be running.
    earliest_possible_start = now - timedelta(minutes=MAX_DURATION_MINUTES)
    candidates = db.scalars(
        _meeting_query()
        .where(
            Meeting.host_id == host.id,
            Meeting.status.in_([MeetingStatus.SCHEDULED, MeetingStatus.LIVE]),
            Meeting.scheduled_start >= earliest_possible_start,
        )
        .order_by(Meeting.scheduled_start)
    ).all()

    live = [m for m in candidates if m.status == MeetingStatus.LIVE]
    scheduled = [
        m
        for m in candidates
        if m.status == MeetingStatus.SCHEDULED
        and m.meeting_type == MeetingType.SCHEDULED
        and _meeting_end(m) > now
    ]
    return live + scheduled


def list_recent_meetings(db: Session, host: User) -> list[Meeting]:
    return list(
        db.scalars(
            _meeting_query()
            .where(Meeting.host_id == host.id, Meeting.status == MeetingStatus.ENDED)
            .order_by(Meeting.ended_at.desc())
            .limit(RECENT_MEETINGS_LIMIT)
        ).all()
    )


def end_meeting(db: Session, meeting: Meeting) -> Meeting:
    """Ends the meeting for everyone: all connected participants are marked as left."""
    now = utc_now()
    for participant in meeting.participants:
        if participant.status == ParticipantStatus.JOINED:
            participant.status = ParticipantStatus.LEFT
            participant.left_at = now
    meeting.status = MeetingStatus.ENDED
    meeting.ended_at = now
    db.commit()
    db.refresh(meeting)
    return meeting


def expire_stale_sessions(db: Session) -> None:
    """Lazy cleanup, run before reads that depend on presence.

    Browsers can close without calling /leave, so participants that stopped heartbeating are
    marked as left, and live meetings with nobody left in them are ended.
    """
    now = utc_now()
    cutoff = now - HEARTBEAT_TIMEOUT
    stale = db.scalars(
        select(Participant).where(
            Participant.status == ParticipantStatus.JOINED,
            Participant.last_seen_at < cutoff,
        )
    ).all()
    for participant in stale:
        participant.status = ParticipantStatus.LEFT
        participant.left_at = participant.last_seen_at

    if stale:
        db.flush()
        empty_live_meetings = db.scalars(
            select(Meeting).where(
                Meeting.status == MeetingStatus.LIVE,
                ~Meeting.participants.any(Participant.status == ParticipantStatus.JOINED),
            )
        ).all()
        for meeting in empty_live_meetings:
            meeting.status = MeetingStatus.ENDED
            meeting.ended_at = now
    db.commit()
