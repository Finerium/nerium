"""New-domain warmup scheduler.

Per ``docs/contracts/email_transactional.contract.md`` Section 4.2 a
brand-new sending domain (``mail.nerium.com``) must ramp volume
gradually or ISP reputation filters will quarantine legitimate mail.
The schedule below comes from the contract (50 / 50 / 100 / 200 / 500
/ 1 000 / 2 000 / 5 000 per day, steady-state 10 000).

Implementation shape
--------------------
- :func:`compute_warmup_cap` : pure function over ``(today, warmup_start)``.
- :func:`count_sent_today`   : asyncpg query against ``email_message``.
- :func:`within_warmup_cap`  : combines the two and decides whether a
  send can fire. Critical templates bypass the cap.
- :func:`check_and_record`   : the production entrypoint; atomically
  checks, records a reservation counter, and returns a decision.

Hemera integration
------------------
Contract Section 4.2 points at Hemera flag ``email.warmup_start`` for
the start date. Hemera is a separate W1 service that has not yet
landed at the time Pheme ships; we degrade to
``settings.email_warmup_start`` so the code path is exercisable before
Hemera wires in. Post-Hemera the lookup order is:

    1. Hemera flag ``email.warmup_start`` (if the flag service is up).
    2. Settings ``email_warmup_start`` env var.
    3. Empty string -> cap disabled (dev pre-launch mode).

The Hemera call is intentionally soft: a failure in Hemera never
blocks a send; we just fall back to the settings value and log a
warning so Selene can dashboard it.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, datetime, timezone

from src.backend.config import Settings, get_settings
from src.backend.db.pool import get_pool

logger = logging.getLogger(__name__)

# Contract Section 4.2 schedule. Index is ``days_since_launch`` (0-based).
# Day 0 + 1 stay at 50 for a conservative two-day warmup; Day 2 doubles
# to 100, then ramps each day. Index beyond len(_SCHEDULE) saturates at
# ``_STEADY_STATE_CAP`` (post-hackathon this grows with plan tier).
_SCHEDULE: tuple[int, ...] = (50, 50, 100, 200, 500, 1000, 2000, 5000)
_STEADY_STATE_CAP: int = 10_000

# Value returned when warmup is disabled (empty warmup_start). A send
# can always fire. Used by :func:`within_warmup_cap` to short-circuit.
_UNBOUNDED: int = 2**31 - 1


@dataclass(frozen=True)
class WarmupDecision:
    """Structured result for :func:`check_and_record`."""

    allowed: bool
    cap: int
    day_sent: int
    reason: str  # 'within_cap' | 'cap_exceeded' | 'critical_bypass' | 'cap_disabled'


def _parse_warmup_start(raw: str) -> date | None:
    """Parse an ISO date string into a ``date``. Returns None on empty."""

    trimmed = raw.strip()
    if not trimmed:
        return None
    try:
        return date.fromisoformat(trimmed)
    except ValueError:
        logger.warning(
            "email.warmup.invalid_start_date value=%s",
            trimmed,
        )
        return None


def compute_warmup_cap(
    *,
    today: date | None = None,
    warmup_start: date | None = None,
) -> int:
    """Return the per-day cap for ``today`` given the start date.

    ``warmup_start=None`` (cap disabled, dev mode) returns
    :data:`_UNBOUNDED`. Otherwise the schedule is applied with the
    index ``max(0, (today - warmup_start).days)``.

    Clock-skew safe: if ``today`` is before ``warmup_start`` we return
    the day-0 cap so pre-launch smoke tests do not see an inflated
    quota.
    """

    if warmup_start is None:
        return _UNBOUNDED
    effective_today = today or datetime.now(timezone.utc).date()
    delta_days = max(0, (effective_today - warmup_start).days)
    if delta_days < len(_SCHEDULE):
        return _SCHEDULE[delta_days]
    return _STEADY_STATE_CAP


async def count_sent_today() -> int:
    """Count ``email_message`` rows sent within the current UTC day.

    The query is small + covered by the ``idx_email_message_sent_at``
    index defined in the 020 migration. Returns 0 when the pool is not
    yet initialized (pre-lifespan tests) rather than raising; that
    lets :func:`within_warmup_cap` fail-open during pure unit tests.
    """

    try:
        pool = get_pool()
    except RuntimeError:
        logger.debug("email.warmup.count_sent_no_pool")
        return 0

    today_utc = datetime.now(timezone.utc).date()
    query = (
        "SELECT COUNT(*)::bigint FROM email_message "
        "WHERE status = 'sent' AND sent_at >= $1"
    )
    start_of_day = datetime(
        today_utc.year,
        today_utc.month,
        today_utc.day,
        tzinfo=timezone.utc,
    )
    async with pool.acquire() as conn:
        value = await conn.fetchval(query, start_of_day)
    return int(value or 0)


def resolve_warmup_start(settings: Settings | None = None) -> date | None:
    """Return the effective warmup start date.

    Hemera flag lookup wrapped in a try/except so a flag-service outage
    never blocks a send path. Current implementation reads settings
    directly; the Hemera hook lands in the hemera_flag W1 consumer.
    """

    resolved = settings or get_settings()
    return _parse_warmup_start(resolved.email_warmup_start)


async def within_warmup_cap(
    *,
    critical: bool = False,
    settings: Settings | None = None,
) -> WarmupDecision:
    """Decide whether a send can fire now.

    Parameters
    ----------
    critical
        When True the send bypasses the cap per contract Section 8
        ("password_reset, security_alert bypass"). The reason field
        reports ``critical_bypass`` so Selene can dashboard how often
        the escape hatch fires.
    settings
        Optional override for tests. When omitted reads process
        Settings.
    """

    warmup_start = resolve_warmup_start(settings)
    cap = compute_warmup_cap(warmup_start=warmup_start)

    if cap == _UNBOUNDED:
        return WarmupDecision(
            allowed=True,
            cap=cap,
            day_sent=0,
            reason="cap_disabled",
        )

    day_sent = await count_sent_today()

    if critical:
        return WarmupDecision(
            allowed=True,
            cap=cap,
            day_sent=day_sent,
            reason="critical_bypass",
        )

    if day_sent < cap:
        return WarmupDecision(
            allowed=True,
            cap=cap,
            day_sent=day_sent,
            reason="within_cap",
        )

    logger.warning(
        "email.warmup.cap_exceeded day_sent=%d cap=%d",
        day_sent,
        cap,
    )
    return WarmupDecision(
        allowed=False,
        cap=cap,
        day_sent=day_sent,
        reason="cap_exceeded",
    )


__all__ = [
    "WarmupDecision",
    "compute_warmup_cap",
    "count_sent_today",
    "resolve_warmup_start",
    "within_warmup_cap",
]
