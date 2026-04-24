"""Unit tests for :mod:`src.backend.trust.wilson`.

Owner: Astraea (W2 Registry trust, NP P1 S1). Covers the standard
Wilson-score lower-bound edges: empty sample, all-positive, all-negative,
known-reference values, monotonicity, invalid inputs.
"""

from __future__ import annotations

import math

import pytest

from src.backend.trust.wilson import (
    DEFAULT_Z_SCORE,
    wilson_lower_bound,
    wilson_lower_bound_from_signals,
)


def test_default_z_matches_95_percent_confidence() -> None:
    assert DEFAULT_Z_SCORE == pytest.approx(1.96)


def test_total_zero_returns_zero() -> None:
    """No evidence -> no positive-rate confidence."""

    assert wilson_lower_bound(positive=0, total=0) == 0.0


def test_zero_positive_returns_zero() -> None:
    """Zero helpful votes -> lower bound 0.0 exactly."""

    # Formula still evaluates to 0.0 at the lower bound (centre = 0).
    assert wilson_lower_bound(positive=0, total=100) == 0.0


def test_all_positive_100_of_100_near_0_964() -> None:
    """Canonical reference: 100/100 -> ~0.9637 at z=1.96."""

    value = wilson_lower_bound(positive=100, total=100)
    assert value == pytest.approx(0.9637, abs=1e-3)


def test_all_positive_10_of_10_below_one() -> None:
    """Small sample with 100 percent positive never claims certainty."""

    value = wilson_lower_bound(positive=10, total=10)
    assert 0.6 < value < 0.75  # textbook value ~0.7224
    assert value < 1.0


def test_single_positive_one_of_one_small() -> None:
    """Lone positive produces a generous but non-zero lower bound."""

    value = wilson_lower_bound(positive=1, total=1)
    # Wilson 1/1 at z=1.96 -> ~0.2065.
    assert 0.15 < value < 0.30


def test_half_positive_50_of_100_near_0_4() -> None:
    """Fair-coin evidence: lower bound lands below the point estimate."""

    value = wilson_lower_bound(positive=50, total=100)
    # Textbook ~0.4038.
    assert value == pytest.approx(0.4038, abs=1e-3)


def test_lower_bound_always_below_point_estimate() -> None:
    """For every non-trivial sample, lb < p_hat."""

    for n in (1, 5, 10, 50, 100, 1000):
        for p in (0.1, 0.3, 0.5, 0.7, 0.9):
            pos = max(1, int(round(p * n)))
            pos = min(pos, n - 1) if n > 1 else pos
            point = pos / n
            lb = wilson_lower_bound(positive=pos, total=n)
            # Exclude the degenerate n=1 pos=1 case where both equal 1 boundary cases.
            if 0 < point < 1:
                assert lb < point


def test_monotonic_in_total_for_fixed_rate() -> None:
    """Larger n with identical rate yields a higher lower bound."""

    # 80 percent positives at two scales.
    small = wilson_lower_bound(positive=8, total=10)
    large = wilson_lower_bound(positive=800, total=1000)
    assert large > small


def test_monotonic_in_positive_for_fixed_total() -> None:
    """More positives (fixed total) -> higher lower bound."""

    few = wilson_lower_bound(positive=20, total=100)
    many = wilson_lower_bound(positive=80, total=100)
    assert many > few


def test_output_bounded_in_0_1() -> None:
    """Sweep across edges; output always in [0, 1]."""

    for total in (1, 5, 10, 100, 10_000):
        for pos in (0, 1, total // 2, total):
            if pos > total:
                continue
            value = wilson_lower_bound(positive=pos, total=total)
            assert 0.0 <= value <= 1.0


def test_rejects_negative_positive() -> None:
    with pytest.raises(ValueError):
        wilson_lower_bound(positive=-1, total=10)


def test_rejects_negative_total() -> None:
    with pytest.raises(ValueError):
        wilson_lower_bound(positive=0, total=-10)


def test_rejects_positive_greater_than_total() -> None:
    with pytest.raises(ValueError):
        wilson_lower_bound(positive=11, total=10)


def test_large_counts_stay_finite() -> None:
    """Near-ceiling counts do not overflow or return NaN."""

    value = wilson_lower_bound(positive=10**9, total=10**9)
    assert math.isfinite(value)
    assert 0.99 < value <= 1.0


def test_custom_z_narrower_interval() -> None:
    """Lower z (narrower CI) yields a higher lower bound than default."""

    narrow = wilson_lower_bound(positive=80, total=100, z=1.0)
    wide = wilson_lower_bound(positive=80, total=100, z=1.96)
    assert narrow > wide


def test_signals_wrapper_matches_direct_call() -> None:
    """``wilson_lower_bound_from_signals`` mirrors the pos/total direct call."""

    direct = wilson_lower_bound(positive=12, total=15)
    wrapped = wilson_lower_bound_from_signals(helpful_count=12, flag_count=3)
    assert direct == wrapped


def test_signals_wrapper_zero_total() -> None:
    """Empty helpful/flag -> 0.0 lower bound."""

    assert wilson_lower_bound_from_signals(helpful_count=0, flag_count=0) == 0.0
