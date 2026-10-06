"""SQLAlchemy ORM models.

Schema overview:

    users 1 ──< auth_sessions  (one row per signed-in browser; deleted on logout)
    users 1 ──< meetings       (a user hosts many meetings)
    meetings 1 ──< participants (a meeting has many participant sessions)
    users 1 ──< participants    (optional: guests joining by link have no user row)

All timestamps are stored as naive UTC in SQLite and returned as timezone-aware UTC.
"""

import enum
from datetime import UTC, datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    TypeDecorator,
    func,
    select,
)
from sqlalchemy.orm import Mapped, column_property, mapped_column, relationship

from app.database import Base


def utc_now() -> datetime:
    return datetime.now(UTC)


class UTCDateTime(TypeDecorator):
    """Stores datetimes as naive UTC and always hands back timezone-aware UTC values.

    SQLite has no timezone support, so without this a datetime would silently lose its offset.
    """

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            raise ValueError("Naive datetimes are not allowed; pass a timezone-aware value.")
        return value.astimezone(UTC).replace(tzinfo=None)

    def process_result_value(self, value: datetime | None, dialect):
        return value.replace(tzinfo=UTC) if value is not None else None


def _enum_column(enum_cls: type[enum.Enum], name: str) -> Enum:
    # Stored as plain strings plus a CHECK constraint, which keeps the SQLite file readable.
    return Enum(
        enum_cls,
        name=name,
        native_enum=False,
        create_constraint=True,
        length=20,
        values_callable=lambda members: [member.value for member in members],
    )


class MeetingType(str, enum.Enum):
    INSTANT = "instant"
    SCHEDULED = "scheduled"


class MeetingStatus(str, enum.Enum):
    SCHEDULED = "scheduled"  # created, nobody has joined yet
    LIVE = "live"  # at least one participant has joined
    ENDED = "ended"  # host ended it, or everyone left


class ParticipantRole(str, enum.Enum):
    HOST = "host"
    ATTENDEE = "attendee"


class ParticipantStatus(str, enum.Enum):
    JOINED = "joined"
    LEFT = "left"
    REMOVED = "removed"  # removed by the host; cannot rejoin with the same session


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime, default=utc_now, onupdate=utc_now, nullable=False
    )


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    # "scrypt$<salt hex>$<hash hex>" — never the plain password (see services/auth.py).
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    job_title: Mapped[str | None] = mapped_column(String(100))

    hosted_meetings: Mapped[list["Meeting"]] = relationship(back_populates="host")


class AuthSession(Base):
    """A login session. The client holds a random token; only its SHA-256 hash is stored,
    so a leaked database can't be used to impersonate users."""

    __tablename__ = "auth_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utc_now, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False)

    user: Mapped[User] = relationship()


class Meeting(TimestampMixin, Base):
    __tablename__ = "meetings"
    __table_args__ = (
        # Dashboard queries filter a host's meetings by status and sort by start time.
        Index("ix_meetings_host_status_start", "host_id", "status", "scheduled_start"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # The public, Zoom-style 11-digit meeting ID. Kept separate from the internal primary key
    # so URLs never expose sequential IDs.
    meeting_code: Mapped[str] = mapped_column(String(11), unique=True, index=True, nullable=False)
    host_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    meeting_type: Mapped[MeetingType] = mapped_column(
        _enum_column(MeetingType, "meeting_type"), nullable=False
    )
    status: Mapped[MeetingStatus] = mapped_column(
        _enum_column(MeetingStatus, "meeting_status"),
        default=MeetingStatus.SCHEDULED,
        nullable=False,
    )
    scheduled_start: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    ended_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    host: Mapped[User] = relationship(back_populates="hosted_meetings")
    participants: Mapped[list["Participant"]] = relationship(
        back_populates="meeting", cascade="all, delete-orphan", passive_deletes=True
    )


class Participant(TimestampMixin, Base):
    """One participant *session*: a row is created each time someone joins a meeting."""

    __tablename__ = "participants"
    __table_args__ = (
        # Used to list who is currently in a meeting.
        Index("ix_participants_meeting_status", "meeting_id", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    meeting_id: Mapped[int] = mapped_column(
        ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    role: Mapped[ParticipantRole] = mapped_column(
        _enum_column(ParticipantRole, "participant_role"), nullable=False
    )
    status: Mapped[ParticipantStatus] = mapped_column(
        _enum_column(ParticipantStatus, "participant_status"),
        default=ParticipantStatus.JOINED,
        nullable=False,
    )
    is_muted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_video_on: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    joined_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utc_now, nullable=False)
    left_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    # Updated by the client's heartbeat; sessions that stop heartbeating are treated as gone.
    last_seen_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utc_now, nullable=False)

    meeting: Mapped[Meeting] = relationship(back_populates="participants")
    user: Mapped[User | None] = relationship()


# Number of people who have ever joined the meeting, computed in SQL alongside each meeting row
# (avoids an N+1 query when listing meetings).
Meeting.participant_count = column_property(
    select(func.count(func.distinct(Participant.display_name)))
    .where(Participant.meeting_id == Meeting.id)
    .correlate_except(Participant)
    .scalar_subquery()
)
