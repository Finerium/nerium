"""Realtime test fixtures.

Owner: Nike (W2 NP P3 S1).

Heavy lifting:

- ``fake_redis_client``: an in-memory ``fakeredis.aioredis.FakeRedis``
  instance with the methods we need (xadd, xrange, publish, pubsub).
- ``connection_manager``: a fresh :class:`ConnectionManager` bound to
  the fake Redis.
- ``ws_app``: minimal FastAPI app exposing the realtime WebSocket
  endpoint with the manager pre-installed (no full ``main.create_app``
  lifespan). Lets tests drive the WS via ``TestClient.websocket_connect``
  without standing up Postgres.
- ``hs256_ticket_factory``: mints HS256 JWTs the realtime ticket
  verifier accepts (the S1 stub uses Aether's HS256 path).

The fixtures are scoped per-test so cross-test state never leaks.
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import Iterator
from typing import Callable

import pytest
import pytest_asyncio
from fakeredis import aioredis as fake_aioredis
from fastapi import FastAPI
from fastapi.testclient import TestClient
from jose import jwt

from src.backend.config import Settings
from src.backend.realtime.connection_manager import (
    ConnectionManager,
    set_connection_manager,
)
from src.backend.realtime.ticket import set_realtime_verifier
from src.backend.realtime.ws_server import realtime_ws_router


@pytest.fixture
def realtime_settings() -> Settings:
    """Settings tuned for realtime tests."""

    return Settings(
        env="development",
        version="0.1.0-test-realtime",
        trusted_hosts=["testserver", "localhost", "127.0.0.1"],
        cors_origins=["http://testserver"],
        database_url="postgresql://nerium_api:pw@localhost:5432/nerium_test",
        database_migration_url="postgresql://nerium_migration:pw@localhost:5432/nerium_test",
    )


@pytest_asyncio.fixture
async def fake_redis_client():
    """In-memory async Redis stand-in (fakeredis.aioredis.FakeRedis).

    Yields a freshly-flushed instance per test so streams + channels do
    not bleed between tests.
    """

    client = fake_aioredis.FakeRedis(decode_responses=True)
    await client.flushall()
    try:
        yield client
    finally:
        await client.aclose()


@pytest_asyncio.fixture
async def connection_manager(
    fake_redis_client,
) -> ConnectionManager:
    """A live ConnectionManager bound to the fake Redis."""

    manager = ConnectionManager(redis=fake_redis_client)
    set_connection_manager(manager)
    await manager.start()
    try:
        yield manager
    finally:
        await manager.stop()
        set_connection_manager(None)


@pytest_asyncio.fixture
async def manager_no_redis() -> ConnectionManager:
    """Manager without Redis. Used by registry-only tests."""

    manager = ConnectionManager(redis=None)
    set_connection_manager(manager)
    await manager.start()
    try:
        yield manager
    finally:
        await manager.stop()
        set_connection_manager(None)


@pytest.fixture
def hs256_ticket_factory(
    realtime_settings: Settings,
) -> Callable[..., str]:
    """Mint HS256 tickets the S1 stub verifier accepts."""

    def _mint(
        *,
        user_id: str = "11111111-1111-7111-8111-111111111111",
        tenant_id: str = "22222222-2222-7222-8222-222222222222",
        expires_in: int = 60,
        extra_claims: dict | None = None,
    ) -> str:
        now = int(time.time())
        claims: dict = {
            "sub": user_id,
            "tenant_id": tenant_id,
            "iss": "nerium-test",
            "iat": now,
            "exp": now + expires_in,
            "scope": "realtime:*",
        }
        if extra_claims:
            claims.update(extra_claims)
        return jwt.encode(
            claims,
            realtime_settings.secret_key.get_secret_value(),
            algorithm="HS256",
        )

    return _mint


@pytest.fixture
def ws_app(
    realtime_settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
) -> Iterator[FastAPI]:
    """Minimal FastAPI app exposing only the realtime WebSocket route.

    The fakeredis client AND the ConnectionManager are constructed
    inside the FastAPI lifespan so all asyncio primitives bind to the
    portal event loop TestClient drives. Building either eagerly in a
    pytest-asyncio fixture binds them to the wrong loop and tears
    down with ``"bound to a different event loop"``.
    """

    # Force the realtime ticket verifier to use our test settings.
    monkeypatch.setattr(
        "src.backend.realtime.ticket.get_settings",
        lambda: realtime_settings,
    )
    monkeypatch.setattr(
        "src.backend.config.get_settings",
        lambda: realtime_settings,
    )
    set_realtime_verifier(None)  # use default HS256 fallback

    from contextlib import asynccontextmanager

    state: dict[str, ConnectionManager] = {}

    @asynccontextmanager
    async def _lifespan(_app):
        from fakeredis import aioredis as _fake_aioredis

        redis = _fake_aioredis.FakeRedis(decode_responses=True)
        manager = ConnectionManager(redis=redis)
        await manager.start()
        set_connection_manager(manager)
        state["m"] = manager
        state["r"] = redis
        try:
            yield
        finally:
            await manager.stop()
            set_connection_manager(None)
            try:
                await redis.aclose()
            except Exception:
                pass

    app = FastAPI(lifespan=_lifespan)
    app.include_router(realtime_ws_router, prefix="/v1")

    yield app


@pytest.fixture
def ws_client(ws_app: FastAPI) -> Iterator[TestClient]:
    """TestClient bound to the realtime WS-only app."""

    with TestClient(ws_app) as client:
        yield client
