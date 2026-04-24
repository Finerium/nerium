"""New-agent cold-start boost for the trust score formula.

Owner: Astraea (W2 Registry trust, NP P1 S1).

Formula (per ``docs/contracts/trust_score.contract.md`` Section 3.1
and Section 4.4)::

    boost = 0.2 * exp(-age_days / 3)    when age_days < 7
    boost = 0.0                         when age_days >= 7

Rationale
---------
Without a boost, a brand-new listing sits at ``C = 0.7`` (the global
baseline) immediately after creation because ``v = 0`` collapses the
Bayesian formula to the prior mean. That still places it below every
established listing that has accumulated even a handful of positive
reviews. The boost lets a fresh listing surface in early search results
long enough to gather its first few reviews, and it decays quickly
(half-life ~2.08 days via the ``exp(-t/3)`` curve) so abusive cold-
start spam does not linger.

At ``t = 0``: boost = ``0.2``
At ``t = 3``: boost ~ ``0.074``
At ``t = 7``: boost ~ ``0.023`` -> cut off to 0
At ``t = 10``: boost = ``0.0`` exactly (past cutoff)
"""

from __future__ import annotations

import math
from datetime import datetime, timezone

DEFAULT_MAX_BOOST: float = 0.2
"""Boost magnitude at ``age_days == 0`` (contract-locked)."""

DEFAULT_DECAY_TAU_DAYS: float = 3.0
"""Exponential decay time constant in days."""

DEFAULT_CUTOFF_DAYS: float = 7.0
"""Hard cutoff past which the boost is identically zero."""


def new_agent_boost(
    *,
    age_days: float,
    max_boost: float = DEFAULT_MAX_BOOST,
    tau_days: float = DEFAULT_DECAY_TAU_DAYS,
    cutoff_days: float = DEFAULT_CUTOFF_DAYS,
) -> float:
    """Return the additive new-agent boost in ``[0.0, max_boost]``.

    Parameters
    ----------
    age_days
        Days since listing / identity creation. Negative values
        (e.g. a future ``created_at`` from clock skew) clamp to 0
        so we never return a negative boost.
    max_boost
        Peak boost at ``age_days == 0``.
    tau_days
        Decay time constant. Must be > 0.
    cutoff_days
        Days past which the boost is zero. Must be >= 0.

    Returns
    -------
    float
        Boost in ``[0.0, max_boost]``.
    """

    if tau_days <= 0:
        raise ValueError(f"tau_days must be > 0, got {tau_days}")
    if cutoff_days < 0:
        raise ValueError(f"cutoff_days must be >= 0, got {cutoff_days}")
    if max_boost < 0:
        raise ValueError(f"max_boost must be >= 0, got {max_boost}")

    age_clamped = max(0.0, float(age_days))
    if age_clamped >= cutoff_days:
        return 0.0
    return max_boost * math.exp(-age_clamped / tau_days)


def age_days_from_created_at(
    created_at: datetime,
    *,
    now: datetime | None = None,
) -> float:
    """Return the age in fractional days between ``created_at`` and ``now``.

    Both inputs MUST be timezone-aware. The helper raises a
    ``ValueError`` on naive datetimes rather than silently assuming
    UTC, so a caller that forgets ``timezone.utc`` learns about it
    during tests instead of at 2am in production.

    A future ``created_at`` (e.g. clock skew, seed fixtures) clamps to
    zero days rather than returning a negative value.
    """

    if created_at.tzinfo is None:
        raise ValueError(
            "created_at must be timezone-aware; pass a tz-aware datetime "
            "(use datetime.now(timezone.utc) or tzinfo=timezone.utc)."
        )
    if now is None:
        now = datetime.now(timezone.utc)
    if now.tzinfo is None:
        raise ValueError("now must be timezone-aware.")

    delta = now - created_at
    days = delta.total_seconds() / 86400.0
    return max(0.0, days)


__all__ = [
    "DEFAULT_CUTOFF_DAYS",
    "DEFAULT_DECAY_TAU_DAYS",
    "DEFAULT_MAX_BOOST",
    "age_days_from_created_at",
    "new_agent_boost",
]
