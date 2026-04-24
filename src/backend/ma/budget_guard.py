"""Chronos (Moros-owned) budget cap pre-call guard.

Owner: Kratos (W2 S1, reader of Chronos flags).

Two-tier check run before the session transitions out of ``queued``:

1. Global cap flag ``chronos:ma_capped`` (platform-wide kill switch).
2. Per-tenant cap flag ``chronos:tenant:<id>:capped`` + residual
   headroom via ``chronos:tenant:<id>:usd_today`` counter.

The actual budget *daemon* lives under Moros (``src/backend/budget/``).
Kratos holds only the read-side here; Moros P3 writes the counter +
flips the flag via the local accountant + the Admin Usage API poller.

Redis access
------------
The contract names the Redis keys under ``chronos:*`` so the Kratos
reader + the Moros writer share the same namespace. We use the
process-wide Redis client (Aether-owned) via ``get_redis`` so pytest
can swap a fakeredis backend through the same override pattern the
existing middleware tests rely on.

Contract references
-------------------
- ``docs/contracts/agent_orchestration_runtime.contract.md`` Section
  4.4 second bullet + Kratos hard-stop "Bypassing Chronos budget
  daemon".
- ``docs/contracts/budget_monitor.contract.md`` Section 3.2 Redis
  counter keys + Section 4.4 ``enforce_budget_cap`` signature.

Design notes
------------
- We tolerate Redis outages by failing **closed** (raise
  :class:`BudgetCapTripped`) to match the whitelist gate's posture; a
  degraded budget store is more harmful than a bounced request.
- ``remaining_usd`` surfaces even on the short-circuit path so the
  router can forward it into the 429 problem+json ``extensions`` for
  client UX.
- Per-tenant policy caps are **read by Moros**; we do not join
  ``budget_policy`` at the hot path. Instead the Moros local
  accountant writes the current cap as a second Redis key
  (``chronos:tenant:<id>:cap_usd``) when the policy is first loaded.
  If missing we fall back to the ``default_usd_cap`` constant and let
  Moros reconcile.
"""

from __future__ import annotations

import logging
from decimal import Decimal
from typing import Any
from uuid import UUID

from src.backend.ma.errors import BudgetCapTripped
from src.backend.redis_client import get_redis_client

logger = logging.getLogger(__name__)

CHRONOS_GLOBAL_CAP_KEY: str = "chronos:ma_capped"
"""Global platform cap flag ("1" when the whole platform is paused)."""

CHRONOS_TENANT_CAP_KEY_FMT: str = "chronos:tenant:{tenant_id}:capped"
"""Per-tenant cap flag key template."""

CHRONOS_TENANT_SPENT_KEY_FMT: str = "chronos:tenant:{tenant_id}:usd_today"
"""Per-tenant running spend counter key template."""

CHRONOS_TENANT_CAP_USD_KEY_FMT: str = "chronos:tenant:{tenant_id}:cap_usd"
"""Per-tenant daily cap (USD) key template. Written by Moros."""

# Fallback default if the tenant cap has not been seeded into Redis
# yet. Matches the hackathon submission default (USD 100/day) per
# ``budget_monitor.contract.md`` Section 1 + Ghaisan M1 response.
DEFAULT_TENANT_DAILY_CAP_USD: Decimal = Decimal("100.00")


