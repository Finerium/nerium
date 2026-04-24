"""Redis cache for flag evaluations.

Key convention per ``docs/contracts/feature_flag.contract.md`` Section 7:

    flag:<flag_name>:<user_id_or_none>:<tenant_id_or_none>

Cache TTL is the contract-mandated 10 seconds (Section 4.1). Urgent
invalidations propagate via the ``flag:invalidate`` pub/sub channel
owned by :mod:`src.backend.flags.invalidator`; this module only
handles the get / set path.

Cache miss semantics
--------------------
- ``get_cached(...)`` returns ``_MISS`` on miss so callers distinguish a
  cached ``None`` (explicit ``null`` flag value, e.g.
  ``mcp.rate_limit_override``) from "not in cache". The sentinel is
  exported so tests can assert on it.
- ``set_cached(...)`` always overwrites; cache writes are idempotent.
- ``invalidate_flag(flag_name)`` removes every key matching
  ``flag:<flag_name>:*``. Called by the admin router after a mutation
  and by the invalidator consumer on pub/sub receipt.

Sentinel choice
---------------
``_MISS`` is a module-level singleton (an instance of
:class:`_MissSentinel`) rather than ``None`` so ``None`` can be a valid
cached value (see ``mcp.rate_limit_override`` default ``null``). Using
``object()`` directly is fine; we wrap it in a named class so the repr
is readable in test output.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Final
from uuid import UUID

from src.backend.redis_client import get_redis_client

logger = logging.getLogger(__name__)

CACHE_TTL_SECONDS: Final[int] = 10
"""Contract-mandated cache TTL. Do not increase without a ferry.

10 s is the upper bound for flag change latency. Pub/sub invalidation
(``invalidator.py``) drops the TTL to ~100 ms for mutations that go
through the admin API; TTL remains the floor for changes made via
direct SQL (e.g., debug session overrides) which bypass the invalidator.
"""

SCAN_COUNT: Final[int] = 200
"""Page size for SCAN during invalidation. 200 balances network round-trips
against per-call latency for the shard. Values beyond 500 show no measurable
improvement on a single-tenant Redis."""


class _MissSentinel:
    """Singleton sentinel signalling a cache miss."""

    __slots__ = ()

    def __repr__(self) -> str:  # pragma: no cover - trivial
        return "<flag-cache MISS>"


MISS: Final[_MissSentinel] = _MissSentinel()
"""Module-level singleton for cache misses."""


def cache_key(
    flag_name: str,
    *,
    user_id: UUID | str | None,
    tenant_id: UUID | str | None,
) -> str:
    """Return the canonical cache key.

    ``None`` scope components are encoded as the literal string ``none``
    so the key space is unambiguous. Per-user + per-tenant caches live
    side-by-side; the precedence collapse happens inside
    :func:`service.get_flag` before the cache lookup.
    """

    return (
        f"flag:{flag_name}"
        f":{_stringify(user_id)}"
        f":{_stringify(tenant_id)}"
    )


async def get_cached(
    flag_name: str,
    *,
    user_id: UUID | str | None,
    tenant_id: UUID | str | None,
) -> Any | _MissSentinel:
    """Return the cached JSON-decoded value, or :data:`MISS` on miss.

    Redis failures are treated as misses; the caller hits the DB. The
    failure is logged at WARN but not raised because a flag miss is
    recoverable while a Redis outage is.
    """

    key = cache_key(flag_name, user_id=user_id, tenant_id=tenant_id)
    client = get_redis_client()
    try:
        raw = await client.get(key)
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("flags.cache.get_failed key=%s err=%s", key, exc)
        return MISS
    finally:
        await client.close()

    if raw is None:
        return MISS
    try:
        return json.loads(raw)
    except ValueError:
        # Corrupt cache entry: purge and miss.
        logger.warning("flags.cache.decode_failed key=%s", key)
        await invalidate_key(key)
        return MISS


async def set_cached(
    flag_name: str,
    value: Any,
    *,
    user_id: UUID | str | None,
    tenant_id: UUID | str | None,
    ttl_seconds: int = CACHE_TTL_SECONDS,
) -> None:
    """Write ``value`` under the canonical cache key with TTL.

    ``value`` is serialised via ``json.dumps``. ``None`` is encoded as
    the JSON literal ``null`` so the distinction from :data:`MISS` is
    preserved.
    """

    key = cache_key(flag_name, user_id=user_id, tenant_id=tenant_id)
    payload = json.dumps(value)
    client = get_redis_client()
    try:
        await client.set(key, payload, ex=ttl_seconds)
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("flags.cache.set_failed key=%s err=%s", key, exc)
    finally:
        await client.close()


async def invalidate_flag(flag_name: str) -> int:
    """Remove every cache entry for ``flag_name``. Returns keys deleted.

    Uses SCAN + DEL rather than ``KEYS`` to avoid blocking the shard on
    a live database. ``COUNT`` is tuned via :data:`SCAN_COUNT`. Safe to
    call during a request because scanning is cooperative.
    """

    pattern = f"flag:{flag_name}:*"
    deleted = 0
    client = get_redis_client()
    try:
        async for key in client.scan_iter(match=pattern, count=SCAN_COUNT):
            try:
                deleted += await client.delete(key)
            except Exception as exc:  # pragma: no cover - defensive
                logger.warning(
                    "flags.cache.invalidate_key_failed key=%s err=%s", key, exc
                )
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning(
            "flags.cache.invalidate_scan_failed flag=%s err=%s", flag_name, exc
        )
    finally:
        await client.close()
    return deleted


async def invalidate_key(key: str) -> None:
    """Purge a specific key. Used on decode failure."""

    client = get_redis_client()
    try:
        await client.delete(key)
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("flags.cache.invalidate_single_failed key=%s err=%s", key, exc)
    finally:
        await client.close()


def _stringify(value: UUID | str | None) -> str:
    if value is None:
        return "none"
    if isinstance(value, UUID):
        return str(value)
    return str(value)


__all__ = [
    "CACHE_TTL_SECONDS",
    "MISS",
    "SCAN_COUNT",
    "cache_key",
    "get_cached",
    "invalidate_flag",
    "invalidate_key",
    "set_cached",
]
