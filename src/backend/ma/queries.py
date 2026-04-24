"""Postgres query helpers for the MA runtime.

Owner: Kratos (W2 S1).

Thin async wrappers over ``asyncpg`` so router code does not inline
SQL. Each helper expects a tenant-bound :class:`asyncpg.Connection` so
the RLS policy enforces isolation transparently; callers acquire the
connection via :func:`src.backend.db.tenant.tenant_scoped`.

Session 1 scope: session INSERT, status UPDATE (transition-guarded),
detail SELECT, list SELECT, active-count SELECT, cancel-flag helper
via Redis (see ``cancel_flag`` module; exposed here only as a
thin re-export for the router import). Step + event writes land in
Session 2 once the SDK loop is in place.

Contract references
-------------------
- ``docs/contracts/ma_session_lifecycle.contract.md`` Section 3.1 DDL.
- ``docs/contracts/agent_orchestration_runtime.contract.md`` Section 4.4
  concurrent session cap.
- ``docs/contracts/postgres_multi_tenant.contract.md`` Section 4.2
  tenant binding helper.

Design notes
------------
- We pass the ``session_id`` UUID through as a Python :class:`UUID` so
  asyncpg binds it via its UUID codec; Postgres ``uuid`` column types
  round-trip without explicit casts.
- ``jsonb`` columns are passed as JSON strings via ``json.dumps`` so
  the driver does not try to encode nested Decimal instances; the
  repository layer is the single place this encoding choice is made.
- The active-session cap check runs in the same transaction as the
  subsequent INSERT so a racing client cannot smuggle two sessions
  through the gap. Postgres serialisable isolation would also do the
  job but transaction-local counting is cheaper.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID

import asyncpg

from src.backend.ma.state_machine import MASessionStatus, assert_transition

logger = logging.getLogger(__name__)


async def insert_session(
    conn: asyncpg.Connection,
    *,
    session_id: UUID,
    tenant_id: UUID,
    user_id: UUID,
    mode: str,
    model: str,
    prompt: str,
    max_tokens: int,
    budget_usd_cap: Decimal,
    thinking: bool,
    tools: list[str],
    system_prompt: Optional[str],
    idempotency_key: Optional[str],
) -> asyncpg.Record:
    """Insert a new ``ma_session`` row and return the full record.

    Uses ``RETURNING *`` so the caller has the server-assigned
    ``created_at`` + ``updated_at`` timestamps without a follow-up
    SELECT. Idempotency key conflicts bubble up as
    :class:`asyncpg.UniqueViolationError`; the router catches them and
    replays the prior result per the contract idempotency rules.
    """

    row = await conn.fetchrow(
        """
        INSERT INTO ma_session (
            id, tenant_id, user_id, mode, model, status,
            system_prompt, prompt, max_tokens, budget_usd_cap,
            thinking, tools, idempotency_key
        )
        VALUES (
            $1, $2, $3, $4, $5, 'queued',
            $6, $7, $8, $9, $10, $11, $12
        )
        RETURNING *
        """,
        session_id,
        tenant_id,
        user_id,
        mode,
        model,
        system_prompt,
        prompt,
        max_tokens,
        budget_usd_cap,
        thinking,
        json.dumps(list(tools)),
        idempotency_key,
    )
    assert row is not None
    return row


async def select_session_by_idempotency_key(
    conn: asyncpg.Connection,
    *,
    user_id: UUID,
    idempotency_key: str,
) -> Optional[asyncpg.Record]:
    """Return the prior session row for an Idempotency-Key replay.

    The unique constraint is ``(user_id, idempotency_key)`` per the
    DDL; tenant binding already restricts the query to the caller's
    rows so we do not re-filter on tenant.
    """

    return await conn.fetchrow(
        "SELECT * FROM ma_session "
        "WHERE user_id = $1 AND idempotency_key = $2",
        user_id,
        idempotency_key,
    )


async def select_session_by_id(
    conn: asyncpg.Connection,
    *,
    session_id: UUID,
) -> Optional[asyncpg.Record]:
    """Return the row or ``None``. Tenant isolation via RLS + binding."""

    return await conn.fetchrow(
        "SELECT * FROM ma_session WHERE id = $1",
        session_id,
    )


async def count_active_sessions(
    conn: asyncpg.Connection,
    *,
    user_id: UUID,
) -> int:
    """Count ``running|streaming`` sessions for the given user.

    Used by the concurrent session cap check before insert.
    ``queued`` is not counted because the dispatcher picks the row up
    fast (< 100 ms per contract); counting it would make the gate
    overly tight during normal create bursts.
    """

    value = await conn.fetchval(
        "SELECT count(*) FROM ma_session "
        "WHERE user_id = $1 AND status IN ('running', 'streaming')",
        user_id,
    )
    return int(value or 0)


async def update_session_status(
    conn: asyncpg.Connection,
    *,
    session_id: UUID,
    to_status: MASessionStatus,
    error: Optional[dict[str, Any]] = None,
    stop_reason: Optional[str] = None,
    set_started_at: bool = False,
    set_ended_at: bool = False,
) -> asyncpg.Record:
    """Transition-guarded status update.

    Reads the current status, validates via
    :func:`src.backend.ma.state_machine.assert_transition`, then writes
    the new value + optional error blob. Raises
    :class:`InvalidTransitionError` on an illegal hop.
    """

    current = await conn.fetchval(
        "SELECT status FROM ma_session WHERE id = $1 FOR UPDATE",
        session_id,
    )
    if current is None:
        raise LookupError(f"ma_session id={session_id} not found")

    assert_transition(current, to_status)

    now = datetime.now(timezone.utc)
    started_expr = "started_at = $4" if set_started_at else "started_at = started_at"
    ended_expr = "ended_at = $5" if set_ended_at else "ended_at = ended_at"
    # The dance above keeps the parameter list stable regardless of
    # whether the caller opted into the timestamp writes; we always
    # bind $4 + $5 so asyncpg does not complain about missing params.
    row = await conn.fetchrow(
        f"""
        UPDATE ma_session
        SET
            status = $2,
            error = COALESCE($3, error),
            stop_reason = COALESCE($6, stop_reason),
            {started_expr},
            {ended_expr},
            updated_at = now()
        WHERE id = $1
        RETURNING *
        """,
        session_id,
        to_status.value,
        json.dumps(error) if error is not None else None,
        now,
        now,
        stop_reason,
    )
    assert row is not None
    logger.info(
        "ma.state.transitioned session_id=%s from=%s to=%s",
        session_id,
        current,
        to_status.value,
    )
    return row


__all__ = [
    "count_active_sessions",
    "insert_session",
    "select_session_by_id",
    "select_session_by_idempotency_key",
    "update_session_status",
]
