"""Cost tracker + mid-session budget enforcement.

Owner: Kratos (W2 S3) reader + writer; Moros owns the daemon.

Responsibilities split
----------------------

- **Kratos (here):** compute cost USD from Anthropic ``message_delta.usage``
  deltas, write per-session total to ``ma_session.cost_usd``, emit
  ``nerium.system.budget_alert`` wire events on threshold cross, flip
  the per-session ``ma.budget.updated`` wire event each API call.

- **Moros (``src/backend/budget/``, arrives in P3):** global +
  tenant-scoped counters, daily rollover cron, Anthropic Admin Usage
  API reconciliation, Hemera auto-disable on cap trip, cap flag
  lifecycle.

The boundary is a single Arq task: Kratos enqueues
``ma_record_session_cost`` when a session transitions to a terminal
state, Moros's local accountant consumes it and increments
``chronos:tenant:<id>:usd_today`` + enforces threshold + auto-disable
logic.

Until Moros P3 lands, Kratos still performs the pre-call read + the
per-session write; the daily rollup + reconciliation path is a no-op
but the contract shape is ready.

Contract references
-------------------
- ``docs/contracts/budget_monitor.contract.md`` Section 3.3 pricing
  map + formula.
- ``docs/contracts/agent_orchestration_runtime.contract.md`` Section
  4.5 post-call cost write + Section 5 wire events.
- ``docs/contracts/realtime_bus.contract.md`` Section 3.3
  ``BudgetAlertPayload``.
"""

from __future__ import annotations

import logging
from decimal import Decimal
from typing import Any, Literal, TypedDict
from uuid import UUID

import asyncpg

from src.backend.ma.errors import BudgetCapTripped
from src.backend.ma.state_machine import MASessionStatus

logger = logging.getLogger(__name__)


# Anthropic pricing per-million-tokens (April 2026) mirrored from
# ``budget_monitor.contract.md`` Section 3.3. Authoritative copy lives
# in ``src/backend/budget/pricing.py`` (Moros); we keep a read-only
# mirror here so S3 can compute without a Moros dependency. Bumps
# require a contract revision + migration + sync of both constants.
_MODEL_PRICING_USD_PER_M: dict[str, dict[str, Decimal]] = {
    "claude-opus-4-7": {
        "input": Decimal("5"),
        "output": Decimal("25"),
        "cache_read": Decimal("0.50"),
        "cache_write": Decimal("6.25"),
    },
    "claude-opus-4-6": {
        "input": Decimal("5"),
        "output": Decimal("25"),
        "cache_read": Decimal("0.50"),
        "cache_write": Decimal("6.25"),
    },
    "claude-sonnet-4-6": {
        "input": Decimal("3"),
        "output": Decimal("15"),
        "cache_read": Decimal("0.30"),
        "cache_write": Decimal("3.75"),
    },
    "claude-haiku-4-5": {
        "input": Decimal("1"),
        "output": Decimal("5"),
        "cache_read": Decimal("0.10"),
        "cache_write": Decimal("1.25"),
    },
}

_PER_MILLION = Decimal("1000000")


class UsageDelta(TypedDict, total=False):
    """Fields harvested from Anthropic ``message_delta.usage``.

    Shape mirrors the Anthropic stream envelope per M1 Section B.13;
    ``cache_read_input_tokens`` + ``cache_creation_input_tokens`` are
    included for cache-aware pricing.
    """

    input_tokens: int
    output_tokens: int
    cache_read_input_tokens: int
    cache_creation_input_tokens: int


def compute_cost_usd(
    model: str,
    usage: UsageDelta,
) -> Decimal:
    """Apply the pricing formula from ``budget_monitor.contract.md``.

    Formula::

        cost = (input - cache_read - cache_write) * input_price / 1e6
             + output * output_price / 1e6
             + cache_read * cache_read_price / 1e6
             + cache_write * cache_write_price / 1e6

    Unknown models raise :class:`KeyError`; the caller maps that to
    ``failed`` with ``error_kind = unknown_model``.
    """

    prices = _MODEL_PRICING_USD_PER_M[model]
    input_tokens = Decimal(int(usage.get("input_tokens", 0)))
    output_tokens = Decimal(int(usage.get("output_tokens", 0)))
    cache_read = Decimal(int(usage.get("cache_read_input_tokens", 0)))
    cache_write = Decimal(int(usage.get("cache_creation_input_tokens", 0)))

    uncached_input = input_tokens - cache_read - cache_write
    if uncached_input < 0:
        uncached_input = Decimal(0)

    cost = (
        uncached_input * prices["input"]
        + output_tokens * prices["output"]
        + cache_read * prices["cache_read"]
        + cache_write * prices["cache_write"]
    ) / _PER_MILLION

    return cost.quantize(Decimal("0.000001"))


