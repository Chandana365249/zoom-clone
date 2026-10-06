"""Seeds realistic sample data so the dashboard looks lived-in on first launch.

Run manually with:  python -m app.seed          (only seeds an empty database)
                    python -m app.seed --reset  (drops and recreates all tables first)
"""

import sys
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import Base, SessionLocal, engine
from app.models import (
    Meeting,
    MeetingStatus,
    MeetingType,
    Participant,
    ParticipantRole,
    ParticipantStatus,
    User,
    utc_now,
)
from app.services.auth import hash_password
from app.services.meetings import generate_meeting_code

# Every seeded account uses this password. The demo account is what the sign-in page's
# "Continue with demo account" button logs into.
DEMO_PASSWORD = "zoomdemo123"
DEFAULT_USER = {"name": "Alex Morgan", "email": "alex.morgan@example.com", "job_title": "Product Manager"}

COLLEAGUES = [
    ("Priya Sharma", "priya.sharma@example.com", "Engineering Lead"),
    ("Daniel Kim", "daniel.kim@example.com", "Product Designer"),
    ("Sofia Martinez", "sofia.martinez@example.com", "Marketing Manager"),
    ("Marcus Lee", "marcus.lee@example.com", "Backend Engineer"),
    ("Emma Wilson", "emma.wilson@example.com", "Customer Success"),
]

# (title, description, days from now, hours offset, duration)
UPCOMING = [
    ("Weekly Product Sync", "Roadmap check-in, blockers and priorities for the week.", 0, 2, 45),
    ("Design Review: Mobile Onboarding", "Walk through the new onboarding flow with design and engineering.", 1, 1, 60),
    ("1:1 with Priya", None, 1, 4, 30),
    ("Sprint Planning — Q4 Kickoff", "Estimate and commit to the first sprint of Q4.", 3, 0, 90),
    ("Customer Interview: Northwind Traders", "Discovery call about their reporting workflow.", 5, 2, 30),
]

# (title, days ago, hours before the next half hour, actual minutes, attendee names, type)
RECENT = [
    ("Engineering Standup", 1, 3, 15, ["Priya Sharma", "Marcus Lee", "Daniel Kim"], MeetingType.SCHEDULED),
    ("Quarterly Business Review", 2, 5, 58, ["Priya Sharma", "Sofia Martinez", "Emma Wilson", "Marcus Lee"], MeetingType.SCHEDULED),
    ("Alex Morgan's Zoom Meeting", 3, 1, 22, ["Daniel Kim"], MeetingType.INSTANT),
    ("Marketing Launch Retro", 4, 6, 41, ["Sofia Martinez", "Emma Wilson"], MeetingType.SCHEDULED),
    ("Hiring Debrief: Senior Engineer", 6, 2, 30, ["Priya Sharma", "Marcus Lee"], MeetingType.SCHEDULED),
]


def _next_half_hour(moment: datetime) -> datetime:
    moment = moment.replace(second=0, microsecond=0)
    return moment + timedelta(minutes=30 - moment.minute % 30)


def seed(db: Session) -> bool:
    """Inserts sample data if the database has no users. Returns True if it seeded."""
    if db.scalar(select(User.id).limit(1)) is not None:
        return False

    password_hash = hash_password(DEMO_PASSWORD)  # one hash (one salt) is fine for demo data
    host = User(**DEFAULT_USER, password_hash=password_hash)
    colleagues = {
        name: User(name=name, email=email, job_title=title, password_hash=password_hash)
        for name, email, title in COLLEAGUES
    }
    db.add(host)
    db.add_all(colleagues.values())

    now = utc_now()
    base = _next_half_hour(now)

    for title, description, days, hours, duration in UPCOMING:
        db.add(
            Meeting(
                meeting_code=generate_meeting_code(),
                host=host,
                title=title,
                description=description,
                meeting_type=MeetingType.SCHEDULED,
                status=MeetingStatus.SCHEDULED,
                scheduled_start=base + timedelta(days=days, hours=hours),
                duration_minutes=duration,
            )
        )

    for title, days_ago, hours_ago, minutes, attendees, meeting_type in RECENT:
        started = base - timedelta(days=days_ago, hours=hours_ago)
        ended = started + timedelta(minutes=minutes)
        meeting = Meeting(
            meeting_code=generate_meeting_code(),
            host=host,
            title=title,
            meeting_type=meeting_type,
            status=MeetingStatus.ENDED,
            scheduled_start=started,
            duration_minutes=max(30, minutes),
            started_at=started,
            ended_at=ended,
        )
        db.add(meeting)
        session_rows = [(host.name, host, ParticipantRole.HOST)] + [
            (name, colleagues[name], ParticipantRole.ATTENDEE) for name in attendees
        ]
        for index, (name, user, role) in enumerate(session_rows):
            joined = started + timedelta(minutes=index)
            db.add(
                Participant(
                    meeting=meeting,
                    user=user,
                    display_name=name,
                    role=role,
                    status=ParticipantStatus.LEFT,
                    joined_at=joined,
                    last_seen_at=ended,
                    left_at=ended,
                )
            )

    db.commit()
    return True


def main() -> None:
    if "--reset" in sys.argv:
        Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        print("Seeded sample data." if seed(db) else "Database already has data; nothing to do.")


if __name__ == "__main__":
    main()
