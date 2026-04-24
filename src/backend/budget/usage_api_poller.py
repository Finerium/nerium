"""Anthropic Admin Usage + Cost API poller.

Owner: Moros (W2 NP P3 S1).

Arq cron ``moros.chronos_poll`` runs every
``CHRONOS_POLL_INTERVAL_SECONDS`` (default 600 s = 10 min). Each cycle:

1. Acquire the Redis single-runner lock ``chronos:poll_lock`` (``NX``,
   60 s TTL) so two workers cannot hammer the Admin API in the same
   minute.
2. GET ``/v1/organizations/cost_report`` (daily bucket, MTD window).
   The response gives USD spend per day; sum to derive ``mtd_usd`` +
   today's ``daily_usd`` bucket.
3. Optionally GET ``/v1/organizations/usage_report/messages`` (hourly
   bucket, last 1 h) for model-level attribution. Failure on this
   call is non-fatal; the daemon still reconciles spend from
   ``cost_report``.
4. Cache the result in ``chronos:last_poll`` (hash), advance
   ``chronos:last_reconcile_ts``, and call
   :func:`cap_flag.evaluate_and_cap` with the fresh numbers.
5. On any exception, increment ``chronos:consecutive_failures`` +
   write ``chronos:last_error`` + exponential backoff the next
   invocation.

Admin API shape assumption
--------------------------
The exact response body shape may vary as Anthropic rotates the Admin
API. Per the Moros anti-pattern honor line we assume the shape below
(mirrored from the NP contract Section 4.1 + the public docs URL in
the spawn prompt) and document the fields we rely on:

- ``cost_report`` response:
  ``{"data": [{"starting_at": "...Z", "ending_at": "...Z",
              "amount_cents": int, "currency": "USD",
              "results": [{"amount_cents": int, "currency": "USD",
                           "model": "...", ...}]}], "has_more": bool}``
  We sum ``amount_cents / 100`` per bucket for USD. The ``results``
  nested array is optional; if missing we still add up at the bucket
  level.
- ``usage_report/messages`` response:
  ``{"data": [{"starting_at": ..., "ending_at": ...,
              "uncached_input_tokens": int, "output_tokens": int,
              "cache_read_input_tokens": int,
              "cache_creation_input_tokens": int, "model": "..."}]}``

If the live endpoint returns a different shape the poller logs a
``budget.admin_api.shape_drift`` warning and records ``last_error``;
the operator then rolls a new contract version + fixes the parser.

Contract reference: ``docs/contracts/budget_monitor.contract.md``
Section 4.1.
"""

from __future__ import annotations

import logging
import math
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any
from uuid import uuid4

import httpx
from arq.cron import cron

from src.backend.budget import cap_flag
from src.backend.budget.redis_keys import (
    CONSECUTIVE_FAILURES,
    CYCLE_AUDIT_FMT,
    CYCLE_AUDIT_TTL_SECONDS,
    LAST_ERROR,
    LAST_POLL_HASH,
    LAST_RECONCILE_TS,
    POLL_LOCK,
)
from src.backend.config import get_settings
from src.backend.redis_client import get_redis_client
from src.backend.workers.arq_worker import register_cron_job

logger = logging.getLogger(__name__)


ADMIN_API_COST_PATH: str = "/v1/organizations/cost_report"
ADMIN_API_USAGE_MESSAGES_PATH: str = "/v1/organizations/usage_report/messages"

# Flag names read once per cycle so we do not bind to the DB pool
# import at module load.
FLAG_DAILY_CAP: str = "ma.daily_budget_usd"
FLAG_MONTHLY_CAP: str = "ma.monthly_budget_usd"
FLAG_WARN_THRESHOLD: str = "ma.budget_cap_threshold"

DEFAULT_DAILY_CAP_USD: Decimal = Decimal("100")
DEFAULT_MONTHLY_CAP_USD: Decimal = Decimal("500")
DEFAULT_WARN_THRESHOLD: float = 0.90

ADMIN_AUTH_HEADER: str = "x-api-key"
ANTHROPIC_VERSION_HEADER: str = "anthropic-version"
ANTHROPIC_VERSION_VALUE: str = "2023-06-01"


@dataclass
class PollResult:
    """Structured outcome of :func:`poll_anthropic_usage`.

    Tests assert on this rather than on Redis state so the parser is
    exercised independently of the cap logic. The cap path is covered
    by separate ``tests/backend/budget/test_cap_flag_transitions.py``.
    """

    cycle_id: str
    success: bool
    mtd_usd: Decimal = Decimal("0")
    daily_usd: Decimal = Decimal("0")
    buckets_seen: int = 0
    last_error: str | None = None
    skipped_reason: str | None = None
    poll_duration_ms: int = 0
    per_model_usd: dict[str, Decimal] = field(default_factory=dict)


