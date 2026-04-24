"""SET LOCAL hemera.actor_id helper.

The audit trigger reads ``current_setting('hemera.actor_id', true)`` and
attributes the audit row to that user. Callers that mutate flags or
overrides MUST bind the actor before issuing the write. The system cron
(TTL sweep) leaves it unset so audit rows land with actor_user_id=NULL.

Usage
-----
::

    from src.backend.flags.actor import actor_scoped

    async with pool.acquire() as conn:
        async with conn.transaction():
            await actor_scoped(conn, user_id=principal.user_id)
            await conn.execute("UPDATE hemera_override SET ...")

or through the combined helper::

    from src.backend.flags.actor import run_with_actor

    await run_with_actor(pool, user_id, async_body)

Both forms rely on Postgres' ``SET LOCAL`` behaviour: the GUC is scoped
to the enclosing transaction and cleared automatically on commit / rollback.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator, Awaitable, Callable
from uuid import UUID

import asyncpg

ACTOR_SETTING_KEY = "hemera.actor_id"
"""GUC key read by the audit triggers."""

AUDIT_ACTION_SETTING_KEY = "hemera.audit_action"
"""GUC key read by the override-DELETE trigger to override the action label
(so the TTL sweep can write ``override_expired`` instead of
``override_deleted``)."""


async def set_actor(conn: asyncpg.Connection, user_id: UUID | str | None) -> None:
    """Bind ``hemera.actor_id`` for the current transaction.

    ``user_id=None`` binds an empty string; the trigger's ``NULLIF(..., '')``
    clause collapses that to SQL NULL. Using an empty string instead of
    just skipping the call keeps the GUC value deterministic across a
    reused connection (no bleed from a previous transaction).
    """

    if user_id is None:
        await conn.execute("SET LOCAL hemera.actor_id = ''")
        return

    normalised = _normalise_uuid(user_id)
    # SET LOCAL does not accept parameter placeholders; inline the UUID
    # after shape-validation. The UUID character set is closed so this is
    # injection-safe.
    await conn.execute(f"SET LOCAL hemera.actor_id = '{normalised}'")


async def set_audit_action(conn: asyncpg.Connection, action: str | None) -> None:
    """Bind ``hemera.audit_action`` for the current transaction.

    Used by the TTL sweep to write ``override_expired`` instead of the
    default ``override_deleted``. ``action=None`` clears the override.
    """

    if action is None:
        await conn.execute("SET LOCAL hemera.audit_action = ''")
        return
    # Validate whitelist to keep the inlined string safe. The Postgres
    # CHECK constraint already rejects anything else, but we want a tight
    # error at the API layer.
    allowed = {
        "override_created",
        "override_updated",
        "override_deleted",
        "override_expired",
    }
    if action not in allowed:
        raise ValueError(f"audit_action must be one of {allowed}, got {action!r}")
    await conn.execute(f"SET LOCAL hemera.audit_action = '{action}'")


@asynccontextmanager
async def actor_scoped(
    pool: asyncpg.Pool,
    *,
    user_id: UUID | str | None,
) -> AsyncIterator[asyncpg.Connection]:
    """Acquire a connection, open a transaction, bind the actor, yield.

    Semantics match :func:`src.backend.db.tenant.tenant_scoped`: the GUC
    is cleared when the enclosing transaction commits or rolls back so
    connection reuse cannot leak the actor across request boundaries.
    """

    async with pool.acquire() as conn:
        async with conn.transaction():
            await set_actor(conn, user_id)
            yield conn


async def run_with_actor(
    pool: asyncpg.Pool,
    user_id: UUID | str | None,
    body: Callable[[asyncpg.Connection], Awaitable[None]],
) -> None:
    """Convenience wrapper: ``async with actor_scoped(...) as conn: await body(conn)``.

    Callers that need a single-statement actor-scoped write use this to
    avoid nested ``async with`` blocks.
    """

    async with actor_scoped(pool, user_id=user_id) as conn:
        await body(conn)


def _normalise_uuid(value: UUID | str) -> str:
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, str):
        parsed = UUID(value)
        return str(parsed)
    raise TypeError(
        f"user_id must be uuid.UUID or str, got {type(value).__name__}"
    )


__all__ = [
    "ACTOR_SETTING_KEY",
    "AUDIT_ACTION_SETTING_KEY",
    "actor_scoped",
    "run_with_actor",
    "set_actor",
    "set_audit_action",
]
