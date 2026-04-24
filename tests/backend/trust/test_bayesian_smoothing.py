"""Unit tests for :mod:`src.backend.trust.bayesian`.

Owner: Astraea (W2 Registry trust, NP P1 S1). Pure-math coverage; no
asyncpg, no fixtures, just deterministic arithmetic edges.
"""

from __future__ import annotations

import math

import pytest

from src.backend.trust.bayesian import (
    DEFAULT_GLOBAL_BASELINE_C,
    DEFAULT_PRIOR_WEIGHT_M,
    bayesian_smoothed_mean,
    normalise_rating_mean,
    normalise_scalar_rating,
)


# ---------------------------------------------------------------------------
# bayesian_smoothed_mean
# ---------------------------------------------------------------------------


def test_defaults_match_contract_section_3_1() -> None:
    """Prior m=15 and C=0.7 mirror the contract Section 3.1 lock."""

    assert DEFAULT_PRIOR_WEIGHT_M == 15
    assert DEFAULT_GLOBAL_BASELINE_C == pytest.approx(0.7)


def test_zero_votes_returns_C_exactly() -> None:
    """v=0 collapses the formula to C regardless of R."""

    for R in (0.0, 0.25, 0.5, 0.8, 1.0):
        assert bayesian_smoothed_mean(R=R, v=0, C=0.7) == pytest.approx(0.7)


def test_large_v_approaches_R() -> None:
    """As v -> infinity the score approaches R to arbitrary precision."""

    R = 0.92
    result = bayesian_smoothed_mean(R=R, v=10_000, C=0.3)
    # With m=15 the residual prior weight is 15 / 10015 ~ 0.0015.
    assert abs(result - R) < 0.01


def test_equal_weight_v_equals_m() -> None:
    """v == m yields the arithmetic midpoint of R and C."""

    R, C = 1.0, 0.0
    result = bayesian_smoothed_mean(R=R, v=15, C=C, m=15)
    assert result == pytest.approx(0.5, rel=1e-9)


def test_monotonic_in_R() -> None:
    """Fix v + m + C; higher R must yield strictly higher score."""

    base = bayesian_smoothed_mean(R=0.5, v=20, C=0.7)
    higher = bayesian_smoothed_mean(R=0.9, v=20, C=0.7)
    assert higher > base


def test_monotonic_in_v_when_R_above_C() -> None:
    """More evidence with R>C pulls the score closer to R (higher)."""

    few = bayesian_smoothed_mean(R=0.95, v=2, C=0.7)
    many = bayesian_smoothed_mean(R=0.95, v=200, C=0.7)
    assert many > few


def test_monotonic_in_v_when_R_below_C() -> None:
    """More evidence with R<C pulls the score down toward R."""

    few = bayesian_smoothed_mean(R=0.2, v=2, C=0.7)
    many = bayesian_smoothed_mean(R=0.2, v=200, C=0.7)
    assert many < few


def test_output_bounded_in_0_1() -> None:
    """Every valid input combination stays in [0, 1]."""

    for R in (0.0, 0.15, 0.5, 0.85, 1.0):
        for v in (0, 1, 10, 100, 10_000):
            for C in (0.0, 0.3, 0.7, 1.0):
                value = bayesian_smoothed_mean(R=R, v=v, C=C)
                assert 0.0 <= value <= 1.0


def test_clamps_R_above_one() -> None:
    """Bogus R > 1 (upstream bug) clamps to 1 instead of blowing up."""

    out = bayesian_smoothed_mean(R=1.5, v=100, C=0.7)
    # Clamped R=1 + large v -> output near 1 but strictly <= 1.
    assert out == pytest.approx(100 / 115 + (15 / 115) * 0.7, rel=1e-9)


def test_clamps_C_below_zero() -> None:
    """Bogus C < 0 (upstream bug) clamps to 0."""

    out = bayesian_smoothed_mean(R=0.5, v=0, C=-0.2)
    assert out == 0.0


def test_negative_v_clamps_to_zero() -> None:
    """Accidental negative v collapses to v=0 behaviour."""

    assert bayesian_smoothed_mean(R=0.95, v=-5, C=0.4) == pytest.approx(0.4)


def test_invalid_m_raises() -> None:
    """m < 1 is a caller-contract violation, not a recoverable edge."""

    with pytest.raises(ValueError):
        bayesian_smoothed_mean(R=0.5, v=10, C=0.7, m=0)


# ---------------------------------------------------------------------------
# normalise_rating_mean / normalise_scalar_rating
# ---------------------------------------------------------------------------


def test_normalise_empty_iterable() -> None:
    """Empty review list yields (0.0, 0)."""

    mean, count = normalise_rating_mean([])
    assert mean == 0.0
    assert count == 0


def test_normalise_five_star_scale() -> None:
    """All-5.0 reviews on a 5-scale normalise to 1.0."""

    mean, count = normalise_rating_mean([5.0, 5.0, 5.0, 5.0])
    assert mean == pytest.approx(1.0)
    assert count == 4


def test_normalise_partial_stars() -> None:
    """Mix of 4 and 5 star reviews lands between 0.8 and 1.0."""

    mean, count = normalise_rating_mean([4.0, 5.0, 4.0, 5.0])
    assert count == 4
    assert mean == pytest.approx(0.9)


def test_normalise_clamps_out_of_range() -> None:
    """Upstream-bogus rating values clamp rather than raising."""

    mean, count = normalise_rating_mean([6.0, -1.0, 5.0])
    # 6 clamps to 5, -1 clamps to 0, 5 stays. Sum = 10, count 3, scale 5.
    assert mean == pytest.approx(10 / 15)
    assert count == 3


def test_normalise_rejects_non_positive_scale() -> None:
    with pytest.raises(ValueError):
        normalise_rating_mean([5.0], scale_max=0)


def test_normalise_scalar_rating_midpoint() -> None:
    """3.5 / 5 = 0.7 -- matches the default C baseline."""

    assert normalise_scalar_rating(3.5) == pytest.approx(0.7)


def test_normalise_scalar_rating_clamps() -> None:
    assert normalise_scalar_rating(6.0) == 1.0
    assert normalise_scalar_rating(-0.5) == 0.0
    assert normalise_scalar_rating(None) == 0.0  # type: ignore[arg-type]


def test_normalise_scalar_rating_rejects_bad_scale() -> None:
    with pytest.raises(ValueError):
        normalise_scalar_rating(3.0, scale_max=0.0)


# ---------------------------------------------------------------------------
# Determinism (contract Section 9 testing surface)
# ---------------------------------------------------------------------------


def test_determinism_same_inputs_same_output() -> None:
    """Bitwise equality for repeated calls: no RNG in the formula."""

    a = bayesian_smoothed_mean(R=0.81234567, v=42, C=0.70123456, m=15)
    b = bayesian_smoothed_mean(R=0.81234567, v=42, C=0.70123456, m=15)
    c = bayesian_smoothed_mean(R=0.81234567, v=42, C=0.70123456, m=15)
    assert a == b == c
    assert not math.isnan(a)
