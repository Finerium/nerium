"""Override CRUD.

Admin router calls into these helpers. Each mutation:

1. Opens a transaction on the app pool.
2. ``SET LOCAL hemera.actor_id = '<actor>'`` so the audit trigger
   records the caller.
3. Runs the ``INSERT`` / ``UPDATE`` / ``DELETE``.
4. Commits; the trigger fires AFTER and writes the audit row.
5. Publishes a pub/sub invalidation message so cross-worker caches
   drop their entry within ~100 ms.

The invalidation happens AFTER commit, not inside the transaction,
because pub/sub is best-effort: a pre-commit publish that then rolled
back would leave caches showing the pre-commit state for up to 10 s
(cache TTL). Post-commit publish on success is the correct ordering.

Concurrent writes to the same ``(flag_name, scope_kind, scope_id)``
tuple resolve via the ``UNIQUE`` constraint: the second writer hits an
``asyncpg.UniqueViolationError`` and falls through to UPDATE. The
public ``upsert_override`` helper handles this with ``ON CONFLICT DO
UPDATE`` so callers never see the race.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any, Literal
from uuid import UUID

import asyncpg

from src.backend.db.pool import get_pool
from src.backend.flags.actor import actor_scoped, set_actor, set_audit_action
from src.backend.flags.cache import invalidate_flag
from src.backend.flags.errors import FlagNotFound, InvalidScope
from src.backend.flags.invalidator import publish_invalidation

logger = logging.getLogger(__name__)

ScopeLiteral = Literal["user", "tenant", "global"]


async def upsert_override(
    *,
    actor_id: UUID | str | None,
    flag_name: str,
    scope_kind: ScopeLiteral,
    scope_id: UUID | str | None,
    value: Any,
    expires_at: datetime | None = None,
    reason: str | None = None,
) -> int:
    """Create or replace an override. Returns the override id.

    Raises :class:`FlagNotFound` when ``flag_name`` is not registered and
    :class:`InvalidScope` when ``(scope_kind, scope_id)`` are inconsistent.
    The Postgres CHECK constraint would reject the latter too, but raising
    early keeps the error surface clean.
    """

    _validate_scope(scope_kind, scope_id)

    pool = get_pool()
    encoded = json.dumps(value)
    scope_uuid = _to_uuid(scope_id)
    created_by = _to_uuid(actor_id)

    async with actor_scoped(pool, user_id=actor_id) as conn:
        # Pre-check that the flag exists; the FK would reject a bad name
        # but the error surface is clearer here.
        exists = await conn.fetchval(
            "SELECT 1 FROM hemera_flag WHERE flag_name = $1", flag_name
        )
        if not exists:
            raise FlagNotFound(flag_name)

        record = await conn.fetchrow(
            """
            INSERT INTO hemera_override (
                flag_name, scope_kind, scope_id, value, expires_at,
                reason, created_by
            ) VALUES ($1, $2, $3::uuid, $4::jsonb, $5, $6, $7::uuid)
            ON CONFLICT (flag_name, scope_kind, scope_id) DO UPDATE SET
                value       = EXCLUDED.value,
                expires_at  = EXCLUDED.expires_at,
                reason      = EXCLUDED.reason,
                updated_at  = now()
            RETURNING id
            """,
            flag_name,
            scope_kind,
            scope_uuid,
            encoded,
            expires_at,
            reason,
            created_by,
        )
        override_id = int(record["id"])

    await _invalidate_after_commit(flag_name, source="override_upsert")
    return override_id


async def delete_override_by_scope(
    *,
    actor_id: UUID | str | None,
    flag_name: str,
    scope_kind: ScopeLiteral,
    scope_id: UUID | str | None,
) -> bool:
    """Delete the override matching the scope triple. Returns True on hit."""

    _validate_scope(scope_kind, scope_id)
    pool = get_pool()
    scope_uuid = _to_uuid(scope_id)

    async with actor_scoped(pool, user_id=actor_id) as conn:
        status = await conn.execute(
            """
            DELETE FROM hemera_override
            WHERE flag_name = $1
              AND scope_kind = $2
              AND scope_id IS NOT DISTINCT FROM $3::uuid
            """,
            flag_name,
            scope_kind,
            scope_uuid,
        )
    deleted = status.endswith(" 1")
    if deleted:
        await _invalidate_after_commit(flag_name, source="override_delete")
    return deleted


async def delete_override_by_id(
    *,
    actor_id: UUID | str | None,
    override_id: int,
) -> bool:
    """Delete an override by primary key. Returns True on hit.

    The admin router uses this when the caller passes a row id; the
    helper looks up the flag_name so the cache-invalidation broadcast
    remains scoped to the affected flag.
    """

    pool = get_pool()
    async with actor_scoped(pool, user_id=actor_id) as conn:
        row = await conn.fetchrow(
            "SELECT flag_name FROM hemera_override WHERE id = $1",
            override_id,
        )
        if row is None:
            return False
        status = await conn.execute(
            "DELETE FROM hemera_override WHERE id = $1", override_id
        )
    deleted = status.endswith(" 1")
    if deleted:
        await _invalidate_after_commit(row["flag_name"], source="override_delete")
    return deleted


async def sweep_expired_overrides(
    *,
    now: datetime | None = None,
) -> list[str]:
    """Delete overrides whose ``expires_at`` has passed. Returns flag names.

    Called by the Arq cron in :mod:`ttl_sweep`. Writes audit rows with
    ``action='override_expired'`` via the ``hemera.audit_action`` GUC so
    the stream differentiates auto-expiry from manual delete.

    Uses ``DELETE ... RETURNING`` to collect both the deleted flag names
    (for invalidation) and the row count (for observability).
    """

    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            # No actor for system cron. Leave hemera.actor_id at NULL.
            await set_actor(conn, None)
            await set_audit_action(conn, "override_expired")
            rows = await conn.fetch(
                """
                DELETE FROM hemera_override
                WHERE expires_at IS NOT NULL
                  AND expires_at <= COALESCE($1::timestamptz, now())
                RETURNING flag_name
                """,
                now,
            )

    flag_names = sorted({row["flag_name"] for row in rows})
    for name in flag_names:
        await invalidate_flag(name)
    if flag_names:
        await publish_invalidation(flag_names, source="ttl_sweep")
        logger.info(
            "flags.ttl_sweep.expired count=%d flags=%s",
            len(rows),
            flag_names,
        )
    return flag_names


async def list_overrides(flag_name: str) -> list[asyncpg.Record]:
    """List all overrides for a flag ordered by creation time ASC.

    Returns the raw asyncpg records; the router converts to Pydantic.
    """

    pool = get_pool()
    async with pool.acquire() as conn:
        return list(
            await conn.fetch(
                """
                SELECT id, flag_name, scope_kind, scope_id, value,
                       expires_at, reason, created_by, created_at, updated_at
                FROM hemera_override
                WHERE flag_name = $1
                ORDER BY created_at ASC
                """,
                flag_name,
            )
        )


def _validate_scope(scope_kind: str, scope_id: UUID | str | None) -> None:
    if scope_kind in ("user", "tenant") and scope_id is None:
        raise InvalidScope(scope_kind, scope_id)
    if scope_kind == "global" and scope_id is not None:
        raise InvalidScope(scope_kind, scope_id)


def _to_uuid(value: UUID | str | None) -> UUID | None:
    if value is None:
        return None
    if isinstance(value, UUID):
        return value
    return UUID(value)


async def _invalidate_after_commit(flag_name: str, *, source: str) -> None:
    """Run cache purge + pub/sub publish. Executed outside the transaction."""

    await invalidate_flag(flag_name)
    await publish_invalidation([flag_name], source=source)


__all__ = [
    "ScopeLiteral",
    "delete_override_by_id",
    "delete_override_by_scope",
    "list_overrides",
    "sweep_expired_overrides",
    "upsert_override",
]