async def poll_anthropic_usage(
    ctx: dict[str, Any] | None = None,
    *,
    redis: Any | None = None,
    http_client: httpx.AsyncClient | None = None,
) -> PollResult:
    """Arq cron entry point. Returns :class:`PollResult`.

    The ``ctx`` arg is required by Arq's function contract but unused
    here. ``redis`` + ``http_client`` are injected for tests; production
    uses the process-wide clients.
    """

    del ctx  # unused; keeps the Arq signature clean

    settings = get_settings()
    cycle_id = str(uuid4())
    redis_client = redis if redis is not None else get_redis_client()
    started = time.monotonic()

    # Fail-closed if the Admin API key is missing; the daemon degrades
    # gracefully and the local accountant keeps increments running via
    # ``record_session_cost``.
    admin_key = settings.anthropic_admin_api_key.get_secret_value()
    if not admin_key:
        logger.warning("chronos.poll.skipped reason=admin_key_missing cycle_id=%s", cycle_id)
        await _record_skipped(redis_client, cycle_id, "admin_key_missing")
        return PollResult(
            cycle_id=cycle_id,
            success=False,
            skipped_reason="admin_key_missing",
        )

    # Single-runner lock. Other workers skip; this is intentional, the
    # next 10-min tick picks up the work.
    got_lock = await _acquire_lock(redis_client)
    if not got_lock:
        logger.info("chronos.poll.skipped reason=locked cycle_id=%s", cycle_id)
        return PollResult(
            cycle_id=cycle_id,
            success=False,
            skipped_reason="locked",
        )

    own_client = http_client is None
    client = http_client or httpx.AsyncClient(
        base_url=settings.anthropic_admin_api_base_url,
        timeout=settings.chronos_admin_api_timeout_seconds,
    )

    try:
        # MTD window: since start-of-month UTC.
        now = datetime.now(timezone.utc)
        mtd_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)

        raw = await _fetch_cost_report(
            client,
            admin_key=admin_key,
            starting_at=mtd_start,
            ending_at=now,
        )

        mtd_usd, daily_usd, buckets_seen, per_model = parse_cost_report(
            raw, today=now.date()
        )

        # Warn threshold + cap eval via shared module.
        warn_pct, daily_cap, monthly_cap = await _load_policy()
        decision = await cap_flag.evaluate_and_cap(
            redis=redis_client,
            mtd_usd=mtd_usd,
            daily_usd=daily_usd,
            daily_cap_usd=daily_cap,
            monthly_cap_usd=monthly_cap,
            warn_threshold_pct=int(round(warn_pct * 100)),
            cycle_id=cycle_id,
        )

        elapsed_ms = int((time.monotonic() - started) * 1000)
        result = PollResult(
            cycle_id=cycle_id,
            success=True,
            mtd_usd=mtd_usd,
            daily_usd=daily_usd,
            buckets_seen=buckets_seen,
            poll_duration_ms=elapsed_ms,
            per_model_usd=per_model,
        )

        # Cache state so the admin endpoint + next cycle can see it.
        await _record_success(redis_client, result, decision=decision)
        logger.info(
            "chronos.poll.success cycle_id=%s mtd_usd=%s daily_usd=%s "
            "buckets=%d decision=%s duration_ms=%d",
            cycle_id,
            mtd_usd,
            daily_usd,
            buckets_seen,
            decision,
            elapsed_ms,
        )
        return result

    except Exception as exc:
        elapsed_ms = int((time.monotonic() - started) * 1000)
        error_msg = _sanitise_error(exc)
        logger.exception(
            "chronos.poll.failed cycle_id=%s err=%s duration_ms=%d",
            cycle_id,
            error_msg,
            elapsed_ms,
        )
        await _record_failure(redis_client, cycle_id, error_msg, elapsed_ms)
        return PollResult(
            cycle_id=cycle_id,
            success=False,
            last_error=error_msg,
            poll_duration_ms=elapsed_ms,
        )
    finally:
        if own_client:
            await client.aclose()
        try:
            await redis_client.delete(POLL_LOCK)
        except Exception:
            logger.warning("chronos.poll.lock.release_failed cycle_id=%s", cycle_id)


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------


