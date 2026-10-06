"""WebRTC signaling relay: participants exchange offer/answer/ICE messages through the API.

Delivery is "poll with a cursor": a client asks for messages with id > the last id it saw.
Anything at or below that cursor has been received, so it is deleted (acknowledged).
"""

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.errors import ConflictError, NotFoundError
from app.models import Participant, ParticipantStatus, Signal
from app.schemas import SignalIn

MAX_SIGNALS_PER_FETCH = 100


def send_signal(db: Session, sender: Participant, data: SignalIn) -> Signal:
    if sender.status != ParticipantStatus.JOINED:
        raise ConflictError("You are no longer in this meeting.")
    recipient = db.get(Participant, data.recipient_id)
    if recipient is None or recipient.meeting_id != sender.meeting_id or recipient.id == sender.id:
        raise NotFoundError("That participant isn't in this meeting.")
    if recipient.status != ParticipantStatus.JOINED:
        raise ConflictError("That participant has left the meeting.")

    signal = Signal(sender_id=sender.id, recipient_id=recipient.id, kind=data.kind, payload=data.payload)
    db.add(signal)
    db.commit()
    return signal


def fetch_signals(db: Session, recipient: Participant, after: int) -> list[Signal]:
    db.execute(delete(Signal).where(Signal.recipient_id == recipient.id, Signal.id <= after))
    signals = list(
        db.scalars(
            select(Signal)
            .where(Signal.recipient_id == recipient.id, Signal.id > after)
            .order_by(Signal.id)
            .limit(MAX_SIGNALS_PER_FETCH)
        ).all()
    )
    db.commit()
    return signals
