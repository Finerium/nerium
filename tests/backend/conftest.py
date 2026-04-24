"""Shared pytest fixtures for the backend test suite.

The fixtures kept here are process-wide and contract-level: settings
override, fake DB pool for lifespan tests, and HTTP client factory. Tests
that need real asyncpg integration live under
``tests/backend/integration/`` and are skipped by default (require a live
Postgres 16 instance).
"""

from __future__ import annotations

from typing import AsyncIterator
from unittest.mock import AsyncMock, MagicMock

import pytest
import pytest_asyncio
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.backend.config import Settings, get_settings
from src.backend.db import pool as pool_module


@pytest.fixture
def test_settings() -> Settings:
    """Return a Settings instance tuned for tests.

    - Development env.
    - Localhost DSNs (unused; we swap the pool for a mock).
    - Trusted hosts include ``testserver`` so ``TestClient`` calls pass
      through TrustedHostMiddleware without a 400.
    """

    return Settings(
        env="development",
        version="0.1.0-test",
        trusted_hosts=["testserver", "localhost", "127.0.0.1"],
        cors_origins=[
            "http://testserver",
            "http://localhost:3100",
            "https://claude.ai",
            "https://nerium.com",
        ],
        database_url="postgresql://nerium_api:pw@localhost:5432/nerium_test",
        database_migration_url="postgresql://nerium_migration:pw@localhost:5432/nerium_test",
    )


class _FakeAcquireCtx:
    """Async context manager returning a preconfigured fake connection."""

    def __init__(self, conn):
        self._conn = conn

    async def __aenter__(self):
        return self._conn

    async def __aexit__(self, exc_type, exc, tb):
        return None


class _FakeTransactionCtx:
    async def __aenter__(self):
        return None

    async def __aexit__(self, exc_type, exc, tb):
        return None


@pytest.fixture
def fake_pool(monkeypatch: pytest.MonkeyPatch) -> MagicMock:
    """Install a fake asyncpg pool so lifespan startup does not require Postgres.

    Returns a plain :class:`MagicMock` rather than an :class:`AsyncMock` so
    that ``pool.acquire()`` returns the context manager object synchronously.
    AsyncMock would wrap the return in a coroutine which breaks the
    ``async with pool.acquire() as conn`` idiom used in production code.
    """

    fake_conn = MagicMock()
    fake_conn.fetchval = AsyncMock(return_value=1)
    fake_conn.fetch = AsyncMock(return_value=[])
    fake_conn.fetchrow = AsyncMock(return_value=None)
    fake_conn.execute = AsyncMock(return_value="OK")
    fake_conn.transaction = MagicMock(return_value=_FakeTransactionCtx())

    mock_pool = MagicMock()
    mock_pool.acquire = MagicMock(return_value=_FakeAcquireCtx(fake_conn))
    mock_pool.close = AsyncMock(return_value=None)

    async def _fake_create(settings):
        return mock_pool

    monkeypatch.setattr(pool_module, "create_app_pool", _fake_create)
    return mock_pool


@pytest_asyncio.fixture
async def app_with_fake_pool(
    test_settings: Settings,
    fake_pool: AsyncMock,
    monkeypatch: pytest.MonkeyPatch,
) -> AsyncIterator[FastAPI]:
    """Build a FastAPI app whose lifespan uses the fake pool.

    Yields the raw FastAPI instance so individual tests decide whether to
    drive it through httpx.AsyncClient or synchronously via TestClient.
    """

    # Force get_settings to return our test settings across modules.
    monkeypatch.setattr(
        "src.backend.config.get_settings",
        lambda: test_settings,
    )
    # healthz imports get_settings from its own module-level reference when
    # settings=None defaults are used; also patch there for completeness.
    monkeypatch.setattr("src.backend.healthz.get_settings", lambda: test_settings)
    # main.create_app reads via module-level import too.
    monkeypatch.setattr("src.backend.main.get_settings", lambda: test_settings)
    get_settings.cache_clear()

    from src.backend.main import create_app

    app = create_app(settings=test_settings)
    yield app


@pytest.fixture
def client(app_with_fake_pool: FastAPI) -> TestClient:
    """Synchronous TestClient wrapping the fake-pool app.

    TestClient drives the lifespan context so startup + shutdown fire.
    """

    with TestClient(app_with_fake_pool) as c:
        yield c
