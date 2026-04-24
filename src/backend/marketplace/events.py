"""Marketplace listing event emission.

Owner: Phanes (W2 NP P1 Session 2). P6 Eunomia will consume these events
from the moderation queue once the inbox worker lands; for S2 the stub
emits structured log events via ``structlog`` and a module-level
``_captured_events`` list that tests inspect to assert emission without
requiring a full event bus.

Contract reference
------------------
- ``docs/contracts/marketplace_listing.contract.md`` Section 5 "Event
  Signatures": ``marketplace.listing.published`` (and, when moderation
  lands, ``marketplace.listing.submitted``).
- ``docs/contracts/event_bus.contract.md`` for the post-hackathon shape.

Design notes
------------
- Keep the signature narrow: ``listing_id`` + ``actor_user_id`` is enough
  for a downstream moderator to load context via the listing_service.
- No async await on a real bus yet; the function is declared async so the
  caller's interface does not change when the real emitter lands.
- The in-process ``_captured_events`` list is reset by tests through the
  ``reset_captured_events`` helper so parallel test runs do not cross.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

try:
    import structlog

    _log = structlog.get_logger("marketplace.events")
except ImportError:  # pragma: no cover - structlog is a listed dependency
    _log = None  # type: ignore[assignment]


@dataclass(frozen=True)
class ListingSubmittedEvent:
    """Structured payload for ``marketplace.listing.submitted``."""

    listing_id: UUID
    actor_user_id: UUID
    emitted_at: datetime

    def as_dict(self) -> dict[str, Any]:
        return {
            "listing_id": str(self.listing_id),
            "actor_user_id": str(self.actor_user_id),
            "emitted_at": self.emitted_at.isoformat(),
        }


# In-process buffer so unit tests can assert emission without wiring a
# real bus. Production ignores this; Eunomia owns the durable consumer.
_captured_events: list[ListingSubmittedEvent] = []


def captured_events() -> tuple[ListingSubmittedEvent, ...]:
    """Return a tuple snapshot of captured events for test introspection."""

    return tuple(_captured_events)


def reset_captured_events() -> None:
    """Clear the captured-events buffer. Tests call in teardown."""

    _captured_events.clear()


async def emit_listing_submitted(
    *,
    listing_id: UUID,
    actor_user_id: UUID,
) -> ListingSubmittedEvent:
    """Emit a structured ``marketplace.listing.submitted`` event.

    Logs via structlog and appends to the in-process buffer. The real
    event bus call lands in a follow-up revision when P6 Eunomia ships
    the moderation queue consumer.
    """

    event = ListingSubmittedEvent(
        listing_id=listing_id,
        actor_user_id=actor_user_id,
        emitted_at=datetime.now(timezone.utc),
    )
    _captured_events.append(event)
    if _log is not None:
        try:
            _log.info("marketplace.listing.submitted", **event.as_dict())
        except Exception:
            # Never let the event emission failure propagate into the
            # publish path. The captured buffer still records the call.
            pass
    return event


__all__ = [
    "ListingSubmittedEvent",
    "captured_events",
    "emit_listing_submitted",
    "reset_captured_events",
]
