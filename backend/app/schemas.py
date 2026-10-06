"""Pydantic request/response schemas — the public contract of the API."""

import re
from datetime import UTC, datetime, timedelta
from typing import Annotated

from pydantic import (
    AfterValidator,
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    computed_field,
    field_validator,
)

from app.config import settings
from app.models import MeetingStatus, MeetingType, ParticipantRole, ParticipantStatus

MIN_DURATION_MINUTES = 15
MAX_DURATION_MINUTES = 480
# Small allowance for clock drift / time spent filling in the form.
PAST_START_TOLERANCE = timedelta(minutes=1)

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Description = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]
DisplayName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]
PersonName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
Duration = Annotated[int, Field(ge=MIN_DURATION_MINUTES, le=MAX_DURATION_MINUTES)]
_EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _check_email(value: str) -> str:
    # Deliberately simple ("name@domain.tld"); proving ownership would need a confirmation email.
    if not _EMAIL_PATTERN.match(value):
        raise ValueError("Enter a valid email address")
    return value


Email = Annotated[
    str,
    StringConstraints(strip_whitespace=True, to_lower=True, max_length=255),
    AfterValidator(_check_email),
]


def _ensure_future(value: datetime | None) -> datetime | None:
    if value is not None and value < datetime.now(UTC) - PAST_START_TOLERANCE:
        raise ValueError("Start time must be in the future")
    return value


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- Users ----------


class UserOut(ORMModel):
    id: int
    name: str
    email: str
    job_title: str | None


class SignupRequest(BaseModel):
    name: PersonName
    email: Email
    password: Annotated[str, Field(min_length=8, max_length=128)]


class LoginRequest(BaseModel):
    email: Email
    password: Annotated[str, Field(min_length=1, max_length=128)]


class AuthResponse(BaseModel):
    token: str
    user: UserOut


class HostOut(ORMModel):
    id: int
    name: str


# ---------- Meetings ----------


class MeetingOut(ORMModel):
    meeting_code: str
    title: str
    description: str | None
    meeting_type: MeetingType
    status: MeetingStatus
    scheduled_start: datetime
    duration_minutes: int
    started_at: datetime | None
    ended_at: datetime | None
    created_at: datetime
    participant_count: int
    host: HostOut

    @computed_field
    @property
    def join_url(self) -> str:
        return f"{settings.frontend_url}/j/{self.meeting_code}"


class ScheduleMeetingRequest(BaseModel):
    title: Title
    description: Description | None = None
    scheduled_start: AwareDatetime
    duration_minutes: Duration

    _future_start = field_validator("scheduled_start")(_ensure_future)


class UpdateMeetingRequest(BaseModel):
    """Partial update: only the fields that are sent are changed."""

    title: Title | None = None
    description: Description | None = None
    scheduled_start: AwareDatetime | None = None
    duration_minutes: Duration | None = None

    _future_start = field_validator("scheduled_start")(_ensure_future)


# ---------- Participants ----------


class ParticipantOut(ORMModel):
    id: int
    display_name: str
    role: ParticipantRole
    status: ParticipantStatus
    is_muted: bool
    is_video_on: bool
    joined_at: datetime


class JoinMeetingRequest(BaseModel):
    display_name: DisplayName
    as_host: bool = False
    is_muted: bool = False
    is_video_on: bool = True


class JoinMeetingResponse(BaseModel):
    participant: ParticipantOut
    meeting: MeetingOut


class MediaStateUpdate(BaseModel):
    is_muted: bool | None = None
    is_video_on: bool | None = None


class HostActionRequest(BaseModel):
    """Identifies the participant session performing a host-only action."""

    host_participant_id: int


class RoomState(BaseModel):
    """Everything the meeting room needs on each poll: who I am, the meeting, who else is here."""

    me: ParticipantOut
    meeting: MeetingOut
    participants: list[ParticipantOut]