async def _fetch_cost_report(
    client: httpx.AsyncClient,
    *,
    admin_key: str,
    starting_at: datetime,
    ending_at: datetime,
) -> dict[str, Any]:
    """Call ``GET /v1/organizations/cost_report`` + return parsed JSON.

    We request a daily bucket (``bucket_width=1d``) so the response
    gives one entry per UTC day in the window. The MTD window keeps
    the payload bounded (at most 31 buckets).
    """

    params = {
        "starting_at": _iso_utc(starting_at),
        "ending_at": _iso_utc(ending_at),
        "bucket_width": "1d",
    }
    headers = {
        ADMIN_AUTH_HEADER: admin_key,
        ANTHROPIC_VERSION_HEADER: ANTHROPIC_VERSION_VALUE,
        "accept": "application/json",
    }
    resp = await client.get(ADMIN_API_COST_PATH, params=params, headers=headers)
    resp.raise_for_status()
    return resp.json()


# ---------------------------------------------------------------------------
# Parsers
# ---------------------------------------------------------------------------


def parse_cost_report(
    body: dict[str, Any],
    *,
    today: datetime | Any,
) -> tuple[Decimal, Decimal, int, dict[str, Decimal]]:
    """Parse the cost report body into MTD + today's spend.

    The parser is tolerant: unknown keys are ignored, ``amount_cents``
    missing means the bucket is skipped with a warning. The
    ``per_model`` rollup reads the nested ``results`` array when
    available; absent results emit an empty rollup which the caller
    treats as "model attribution unavailable".
    """

    from datetime import date as _date_cls

    if isinstance(today, datetime):
        today_date = today.date()
    elif isinstance(today, _date_cls):
        today_date = today
    else:
        today_date = datetime.now(timezone.utc).date()

    mtd_total = Decimal("0")
    daily_total = Decimal("0")
    per_model: dict[str, Decimal] = {}
    seen = 0

    buckets = body.get("data") or []
    for bucket in buckets:
        if not isinstance(bucket, dict):
            logger.warning("chronos.poll.shape_drift reason=bucket_not_dict")
            continue
        cents = bucket.get("amount_cents")
        amount_usd: Decimal | None = None
        if cents is None:
            # Fallback: sum nested results.
            results = bucket.get("results") or []
            if results:
                amount_usd = Decimal("0")
                for result in results:
                    if not isinstance(result, dict):
                        continue
                    sub_cents = result.get("amount_cents")
                    if sub_cents is None:
                        continue
                    amount_usd += _cents_to_usd(sub_cents)
                    model = str(result.get("model", "unknown"))
                    per_model[model] = per_model.get(model, Decimal("0")) + _cents_to_usd(sub_cents)
            else:
                logger.warning(
                    "chronos.poll.shape_drift reason=missing_amount_cents bucket=%s",
                    bucket.get("starting_at"),
                )
                continue
        else:
            amount_usd = _cents_to_usd(cents)
            # Still try to drill down for per-model attribution.
            for result in bucket.get("results") or []:
                if not isinstance(result, dict):
                    continue
                sub_cents = result.get("amount_cents")
                if sub_cents is None:
                    continue
                model = str(result.get("model", "unknown"))
                per_model[model] = per_model.get(model, Decimal("0")) + _cents_to_usd(sub_cents)

        if amount_usd is None:
            continue

        seen += 1
        mtd_total += amount_usd

        # Today's bucket: match on starting_at date.
        starting = _parse_iso(bucket.get("starting_at"))
        if starting is not None and starting.date() == today_date:
            daily_total += amount_usd

    return mtd_total.quantize(Decimal("0.000001")), daily_total.quantize(Decimal("0.000001")), seen, per_model


def _cents_to_usd(cents: Any) -> Decimal:
    try:
        return (Decimal(str(int(cents))) / Decimal("100")).quantize(Decimal("0.000001"))
    except (ValueError, ArithmeticError):
        return Decimal("0")


def _parse_iso(raw: Any) -> datetime | None:
    if not raw:
        return None
    if isinstance(raw, datetime):
        return raw
    if not isinstance(raw, str):
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None


def _iso_utc(moment: datetime) -> str:
    return moment.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


# ---------------------------------------------------------------------------
# Policy load (Hemera flags)
# ---------------------------------------------------------------------------


