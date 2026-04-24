"""Tests for the Eunomia moderation queue service.

Scope
-----
- Approve flow writes a ``moderation_event`` row and is idempotent on
  repeat calls.
- Reject flow flips the listing status to ``suspended`` and writes an
  audit row with the reason.
- Reject rejects empty / whitespace-only reason with a 422.
- Approve of archived listing raises a 422.
"""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from src.backend.admin import moderation as moderation_service
from src.backend.errors import NotFoundProblem, ValidationProblem
from tests.backend.admin.conftest import (
    listing_row_for_moderation,
    moderation_event_row,
)


async def test_approve_listing_writes_audit_row(fake_admin_pool) -> None:
    conn = fake_admin_pool._test_conn
    listing_id = uuid4()
    tenant_id = uuid4()
    moderator_id = uuid4()

    # First fetchrow: listing SELECT. Second fetchrow: idempotent check
    # (returns None). Third fetchrow: INSERT RETURNING.
    audit_row = moderation_event_row(
        listing_id=listing_id,
        tenant_id=tenant_id,
        moderator_id=moderator_id,
        action="approve",
    )
    conn.fetchrow = AsyncMock(
        side_effect=[
            listing_row_for_moderation(
                listing_id=listing_id, tenant_id=tenant_id
            ),
            None,  # no existing approve row
            audit_row,
        ]
    )

    event = await moderation_service.approve_listing(
        listing_id=listing_id, moderator_id=moderator_id
    )

    assert event.action == "approve"
    assert event.listing_id == listing_id
    assert event.moderator_id == moderator_id
    assert event.reason is None


async def test_approve_listing_is_idempotent(fake_admin_pool) -> None:
    conn = fake_admin_pool._test_conn
    listing_id = uuid4()
    moderator_id = uuid4()

    existing = moderation_event_row(
        listing_id=listing_id,
        moderator_id=moderator_id,
        action="approve",
    )
    conn.fetchrow = AsyncMock(
        side_effect=[
            listing_row_for_moderation(listing_id=listing_id),
            existing,  # prior approve already on file
        ]
    )

    event = await moderation_service.approve_listing(
        listing_id=listing_id, moderator_id=moderator_id
    )

    assert event.id == existing["id"]
    # INSERT fetchrow must NOT have been called.
    assert conn.fetchrow.await_count == 2


async def test_approve_missing_listing_raises_404(fake_admin_pool) -> None:
    conn = fake_admin_pool._test_conn
    conn.fetchrow = AsyncMock(return_value=None)

    with pytest.raises(NotFoundProblem):
        await moderation_service.approve_listing(
            listing_id=uuid4(), moderator_id=uuid4()
        )


async def test_approve_archived_listing_raises_validation(fake_admin_pool) -> None:
    conn = fake_admin_pool._test_conn
    conn.fetchrow = AsyncMock(
        return_value=listing_row_for_moderation(
            archived_at=datetime.now(timezone.utc)
        )
    )

    with pytest.raises(ValidationProblem):
        await moderation_service.approve_listing(
            listing_id=uuid4(), moderator_id=uuid4()
        )


async def test_reject_listing_flips_status_and_writes_audit(fake_admin_pool) -> None:
    conn = fake_admin_pool._test_conn
    listing_id = uuid4()
    tenant_id = uuid4()
    moderator_id = uuid4()
    reason = "Missing license file per taxonomy."

    audit_row = moderation_event_row(
        listing_id=listing_id,
        tenant_id=tenant_id,
        moderator_id=moderator_id,
        action="reject",
        reason=reason,
    )
    conn.fetchrow = AsyncMock(
        side_effect=[
            listing_row_for_moderation(
                listing_id=listing_id, tenant_id=tenant_id
            ),
            audit_row,
        ]
    )

    event = await moderation_service.reject_listing(
        listing_id=listing_id,
        moderator_id=moderator_id,
        reason=reason,
    )

    assert event.action == "reject"
    assert event.reason == reason
    # The service issues an UPDATE before the INSERT RETURNING; verify
    # we called execute at least once with the suspension SQL.
    update_calls = [call.args[0] for call in conn.execute.await_args_list]
    assert any("SET status = 'suspended'" in sql for sql in update_calls), (
        f"expected a suspension UPDATE; saw: {update_calls!r}"
    )


async def test_reject_rejects_empty_reason(fake_admin_pool) -> None:
    with pytest.raises(ValidationProblem):
        await moderation_service.reject_listing(
            listing_id=uuid4(), moderator_id=uuid4(), reason="   "
        )


async def test_reject_rejects_overly_long_reason(fake_admin_pool) -> None:
    huge = "x" * (moderation_service.MAX_REASON_LEN + 1)
    with pytest.raises(ValidationProblem):
        await moderation_service.reject_listing(
            listing_id=uuid4(), moderator_id=uuid4(), reason=huge
        )
