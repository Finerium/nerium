"""Redis client smoke tests.

Exercises the module-level pool handle lifecycle + ping helper with a
stub implementation. Live Redis tests live under
``tests/backend/integration/`` and require a running local server.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from src.backend import redis_client as redis_module
from src.backend.redis_client import (
    build_pool,
    close_redis_pool,
    get_redis_client,
    get_redis_pool,
    ping,
    set_redis_pool,
)
from src.backend.config import Settings


def test_build_pool_reads_settings() -> None:
    settings = Settings(redis_url="redis://localhost:6390/7", redis_max_connections=17)
    pool = build_pool(settings)
    # The pool object does not open a socket until first use, so the
    # constructor succeeds without a live server. We only assert that
    # basic attributes reflect the configuration.
    assert pool.max_connections == 17
    # Cleanup so the pool is not GC-collected during test teardown with
    # an open event loop reference.
    # The pool has no synchronous close; only async disconnect. Ignore.


def test_get_redis_pool_raises_without_install() -> None:
    set_redis_pool(None)
    with pytest.raises(RuntimeError) as excinfo:
        get_redis_pool()
    assert "not initialized" in str(excinfo.value)


def test_set_and_get_redis_pool_roundtrip() -> None:
    sentinel = MagicMock(name="sentinel_pool")
    try:
        set_redis_pool(sentinel)
        assert get_redis_pool() is sentinel
    finally:
        set_redis_pool(None)


def test_get_redis_client_uses_installed_pool() -> None:
    sentinel = MagicMock(name="sentinel_pool")
    try:
        set_redis_pool(sentinel)
        client = get_redis_client()
        # redis.asyncio.Redis stores the pool on .connection_pool in
        # recent redis-py releases. Accept either attribute for
        # forward-compat.
        pool_attr = getattr(client, "connection_pool", None)
        assert pool_attr is sentinel
    finally:
        set_redis_pool(None)


@pytest.mark.asyncio
async def test_ping_returns_false_without_pool() -> None:
    set_redis_pool(None)
    assert await ping() is False


@pytest.mark.asyncio
async def test_close_redis_pool_idempotent() -> None:
    sentinel = MagicMock(name="sentinel_pool")
    sentinel.disconnect = AsyncMock(return_value=None)
    set_redis_pool(sentinel)
    await close_redis_pool()
    # Second close is a no-op.
    await close_redis_pool()
    assert sentinel.disconnect.await_count == 1


@pytest.mark.asyncio
async def test_ping_truthy_when_client_ping_returns_true(monkeypatch) -> None:
    class _Pool:
        async def disconnect(self) -> None:
            return None

    class _Client:
        async def ping(self) -> bool:
            return True

        async def close(self) -> None:
            return None

    # Install a sentinel pool and monkeypatch the Redis constructor
    # invoked inside ping() to return our stub.
    import redis.asyncio as real_asyncio

    pool = _Pool()
    set_redis_pool(pool)  # type: ignore[arg-type]

    def _fake_redis(*, connection_pool):  # noqa: ARG001
        return _Client()

    monkeypatch.setattr(real_asyncio, "Redis", _fake_redis)
    monkeypatch.setattr(redis_module, "Redis", _fake_redis)
    try:
        assert await ping() is True
    finally:
        set_redis_pool(None)
