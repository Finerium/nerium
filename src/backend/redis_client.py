"""Async Redis client factory and lifecycle helpers.

Owner: Aether (W1 Session 2). Consumer agents access the shared pool via
:func:`get_redis_pool` which mirrors the asyncpg pattern in
``src.backend.db.pool``. The pool is created once during FastAPI lifespan
startup and torn down on shutdown.

Module path note
----------------
The canonical contract (``docs/contracts/redis_session.contract.md``
Section 6) names the pool factory ``src/backend/redis/pool.py``. For
Session 2 we land the implementation at ``src/backend/redis_client.py``
per V4 scope directive to avoid any risk of a ``src.backend.redis.*``
subpackage shadowing the top-level ``redis`` pip distribution during
absolute imports. Downstream consumers import via
``from src.backend.redis_client import get_redis_pool`` until Pythia
ratifies the path deviation in a contract amendment. Function names,
configuration keys, and behavioural contract remain identical.

Contract references
-------------------
- ``docs/contracts/redis_session.contract.md`` Section 4.1 connection.
- ``docs/contracts/redis_session.contract.md`` Section 3.4 memory limit.
- ``docs/contracts/rest_api_base.contract.md`` Section 3.1 ``/readyz``
  deep readiness check reads pool state.
- ``docs/contracts/observability.contract.md`` Section 9 slow command
  logging (>50 ms emits ``redis.command.slow``).

Session 2 scope: factory + lifespan hooks + healthcheck ping + simple
eval helper for Lua scripts (used by the rate limit middleware). ACL
partitioning, streams, and pub/sub helpers arrive with the pub/sub
module authored alongside Nike (W2) and the rate limit wrapper below.
"""

from __future__ import annotations

import logging
from typing import Any

import redis.asyncio as redis_asyncio
from redis.asyncio import Redis
from redis.asyncio.connection import ConnectionPool

from src.backend.config import Settings

logger = logging.getLogger(__name__)

# Module-level pool handle. Owned by the FastAPI lifespan. Tests that run
# outside the app factory MUST call :func:`set_redis_pool` manually.
_pool: ConnectionPool | None = None


def build_pool(settings: Settings) -> ConnectionPool:
    """Construct a ``ConnectionPool`` from settings without installing it.

    Kept separate from :func:`create_redis_pool` so tests can instantiate a
    pool without side-effects on the module-level handle.

    Parameters
    ----------
    settings
        Aether :class:`~src.backend.config.Settings` instance.

    Returns
    -------
    redis.asyncio.ConnectionPool
        Not yet opened connections; first use triggers the socket connect.
    """

    return ConnectionPool.from_url(
        settings.redis_url,
        decode_responses=True,
        max_connections=settings.redis_max_connections,
        socket_keepalive=True,
        health_check_interval=30,
    )


async def create_redis_pool(settings: Settings) -> ConnectionPool:
    """Create and eagerly verify a Redis connection pool.

    Mirrors :func:`src.backend.db.pool.create_app_pool` semantics: the
    pool is returned ready for the lifespan hook to install via
    :func:`set_redis_pool`. We run an explicit ``PING`` so lifespan
    startup fails fast when Redis is unreachable rather than waiting for
    the first request to trip the health check.
    """

    pool = build_pool(settings)
    client: Redis = redis_asyncio.Redis(connection_pool=pool)
    try:
        await client.ping()
    finally:
        # Do NOT close the pool here; we only want to release the probing
        # connection. Closing ``client`` does release the single connection
        # it held back to the pool.
        await client.close()
    return pool


def set_redis_pool(pool: ConnectionPool | None) -> None:
    """Install (or uninstall) the module-level Redis pool handle."""

    global _pool
    _pool = pool


def get_redis_pool() -> ConnectionPool:
    """Return the installed Redis pool or raise.

    Raises
    ------
    RuntimeError
        If the pool has not been initialized. This indicates a lifespan
        ordering bug: the caller tried to use Redis before startup finished
        or after shutdown completed.
    """

    if _pool is None:
        raise RuntimeError(
            "Redis pool not initialized. Ensure the FastAPI lifespan has "
            "completed startup before calling get_redis_pool()."
        )
    return _pool


def get_redis_client() -> Redis:
    """Return a thin :class:`redis.asyncio.Redis` bound to the shared pool.

    ``redis.asyncio.Redis`` is itself cheap to construct; it multiplexes
    over the underlying :class:`ConnectionPool`. Callers treat the result
    as short-lived and do NOT need to close it explicitly.
    """

    return Redis(connection_pool=get_redis_pool())


async def close_redis_pool() -> None:
    """Close the module-level pool if installed. Idempotent.

    ``ConnectionPool.disconnect`` closes every connection in the pool and
    waits for in-flight commands to drain. Safe to call even when some
    consumers still hold a client; subsequent commands raise
    ``ConnectionError`` which the caller must handle (``/readyz`` returns
    503 for example).
    """

    global _pool
    if _pool is not None:
        try:
            await _pool.disconnect()
        finally:
            _pool = None


async def ping(pool: ConnectionPool | None = None) -> bool:
    """Run a trivial PING to verify the pool is reachable.

    Used by ``/readyz`` and by tests. Returns ``True`` on success,
    ``False`` on any redis error so callers can translate to an HTTP
    status without leaking Redis internals.
    """

    target = pool if pool is not None else _pool
    if target is None:
        return False
    client = Redis(connection_pool=target)
    try:
        return bool(await client.ping())
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("redis.ping.failed", exc_info=exc)
        return False
    finally:
        await client.close()


async def eval_script(
    script: str,
    keys: list[str],
    args: list[str | int | float],
) -> Any:
    """Execute a Lua script against the installed pool.

    Convenience wrapper for the rate limit middleware and future
    idempotency helpers. Uses ``EVAL`` rather than ``EVALSHA``-with-cache
    for Session 2 simplicity; the middleware may promote to ``EVALSHA``
    when the hot path is measured.

    Parameters
    ----------
    script
        Full Lua source. Callers typically keep it in a module-level
        constant.
    keys
        Redis keys the script touches. Populates ``KEYS[]`` for the Lua
        runtime.
    args
        Script arguments. Populates ``ARGV[]`` for the Lua runtime.
        Numeric values are coerced to strings at the redis-py wire layer
        so Lua ``tonumber`` calls remain portable.
    """

    client = get_redis_client()
    try:
        return await client.eval(script, len(keys), *keys, *args)
    finally:
        await client.close()


__all__ = [
    "build_pool",
    "close_redis_pool",
    "create_redis_pool",
    "eval_script",
    "get_redis_client",
    "get_redis_pool",
    "ping",
    "set_redis_pool",
]
