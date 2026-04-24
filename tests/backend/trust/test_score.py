"""Unit tests for :mod:`src.backend.trust.score`.

Owner: Astraea (W2 Registry trust, NP P1 S1). Covers the top-level
``compute_trust`` orchestration: boost application, band derivation,
stability classification, and clamping.
"""

from __future__ import annotations

import pytest

from src.backend.trust.per_category import CategoryInputs
from src.backend.trust.score import (
    DEFAULT_WEIGHTS,
    FORMULA_VERSION,
    STABILITY_REVIEW_THRESHOLD,
    VERIFIED_BOOST_AMOUNT,
    breakdown_to_jsonable,
    compute_trust,
    derive_band,
    derive_stability,
)


# ---------------------------------------------------------------------------
# derive_band
# ---------------------------------------------------------------------------


def test_band_unverified_below_020() -> None:
    assert derive_band(0.0) == "unverified"
    assert derive_band(0.15) == "unverified"
    assert derive_band(0.199) == "unverified"


def test_band_emerging_020_to_039() -> None:
    assert derive_band(0.20) == "emerging"
    assert derive_band(0.35) == "emerging"
    assert derive_band(0.399) == "emerging"


def test_band_established_040_to_059() -> None:
    assert derive_band(0.40) == "established"
    assert derive_band(0.55) == "established"
    assert derive_band(0.599) == "established"


def test_band_trusted_060_to_084() -> None:
    assert derive_band(0.60) == "trusted"
    assert derive_band(0.75) == "trusted"
    assert derive_band(0.849) == "trusted"


def test_band_elite_085_and_up() -> None:
    assert derive_band(0.85) == "elite"
    assert derive_band(0.92) == "elite"
    assert derive_band(1.0) == "elite"


def test_band_clamps_out_of_range() -> None:
    assert derive_band(-0.5) == "unverified"
    assert derive_band(2.0) == "elite"


# ---------------------------------------------------------------------------
# derive_stability
# ---------------------------------------------------------------------------


def test_stability_provisional_below_threshold() -> None:
    for v in (0, 1, 5, STABILITY_REVIEW_THRESHOLD - 1):
        assert derive_stability(v) == "provisional"


def test_stability_stable_at_and_above_threshold() -> None:
    for v in (STABILITY_REVIEW_THRESHOLD, 15, 100, 10_000):
        assert derive_stability(v) == "stable"


# ---------------------------------------------------------------------------
# compute_trust orchestration
# ---------------------------------------------------------------------------


def test_compute_trust_fresh_listing_no_evidence() -> None:
    """Brand-new listing (age 0, no reviews, no signals) -> non-trivial boost."""

    inputs = CategoryInputs(age_days=0.0)
    out = compute_trust(category="content", inputs=inputs)
    # base collapses to weighted C + wilson=0.5 default. With content
    # weights (primary=0.3, review=0.5, wilson=0.2) and primary=0:
    # base = 0.5 * 0.7 + 0.2 * 0.5 = 0.45
    # boost_new at t=0 = 0.2 (no verified -> 0)
    # final = 0.65
    assert out.boost_components["new_agent_boost"] == pytest.approx(0.2)
    assert out.boost_components["verified_boost"] == 0.0
    assert 0.6 < out.score < 0.7


def test_compute_trust_established_listing_no_boost() -> None:
    """Old listing with good reviews: past cutoff -> boost 0."""

    inputs = CategoryInputs(
        review_rating_mean_normalised=0.9,
        review_count=100,
        helpful_count=80,
        flag_count=5,
        age_days=90.0,
        usage_count=2000,
    )
    out = compute_trust(category="content", inputs=inputs)
    assert out.boost_components["new_agent_boost"] == 0.0
    assert out.stability == "stable"
    # High score: 0.9 review + high wilson + log-norm usage
    assert out.score >= 0.75


def test_compute_trust_verified_adds_boost() -> None:
    """Verified flag adds +0.05 exactly."""

    inputs = CategoryInputs(
        review_rating_mean_normalised=0.9,
        review_count=100,
        helpful_count=80,
        flag_count=5,
        age_days=90.0,
        verified_flag=True,
    )
    out = compute_trust(category="content", inputs=inputs)
    assert out.boost_components["verified_boost"] == pytest.approx(
        VERIFIED_BOOST_AMOUNT
    )


def test_compute_trust_premium_ignores_boosts() -> None:
    """Premium listings skip new-agent + verified boosts entirely."""

    granted = compute_trust(
        category="premium",
        inputs=CategoryInputs(admin_grant=True, age_days=0.0, verified_flag=True),
    )
    assert granted.score == 1.0
    # Boosts surface as 0 even though the raw inputs would otherwise
    # qualify (fresh + verified).
    assert granted.boost_components["new_agent_boost"] == 0.0
    assert granted.boost_components["verified_boost"] == 0.0

    ungranted = compute_trust(
        category="premium",
        inputs=CategoryInputs(admin_grant=False, age_days=0.0),
    )
    assert ungranted.score == 0.0


