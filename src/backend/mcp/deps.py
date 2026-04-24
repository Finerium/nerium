"""Shared dependencies for MCP tool handlers.

Owner: Khronos. Thin accessors so per-tool modules stay terse:

- :func:`hemera_flag`: reads a Hemera feature flag via env shim. Swap
  the body to delegate to ``src.backend.flags.service.get_flag`` once
  Hemera's service module lands.
- :func:`moros_budget_capped`: reads the Chronos budget cap Redis flag.
  Falls back to ``False`` (not capped) when Redis is unavailable so the
  MCP surface does not fail closed during demo bakes.
- :func:`db_fetch`, :func:`db_fetchrow`: wrap ``asyncpg.Pool.acquire``
  with tenant binding (``SET LOCAL app.tenant_id``) so per-tenant RLS
  applies transparently. Gracefully return empty / ``None`` when the
  target table has not yet been migrated by a downstream agent (Phanes,
  Tethys, Astraea, Kratos).
"""

from __future__ import annotations

import logging
import os
from typing import Any

import asyncpg

from src.backend.db.pool import get_pool

logger = logging.getLogger(__name__)

UNDEFINED_TABLE_SQLSTATE = "42P01"


# ---------------------------------------------------------------------------
# Feature flag reader (Hemera shim)
# ---------------------------------------------------------------------------


async def hemera_flag(flag_name: str, default: Any = None) -> Any:
    """Read a Hemera flag.

    Production path: ``from src.backend.flags.service import get_flag``.
    Present shim: environment variable ``HEMERA_FLAG_<NAME>`` parsed as
    JSON when possible, else raw string. Returns ``default`` when unset.
    """

    env_key = f"HEMERA_FLAG_{flag_name.upper().replace('.', '_')}"
    raw = os.environ.get(env_key)
    if raw is None:
        return default

    stripped = raw.strip()
    if stripped == "":
        return default
    lowered = stripped.lower()
    if lowered in {"true", "yes", "1", "on"}:
        return True
    if lowered in {"false", "no", "0", "off"}:
        return False
    try:
        import json

        return json.loads(stripped)
    except ValueError:
        return stripped


# ---------------------------------------------------------------------------
# Moros budget cap reader
# ---------------------------------------------------------------------------


async def moros_budget_capped(tenant_id: str | None = None) -> bool:
    """Return True when the Chronos budget cap flag is set in Redis.

    Global cap: ``chronos:ma_capped``. Per-tenant cap (future): ``chronos:tenant:<id>:capped``.
    Fails open on Redis unreachability: the daily usage-report reconciliation
    will catch up within 5 min per Moros contract.
    """

    try:
        from src.backend.redis_client import get_redis_client
    except ImportError:  # pragma: no cover
        return False

    try:
        client = get_redis_client()
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning(
            "moros.budget.cap.redis_unreachable",
            extra={"event": "moros.budget.cap.redis_unreachable", "err": str(exc)},
        )
        return False

    try:
        global_flag = await client.get("chronos:ma_capped")
        if global_flag and str(global_flag).lower() in {"1", "true"}:
            return True
        if tenant_id:
            tenant_flag = await client.get(f"chronos:tenant:{tenant_id}:capped")
            if tenant_flag and str(tenant_flag).lower() in {"1", "true"}:
                return True
        return False
    except Exception as exc:
        logger.warning(
            "moros.budget.cap.read_failed",
            extra={"event": "moros.budget.cap.read_failed", "err": str(exc)},
        )
        return False


# ---------------------------------------------------------------------------
# DB helpers with UndefinedTable-aware degradation
# ---------------------------------------------------------------------------


async def _bind_tenant(conn: asyncpg.Connection, tenant_id: str | None) -> None:
    if tenant_id is None:
        return
    try:
        await conn.execute(f"SET LOCAL app.tenant_id = '{tenant_id}'")
    except Exception:  # pragma: no cover - defensive
        # Tenant binding is best-effort inside MCP reads; RLS will still
        # filter against the app role default when the GUC is unset.
        pass


async def db_fetch(
    query: str,
    *args: Any,
    tenant_id: str | None = None,
) -> list[asyncpg.Record]:
    """SELECT many rows; returns ``[]`` on UndefinedTable + logs warning."""

    try:
        pool = get_pool()
    except RuntimeError:
        # Aether pool not initialised yet (unit test with no lifespan).
        logger.debug("mcp.db.pool_uninitialised")
        return []

    try:
        async with pool.acquire() as conn:
            async with conn.transaction():
                await _bind_tenant(conn, tenant_id)
                return list(await conn.fetch(query, *args))
    except asyncpg.UndefinedTableError as exc:
        logger.warning(
            "mcp.db.table_pending",
            extra={
                "event": "mcp.db.table_pending",
                "query_prefix": query.strip().split()[0] if query.strip() else "",
                "detail": str(exc)[:120],
            },
        )
        return []


async def db_fetchrow(
    query: str,
    *args: Any,
    tenant_id: str | None = None,
) -> asyncpg.Record | None:
    """SELECT one row; returns ``None`` on UndefinedTable + logs warning."""

    try:
        pool = get_pool()
    except RuntimeError:
        return None

    try:
        async with pool.acquire() as conn:
            async with conn.transaction():
                await _bind_tenant(conn, tenant_id)
                return await conn.fetchrow(query, *args)
    except asyncpg.UndefinedTableError as exc:
        logger.warning(
            "mcp.db.table_pending",
            extra={
                "event": "mcp.db.table_pending",
                "query_prefix": query.strip().split()[0] if query.strip() else "",
                "detail": str(exc)[:120],
            },
        )
        return None


__all__ = [
    "UNDEFINED_TABLE_SQLSTATE",
    "db_fetch",
    "db_fetchrow",
    "hemera_flag",
    "moros_budget_capped",
]