async def _load_policy() -> tuple[float, Decimal, Decimal]:
    """Load (warn_threshold, daily_cap_usd, monthly_cap_usd) from Hemera.

    Falls back to the hard-coded defaults when a flag is missing so the
    daemon stays usable on a fresh boot before the seed lands. The
    Hemera bootstrap cache is read first so this path does not hit the
    DB on every cycle.
    """

    try:
        from src.backend.flags.service import get_bootstrap_default, get_flag
    except Exception:  # pragma: no cover - import-time guard
        return DEFAULT_WARN_THRESHOLD, DEFAULT_DAILY_CAP_USD, DEFAULT_MONTHLY_CAP_USD

    async def _load(flag_name: str, default: Any) -> Any:
        try:
            value = await get_flag(flag_name)
        except Exception:
            value = None
        if value is None:
            value = get_bootstrap_default(flag_name)
        if value is None:
            value = default
        return value

    warn_raw = await _load(FLAG_WARN_THRESHOLD, DEFAULT_WARN_THRESHOLD)
    daily_raw = await _load(FLAG_DAILY_CAP, DEFAULT_DAILY_CAP_USD)
    monthly_raw = await _load(FLAG_MONTHLY_CAP, DEFAULT_MONTHLY_CAP_USD)

    warn = float(warn_raw) if warn_raw is not None else DEFAULT_WARN_THRESHOLD
    # Defensive clamp: threshold must stay in (0, 1].
    if not math.isfinite(warn) or warn <= 0 or warn > 1:
        warn = DEFAULT_WARN_THRESHOLD

    daily_cap = _decimal_or_default(daily_raw, DEFAULT_DAILY_CAP_USD)
    monthly_cap = _decimal_or_default(monthly_raw, DEFAULT_MONTHLY_CAP_USD)

    return warn, daily_cap, monthly_cap


def _decimal_or_default(raw: Any, default: Decimal) -> Decimal:
    if raw is None:
        return default
    try:
        value = Decimal(str(raw))
    except (ValueError, ArithmeticError):
        return default
    if value < 0:
        return default
    return value


# ---------------------------------------------------------------------------
# Redis state helpers
# ---------------------------------------------------------------------------


async def _acquire_lock(redis: Any) -> bool:
    """SETNX-style lock with a 60 s TTL.

    Returns ``True`` when the caller acquired the lock. Any other
    worker that finds the key already set skips the cycle.
    """

    try:
        got = await redis.set(POLL_LOCK, "1", ex=60, nx=True)
        return bool(got)
    except Exception:
        logger.exception("chronos.poll.lock.acquire_failed")
        return False


async def _record_success(
    redis: Any,
    result: PollResult,
    *,
    decision: cap_flag.CapDecision,
) -> None:
    """Persist the successful poll snapshot to Redis.

    - ``chronos:last_poll`` hash for the admin endpoint.
    - ``chronos:last_reconcile_ts`` advances so the next poll picks up
      from the new horizon.
    - ``chronos:consecutive_failures`` reset to 0.
    - ``chronos:cycle:<id>`` short-lived audit record (TTL 1 h).
    - ``chronos:last_error`` cleared so the admin view reflects
      healthy state.
    """

    now_iso = _iso_utc(datetime.now(timezone.utc))
    snapshot = {
        "cycle_id": result.cycle_id,
        "mtd_usd": str(result.mtd_usd),
        "daily_usd": str(result.daily_usd),
        "buckets_seen": str(result.buckets_seen),
        "poll_duration_ms": str(result.poll_duration_ms),
        "ts": now_iso,
        "decision_kind": decision.kind or "none",
        "decision_pct": f"{decision.pct:.4f}",
    }
    try:
        await _hset(redis, LAST_POLL_HASH, snapshot)
        await redis.set(LAST_RECONCILE_TS, now_iso, ex=3600)
        await redis.delete(LAST_ERROR)
        await redis.set(CONSECUTIVE_FAILURES, "0")
    except Exception:
        logger.exception("chronos.poll.redis_write_failed cycle_id=%s", result.cycle_id)

    cycle_key = CYCLE_AUDIT_FMT.format(cycle_id=result.cycle_id)
    try:
        await _hset(redis, cycle_key, {**snapshot, "success": "1"})
        await redis.expire(cycle_key, CYCLE_AUDIT_TTL_SECONDS)
    except Exception:
        logger.warning("chronos.poll.cycle_audit_failed cycle_id=%s", result.cycle_id)


async def _record_skipped(redis: Any, cycle_id: str, reason: str) -> None:
    """Record a skipped cycle (missing key, lock held) without counting
    it as a failure."""

    try:
        snapshot = {
            "cycle_id": cycle_id,
            "reason": reason,
            "ts": _iso_utc(datetime.now(timezone.utc)),
            "success": "0",
            "skipped": "1",
        }
        cycle_key = CYCLE_AUDIT_FMT.format(cycle_id=cycle_id)
        await _hset(redis, cycle_key, snapshot)
        await redis.expire(cycle_key, CYCLE_AUDIT_TTL_SECONDS)
    except Exception:
        logger.warning("chronos.poll.skip_record_failed cycle_id=%s", cycle_id)


