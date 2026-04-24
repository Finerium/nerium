"""Core flag evaluation service.

Entry point: :func:`get_flag`. Reads the Redis cache; on miss, runs a
single-query LATERAL join against Postgres to resolve precedence, caches
for ~10 s, and returns the JSON-decoded value.

Precedence (most specific first)
--------------------------------
1. ``scope_kind='user'``   AND ``scope_id = :user_id``
2. ``scope_kind='tenant'`` AND ``scope_id = :tenant_id``
3. ``scope_kind='global'`` AND ``scope_id IS NULL``
4. ``hemera_flag.default_value``

Override rows with ``expires_at IS NOT NULL AND expires_at <= now()``
are ignored. The nightly TTL sweep deletes them, but the query is
defensive in case the sweep has not yet run.

Unknown flag
------------
``get_flag`` returns ``None`` for flags that are not registered in
``hemera_flag``. This is intentional: consumers pass a coded default
that is never ``None`` for boolean flags (e.g. ``builder.live`` falls
back to ``False``), and the router surfaces 404 separately.

Cache misses fall through to a direct DB read. DB failures bubble up
as ``asyncpg`` exceptions; the fail-open behaviour is left to the
caller because "flag unknown" is a safer default for kill-switches
than "flag true".

Process-local bootstrap cache
-----------------------------
:func:`bootstrap_all_flags` preloads every flag's default value into a
process-local dict at lifespan startup. Sync consumers (the boot-time
Khronos MCP rate-limit registration) read from this dict via
:func:`get_bootstrap_default` so they do not need the async Redis /
Postgres round-trip during ``create_app``. Pub/sub invalidation and
the admin API refresh the bootstrap dict on change.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Final
from uuid import UUID

import asyncpg

from src.backend.db.pool import get_pool
from src.backend.flags import cache
from src.backend.flags.errors import FlagNotFound
from src.backend.flags.schemas import FlagKind

logger = logging.getLogger(__name__)

# Module-level bootstrap dict. Written by ``bootstrap_all_flags`` at
# lifespan startup + refreshed by the pub/sub invalidator on mutation.
# Reads are cheap; writes hold the asyncio event loop during the DB
# fetch. The dict-of-dicts layout mirrors a flattened hemera_flag row.
_BOOTSTRAP_DEFAULTS: dict[str, dict[str, Any]] = {}


# Single-query LATERAL resolution. Returns one row per flag_name. If the
# flag does not exist, zero rows. If no override matches, ``override_value``
# is NULL and ``override_scope`` is NULL, so the caller falls back to the
# ``default_value`` column.
_RESOLVE_SQL: Final[str] = """
SELECT
  f.flag_name,
  f.kind,
  f.default_value,
  f.tags,
  o.value       AS override_value,
  o.scope_kind  AS override_scope
