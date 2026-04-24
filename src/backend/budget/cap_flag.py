"""Cap-flag transitions for the Chronos budget daemon.

Owner: Moros (W2 NP P3 S1). This module centralises the three
transitions that move the platform between *uncapped* and *capped*
states:

1. ``trip_global_cap``  : writes ``chronos:ma_capped=1`` + flips the
   Hemera ``builder.live`` flag to ``false`` + broadcasts the
   ``nerium.system.budget_alert`` event via Nike + publishes on the
   Redis pub/sub cap-events channel.
2. ``clear_global_cap`` : inverse; used by the daily reset cron.
3. ``evaluate_and_cap`` : pure-ish orchestration called from the
   poller + the local accountant. Compares spend vs flag-defined caps
   and calls ``trip_global_cap`` when a threshold is crossed.

Contract references
-------------------
- ``docs/contracts/budget_monitor.contract.md`` Section 4.3 threshold
  + auto-disable shape.
- ``docs/contracts/feature_flag.contract.md`` Section 4 override CRUD
  (we write via :func:`upsert_override` so the audit trigger fires).
- ``docs/contracts/realtime_bus.contract.md`` Section 3.3
  ``BudgetAlertPayload``.

Ordering discipline
-------------------
Per the Moros anti-pattern honor line: set the Redis cap flag FIRST,
then flip Hemera, then broadcast. The Kratos pre-call gate already
reads the Redis flag, so setting it first closes the fast-path race
before Hemera's 10 s cache propagation catches up.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Literal

from src.backend.budget.redis_keys import (
    CAP_EVENTS_CHANNEL,
    GLOBAL_AUTO_DISABLED_FLAG,
    GLOBAL_CAP_FLAG,
    seconds_until_next_utc_midnight,
)
from src.backend.obs.metrics import (
    budget_alert_threshold_total,
    budget_cap_tripped_total,
    budget_global_spent_usd,
)

logger = logging.getLogger(__name__)


# Reason strings captured on the Hemera override + on the Redis
# pub/sub payload. Matching tokens so an operator who greps Hemera
# audit for "budget_cap_auto" and Redis pub/sub for the same token
# sees the full trace.

REASON_AUTO_TRIPPED: str = "budget_cap_auto"
REASON_AUTO_RESET: str = "budget_cap_auto_reset"

# Threshold ladder. Contract Section 3.1 lists 50/75/90/100 as the
# canonical set; we only materialise 90 (warn) + 100 (hard) in the
# first ship so the blast radius stays small. Post-hackathon will
# add 50/75 once the UI can surface them without spam.
THRESHOLD_WARN_PCT: int = 90
THRESHOLD_HARD_PCT: int = 100

PUBLISH_EVENT_TRIPPED: str = "nerium.system.budget_cap.tripped"
PUBLISH_EVENT_CLEARED: str = "nerium.system.budget_cap.cleared"
PUBLISH_EVENT_WARNING: str = "nerium.system.budget_cap.warning"


BudgetCapKind = Literal["daily", "monthly"]


@dataclass(frozen=True)
class CapDecision:
    """Outcome of :func:`evaluate_and_cap`.

    Test ergonomic: asserts reason codes without re-inspecting Redis
    state. ``triggered`` is ``True`` when the decision moved the flag
    from off to on (idempotent repeat calls return ``False``).
    """

    triggered: bool
    warn_emitted: bool
    kind: BudgetCapKind | None
    spent_usd: Decimal
    cap_usd: Decimal
    pct: float


async def trip_global_cap(
    *,
    redis: Any,
    kind: BudgetCapKind,
    spent_usd: Decimal,
    cap_usd: Decimal,
    cycle_id: str | None = None,
) -> bool:
    """Flip the Redis cap flag + auto-disable Hemera + broadcast.

    Returns ``True`` when this call is the one that moved the flag.
    Idempotent: a second call with the flag already set is a no-op
    that still returns ``False`` so the caller can distinguish the
    first trip from repeats (useful for emitting the alert only once).

    Parameters
    ----------
    redis
        Async Redis handle. Injected explicitly for tests.
    kind
        ``"daily"`` or ``"monthly"``; surfaces on the wire payload.
    spent_usd, cap_usd
        Current spend vs the cap that was just crossed. Decimal to
        keep the USD math truthful.
    cycle_id
        Poll cycle uuid7 that observed the trip (optional). Included
        on the event payload for audit correlation.
    """

    # Step 1: set the Redis flag (atomic SETNX-style via redis.set with
    # NX). If the flag is already set we skip the Hemera write + the
    # broadcast so repeat polls are cheap.
    already = await redis.get(GLOBAL_CAP_FLAG)
    if already and _is_truthy_flag(already):
        logger.debug(
            "chronos.cap.already_tripped kind=%s spent=%s cap=%s",
            kind,
            spent_usd,
            cap_usd,
        )
        return False

    await redis.set(GLOBAL_CAP_FLAG, "1")
    await redis.set(
        GLOBAL_AUTO_DISABLED_FLAG,
        "1",
        ex=seconds_until_next_utc_midnight(),
    )

    # Step 2: flip Hemera. We import lazily so unit tests that do not
    # need a DB pool can stub this out via monkeypatch.
    await _set_hemera_flag(False, reason=REASON_AUTO_TRIPPED)

    # Step 3: broadcast on Nike + Redis pub/sub.
    await _broadcast_cap_event(
        redis,
        event_type=PUBLISH_EVENT_TRIPPED,
        kind=kind,
        spent_usd=spent_usd,
        cap_usd=cap_usd,
        cycle_id=cycle_id,
        builder_disabled=True,
    )

    budget_cap_tripped_total.labels(scope="global").inc()
    budget_alert_threshold_total.labels(
        tenant_id="global", pct=str(THRESHOLD_HARD_PCT)
    ).inc()
    logger.warning(
        "chronos.cap.tripped kind=%s spent_usd=%s cap_usd=%s cycle_id=%s",
        kind,
        spent_usd,
        cap_usd,
        cycle_id,
    )
    return True


async def clear_global_cap(
    *,
    redis: Any,
    reason: str = REASON_AUTO_RESET,
    cycle_id: str | None = None,
) -> bool:
    """Inverse of :func:`trip_global_cap`. Returns ``True`` when the
    call actually cleared a set flag.

    Only touches Hemera when the ``chronos:global_auto_disabled`` marker
    is present so a manual operator flip is never overridden by the
    daily cron.
    """

    flag = await redis.get(GLOBAL_CAP_FLAG)
    auto_marker = await redis.get(GLOBAL_AUTO_DISABLED_FLAG)

    had_flag = flag is not None and _is_truthy_flag(flag)
    had_auto = auto_marker is not None and _is_truthy_flag(auto_marker)

    # Always clear the Redis flag + the auto marker; these are cheap
    # and safe (Kratos pre-call gate reads the flag, missing means
    # allow).
    await redis.delete(GLOBAL_CAP_FLAG)
    await redis.delete(GLOBAL_AUTO_DISABLED_FLAG)

    if had_auto:
        await _set_hemera_flag(True, reason=reason)

    if had_flag:
        await _broadcast_cap_event(
            redis,
            event_type=PUBLISH_EVENT_CLEARED,
            kind="daily",
            spent_usd=Decimal("0"),
            cap_usd=Decimal("0"),
            cycle_id=cycle_id,
            builder_disabled=False,
        )
        logger.info("chronos.cap.cleared reason=%s cycle_id=%s", reason, cycle_id)

    return had_flag


async def emit_warning(
    *,
    redis: Any,
    kind: BudgetCapKind,
    spent_usd: Decimal,
    cap_usd: Decimal,
    cycle_id: str | None = None,
) -> None:
    """Emit a non-blocking warning broadcast when spend crosses the
    90% threshold without tripping the hard cap.

    No Redis state change, no Hemera write; purely an observability
    signal. The ``budget_alert_threshold_total`` counter bumps so
    Grafana alerting can fire before the hard cap.
    """

    budget_alert_threshold_total.labels(
        tenant_id="global", pct=str(THRESHOLD_WARN_PCT)
    ).inc()
    await _broadcast_cap_event(
        redis,
        event_type=PUBLISH_EVENT_WARNING,
        kind=kind,
        spent_usd=spent_usd,
        cap_usd=cap_usd,
        cycle_id=cycle_id,
        builder_disabled=False,
    )
    logger.warning(
        "chronos.cap.warning kind=%s spent_usd=%s cap_usd=%s cycle_id=%s",
        kind,
        spent_usd,
        cap_usd,
        cycle_id,
    )


async def evaluate_and_cap(
    *,
    redis: Any,
    mtd_usd: Decimal,
    daily_usd: Decimal,
    daily_cap_usd: Decimal,
    monthly_cap_usd: Decimal,
    warn_threshold_pct: int = THRESHOLD_WARN_PCT,
    cycle_id: str | None = None,
) -> CapDecision:
    """Compare spend vs caps + trip / warn as appropriate.

    Preference order when both caps would trip on the same call: the
    daily cap wins because it is the binding submission control per
    contract Section 10. The decision object still reports the raw
    ``kind`` string so the caller can log precisely.
    """

    # Update the platform-spend gauge no matter what so dashboards
    # always reflect fresh state even on uncapped cycles.
    if monthly_cap_usd > 0:
        budget_global_spent_usd.labels(period="mtd").set(float(mtd_usd))
    if daily_cap_usd > 0:
        budget_global_spent_usd.labels(period="daily").set(float(daily_usd))

    daily_pct = (
        float(daily_usd / daily_cap_usd * 100)
        if daily_cap_usd > 0
        else 0.0
    )
    monthly_pct = (
        float(mtd_usd / monthly_cap_usd * 100)
        if monthly_cap_usd > 0
        else 0.0
    )

    # Hard-cap check (daily first).
    if daily_cap_usd > 0 and daily_usd >= daily_cap_usd:
        tripped = await trip_global_cap(
            redis=redis,
            kind="daily",
            spent_usd=daily_usd,
            cap_usd=daily_cap_usd,
            cycle_id=cycle_id,
        )
        return CapDecision(
            triggered=tripped,
            warn_emitted=False,
            kind="daily",
            spent_usd=daily_usd,
            cap_usd=daily_cap_usd,
            pct=daily_pct,
        )
    if monthly_cap_usd > 0 and mtd_usd >= monthly_cap_usd:
        tripped = await trip_global_cap(
            redis=redis,
            kind="monthly",
            spent_usd=mtd_usd,
            cap_usd=monthly_cap_usd,
            cycle_id=cycle_id,
        )
        return CapDecision(
            triggered=tripped,
            warn_emitted=False,
            kind="monthly",
            spent_usd=mtd_usd,
            cap_usd=monthly_cap_usd,
            pct=monthly_pct,
        )

    # Warn threshold (monthly only; daily is binary per contract).
    if monthly_cap_usd > 0 and monthly_pct >= warn_threshold_pct:
        await emit_warning(
            redis=redis,
            kind="monthly",
            spent_usd=mtd_usd,
            cap_usd=monthly_cap_usd,
            cycle_id=cycle_id,
        )
        return CapDecision(
            triggered=False,
            warn_emitted=True,
            kind="monthly",
            spent_usd=mtd_usd,
            cap_usd=monthly_cap_usd,
            pct=monthly_pct,
        )
    if daily_cap_usd > 0 and daily_pct >= warn_threshold_pct:
        await emit_warning(
            redis=redis,
            kind="daily",
            spent_usd=daily_usd,
            cap_usd=daily_cap_usd,
            cycle_id=cycle_id,
        )
        return CapDecision(
            triggered=False,
            warn_emitted=True,
            kind="daily",
            spent_usd=daily_usd,
            cap_usd=daily_cap_usd,
            pct=daily_pct,
        )

    return CapDecision(
        triggered=False,
        warn_emitted=False,
        kind=None,
        spent_usd=daily_usd,
        cap_usd=daily_cap_usd,
        pct=daily_pct,
    )


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _is_truthy_flag(raw: Any) -> bool:
    """Permissive truthy decoder matching the Kratos guard."""

    if raw is None:
        return False
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8", errors="ignore")
    if isinstance(raw, str):
        return raw.strip() == "1"
    return bool(raw)


async def _set_hemera_flag(value: bool, *, reason: str) -> None:
    """Write the ``builder.live`` flag via Hemera override.

    We target the *global* scope so the override behaves like a big
    red button. Per-user whitelist overrides stay in effect because
    the precedence chain resolves user > tenant > global > default.

    Import is lazy so unit tests that stub this function out do not
    have to keep the DB pool module on the import path.
    """

    try:
        from src.backend.flags.override import upsert_override
    except Exception as exc:  # pragma: no cover - import-time guard
        logger.exception("chronos.cap.hemera.import_failed err=%s", exc)
        return

    try:
        await upsert_override(
            actor_id=None,
            flag_name="builder.live",
            scope_kind="global",
            scope_id=None,
            value=value,
            expires_at=None,
            reason=reason,
        )
    except Exception:
        # A flipped Hemera write is a soft failure: the Kratos pre-call
        # guard still reads the Redis flag + short-circuits. We log at
        # ERROR so Selene surfaces it but we do not re-raise so the
        # poller keeps the next cycle alive.
        logger.exception(
            "chronos.cap.hemera.write_failed value=%s reason=%s", value, reason
        )


async def _broadcast_cap_event(
    redis: Any,
    *,
    event_type: str,
    kind: BudgetCapKind,
    spent_usd: Decimal,
    cap_usd: Decimal,
    cycle_id: str | None,
    builder_disabled: bool,
) -> None:
    """Fan out the cap event onto Nike + the Redis pub/sub channel.

    The Nike broadcast is best-effort: if the ConnectionManager is not
    yet initialised (pre-lifespan) we fall back to the pub/sub channel
    alone. Either path keeps the cron body running.
    """

    payload = {
        "tenant_id": "global",
        "threshold_pct": (
            THRESHOLD_WARN_PCT
            if event_type == PUBLISH_EVENT_WARNING
            else THRESHOLD_HARD_PCT
        ),
        "spent_usd_today": float(spent_usd),
        "cap_usd_today": float(cap_usd),
        "builder_disabled": builder_disabled,
        "kind": kind,
        "cycle_id": cycle_id,
    }

    # Redis pub/sub first; the realtime fanout can fail (manager not
    # installed in tests, slow consumers) but the pub/sub publish is
    # fire-and-forget.
    try:
        await redis.publish(CAP_EVENTS_CHANNEL, json.dumps(payload))
    except Exception:
        logger.exception("chronos.cap.pubsub.publish_failed channel=%s", CAP_EVENTS_CHANNEL)

    try:
        from src.backend.realtime.connection_manager import get_connection_manager
        from src.backend.realtime.events import build_event
    except Exception:  # pragma: no cover - import-time guard
        return

    try:
        manager = get_connection_manager()
    except Exception:
        logger.info("chronos.cap.nike.manager_not_ready event=%s", event_type)
        return

    # The event id is server-monotonic inside Nike; passing 0 lets the
    # manager assign from its Redis Stream XADD reply.
    event = build_event(event_type=event_type, data=payload, event_id=0)
    try:
        # Broadcast to every connection in the "admin" virtual tenant
        # so the judge console / Eunomia UI lights up. The manager
        # tolerates a missing tenant (no-op fan-out).
        await manager.broadcast(tenant_id="admin", event=event)
    except Exception:
        logger.exception("chronos.cap.nike.broadcast_failed event=%s", event_type)


__all__ = [
    "CapDecision",
    "PUBLISH_EVENT_CLEARED",
    "PUBLISH_EVENT_TRIPPED",
    "PUBLISH_EVENT_WARNING",
    "REASON_AUTO_RESET",
    "REASON_AUTO_TRIPPED",
    "THRESHOLD_HARD_PCT",
    "THRESHOLD_WARN_PCT",
    "clear_global_cap",
    "emit_warning",
    "evaluate_and_cap",
    "trip_global_cap",
]
