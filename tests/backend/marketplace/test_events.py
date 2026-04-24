"""Tests for ``src.backend.marketplace.events``.

Owner: Phanes (W2 NP P1 Session 2). Covers the structured log + captured
buffer surface the publish endpoint uses to hand listings off to the P6
Eunomia moderation queue consumer.
"""

from __future__ import annotations

import pytest
from uuid import UUID

from src.backend.marketplace import events


@pytest.fixture(autouse=True)
def _clear_events():
    events.reset_captured_events()
    yield
    events.reset_captured_events()


@pytest.mark.asyncio
async def test_emit_listing_submitted_appends_to_buffer() -> None:
    listing_id = UUID("01926f00-ffff-7fff-8fff-000000000001")
    actor_id = UUID("01926f00-ffff-7fff-8fff-000000000002")

    evt = await events.emit_listing_submitted(
        listing_id=listing_id, actor_user_id=actor_id
    )

    captured = events.captured_events()
    assert len(captured) == 1
    assert captured[0] is evt
    assert captured[0].listing_id == listing_id
    assert captured[0].actor_user_id == actor_id
    # Timestamp is set to now(timezone.utc); we only assert it is present.
    assert captured[0].emitted_at is not None


@pytest.mark.asyncio
async def test_emit_listing_submitted_payload_serialises() -> None:
    listing_id = UUID("01926f00-ffff-7fff-8fff-000000000003")
    actor_id = UUID("01926f00-ffff-7fff-8fff-000000000004")
    evt = await events.emit_listing_submitted(
        listing_id=listing_id, actor_user_id=actor_id
    )

    payload = evt.as_dict()

    assert payload["listing_id"] == str(listing_id)
    assert payload["actor_user_id"] == str(actor_id)
    # isoformat round-trips through datetime.fromisoformat.
    from datetime import datetime as _dt

    assert _dt.fromisoformat(payload["emitted_at"]) == evt.emitted_at


@pytest.mark.asyncio
async def test_publish_listing_emits_submitted_event(
    fake_listing_pool, flag_patch
) -> None:
    """The publish endpoint must emit ``marketplace.listing.submitted``.

    Integration check: the publish path should call
    ``emit_listing_submitted`` exactly once per successful publish. This
    is the seam P6 Eunomia will wire into once the moderation queue
    consumer ships.
    """

    from datetime import datetime, timezone
    from unittest.mock import AsyncMock
    from uuid import uuid4

    from src.backend.marketplace.listing_service import publish_listing
    from tests.backend.marketplace.conftest import make_listing_row

    events.reset_captured_events()
    flag_patch({"marketplace.live": True})

    lid = uuid4()
    tenant_id = UUID("22222222-2222-7222-8222-222222222222")
    user_id = UUID("11111111-1111-7111-8111-111111111111")

    pre = make_listing_row(
        listing_id=lid,
        creator_user_id=user_id,
        tenant_id=tenant_id,
        category="content",
        subtype="prompt",
        category_metadata={"content_format": "markdown"},
        long_description="long enough to pass the publish validator",
        status="draft",
        version="1.0.0",
        version_history=[],
    )
    post = {
        **pre,
        "status": "published",
        "published_at": datetime.now(timezone.utc),
        "version_history": [
            {"version": "1.0.0", "status_before": "draft", "title": pre["title"]}
        ],
    }
    fake_listing_pool._test_conn.fetchrow = AsyncMock(side_effect=[pre, post])

    await publish_listing(listing_id=lid, tenant_id=tenant_id, user_id=user_id)

    captured = events.captured_events()
    assert len(captured) == 1
    assert captured[0].listing_id == lid
    assert captured[0].actor_user_id == user_id


def test_reset_captured_events_clears_buffer() -> None:
    # Synthesise an event without going through the async path so the
    # reset helper is exercised without an event loop.
    from datetime import datetime, timezone

    events._captured_events.append(  # type: ignore[attr-defined]
        events.ListingSubmittedEvent(
            listing_id=UUID("01926f00-ffff-7fff-8fff-000000000010"),
            actor_user_id=UUID("01926f00-ffff-7fff-8fff-000000000011"),
            emitted_at=datetime.now(timezone.utc),
        )
    )
    assert len(events.captured_events()) == 1
    events.reset_captured_events()
    assert events.captured_events() == ()
