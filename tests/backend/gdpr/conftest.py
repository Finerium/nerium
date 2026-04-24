"""Shared fixtures for GDPR tests."""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, MagicMock

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
    conn.fetch = AsyncMock(return_value=[])
    conn.fetchrow = AsyncMock(return_value=None)
    conn.execute = AsyncMock(return_value="UPDATE 0")
    conn.transaction = MagicMock(return_value=_FakeTransactionCtx())
    return conn


@pytest.fixture
def fake_gdpr_pool(monkeypatch: pytest.MonkeyPatch) -> MagicMock:
    """Fake pool observable from the export + delete + consent modules.

    Also monkeypatches :func:`tenant_scoped` so the consent service's
    per-tenant transaction block yields the same fake connection as the
    raw ``pool.acquire`` path. This keeps the test assertions simple.
    """

    conn = _make_fake_conn()
    pool = MagicMock()
    pool.acquire = MagicMock(return_value=_FakeAcquireCtx(conn))
    pool.close = AsyncMock(return_value=None)

    monkeypatch.setattr("src.backend.db.pool.get_pool", lambda: pool)
    monkeypatch.setattr("src.backend.gdpr.export.get_pool", lambda: pool)
    monkeypatch.setattr("src.backend.gdpr.delete.get_pool", lambda: pool)
    monkeypatch.setattr("src.backend.gdpr.consent.get_pool", lambda: pool)

    # Replace the tenant_scoped async context manager so consent tests
    # do not try to issue ``SET LOCAL`` against the MagicMock.
    from contextlib import asynccontextmanager

    @asynccontextmanager
    async def _fake_tenant_scoped(pool_arg: Any, tenant_id: Any):
        yield conn

    monkeypatch.setattr(
        "src.backend.gdpr.consent.tenant_scoped", _fake_tenant_scoped
    )

    pool._test_conn = conn
    return pool
