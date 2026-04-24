"""Daily cap reset Arq cron.

Owner: Moros (W2 NP P3 S1).

Runs at ``00:00 UTC``. Responsibilities:

1. Clear every ``chronos:tenant:*:usd_today`` counter by virtue of the
   counters carrying a TTL to midnight; we keep a best-effort ``scan +
   delete`` as a belt-and-braces so a counter written with a wrong TTL
   still rolls off.
2. Clear the global ``chronos:ma_capped`` flag + the
   ``chronos:global_auto_disabled`` marker IF Moros was the agent that
   tripped the cap (never fight a manual operator flip).
3. Restore the Hemera ``builder.live`` override to ``true`` at the
   global scope, with ``reason='budget_cap_auto_reset'`` so the audit
   trail shows the automatic transition.
4. Broadcast a ``nerium.system.budget_cap.cleared`` event via Nike +
   the Redis pub/sub cap-events channel.

Contract reference: ``docs/contracts/budget_monitor.contract.md``
Sections 3.2 + 4.3.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from arq.cron import cron

from src.backend.budget import cap_flag
from src.backend.budget.redis_keys import (
    LAST_POLL_HASH,
    LAST_RECONCILE_TS,
    TENANT_CAP_FLAG_FMT,
    TENANT_SPENT_TODAY_FMT,
)
from src.backend.redis_client import get_redis_client
from src.backend.workers.arq_worker import register_cron_job

logger = logging.getLogger(__name__)


async def chronos_daily_reset(
    ctx: dict[str, Any] | None = None,
    *,
    redis: Any | None = None,
) -> dict[str, Any]:
    """Arq cron body. Returns a summary for observability.

    Tests call this directly with an injected Redis so the cron path
    stays deterministic without a live clock.
    """

    del ctx  # unused; keeps the Arq signature
    redis_client = redis if redis is not None else get_redis_client()
    cycle_id = str(uuid4())
    started = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")

    tenant_keys_cleared = 0
    try:
        tenant_keys_cleared = await _sweep_tenant_counters(redis_client)
    except Exception:
        logger.exception("chronos.daily_reset.sweep_failed cycle_id=%s", cycle_id)

    cleared = await cap_flag.clear_global_cap(
        redis=redis_client,
        reason=cap_flag.REASON_AUTO_RESET,
        cycle_id=cycle_id,
    )

    # Touch last_poll + last_reconcile_ts so the admin endpoint
    # reflects the reset turn-over instead of showing a day-old poll.
    try:
        await redis_client.set(LAST_RECONCILE_TS, started, ex=3600)
        await _hset(
            redis_client,
            LAST_POLL_HASH,
            {
                "cycle_id": cycle_id,
                "mtd_usd": "0",
                "daily_usd": "0",
                "buckets_seen": "0",
                "poll_duration_ms": "0",
                "ts": started,
                "decision_kind": "daily_reset",
                "decision_pct": "0.0000",
            },
        )
    except Exception:
        logger.warning("chronos.daily_reset.state_touch_failed cycle_id=%s", cycle_id)

    summary = {
        "cycle_id": cycle_id,
        "ran_at": started,
        "tenant_counter_keys_cleared": tenant_keys_cleared,
        "global_cap_cleared": cleared,
    }
    logger.info("chronos.daily_reset.complete %s", summary)
    return summary


async def _sweep_tenant_counters(redis: Any) -> int:
    """Best-effort scan for ``chronos:tenant:*:usd_today`` + friends.

    We only target the daily counter + the tenant cap flag here;
    ``cap_usd`` is *policy* not *state* so we leave it alone (it is
    rewritten by the local accountant the next time the tenant opens
    a session).

    Uses ``SCAN`` rather than ``KEYS`` so a busy Redis does not
    stall. redis-py exposes ``scan_iter`` + ``scan``; fakeredis has
    both. We fall back to a single-shot SCAN when ``scan_iter`` is
    absent.
    """

    deleted = 0
    patterns = [
        TENANT_SPENT_TODAY_FMT.format(tenant_id="*"),
        TENANT_CAP_FLAG_FMT.format(tenant_id="*"),
    ]

    scan_iter = getattr(redis, "scan_iter", None)
    if scan_iter is not None:
        for pattern in patterns:
            async for key in scan_iter(match=pattern, count=200):
                key_str = key if isinstance(key, str) else key.decode("utf-8", errors="ignore")
                try:
                    await redis.delete(key_str)
                    deleted += 1
                except Exception:
                    logger.warning("chronos.daily_reset.delete_failed key=%s", key_str)
        return deleted

    scan = getattr(redis, "scan", None)
    if scan is None:  # pragma: no cover - defensive
        logger.warning("chronos.daily_reset.scan_missing")
        return 0

    for pattern in patterns:
        cursor = 0
        while True:
            cursor, keys = await scan(cursor=cursor, match=pattern, count=200)
            for key in keys:
                key_str = key if isinstance(key, str) else key.decode("utf-8", errors="ignore")
                try:
                    await redis.delete(key_str)
                    deleted += 1
                except Exception:
                    logger.warning("chronos.daily_reset.delete_failed key=%s", key_str)
            if cursor in (0, "0", b"0"):
                break
    return deleted


async def _hset(redis: Any, key: str, mapping: dict[str, str]) -> None:
    hset = getattr(redis, "hset", None)
    if hset is None:
        return
    try:
        await hset(key, mapping=mapping)
    except TypeError:
        await hset(key, mapping)


# Schedule at 00:00 UTC daily. Arq accepts the scalar int overload for
# the scalar-set semantics documented on the cron reference.
register_cron_job(
    cron(
        chronos_daily_reset,
        name="moros.chronos_reset_daily",
        hour={0},
        minute={0},
        run_at_startup=False,
    )
)


__all__ = ["chronos_daily_reset"]
