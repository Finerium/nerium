"""Shared fixtures for admin moderation tests.

The fixtures mirror the ``tests/backend/marketplace/conftest.py`` shape
so a reader can move between the two suites without re-learning the
async-mock pattern.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Iterator
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import pytest


class _FakeAcquireCtx:
    def __init__(self, conn: MagicMock) -> None:
        self._conn = conn

    async def __aenter__(self) -> MagicMock:
        return self._conn

    async def __aexit__(self, exc_type, exc, tb) -> None:
        return None


class _FakeTransactionCtx:
    async def __aenter__(self) -> None:
        return None

    async def __aexit__(self, exc_type, exc, tb) -> None:
        return None


def _make_fake_conn() -> MagicMock:
    conn = MagicMock()
    conn.fetchrow = AsyncMock(return_value=None)
    conn.fetch = AsyncMock(return_value=[])
    conn.execute = AsyncMock(return_value="OK")
    conn.transaction = MagicMock(return_value=_FakeTransactionCtx())
    return conn


@pytest.fixture
def fake_admin_pool(monkeypatch: pytest.MonkeyPatch) -> MagicMock:
    """Install a shared fake pool observable from admin + gdpr modules."""

    conn = _make_fake_conn()
    pool = MagicMock()
    pool.acquire = MagicMock(return_value=_FakeAcquireCtx(conn))
    pool.close = AsyncMock(return_value=None)

    monkeypatch.setattr("src.backend.db.pool.get_pool", lambda: pool)
    monkeypatch.setattr(
        "src.backend.admin.moderation.get_pool", lambda: pool
    )

    pool._test_conn = conn
    return pool


def moderation_event_row(
    *,
    event_id: UUID | None = None,
    tenant_id: UUID | None = None,
    moderator_id: UUID | None = None,
    listing_id: UUID | None = None,
    action: str = "approve",
    reason: str | None = None,
    metadata: dict | None = None,
    created_at: datetime | None = None,
) -> dict[str, Any]:
    """Build an asyncpg-Record-compatible dict for moderation_event."""

    return {
        "id": event_id or uuid4(),
        "tenant_id": tenant_id or uuid4(),
        "moderator_id": moderator_id or uuid4(),
        "listing_id": listing_id or uuid4(),
        "action": action,
        "reason": reason,
        "metadata": metadata or {},
        "created_at": created_at or datetime.now(timezone.utc),
    }


def listing_row_for_moderation(
    *,
    listing_id: UUID | None = None,
    tenant_id: UUID | None = None,
    status: str = "published",
    archived_at: datetime | None = None,
) -> dict[str, Any]:
    """Minimal listing row the service's SELECT reads for approve/reject."""

    return {
        "id": listing_id or uuid4(),
        "tenant_id": tenant_id or uuid4(),
        "status": status,
        "archived_at": archived_at,
    }


@pytest.fixture
def fresh_uuid() -> Iterator[UUID]:
    """Yield a fresh UUID4 per test without thread-local state."""

    yield uuid4()
