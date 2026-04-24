"""Admin budget status endpoint.

Owner: Moros (W2 NP P3 S1).

Mount point: ``/v1/admin/budget/status`` via the admin package
registry. The endpoint is read-only and surfaces the Chronos daemon's
observable state so operators can triage without tailing logs or
``redis-cli get``.

Auth model mirrors :mod:`src.backend.routers.v1.admin.flags`: the
dependency :func:`require_admin_scope` accepts either the broad
``admin`` scope or the narrow ``admin:budget`` pillar scope. Missing
scope yields 403 problem+json. Missing ``auth`` principal yields 401.

Response shape
--------------
Fields align with the Moros prompt's contract signature. When the
daemon has not yet run a poll (fresh deploy), ``last_poll_at`` is
``None`` but the endpoint still returns 200 so the UI can render a
"never polled" state. Redis outage raises 503 via
:class:`ServiceUnavailableProblem` (the admin dashboard should treat
this as a hard signal to page ops).

Contract: ``docs/contracts/budget_monitor.contract.md`` Section 4.2.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends

from src.backend.budget.redis_keys import (
    CONSECUTIVE_FAILURES,
    GLOBAL_AUTO_DISABLED_FLAG,
    GLOBAL_CAP_FLAG,
    LAST_ERROR,
    LAST_POLL_HASH,
    LAST_RECONCILE_TS,
)
from src.backend.budget.usage_api_poller import (
    DEFAULT_DAILY_CAP_USD,
    DEFAULT_MONTHLY_CAP_USD,
    FLAG_DAILY_CAP,
    FLAG_MONTHLY_CAP,
)
from src.backend.config import get_settings
from src.backend.errors import ServiceUnavailableProblem
from src.backend.models.base import NeriumModel
from src.backend.redis_client import get_redis_client
from src.backend.routers.v1.admin.deps import require_admin_scope

logger = logging.getLogger(__name__)


class BudgetStatusResponse(NeriumModel):
    """Wire shape for ``GET /v1/admin/budget/status``.

    ``mtd_usd`` + ``daily_usd`` come from the last successful Admin
    API poll; they are authoritative. ``daily_cap_usd`` +
    ``monthly_cap_usd`` come from Hemera flags with a hard-coded
    fallback matching :mod:`usage_api_poller` so a fresh deploy with
    no flag rows still renders a useful dashboard.
    """

    mtd_usd: float
    daily_usd: float
    monthly_cap_usd: float
    daily_cap_usd: float
    ma_capped: bool
    auto_disabled: bool
    last_poll_at: str | None
    next_poll_at: str | None
    cycle_id: str | None
    last_error: str | None
    consecutive_failures: int
    poll_interval_seconds: int


router = APIRouter(
    prefix="/admin/budget",
    tags=["admin-budget"],
    dependencies=[Depends(require_admin_scope(pillar_scope="admin:budget"))],
)


@router.get("/status", response_model=BudgetStatusResponse)
async def get_budget_status() -> BudgetStatusResponse:
    """Return the live Chronos daemon state.

    Read sequence (all best-effort; Redis outage raises 503):

    1. ``chronos:last_poll``       (hash)  -> mtd / daily / cycle / ts
    2. ``chronos:ma_capped``        (str)  -> cap bool
    3. ``chronos:global_auto_disabled`` (str) -> auto-disable bool
    4. ``chronos:last_error``       (str)  -> sanitised failure string
    5. ``chronos:consecutive_failures`` (counter) -> backoff depth
    6. ``chronos:last_reconcile_ts`` (str) -> fallback ``last_poll_at``

    Hemera flags read via the bootstrap cache (sync, no DB hit) so the
    endpoint stays cheap. Missing flag values fall through to the
    poller's hard-coded defaults.
    """

    settings = get_settings()
    try:
        redis = get_redis_client()
    except RuntimeError as exc:
        logger.warning("admin.budget.redis_client_missing err=%s", exc)
        raise ServiceUnavailableProblem(
            detail="Redis pool is not initialised; daemon state unavailable."
        ) from exc

    try:
        raw_poll = await _hgetall(redis, LAST_POLL_HASH)
        ma_capped_raw = await redis.get(GLOBAL_CAP_FLAG)
        auto_disabled_raw = await redis.get(GLOBAL_AUTO_DISABLED_FLAG)
        last_error_raw = await redis.get(LAST_ERROR)
        consecutive_raw = await redis.get(CONSECUTIVE_FAILURES)
        last_reconcile_raw = await redis.get(LAST_RECONCILE_TS)
    except Exception as exc:
        logger.exception("admin.budget.redis_read_failed")
        raise ServiceUnavailableProblem(
            detail="Redis read failed while gathering Chronos state."
        ) from exc

    poll = _normalise_hash(raw_poll)

    mtd_usd = _float_or_zero(poll.get("mtd_usd"))
    daily_usd = _float_or_zero(poll.get("daily_usd"))
    cycle_id = poll.get("cycle_id") or None
    last_poll_at = poll.get("ts") or _str_or_none(last_reconcile_raw)

    daily_cap = float(_hemera_number(FLAG_DAILY_CAP, DEFAULT_DAILY_CAP_USD))
    monthly_cap = float(_hemera_number(FLAG_MONTHLY_CAP, DEFAULT_MONTHLY_CAP_USD))

    consecutive_failures = _int_or_zero(consecutive_raw)
    poll_interval = int(settings.chronos_poll_interval_seconds)

    next_poll_at = _compute_next_poll(
        last_poll_at=last_poll_at,
        interval_seconds=poll_interval,
    )

    return BudgetStatusResponse(
        mtd_usd=mtd_usd,
        daily_usd=daily_usd,
        monthly_cap_usd=monthly_cap,
        daily_cap_usd=daily_cap,
        ma_capped=_is_truthy(ma_capped_raw),
        auto_disabled=_is_truthy(auto_disabled_raw),
        last_poll_at=last_poll_at,
        next_poll_at=next_poll_at,
        cycle_id=cycle_id,
        last_error=_str_or_none(last_error_raw),
        consecutive_failures=consecutive_failures,
        poll_interval_seconds=poll_interval,
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _hgetall(redis: Any, key: str) -> dict[Any, Any]:
    """Portable ``HGETALL`` across redis-py + fakeredis.

    Returns an empty dict when the key is absent; raises through on
    transport errors so the outer handler can 503.
    """

    hgetall = getattr(redis, "hgetall", None)
    if hgetall is None:
        return {}
    raw = await hgetall(key)
    return raw or {}


def _normalise_hash(raw: dict[Any, Any]) -> dict[str, str]:
    """Decode bytes keys/values that redis-py returns by default."""

    if not raw:
        return {}
    out: dict[str, str] = {}
    for key, value in raw.items():
        if isinstance(key, bytes):
            key = key.decode("utf-8", errors="ignore")
        if isinstance(value, bytes):
            value = value.decode("utf-8", errors="ignore")
        out[str(key)] = str(value) if value is not None else ""
    return out


def _is_truthy(raw: Any) -> bool:
    if raw is None:
        return False
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8", errors="ignore")
    if isinstance(raw, str):
        return raw.strip() == "1"
    return bool(raw)


def _str_or_none(raw: Any) -> str | None:
    if raw is None:
        return None
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8", errors="ignore")
    return str(raw) if raw else None


def _float_or_zero(raw: Any) -> float:
    if raw is None or raw == "":
        return 0.0
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8", errors="ignore")
    try:
        return float(Decimal(str(raw)))
    except Exception:
        return 0.0


def _int_or_zero(raw: Any) -> int:
    if raw is None or raw == "":
        return 0
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8", errors="ignore")
    try:
        return int(str(raw))
    except Exception:
        return 0


def _hemera_number(flag_name: str, default: Decimal) -> Decimal:
    """Resolve a numeric Hemera flag via the sync bootstrap cache.

    We deliberately avoid the async ``get_flag`` path here; the admin
    dashboard should not block on the DB. Bootstrap cache is populated
    at lifespan start + refreshed on invalidation.
    """

    try:
        from src.backend.flags.service import get_bootstrap_default
    except Exception:
        return default

    raw = get_bootstrap_default(flag_name)
    if raw is None:
        return default
    try:
        value = Decimal(str(raw))
    except Exception:
        return default
    if value < 0:
        return default
    return value


def _compute_next_poll(
    *, last_poll_at: str | None, interval_seconds: int
) -> str | None:
    """Project the next poll moment given the last successful poll.

    ``last_poll_at`` is the ISO-8601 string Moros writes onto
    ``chronos:last_poll.ts``. We add ``interval_seconds`` and render
    back as ISO-8601 UTC so the admin UI can render a countdown.
    """

    if not last_poll_at:
        return None
    parsed = _parse_iso(last_poll_at)
    if parsed is None:
        return None
    projected = parsed + timedelta(seconds=interval_seconds)
    return projected.astimezone(timezone.utc).isoformat(timespec="seconds").replace(
        "+00:00", "Z"
    )


def _parse_iso(raw: str) -> datetime | None:
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None


__all__ = ["BudgetStatusResponse", "router"]
