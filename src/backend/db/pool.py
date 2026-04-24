"""asyncpg connection pool factory and helpers.

The pool is created once during FastAPI lifespan startup and torn down on
shutdown. Other modules read the pool via :func:`get_pool` which raises when
the pool is not yet initialized (fail-fast to surface ordering bugs).

Contract references
-------------------
- ``docs/contracts/postgres_multi_tenant.contract.md`` Section 4.1 pool sizing
  (``min_size=2``, ``max_size=20``, ``command_timeout=30s``,
  ``statement_cache_size=100`` when no pgbouncer).
- ``docs/contracts/postgres_multi_tenant.contract.md`` Section 4.3 migration
  role pool uses BYPASSRLS credentials.
- ``docs/contracts/rest_api_base.contract.md`` healthcheck reads pool state.

Session 1 scope: factory + lifespan hooks + healthcheck ping. Per-tenant
binding lives in ``tenant.py``. Query-builder helpers stay thin and rely on
asyncpg raw API; no SQLAlchemy ORM, no Records-to-Pydantic auto-magic.
"""

from __future__ import annotations

import logging
from typing import Any, Sequence

import asyncpg

from src.backend.config import Settings

logger = logging.getLogger(__name__)

# Module-level pool handle. Owned by the FastAPI lifespan. Tests that run
# outside the app factory MUST call :func:`set_pool` manually.
_pool: asyncpg.Pool | None = None


async def create_app_pool(settings: Settings) -> asyncpg.Pool:
    """Create the app-role asyncpg pool.

    Configured per ``postgres_multi_tenant.contract.md`` Section 4.1:
    ``min_size=2``, ``max_size=20`` (or whatever the settings say), 30 s
    command timeout, 100 prepared-statement cache entries.

    The server-side ``application_name`` is set so Selene + Grafana can filter
    connections by service.
    """

    return await asyncpg.create_pool(
        dsn=settings.database_url,
        min_size=settings.database_pool_min_size,
        max_size=settings.database_pool_max_size,
        command_timeout=settings.database_command_timeout_seconds,
        statement_cache_size=settings.database_statement_cache_size,
        server_settings={"application_name": "nerium-api"},
    )


async def create_migration_pool(settings: Settings) -> asyncpg.Pool:
    """Create a short-lived pool for Alembic migrations.

    Uses the ``database_migration_url`` DSN which should map to the
    ``nerium_migration`` role (BYPASSRLS granted). Pool size stays small
    because migrations are single-connection by convention.
    """

    return await asyncpg.create_pool(
        dsn=settings.database_migration_url,
        min_size=1,
        max_size=2,
        command_timeout=max(settings.database_command_timeout_seconds, 120.0),
        statement_cache_size=0,
        server_settings={"application_name": "nerium-migration"},
    )


def set_pool(pool: asyncpg.Pool | None) -> None:
    """Install (or uninstall) the module-level pool.

    Called by the FastAPI lifespan on startup (install) and shutdown (None).
    Tests use this to inject a test-specific pool.
    """

    global _pool
    _pool = pool


def get_pool() -> asyncpg.Pool:
    """Return the installed pool or raise.

    Raises
    ------
    RuntimeError
        If the pool has not been initialized. This indicates a lifespan
        ordering bug: the caller tried to use the DB before startup finished
        or after shutdown completed.
    """

    if _pool is None:
        raise RuntimeError(
            "asyncpg pool not initialized. Ensure the FastAPI lifespan has "
            "completed startup before using src.backend.db.pool.get_pool()."
        )
    return _pool


async def close_pool() -> None:
    """Close the module-level pool if installed. Idempotent."""

    global _pool
    if _pool is not None:
        try:
            await _pool.close()
        finally:
            _pool = None


async def ping(pool: asyncpg.Pool | None = None) -> bool:
    """Run a trivial query to verify the pool is reachable.

    Used by ``/readyz`` and by tests. Returns True on success, False on any
    asyncpg error so callers can translate to an HTTP status without leaking
    database internals.
    """

    target = pool if pool is not None else _pool
    if target is None:
        return False
    try:
        async with target.acquire() as conn:
            value = await conn.fetchval("SELECT 1")
            return value == 1
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("db.ping.failed", exc_info=exc)
        return False


async def fetch_one(query: str, *args: Any) -> asyncpg.Record | None:
    """Run a query on the installed pool and return the first record.

    Thin wrapper so consumer modules do not each reach for ``get_pool``. The
    pool must be initialized; otherwise RuntimeError bubbles up.
    """

    pool = get_pool()
    async with pool.acquire() as conn:
        return await conn.fetchrow(query, *args)


async def fetch_all(query: str, *args: Any) -> Sequence[asyncpg.Record]:
    """Run a query on the installed pool and return all records."""

    pool = get_pool()
    async with pool.acquire() as conn:
        return await conn.fetch(query, *args)


async def execute(query: str, *args: Any) -> str:
    """Run a DML statement on the installed pool and return the status tag."""

    pool = get_pool()
    async with pool.acquire() as conn:
        return await conn.execute(query, *args)


__all__ = [
    "close_pool",
    "create_app_pool",
    "create_migration_pool",
    "execute",
    "fetch_all",
    "fetch_one",
    "get_pool",
    "ping",
    "set_pool",
]