async def enforce_budget_cap(
    tenant_id: UUID | str,
    requested_usd_cap: Decimal | float,
    *,
    redis: Any | None = None,
) -> None:
    """Raise :class:`BudgetCapTripped` when the pre-call budget is insufficient.

    Checks in order:

    1. Global flag ``chronos:ma_capped``.
    2. Tenant flag ``chronos:tenant:<id>:capped``.
    3. ``spent_today + requested_usd_cap > tenant_cap``.

    On Redis failure we fail **closed** because the budget daemon is
    the canonical source of truth; a missing view of spend is safer to
    pause than to permit.

    Parameters
    ----------
    tenant_id
        Owning tenant for the in-flight session.
    requested_usd_cap
        Per-session cap the user is asking to pre-allocate. Passing the
        row's ``budget_usd_cap`` is the typical call site.
    redis
        Optional Redis handle for tests; defaults to the process-wide
        client installed by the Aether lifespan.
    """

    client = redis if redis is not None else get_redis_client()
    tenant_key = str(tenant_id)
    requested = Decimal(str(requested_usd_cap))

    try:
        global_flag = await client.get(CHRONOS_GLOBAL_CAP_KEY)
    except Exception:
        logger.exception("ma.budget.redis_outage key=%s", CHRONOS_GLOBAL_CAP_KEY)
        raise BudgetCapTripped(
            "redis_unavailable_global",
            scope="global",
        )

    if _is_set_flag(global_flag):
        logger.info("ma.budget.global_cap_tripped tenant=%s", tenant_key)
        raise BudgetCapTripped("global_cap_tripped", scope="global")

    tenant_flag_key = CHRONOS_TENANT_CAP_KEY_FMT.format(tenant_id=tenant_key)
    spent_key = CHRONOS_TENANT_SPENT_KEY_FMT.format(tenant_id=tenant_key)
    cap_key = CHRONOS_TENANT_CAP_USD_KEY_FMT.format(tenant_id=tenant_key)

    try:
        tenant_flag, spent_raw, cap_raw = await _mget(
            client, (tenant_flag_key, spent_key, cap_key)
        )
    except Exception:
        logger.exception("ma.budget.redis_outage tenant_key=%s", tenant_flag_key)
        raise BudgetCapTripped(
            "redis_unavailable_tenant",
            scope="tenant",
        )

    if _is_set_flag(tenant_flag):
        logger.info("ma.budget.tenant_cap_tripped tenant=%s", tenant_key)
        raise BudgetCapTripped("tenant_cap_tripped", scope="tenant")

    spent = _coerce_decimal(spent_raw, default=Decimal("0"))
    cap = _coerce_decimal(cap_raw, default=DEFAULT_TENANT_DAILY_CAP_USD)
    projected = spent + requested
    if projected > cap:
        remaining = cap - spent
        logger.info(
            "ma.budget.insufficient_remaining tenant=%s spent=%s cap=%s requested=%s",
            tenant_key,
            spent,
            cap,
            requested,
        )
        raise BudgetCapTripped(
            "insufficient_remaining",
            scope="tenant",
            remaining_usd=float(max(remaining, Decimal("0"))),
        )

    logger.debug(
        "ma.budget.pass tenant=%s spent=%s cap=%s requested=%s",
        tenant_key,
        spent,
        cap,
        requested,
    )


def _is_set_flag(raw: Any) -> bool:
    """Treat ``b"1"``, ``"1"``, and True-ish values as the cap flag set."""

    if raw is None:
        return False
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8", errors="ignore")
    if isinstance(raw, str):
        return raw.strip() == "1"
    return bool(raw)


async def _mget(client: Any, keys: tuple[str, ...]) -> tuple[Any, ...]:
    """Prefer ``mget`` where available, fall back to individual ``get`` calls.

    ``redis.asyncio.Redis`` exposes ``mget`` natively; the fakeredis
    stub in tests does too. Keeping the fallback lets us pass a plain
    ``AsyncMock(get=...)`` without wiring a bespoke mget.
    """

    mget = getattr(client, "mget", None)
    if callable(mget):
        result = await mget(*keys)
        return tuple(result)
    values = []
    for key in keys:
        values.append(await client.get(key))
    return tuple(values)


def _coerce_decimal(raw: Any, *, default: Decimal) -> Decimal:
    if raw is None:
        return default
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8", errors="ignore")
    try:
        return Decimal(str(raw))
    except (ValueError, ArithmeticError):
        return default


__all__ = [
    "CHRONOS_GLOBAL_CAP_KEY",
    "CHRONOS_TENANT_CAP_KEY_FMT",
    "CHRONOS_TENANT_CAP_USD_KEY_FMT",
    "CHRONOS_TENANT_SPENT_KEY_FMT",
    "DEFAULT_TENANT_DAILY_CAP_USD",
    "enforce_budget_cap",
]
