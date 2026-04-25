"""Fixtures for Tethys agent identity CRUD + middleware tests.

Mirrors :mod:`tests.backend.commerce.conftest`: ``asyncpg`` pool +
``tenant_scoped`` are faked so the service layer + router can run
without a live Postgres. The fake connection's ``fetchrow`` /
``fetch`` / ``execute`` methods are :class:`AsyncMock` instances the
individual tests configure with side effects per scenario.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import pytest

from src.backend.utils.uuid7 import uuid7


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


class _FakeTenantScopedCtx:
    """Async context manager returning the fake connection directly.

    Drop-in replacement for :func:`src.backend.db.tenant.tenant_scoped`
    so tests skip the ``SET LOCAL app.tenant_id`` round-trip on the
    :class:`MagicMock` connection.
    """

    def __init__(self, conn: MagicMock) -> None:
        self._conn = conn

    async def __aenter__(self) -> MagicMock:
        return self._conn

    async def __aexit__(self, exc_type, exc, tb) -> None:
        return None


@pytest.fixture
def fake_identity_pool(monkeypatch: pytest.MonkeyPatch) -> MagicMock:
    """Install a fake ``asyncpg`` pool + patched ``tenant_scoped``.

    Tests assign side effects on the returned ``pool._test_conn`` to
    drive scenarios. The router + service modules read ``get_pool`` +
    ``tenant_scoped`` from their own module namespaces, so we patch
    each consumer site explicitly.
    """

    conn = MagicMock()
    conn.fetchrow = AsyncMock(return_value=None)
    conn.fetch = AsyncMock(return_value=[])
    conn.fetchval = AsyncMock(return_value=None)
    conn.execute = AsyncMock(return_value="OK")
    conn.executemany = AsyncMock(return_value=None)
    conn.transaction = MagicMock(return_value=_FakeTransactionCtx())

    pool = MagicMock()
    pool.acquire = MagicMock(return_value=_FakeAcquireCtx(conn))
    pool.close = AsyncMock(return_value=None)

    monkeypatch.setattr("src.backend.db.pool.get_pool", lambda: pool)
    monkeypatch.setattr(
        "src.backend.registry.identity.service.get_pool", lambda: pool
    )

    def _patched_tenant_scoped(_pool, _tenant_id):
        return _FakeTenantScopedCtx(conn)

    monkeypatch.setattr(
        "src.backend.registry.identity.service.tenant_scoped",
        _patched_tenant_scoped,
    )

    pool._test_conn = conn
    return pool


def make_identity_row(
    *,
    agent_id: UUID | None = None,
    tenant_id: UUID | None = None,
    owner_user_id: UUID | None = None,
    display_name: str = "Test Agent",
    public_key_pem: str = "-----BEGIN PUBLIC KEY-----\nFAKE\n-----END PUBLIC KEY-----",
    status: str = "active",
    revoked_at=None,
    retires_at=None,
) -> dict[str, Any]:
    """Return an asyncpg-compatible row dict for ``agent_identity``."""

    now = datetime.now(UTC)
    return {
        "id": agent_id or uuid7(),
        "tenant_id": tenant_id or uuid4(),
        "owner_user_id": owner_user_id or uuid4(),
        "agent_slug": f"agent_{uuid4().hex[:12]}",
        "display_name": display_name,
        "public_key_pem": public_key_pem,
        "status": status,
        "created_at": now,
        "retires_at": retires_at,
        "revoked_at": revoked_at,
    }


__all__ = [
    "_FakeAcquireCtx",
    "_FakeTenantScopedCtx",
    "_FakeTransactionCtx",
    "fake_identity_pool",
    "make_identity_row",
]