async def write_session_usage(
    conn: asyncpg.Connection,
    *,
    session_id: UUID,
    usage: UsageDelta,
    model: str,
) -> tuple[Decimal, asyncpg.Record]:
    """Persist usage + cost onto ``ma_session`` in a single UPDATE.

    Returns ``(cost_usd_delta, updated_row)``. The row reflects the
    accumulated totals after the update; callers use the cost delta
    as the wire ``nerium.system.budget_alert`` payload value.
    """

    cost_delta = compute_cost_usd(model, usage)
    row = await conn.fetchrow(
        """
        UPDATE ma_session SET
            input_tokens       = input_tokens + $2,
            output_tokens      = output_tokens + $3,
            cache_read_tokens  = cache_read_tokens + $4,
            cache_write_tokens = cache_write_tokens + $5,
            cost_usd           = cost_usd + $6,
            updated_at         = now()
        WHERE id = $1
        RETURNING *
        """,
        session_id,
        int(usage.get("input_tokens", 0)),
        int(usage.get("output_tokens", 0)),
        int(usage.get("cache_read_input_tokens", 0)),
        int(usage.get("cache_creation_input_tokens", 0)),
        cost_delta,
    )
    if row is None:
        raise LookupError(f"ma_session id={session_id} not found")
    logger.info(
        "ma.budget.updated session_id=%s cost_delta=%s cost_total=%s",
        session_id,
        cost_delta,
        row["cost_usd"],
    )
    return cost_delta, row


def should_halt_for_session_cap(
    *, cost_usd: Decimal, cap_usd: Decimal
) -> bool:
    """Return ``True`` when the accumulated cost has reached or exceeded the cap.

    The dispatcher calls this after each ``write_session_usage`` so
    long reasoning turns cannot overshoot the per-session budget by
    more than one token burst.
    """

    return Decimal(str(cost_usd)) >= Decimal(str(cap_usd))


def enforce_session_cap(
    *, session_id: UUID, cost_usd: Decimal, cap_usd: Decimal
) -> None:
    """Raise :class:`BudgetCapTripped` when the per-session cap trips.

    Raised with ``scope='session'`` so the dispatcher can distinguish
    a session-level terminate (budget_capped) from a tenant/global
    short-circuit (same status, different cause).
    """

    if should_halt_for_session_cap(cost_usd=cost_usd, cap_usd=cap_usd):
        logger.info(
            "ma.budget.session_cap_tripped session_id=%s cost=%s cap=%s",
            session_id,
            cost_usd,
            cap_usd,
        )
        raise BudgetCapTripped(
            "session_cap_tripped",
            scope="session",
            remaining_usd=0.0,
        )


def build_budget_alert_payload(
    *,
    tenant_id: str,
    session_id: str,
    spent_usd_today: float,
    cap_usd_today: float,
    threshold_pct: Literal[50, 75, 90, 100],
    builder_disabled: bool,
) -> dict[str, Any]:
    """Shape the ``nerium.system.budget_alert`` + per-session wire payload.

    Returns the dict the event bus serialises to the Redis Pub/Sub
    channel; structure mirrors
    ``realtime_bus.contract.md`` Section 3.3 :class:`BudgetAlertPayload`.
    """

    return {
        "tenant_id": tenant_id,
        "session_id": session_id,
        "threshold_pct": int(threshold_pct),
        "spent_usd_today": float(spent_usd_today),
        "cap_usd_today": float(cap_usd_today),
        "builder_disabled": bool(builder_disabled),
    }


def pick_threshold(
    *, spent_usd: Decimal, cap_usd: Decimal
) -> Literal[50, 75, 90, 100] | None:
    """Return the highest crossed threshold, or ``None`` if below 50%.

    Used by the alert emitter to dedupe repeated alerts: the caller
    tracks which threshold was last emitted per session so the same
    number does not fire twice.
    """

    if cap_usd <= 0:
        return None
    pct = float((Decimal(str(spent_usd)) / Decimal(str(cap_usd))) * 100)
    if pct >= 100:
        return 100
    if pct >= 90:
        return 90
    if pct >= 75:
        return 75
    if pct >= 50:
        return 50
    return None


__all__ = [
    "UsageDelta",
    "build_budget_alert_payload",
    "compute_cost_usd",
    "enforce_session_cap",
    "pick_threshold",
    "should_halt_for_session_cap",
    "write_session_usage",
]
