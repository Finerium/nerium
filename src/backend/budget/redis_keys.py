"""Redis key namespace for the Chronos budget daemon.

Owner: Moros (W2 NP P3 S1). Kratos already depends on the global cap
key + per-tenant counter keys via ``src/backend/ma/budget_guard.py``;
re-declare them here so Moros writes through the same constants and
the two sides cannot drift.

Contract reference: ``docs/contracts/budget_monitor.contract.md``
Section 3.2 (Redis counter keys).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Final

# -- Global (platform-wide) keys ---------------------------------------------

GLOBAL_CAP_FLAG: Final[str] = "chronos:ma_capped"
"""``"1"`` when the platform is paused. Both Kratos ``create_session``
(pre-call) + the dispatcher stream loop short-circuit on this flag."""

LAST_POLL_HASH: Final[str] = "chronos:last_poll"
"""Hash ``{mtd_usd, daily_usd, ts, cycle_id}`` written by the poller
on successful Admin API responses. Surfaced by the admin status
endpoint so operators can see the freshness of the authoritative
source of truth."""

LAST_RECONCILE_TS: Final[str] = "chronos:last_reconcile_ts"
"""ISO-8601 timestamp of the last successful poll. Separate from the
``last_poll`` hash because the poller updates it even when the
response carried zero buckets (so the next poll's ``since`` advances
correctly)."""

POLL_LOCK: Final[str] = "chronos:poll_lock"
"""60 s single-runner lock so parallel Arq workers do not hammer the
Admin API in the same minute. Key is set with ``NX`` + ``EX=60``."""

CONSECUTIVE_FAILURES: Final[str] = "chronos:consecutive_failures"
"""Monotonic counter incremented on every poll failure, reset on
success. The cron body checks this before escalating to an ERROR log."""

LAST_ERROR: Final[str] = "chronos:last_error"
"""Sanitised error message from the most recent failed poll. Surfaced
by the admin status endpoint so operators can triage without tailing
logs. TTL 1 h so stale entries do not linger after recovery."""

GLOBAL_AUTO_DISABLED_FLAG: Final[str] = "chronos:global_auto_disabled"
"""``"1"`` when Moros has auto-disabled the ``builder.live`` Hemera
flag globally (distinct from an admin manual flip). The daily reset
cron only restores the flag when this marker is present so it never
fights a human operator's deliberate off-toggle."""


# -- Per-tenant keys ---------------------------------------------------------

TENANT_CAP_FLAG_FMT: Final[str] = "chronos:tenant:{tenant_id}:capped"
"""Per-tenant cap flag. Mirrors ``ma.budget_guard``'s format string."""

TENANT_SPENT_TODAY_FMT: Final[str] = "chronos:tenant:{tenant_id}:usd_today"
"""Per-tenant daily spend counter (``INCRBYFLOAT``)."""

TENANT_CAP_USD_FMT: Final[str] = "chronos:tenant:{tenant_id}:cap_usd"
"""Per-tenant daily cap (USD) written by the local accountant when the
policy is first loaded. Kratos reads this so the guard math does not
have to join the ``budget_policy`` table on the hot path."""


# -- Cycle audit record ------------------------------------------------------

CYCLE_AUDIT_FMT: Final[str] = "chronos:cycle:{cycle_id}"
"""Short-lived audit record keyed by ``cycle_id`` (uuid7). TTL 1 h so
the admin status endpoint can cross-reference a specific poll without
growing the keyspace unbounded."""
CYCLE_AUDIT_TTL_SECONDS: Final[int] = 3600


# -- Pub/sub channel ---------------------------------------------------------

CAP_EVENTS_CHANNEL: Final[str] = "chronos:cap-events"
"""Redis pub/sub channel where Moros publishes cap-trip + cap-clear
events in addition to the Nike realtime broadcast. Kept so a worker
that is not yet part of the realtime fabric (future Heracles managed
agent daemon) can still hear the signal."""


# -- Helpers -----------------------------------------------------------------


def next_utc_midnight(now: datetime | None = None) -> datetime:
    """Return the next ``00:00 UTC`` boundary after ``now``.

    Used by ``SET EX`` calls so per-tenant daily counters roll off on
    their own even if the Arq daily reset cron is late / missed.
    """

    current = now or datetime.now(timezone.utc)
    tomorrow = (current + timedelta(days=1)).date()
    return datetime(
        tomorrow.year,
        tomorrow.month,
        tomorrow.day,
        0,
        0,
        0,
        tzinfo=timezone.utc,
    )


def seconds_until_next_utc_midnight(now: datetime | None = None) -> int:
    """Return an ``int`` TTL seconds until the next UTC midnight.

    Wraps :func:`next_utc_midnight` so callers that do
    ``redis.set(key, val, ex=seconds_until_next_utc_midnight())`` get
    an integer (redis-py rejects sub-second TTLs on ``ex=``).
    """

    current = now or datetime.now(timezone.utc)
    delta = next_utc_midnight(current) - current
    return max(int(delta.total_seconds()), 1)


__all__ = [
    "CAP_EVENTS_CHANNEL",
    "CONSECUTIVE_FAILURES",
    "CYCLE_AUDIT_FMT",
    "CYCLE_AUDIT_TTL_SECONDS",
    "GLOBAL_AUTO_DISABLED_FLAG",
    "GLOBAL_CAP_FLAG",
    "LAST_ERROR",
    "LAST_POLL_HASH",
    "LAST_RECONCILE_TS",
    "POLL_LOCK",
    "TENANT_CAP_FLAG_FMT",
    "TENANT_CAP_USD_FMT",
    "TENANT_SPENT_TODAY_FMT",
    "next_utc_midnight",
    "seconds_until_next_utc_midnight",
]