def test_compute_trust_clamps_to_one() -> None:
    """Pathological "max everything" inputs never exceed 1.0."""

    inputs = CategoryInputs(
        review_rating_mean_normalised=1.0,
        review_count=10_000,
        helpful_count=10_000,
        flag_count=0,
        age_days=0.0,
        execution_success_rate=1.0,
        verified_flag=True,
    )
    out = compute_trust(category="core_agent", inputs=inputs)
    assert out.score <= 1.0
    assert out.band == "elite"


def test_compute_trust_clamps_to_zero() -> None:
    """All-zero inputs (no reviews, no signals, old) never go negative."""

    inputs = CategoryInputs(age_days=90.0)  # no review, no signals
    out = compute_trust(category="core_agent", inputs=inputs)
    # base = weights.primary*0 + weights.review*C + weights.wilson*0.5
    # For core_agent weights (0.4, 0.4, 0.2): 0 + 0.4*0.7 + 0.2*0.5 = 0.38
    assert 0.0 <= out.score <= 1.0


def test_compute_trust_formula_version_surfaced() -> None:
    """The result carries the formula version tag for audit."""

    out = compute_trust(category="content", inputs=CategoryInputs())
    assert out.formula_version == FORMULA_VERSION


def test_compute_trust_inputs_summary_contains_every_signal() -> None:
    """Audit bag holds every ingredient Astraea read."""

    out = compute_trust(category="content", inputs=CategoryInputs(review_count=5))
    assert "R" in out.inputs_summary
    assert "v" in out.inputs_summary
    assert "helpful_count" in out.inputs_summary
    assert "flag_count" in out.inputs_summary
    assert "age_days" in out.inputs_summary
    assert "verified_flag" in out.inputs_summary


def test_compute_trust_determinism() -> None:
    """Same inputs -> same score (bitwise)."""

    inputs = CategoryInputs(
        review_rating_mean_normalised=0.82,
        review_count=47,
        helpful_count=30,
        flag_count=5,
        age_days=2.5,
    )
    out_a = compute_trust(category="content", inputs=inputs)
    out_b = compute_trust(category="content", inputs=inputs)
    assert out_a.score == out_b.score
    assert out_a.band == out_b.band
    assert out_a.boost_components == out_b.boost_components


def test_compute_trust_different_category_different_weight() -> None:
    """Same inputs across different categories -> different scores."""

    inputs = CategoryInputs(
        review_rating_mean_normalised=0.8,
        review_count=50,
        execution_success_rate=0.95,
        usage_count=1000,
    )
    agent_score = compute_trust(category="core_agent", inputs=inputs).score
    content_score = compute_trust(category="content", inputs=inputs).score
    # Not equal because weights + primary signal differ.
    assert agent_score != content_score


def test_compute_trust_provisional_small_v() -> None:
    """review_count < threshold -> stability=provisional."""

    inputs = CategoryInputs(review_count=3)
    out = compute_trust(category="content", inputs=inputs)
    assert out.stability == "provisional"


def test_compute_trust_stable_enough_reviews() -> None:
    """review_count >= threshold -> stability=stable."""

    inputs = CategoryInputs(review_count=STABILITY_REVIEW_THRESHOLD + 5)
    out = compute_trust(category="content", inputs=inputs)
    assert out.stability == "stable"


# ---------------------------------------------------------------------------
# breakdown_to_jsonable
# ---------------------------------------------------------------------------


def test_breakdown_to_jsonable_produces_plain_dict() -> None:
    """The helper returns a plain dict of plain types for jsonb storage."""

    out = compute_trust(category="content", inputs=CategoryInputs(review_count=5))
    j = breakdown_to_jsonable(out)
    assert isinstance(j, dict)
    assert j["score"] == out.score
    assert j["band"] == out.band
    assert j["stability"] == out.stability
    assert j["formula_version"] == FORMULA_VERSION
    # Mutating the returned dict does NOT leak back into the breakdown.
    j["score"] = 0.0
    assert out.score != 0.0


def test_compute_trust_default_weights_usable() -> None:
    """DEFAULT_WEIGHTS produces a result equivalent to an explicit pass."""

    inputs = CategoryInputs(review_count=20, review_rating_mean_normalised=0.9)
    default_call = compute_trust(category="content", inputs=inputs)
    explicit_call = compute_trust(
        category="content", inputs=inputs, weights=DEFAULT_WEIGHTS
    )
    assert default_call.score == explicit_call.score
