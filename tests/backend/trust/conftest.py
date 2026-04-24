"""Fixtures for Astraea trust tests.

Mirrors ``tests.backend.marketplace.conftest`` but for the trust
service + router paths. We mock asyncpg fetchrow/fetch/execute with
:class:`AsyncMock` so tests can shape scenario-specific return values
per case.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
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


def make_listing_trust_row(
    *,
    listing_id: UUID | None = None,
    tenant_id: UUID | None = None,
    creator_user_id: UUID | None = None,
    category: str = "content",
    trust_score_cached: float | None = 0.8,
    created_at: datetime | None = None,
    trust_score_components_cached: Any = None,
    trust_score_cached_at: datetime | None = None,
    trust_score_formula_version: str | None = None,
    trust_score_band: str | None = None,
    trust_score_stability: str | None = None,
) -> dict[str, Any]:
    """Build an asyncpg-Record-compatible dict for a listing.

    The service fetches a narrow projection in
    :func:`gather_listing_inputs` plus a wider projection in
    :func:`read_cached_listing_trust`; the helper returns a dict with
    every column either path might read.
    """

    return {
        "id": listing_id or uuid4(),
        "tenant_id": tenant_id or uuid4(),
        "creator_user_id": creator_user_id or uuid4(),
        "category": category,
        "trust_score_cached": trust_score_cached,
        "created_at": created_at or datetime.now(timezone.utc),
        "trust_score_components_cached": trust_score_components_cached,
        "trust_score_cached_at": trust_score_cached_at,
        "trust_score_formula_version": trust_score_formula_version,
        "trust_score_band": trust_score_band,
        "trust_score_stability": trust_score_stability,
    }


def make_user_trust_row(
    *,
    user_id: UUID | None = None,
    tenant_id: UUID | None = None,
    display_name: str = "Creator",
    creator_trust_score_cached: float | None = None,
    creator_trust_score_components_cached: Any = None,
    creator_trust_score_cached_at: datetime | None = None,
    creator_trust_score_band: str | None = None,
    creator_verified_badge: bool = False,
    created_at: datetime | None = None,
    status: str = "active",
) -> dict[str, Any]:
    return {
        "id": user_id or uuid4(),
        "tenant_id": tenant_id or uuid4(),
        "display_name": display_name,
        "creator_trust_score_cached": creator_trust_score_cached,
        "creator_trust_score_components_cached": creator_trust_score_components_cached,
        "creator_trust_score_cached_at": creator_trust_score_cached_at,
        "creator_trust_score_band": creator_trust_score_band,
        "creator_verified_badge": creator_verified_badge,
        "created_at": created_at or datetime.now(timezone.utc),
        "status": status,
    }


@pytest.fixture
def fake_trust_pool(monkeypatch: pytest.MonkeyPatch) -> MagicMock:
    """Install a fake asyncpg pool patched onto ``get_pool`` for trust tests."""

    conn = MagicMock()
    conn.fetchrow = AsyncMock(return_value=None)
    conn.fetch = AsyncMock(return_value=[])
    conn.execute = AsyncMock(return_value="OK")
    conn.transaction = MagicMock(return_value=_FakeTransactionCtx())

    pool = MagicMock()
    pool.acquire = MagicMock(return_value=_FakeAcquireCtx(conn))
    pool.close = AsyncMock(return_value=None)

    # Patch both the pool module + every trust module that imports get_pool.
    monkeypatch.setattr("src.backend.db.pool.get_pool", lambda: pool)
    monkeypatch.setattr("src.backend.trust.service.get_pool", lambda: pool)

    pool._test_conn = conn
    return pool
