"""Unit tests for :mod:`src.backend.trust.new_agent_boost`.

Owner: Astraea (W2 Registry trust, NP P1 S1). Covers the exponential-
decay boost formula, the cutoff edge, and the ``age_days`` helper
that converts a ``created_at`` datetime into fractional days.
"""

from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone

import pytest

from src.backend.trust.new_agent_boost import (
    DEFAULT_CUTOFF_DAYS,
    DEFAULT_DECAY_TAU_DAYS,
    DEFAULT_MAX_BOOST,
    age_days_from_created_at,
    new_agent_boost,
)


def test_defaults_match_contract() -> None:
    assert DEFAULT_MAX_BOOST == pytest.approx(0.2)
    assert DEFAULT_DECAY_TAU_DAYS == pytest.approx(3.0)
    assert DEFAULT_CUTOFF_DAYS == pytest.approx(7.0)


def test_day_zero_returns_max_boost() -> None:
    """At ``age_days == 0`` the boost equals ``max_boost`` exactly."""

    assert new_agent_boost(age_days=0.0) == pytest.approx(0.2)


def test_day_three_matches_contract_value() -> None:
    """Contract Section 4.4: age_days=3 -> ~0.074."""

    value = new_agent_boost(age_days=3.0)
    assert value == pytest.approx(0.2 * math.exp(-1.0), abs=1e-6)
    assert value == pytest.approx(0.0736, abs=1e-3)


def test_just_before_cutoff_still_positive() -> None:
    """age_days=6.99 returns a tiny but strictly positive boost."""

    value = new_agent_boost(age_days=6.99)
    assert 0.0 < value < 0.03


def test_cutoff_day_returns_zero() -> None:
    """age_days == cutoff -> 0.0 exactly (hard cut)."""

    assert new_agent_boost(age_days=7.0) == 0.0


def test_past_cutoff_returns_zero() -> None:
    for age in (7.5, 10.0, 30.0, 365.0):
        assert new_agent_boost(age_days=age) == 0.0


def test_negative_age_clamps_to_zero() -> None:
    """Clock skew / future creation date never returns negative boost."""

    assert new_agent_boost(age_days=-5.0) == pytest.approx(0.2)
    assert new_agent_boost(age_days=-0.01) == pytest.approx(0.2)


def test_monotonic_decay_day_by_day() -> None:
    """Each subsequent day (within the window) yields strictly less boost."""

    prev = new_agent_boost(age_days=0.0)
    for day in range(1, 7):
        current = new_agent_boost(age_days=float(day))
        assert current < prev
        prev = current


def test_output_bounded_by_max_boost() -> None:
    """Output stays in [0, max_boost] for every valid age."""

    for age in (-1.0, 0.0, 1.5, 3.0, 5.0, 6.99, 7.0, 8.0, 100.0):
        value = new_agent_boost(age_days=age)
        assert 0.0 <= value <= 0.2


def test_custom_weights_override() -> None:
    """Custom weights override defaults without altering the shape."""

    value = new_agent_boost(
        age_days=5.0,
        max_boost=0.5,
        tau_days=5.0,
        cutoff_days=14.0,
    )
    # 0.5 * exp(-1.0) ~ 0.1839.
    assert value == pytest.approx(0.5 * math.exp(-1.0), abs=1e-6)


def test_custom_weights_respect_cutoff() -> None:
    """Even with a generous max/tau, the cutoff hard-zeroes the output."""

    assert new_agent_boost(
        age_days=14.0,
        max_boost=1.0,
        tau_days=100.0,
        cutoff_days=14.0,
    ) == 0.0


def test_rejects_non_positive_tau() -> None:
    with pytest.raises(ValueError):
        new_agent_boost(age_days=1.0, tau_days=0.0)
    with pytest.raises(ValueError):
        new_agent_boost(age_days=1.0, tau_days=-1.0)


def test_rejects_negative_cutoff() -> None:
    with pytest.raises(ValueError):
        new_agent_boost(age_days=1.0, cutoff_days=-1.0)


def test_rejects_negative_max_boost() -> None:
    with pytest.raises(ValueError):
        new_agent_boost(age_days=1.0, max_boost=-0.1)


# ---------------------------------------------------------------------------
# age_days_from_created_at helper
# ---------------------------------------------------------------------------


def test_age_days_helper_same_instant() -> None:
    """Same created_at + now -> 0 days."""

    now = datetime(2026, 4, 24, 12, 0, 0, tzinfo=timezone.utc)
    assert age_days_from_created_at(now, now=now) == 0.0


def test_age_days_helper_yesterday() -> None:
    """24-hour gap -> 1.0 days."""

    now = datetime(2026, 4, 24, 12, 0, 0, tzinfo=timezone.utc)
    earlier = now - timedelta(days=1)
    assert age_days_from_created_at(earlier, now=now) == pytest.approx(1.0)


def test_age_days_helper_fractional() -> None:
    """Sub-day gap surfaces as a fractional result."""

    now = datetime(2026, 4, 24, 12, 0, 0, tzinfo=timezone.utc)
    earlier = now - timedelta(hours=6)
    assert age_days_from_created_at(earlier, now=now) == pytest.approx(0.25)


def test_age_days_helper_future_clamps_to_zero() -> None:
    """``created_at`` after ``now`` (clock skew) clamps to 0."""

    now = datetime(2026, 4, 24, 12, 0, 0, tzinfo=timezone.utc)
    future = now + timedelta(days=3)
    assert age_days_from_created_at(future, now=now) == 0.0


def test_age_days_helper_rejects_naive_created_at() -> None:
    naive = datetime(2026, 4, 24, 12, 0, 0)  # no tzinfo
    now = datetime(2026, 4, 24, 12, 0, 0, tzinfo=timezone.utc)
    with pytest.raises(ValueError):
        age_days_from_created_at(naive, now=now)


def test_age_days_helper_rejects_naive_now() -> None:
    created = datetime(2026, 4, 24, 12, 0, 0, tzinfo=timezone.utc)
    naive_now = datetime(2026, 4, 25, 12, 0, 0)
    with pytest.raises(ValueError):
        age_days_from_created_at(created, now=naive_now)


def test_age_days_helper_default_now_is_utc() -> None:
    """Omitting ``now`` stamps utcnow under the hood (non-None result)."""

    created = datetime(2026, 4, 20, tzinfo=timezone.utc)
    value = age_days_from_created_at(created)
    assert value >= 0.0
