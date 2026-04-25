"""Fixtures for Crius protocol tests (W2 NP P5 Session 1).

Mirrors :mod:`tests.backend.registry.identity.conftest`:
- A fake ``asyncpg`` pool whose connection is a :class:`MagicMock` so
  the catalogue service can run without a live Postgres.
- An EdDSA agent identity helper that mints a JWT and stubs
  :func:`load_public_pem_for_verify` so :func:`require_agent_jwt`
  resolves the agent without a DB round-trip.

Tests reset the registry singleton between cases via the
``reset_registry`` autouse fixture so monkeypatched env vars cannot
leak into sibling tests.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import pytest

from src.backend.protocol.registry import reset_registry_for_tests
from src.backend.utils.uuid7 import uuid7


class _FakeAcquireCtx:
    def __init__(self, conn: MagicMock) -> None:
        self._conn = conn

    async def __aenter__(self) -> MagicMock:
        return self._conn

    async def __aexit__(self, exc_type, exc, tb) -> None:
        return None


@pytest.fixture(autouse=True)
def reset_registry() -> None:
    """Always start each test with a fresh registry singleton."""

    reset_registry_for_tests()
    yield
    reset_registry_for_tests()


@pytest.fixture
def fake_protocol_pool(monkeypatch: pytest.MonkeyPatch) -> MagicMock:
    """Install a fake asyncpg pool for the catalogue + identity services."""

    conn = MagicMock()
    conn.fetchrow = AsyncMock(return_value=None)
    conn.fetch = AsyncMock(return_value=[])
    conn.fetchval = AsyncMock(return_value=None)
    conn.execute = AsyncMock(return_value="OK")

    pool = MagicMock()
    pool.acquire = MagicMock(return_value=_FakeAcquireCtx(conn))
    pool.close = AsyncMock(return_value=None)

    # Patch every consumer site that imports ``get_pool`` directly so
    # both the catalogue service and the Tethys identity verifier
    # share the same fake.
    monkeypatch.setattr("src.backend.db.pool.get_pool", lambda: pool)
    monkeypatch.setattr(
        "src.backend.protocol.catalog_service.get_pool", lambda: pool
    )
    monkeypatch.setattr(
        "src.backend.registry.identity.service.get_pool", lambda: pool
    )

    class _FakeTenantScopedCtx:
        async def __aenter__(self_inner) -> MagicMock:
            return conn

        async def __aexit__(self_inner, exc_type, exc, tb) -> None:
            return None

    def _patched_tenant_scoped(_pool, _tenant_id):
        return _FakeTenantScopedCtx()

    monkeypatch.setattr(
        "src.backend.registry.identity.service.tenant_scoped",
        _patched_tenant_scoped,
    )

    pool._test_conn = conn
    return pool


def make_catalog_row(
    *,
    vendor_id: UUID | None = None,
    vendor_slug: str = "stub",
    display_name: str = "Stub Echo",
    adapter_type: str = "chat",
    enabled: bool = True,
) -> dict[str, Any]:
    """Return an asyncpg-compatible catalogue row dict."""

    now = datetime.now(UTC)
    return {
        "vendor_id": vendor_id or uuid7(),
        "vendor_slug": vendor_slug,
        "display_name": display_name,
        "adapter_type": adapter_type,
        "enabled": enabled,
        "created_at": now,
        "updated_at": now,
    }


def make_identity_pem_row(
    *,
    public_pem: str,
    status: str = "active",
    owner_user_id: UUID | None = None,
) -> dict[str, Any]:
    """Return the row :func:`load_public_pem_for_verify` expects."""

    return {
        "public_key_pem": public_pem,
        "status": status,
        "owner_user_id": owner_user_id or uuid4(),
    }


__all__ = [
    "fake_protocol_pool",
    "make_catalog_row",
    "make_identity_pem_row",
    "reset_registry",
]
