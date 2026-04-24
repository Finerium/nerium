"""Fixtures for marketplace listing tests.

Provides:

- :func:`fake_listing_pool`: asyncpg-like pool whose connection is a
  preconfigured MagicMock. The connection's ``transaction`` returns an
  async context manager, matching the idiom
  ``async with pool.acquire() as conn: async with conn.transaction():``
  used by ``src.backend.db.tenant.tenant_scoped`` + the service layer.
- :func:`flag_patch`: helper to monkeypatch ``get_flag`` in the service
  module with a dict-driven fake. Gate tests use this to simulate
  ``marketplace.live`` flipping on/off per scope.
- :func:`sample_rows`: table of pre-built asyncpg-row-compatible dicts
  so tests do not re-author the 27-column row shape on every case.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Callable, Iterator
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import pytest

from src.backend.marketplace import listing_service


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


def make_listing_row(
    *,
    listing_id: UUID | None = None,
    tenant_id: UUID | None = None,
    creator_user_id: UUID | None = None,
    category: str = "content",
    subtype: str = "prompt",
    slug: str = "sample-listing",
    title: str = "Sample Listing",
    description: str = "desc",
    short_description: str = "short",
    long_description: str | None = "long long description",
    capability_tags: list[str] | None = None,
    license_value: str = "MIT",
    pricing: dict | None = None,
    pricing_model: str = "free",
    pricing_details: dict | None = None,
    category_metadata: dict | None = None,
    asset_refs: list[UUID] | None = None,
    thumbnail_r2_key: str | None = None,
    trust_score_cached: float | None = None,
    revenue_split_override: float | None = None,
    status: str = "draft",
    version: str = "0.1.0",
    version_history: list[dict] | None = None,
    metadata: dict | None = None,
    published_at: datetime | None = None,
    archived_at: datetime | None = None,
    created_at: datetime | None = None,
    updated_at: datetime | None = None,
) -> dict[str, Any]:
    """Return an asyncpg-Record-compatible dict for a listing row.

    Tests that mock ``fetchrow`` / ``fetch`` pass these dicts through;
    the service layer uses subscript access only (``row["foo"]``) so a
    plain dict is a faithful stand-in.
    """

    now = datetime.now(timezone.utc)
    return {
        "id": listing_id or uuid4(),
        "tenant_id": tenant_id or uuid4(),
        "creator_user_id": creator_user_id or uuid4(),
        "category": category,
        "subtype": subtype,
        "slug": slug,
        "title": title,
        "description": description,
        "short_description": short_description,
        "long_description": long_description,
        "capability_tags": capability_tags or [],
        "license": license_value,
        "pricing": pricing or {},
        "pricing_model": pricing_model,
        "pricing_details": pricing_details or {},
        "category_metadata": category_metadata or {"content_format": "markdown"},
        "asset_refs": asset_refs or [],
        "thumbnail_r2_key": thumbnail_r2_key,
        "trust_score_cached": trust_score_cached,
        "revenue_split_override": revenue_split_override,
        "status": status,
        "version": version,
        "version_history": version_history or [],
        "metadata": metadata or {},
        "published_at": published_at,
        "archived_at": archived_at,
        "created_at": created_at or now,
        "updated_at": updated_at or now,
    }


@pytest.fixture
def fake_listing_pool(monkeypatch: pytest.MonkeyPatch) -> MagicMock:
    """Install a fake asyncpg pool visible via ``get_pool``.

    The returned pool is a MagicMock. Tests mutate the connection's
    ``fetchrow`` / ``fetch`` / ``execute`` attributes with
    :class:`AsyncMock` to shape return values per scenario.
    """

    conn = MagicMock()
    conn.fetchrow = AsyncMock(return_value=None)
    conn.fetch = AsyncMock(return_value=[])
    conn.execute = AsyncMock(return_value="OK")
    conn.transaction = MagicMock(return_value=_FakeTransactionCtx())

    pool = MagicMock()
    pool.acquire = MagicMock(return_value=_FakeAcquireCtx(conn))
    pool.close = AsyncMock(return_value=None)

    # Patch both the pool module (for fallback callers) and the service's
    # imported ``get_pool`` reference so ``await listing_service.create_listing``
    # sees the fake.
    monkeypatch.setattr(
        "src.backend.db.pool.get_pool", lambda: pool
    )
    monkeypatch.setattr(
        "src.backend.marketplace.listing_service.get_pool", lambda: pool
    )

    # Expose conn on the pool for easier mutation in tests.
    pool._test_conn = conn
    return pool


@pytest.fixture
def flag_patch(monkeypatch: pytest.MonkeyPatch) -> Callable[[dict[str, Any]], None]:
    """Return a setter that patches ``get_flag`` in the service module.

    Usage::

        flag_patch({"marketplace.live": True})
        flag_patch({"marketplace.live": False, "marketplace.premium_issuance": True})
    """

    def _apply(values: dict[str, Any]) -> None:
        async def fake_get_flag(flag_name, *, user_id=None, tenant_id=None, **kwargs):
            return values.get(flag_name)

        monkeypatch.setattr(listing_service, "get_flag", fake_get_flag)

    return _apply


@pytest.fixture
def sample_row() -> dict[str, Any]:
    """Single prepopulated row usable by tests that only need one."""

    return make_listing_row()
