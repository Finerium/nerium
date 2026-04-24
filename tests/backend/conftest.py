"""Shared pytest fixtures for the backend test suite.

The fixtures kept here are process-wide and contract-level: settings
override, fake DB pool for lifespan tests, and HTTP client factory. Tests
that need real asyncpg integration live under
``tests/backend/integration/`` and are skipped by default (require a live
Postgres 16 instance).

Session 2 extends the fixture set with:

- ``fake_redis_pool`` + ``fake_arq_redis``: in-memory stand-ins that keep
  the lifespan pass without a live Redis.
- ``hs256_jwt_factory``: helper to mint signed bearer tokens for
  AuthMiddleware tests.
- ``middleware_test_app``: FastAPI app constructed with the Aether
  middleware stack but without the full lifespan (lighter weight for
  middleware unit tests).
"""

from __future__ import annotations

import time
from typing import Any, AsyncIterator, Callable
from unittest.mock import AsyncMock, MagicMock

import pytest
import pytest_asyncio
from fastapi import FastAPI
from fastapi.testclient import TestClient
from jose import jwt

from src.backend.config import Settings, get_settings
from src.backend.db import pool as pool_module
from src.backend import redis_client as redis_module
from src.backend.workers import arq_redis as arq_redis_module


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


class _FakeRedisClient:
    """Minimal async Redis stand-in used by the ping probe.

    Supports the small surface Aether's lifespan + readiness probe
    touches: ``ping`` returns True, ``close`` is a no-op. Expanded in
    middleware-specific tests that need script evaluation.
    """

    def __init__(self, *, ping_result: bool = True) -> None:
        self._ping_result = ping_result
        self.closed = False

    async def ping(self) -> bool:
        return self._ping_result

    async def close(self) -> None:
        self.closed = True


class _FakeRedisPool:
    """Stand-in for ``redis.asyncio.ConnectionPool`` during lifespan tests."""

    def __init__(self) -> None:
        self.disconnected = False

    async def disconnect(self) -> None:
        self.disconnected = True


@pytest.fixture
def fake_redis(monkeypatch: pytest.MonkeyPatch) -> _FakeRedisPool:
    """Install a fake Redis pool + ping + eval_script so lifespan passes."""

    fake_pool_obj = _FakeRedisPool()

    async def _fake_create_redis_pool(settings):
        return fake_pool_obj

    async def _fake_ping(pool=None):
        return True

    async def _fake_eval(script, keys, args):
        # Default: allow, 100 tokens remaining, 0 retry.
        return [1, 100, 0]

    monkeypatch.setattr(redis_module, "create_redis_pool", _fake_create_redis_pool)
    monkeypatch.setattr(redis_module, "ping", _fake_ping)
    monkeypatch.setattr(redis_module, "eval_script", _fake_eval)
    # Rate limit middleware imports ``eval_script`` at module scope so we
    # have to patch its reference too.
    from src.backend.middleware import rate_limit as rate_limit_module

    monkeypatch.setattr(rate_limit_module, "eval_script", _fake_eval)
    return fake_pool_obj


@pytest.fixture
def fake_arq(monkeypatch: pytest.MonkeyPatch) -> MagicMock:
    """Install a fake Arq ``create_pool`` so lifespan does not need live Redis."""

    fake_arq_handle = MagicMock()
    fake_arq_handle.close = AsyncMock(return_value=None)

    async def _fake_create_pool(redis_settings):
        return fake_arq_handle

    import arq

    monkeypatch.setattr(arq, "create_pool", _fake_create_pool)
    return fake_arq_handle


@pytest_asyncio.fixture
async def app_with_fake_pool(
    test_settings: Settings,
    fake_pool: AsyncMock,
    fake_redis: _FakeRedisPool,
    fake_arq: MagicMock,
    monkeypatch: pytest.MonkeyPatch,
) -> AsyncIterator[FastAPI]:
    """Build a FastAPI app whose lifespan uses fake pools.

    Yields the raw FastAPI instance so individual tests decide whether to
    drive it through httpx.AsyncClient or synchronously via TestClient.
    The fake Redis pool + fake Arq handle keep the lifespan green so the
    Session 1 test surface stays intact.
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


# ----- Session 2 specific helpers -----


@pytest.fixture
def hs256_jwt_factory(test_settings: Settings) -> Callable[..., str]:
    """Return a helper that mints HS256 JWTs for auth middleware tests.

    Signed with the same ``settings.secret_key`` the default verifier
    uses so a round trip via ``_default_hs256_verifier`` succeeds.
    """

    def _mint(
        *,
        user_id: str = "11111111-1111-7111-8111-111111111111",
        tenant_id: str = "22222222-2222-7222-8222-222222222222",
        scopes: list[str] | None = None,
        issuer: str = "nerium-test",
        extra_claims: dict[str, Any] | None = None,
        expires_in: int = 600,
    ) -> str:
        now = int(time.time())
        claims: dict[str, Any] = {
            "sub": user_id,
            "tenant_id": tenant_id,
            "iss": issuer,
            "iat": now,
            "exp": now + expires_in,
            "scope": " ".join(scopes or []),
        }
        if extra_claims:
            claims.update(extra_claims)
        return jwt.encode(
            claims,
            test_settings.secret_key.get_secret_value(),
            algorithm="HS256",
        )

    return _mint


@pytest.fixture
def minimal_middleware_app(test_settings: Settings) -> FastAPI:
    """Construct a lightweight FastAPI app with only the Aether middleware
    stack installed. Skips the full lifespan so middleware tests can focus
    on request / response behaviour without pool setup overhead.
    """

    from src.backend.errors import register_problem_handlers
    from src.backend.middleware.auth import install_auth
    from src.backend.middleware.rate_limit import install_rate_limit
    from src.backend.middleware.tenant_binding import install_tenant_binding

    app = FastAPI()
    register_problem_handlers(app)
    install_tenant_binding(app)
    install_auth(app, settings=test_settings)
    install_rate_limit(app)

    @app.get("/private")
    async def private(request: Any) -> dict:
        return {
            "user_id": request.state.auth.user_id,
            "tenant_id": request.state.tenant_id,
            "scopes": sorted(request.state.auth.scopes),
        }

    @app.get("/healthz")
    async def healthz() -> dict:
        return {"status": "ok"}

    return app