FROM hemera_flag f
LEFT JOIN LATERAL (
  SELECT value, scope_kind
  FROM hemera_override ov
  WHERE ov.flag_name = f.flag_name
    AND (ov.expires_at IS NULL OR ov.expires_at > now())
    AND (
      (ov.scope_kind = 'user'   AND ov.scope_id = $2::uuid)
      OR (ov.scope_kind = 'tenant' AND ov.scope_id = $3::uuid)
      OR (ov.scope_kind = 'global' AND ov.scope_id IS NULL)
    )
  ORDER BY CASE ov.scope_kind
           WHEN 'user'   THEN 1
           WHEN 'tenant' THEN 2
           WHEN 'global' THEN 3
         END
  LIMIT 1
) o ON TRUE
WHERE f.flag_name = $1
"""


async def get_flag(
    flag_name: str,
    *,
    user_id: UUID | str | None = None,
    tenant_id: UUID | str | None = None,
    use_cache: bool = True,
) -> Any:
    """Return the effective flag value for the given scope.

    Returns
    -------
    Any
        The JSON-decoded value. ``None`` when the flag is not registered
        (differentiated from a cached ``null`` only by callers that check
        via :func:`is_flag_registered`).

    Parameters
    ----------
    flag_name
        Dot-separated lowercase name, e.g. ``builder.live``.
    user_id
        Authenticated user id. Pass ``None`` for system-scope evaluations
        (e.g. background jobs with no user context).
    tenant_id
        Tenant id. Pass ``None`` for non-tenant-scoped evaluation paths.
    use_cache
        Set to ``False`` in tests that want to bypass Redis.
    """

    if use_cache:
        cached = await cache.get_cached(
            flag_name, user_id=user_id, tenant_id=tenant_id
        )
        if cached is not cache.MISS:
            return cached

    row = await _fetch_effective(flag_name, user_id, tenant_id)
    if row is None:
        # Unknown flag. Do not cache so a subsequent flag_created is
        # picked up on the next request without waiting for TTL.
        return None

    value = (
        _decode(row["override_value"])
        if row["override_value"] is not None
        else _decode(row["default_value"])
    )

    if use_cache:
        await cache.set_cached(
            flag_name, value, user_id=user_id, tenant_id=tenant_id
        )
    return value


async def get_flag_strict(
    flag_name: str,
    *,
    user_id: UUID | str | None = None,
    tenant_id: UUID | str | None = None,
) -> Any:
    """Same as :func:`get_flag` but raises :class:`FlagNotFound` on unknown.

    Admin API uses this so unknown flags produce 404 instead of ``null``.
    """

    if flag_name in _BOOTSTRAP_DEFAULTS:
        # Fast path: we know the flag exists; fall into the cached route.
        return await get_flag(
            flag_name, user_id=user_id, tenant_id=tenant_id
        )

    row = await _fetch_effective(flag_name, user_id, tenant_id)
    if row is None:
        raise FlagNotFound(flag_name)

    value = (
        _decode(row["override_value"])
        if row["override_value"] is not None
        else _decode(row["default_value"])
    )
    await cache.set_cached(
        flag_name, value, user_id=user_id, tenant_id=tenant_id
    )
    return value


async def bootstrap_all_flags() -> dict[str, Any]:
    """Load all flag defaults into the module-level bootstrap cache.

    Called by the FastAPI lifespan after the DB pool comes up. Returns
    the loaded dict so callers can log the count. Subsequent calls
    (invalidator receipt, admin mutations) refresh in-place.
    """

    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT flag_name, kind, default_value, tags "
            "FROM hemera_flag"
        )

    refreshed: dict[str, dict[str, Any]] = {}
    for row in rows:
        refreshed[row["flag_name"]] = {
            "kind": row["kind"],
            "default_value": _decode(row["default_value"]),
            "tags": list(row["tags"] or ()),
        }

    _BOOTSTRAP_DEFAULTS.clear()
    _BOOTSTRAP_DEFAULTS.update(refreshed)
    logger.info("flags.bootstrap.loaded count=%d", len(refreshed))
    return {name: entry["default_value"] for name, entry in refreshed.items()}


async def refresh_bootstrap_flag(flag_name: str) -> None:
    """Reload a single flag row into the bootstrap cache.

    Called by the invalidator consumer + the admin mutation routes so
    sync consumers (boot-time Khronos registration) see the new default
    on their next read. Absent flags are removed.
    """

    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT flag_name, kind, default_value, tags "
            "FROM hemera_flag WHERE flag_name = $1",
            flag_name,
        )

    if row is None:
        _BOOTSTRAP_DEFAULTS.pop(flag_name, None)
        return

    _BOOTSTRAP_DEFAULTS[flag_name] = {
        "kind": row["kind"],
        "default_value": _decode(row["default_value"]),
        "tags": list(row["tags"] or ()),
    }


def get_bootstrap_default(flag_name: str) -> Any | None:
    """Sync read from the bootstrap cache.

    Returns ``None`` when the flag is not registered or the bootstrap
    has not yet run. Sync consumers (Khronos rate-limit module) call
    this and treat ``None`` as "use hard-coded default".
    """

    entry = _BOOTSTRAP_DEFAULTS.get(flag_name)
    if entry is None:
        return None
    return entry["default_value"]


def get_bootstrap_kind(flag_name: str) -> FlagKind | None:
    """Sync read of the declared kind. ``None`` when not registered."""

    entry = _BOOTSTRAP_DEFAULTS.get(flag_name)
    if entry is None:
        return None
    return entry["kind"]  # type: ignore[return-value]


def bootstrap_snapshot() -> dict[str, Any]:
    """Return a shallow copy of the bootstrap defaults.

    Used by the admin diagnostics endpoint and by tests. Not a hot path;
    shallow-copy is fine.
    """

    return {name: entry["default_value"] for name, entry in _BOOTSTRAP_DEFAULTS.items()}


async def is_flag_registered(flag_name: str) -> bool:
    """Return ``True`` when the flag exists in ``hemera_flag``.

    Consults the bootstrap cache first; falls back to a DB hit when the
    cache has not yet run or the flag was freshly created.
    """

    if flag_name in _BOOTSTRAP_DEFAULTS:
        return True
    pool = get_pool()
    async with pool.acquire() as conn:
        return bool(
            await conn.fetchval(
                "SELECT 1 FROM hemera_flag WHERE flag_name = $1",
                flag_name,
            )
        )


def evaluate(
    *,
    default_value: Any,
    overrides: list[dict[str, Any]],
    user_id: UUID | str | None,
    tenant_id: UUID | str | None,
) -> Any:
    """Pure-function precedence resolver for unit tests.

    Each ``overrides`` entry is a dict with keys ``scope_kind``,
    ``scope_id``, ``value``, ``expires_at``. ``expires_at`` may be a
    :class:`datetime` or ``None``; the function does NOT filter expired
    rows since the DB query does. Tests that want to exercise expiry
    exclude them from the input list.
    """

    user_key = _stringify(user_id)
    tenant_key = _stringify(tenant_id)
    best: tuple[int, Any] | None = None
    for entry in overrides:
        kind = entry["scope_kind"]
        sid = _stringify(entry.get("scope_id"))
        if kind == "user" and user_id is not None and sid == user_key:
            precedence = 1
        elif kind == "tenant" and tenant_id is not None and sid == tenant_key:
            precedence = 2
        elif kind == "global" and sid == "none":
            precedence = 3
        else:
            continue
        if best is None or precedence < best[0]:
            best = (precedence, entry["value"])
    if best is not None:
        return best[1]
    return default_value


async def _fetch_effective(
    flag_name: str,
    user_id: UUID | str | None,
    tenant_id: UUID | str | None,
) -> asyncpg.Record | None:
    """Return a single row from :data:`_RESOLVE_SQL` or ``None``."""

    pool = get_pool()
    user_arg = _to_uuid(user_id)
    tenant_arg = _to_uuid(tenant_id)
    async with pool.acquire() as conn:
        return await conn.fetchrow(_RESOLVE_SQL, flag_name, user_arg, tenant_arg)


def _to_uuid(value: UUID | str | None) -> UUID | None:
    if value is None:
        return None
    if isinstance(value, UUID):
        return value
    return UUID(value)


def _stringify(value: UUID | str | None) -> str:
    if value is None:
        return "none"
    if isinstance(value, UUID):
        return str(value)
    return str(value)


def _decode(raw: Any) -> Any:
    """Decode an asyncpg ``jsonb`` column.

    asyncpg returns ``jsonb`` as a Python string when no codec is
    registered. Aether's pool does not register one (see
    ``src/backend/db/pool.py`` docstring), so every jsonb read is a
    ``json.loads`` dance. We accept already-decoded values too so tests
    can pass plain Python objects without encoding first.
    """

    if raw is None:
        return None
    if isinstance(raw, (dict, list, bool, int, float)):
        return raw
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except ValueError:
            # Treat as plain string value.
            return raw
    return raw


__all__ = [
    "bootstrap_all_flags",
    "bootstrap_snapshot",
    "evaluate",
    "get_bootstrap_default",
    "get_bootstrap_kind",
    "get_flag",
    "get_flag_strict",
    "is_flag_registered",
    "refresh_bootstrap_flag",
]