async def _record_failure(
    redis: Any,
    cycle_id: str,
    error_msg: str,
    duration_ms: int,
) -> None:
    """Increment failure counter + surface ``last_error`` for the admin endpoint."""

    settings = get_settings()
    try:
        failures = await redis.incr(CONSECUTIVE_FAILURES)
        await redis.set(LAST_ERROR, error_msg, ex=3600)
        cycle_key = CYCLE_AUDIT_FMT.format(cycle_id=cycle_id)
        await _hset(
            redis,
            cycle_key,
            {
                "cycle_id": cycle_id,
                "success": "0",
                "error": error_msg,
                "duration_ms": str(duration_ms),
                "ts": _iso_utc(datetime.now(timezone.utc)),
            },
        )
        await redis.expire(cycle_key, CYCLE_AUDIT_TTL_SECONDS)
        if failures and int(failures) >= settings.chronos_consecutive_failure_alert:
            logger.error(
                "chronos.poll.escalation failures=%d cycle_id=%s err=%s",
                int(failures),
                cycle_id,
                error_msg,
            )
    except Exception:
        logger.exception(
            "chronos.poll.failure_record_failed cycle_id=%s err=%s",
            cycle_id,
            error_msg,
        )


async def _hset(redis: Any, key: str, mapping: dict[str, str]) -> None:
    """Portable hash-set across redis-py + fakeredis."""

    hset = getattr(redis, "hset", None)
    if hset is None:  # pragma: no cover - defensive
        raise RuntimeError("redis client missing hset")
    # redis-py 5.x supports ``mapping=`` kwarg; older fakeredis builds
    # want positional (key, mapping). Try kwarg first.
    try:
        await hset(key, mapping=mapping)
    except TypeError:
        await hset(key, mapping)


def _sanitise_error(exc: BaseException) -> str:
    """Return a short error description safe for Redis / admin UI.

    Strips tracebacks + any Authorization headers that httpx embeds in
    the repr. Caps the length so the Redis key does not grow unbounded
    under a rare recursive formatting bug.
    """

    message = f"{type(exc).__name__}: {exc}"
    if "api-key" in message.lower() or "authorization" in message.lower():
        message = f"{type(exc).__name__}: [redacted]"
    return message[:512]


def compute_backoff_delay(
    consecutive_failures: int,
    *,
    base_seconds: float,
    max_seconds: float,
) -> float:
    """Exponential backoff with a ceiling.

    Pure function so tests can assert on the ladder without fighting
    the Arq scheduler. Formula: ``min(base * 2 ** (n-1), max)``.
    """

    if consecutive_failures <= 0:
        return 0.0
    delay = base_seconds * (2 ** (consecutive_failures - 1))
    return float(min(delay, max_seconds))


# ---------------------------------------------------------------------------
# Arq registration
# ---------------------------------------------------------------------------


def _resolve_cron_spec() -> tuple[set[int], set[int]]:
    """Derive the minute set Arq needs from the poll interval.

    Arq's ``cron`` builder wants a set of minutes-within-hour. We
    translate ``CHRONOS_POLL_INTERVAL_SECONDS`` into every Nth minute:

    - 600 s = every 10 min -> minutes {0,10,20,30,40,50}
    - 300 s = every 5 min  -> minutes {0,5,10,15,20,25,30,35,40,45,50,55}
    - anything else rounds to the nearest whole-minute multiple of 60.

    For intervals larger than 60 min we fall back to hourly at minute
    0 and rely on Redis TTL to keep the window aligned.
    """

    settings = get_settings()
    interval = max(60, int(settings.chronos_poll_interval_seconds))
    step_minutes = max(1, interval // 60)
    if step_minutes >= 60:
        return {0}, set()
    minutes = {m for m in range(0, 60, step_minutes)}
    return minutes, set()


register_cron_job(
    cron(
        poll_anthropic_usage,
        name="moros.chronos_poll",
        minute=_resolve_cron_spec()[0],
        run_at_startup=False,
    )
)


__all__ = [
    "ADMIN_API_COST_PATH",
    "ADMIN_API_USAGE_MESSAGES_PATH",
    "DEFAULT_DAILY_CAP_USD",
    "DEFAULT_MONTHLY_CAP_USD",
    "DEFAULT_WARN_THRESHOLD",
    "FLAG_DAILY_CAP",
    "FLAG_MONTHLY_CAP",
    "FLAG_WARN_THRESHOLD",
    "PollResult",
    "compute_backoff_delay",
    "parse_cost_report",
    "poll_anthropic_usage",
]
