"""Unit tests for :mod:`src.backend.trust.per_category`.

Owner: Astraea (W2 Registry trust, NP P1 S1). Covers the per-category
primary-signal dispatch, the log-normalisation ceiling, the weights
sum-to-one guard, and the ``compute_category_base`` composition.
"""

from __future__ import annotations

import pytest

from src.backend.trust.per_category import (
    COUNT_CEILING,
    CategoryInputs,
    CategoryWeights,
    DEFAULT_CATEGORY_WEIGHTS,
    KNOWN_CATEGORIES,
    compute_category_base,
    get_category_weights,
    log_normalise_count,
    primary_signal_for,
)


# ---------------------------------------------------------------------------
# log_normalise_count
# ---------------------------------------------------------------------------


def test_log_normalise_zero_returns_zero() -> None:
    assert log_normalise_count(0) == 0.0


def test_log_normalise_at_ceiling_returns_one() -> None:
    assert log_normalise_count(COUNT_CEILING) == pytest.approx(1.0)


def test_log_normalise_above_ceiling_clamps() -> None:
    assert log_normalise_count(COUNT_CEILING * 10) == 1.0


def test_log_normalise_monotonic() -> None:
    prev = 0.0
    for count in (1, 10, 100, 1000, 5000, COUNT_CEILING):
        value = log_normalise_count(count)
        assert value > prev
        prev = value


def test_log_normalise_negative_clamps_to_zero() -> None:
    assert log_normalise_count(-5) == 0.0


def test_log_normalise_rejects_bad_ceiling() -> None:
    with pytest.raises(ValueError):
        log_normalise_count(100, ceiling=0)


# ---------------------------------------------------------------------------
# CategoryWeights
# ---------------------------------------------------------------------------


def test_weights_must_sum_to_one() -> None:
    with pytest.raises(ValueError):
        CategoryWeights(primary=0.5, review=0.3, wilson=0.1)


def test_weights_float_epsilon_tolerated() -> None:
    """Small floating-point drift around 1.0 is tolerated."""

    # 0.3333 * 3 = 0.9999; we accept up to 1e-6 drift.
    CategoryWeights(primary=0.333333, review=0.333333, wilson=0.333334)


def test_default_weights_cover_every_known_category() -> None:
    for category in KNOWN_CATEGORIES:
        assert category in DEFAULT_CATEGORY_WEIGHTS


def test_default_weights_all_sum_to_one() -> None:
    for category, weights in DEFAULT_CATEGORY_WEIGHTS.items():
        total = weights.primary + weights.review + weights.wilson
        assert abs(total - 1.0) < 1e-6


def test_get_category_weights_unknown_falls_back_to_content() -> None:
    value = get_category_weights("does_not_exist")
    assert value == DEFAULT_CATEGORY_WEIGHTS["content"]


def test_get_category_weights_override_wins() -> None:
    override = {
        "content": CategoryWeights(primary=0.8, review=0.1, wilson=0.1),
    }
    assert (
        get_category_weights("content", override=override).primary  # type: ignore[arg-type]
        == pytest.approx(0.8)
    )


# ---------------------------------------------------------------------------
# primary_signal_for
# ---------------------------------------------------------------------------


def test_primary_signal_core_agent_uses_execution_rate() -> None:
    inputs = CategoryInputs(execution_success_rate=0.9)
    assert primary_signal_for("core_agent", inputs) == 0.9


def test_primary_signal_content_uses_usage_count_log_norm() -> None:
    inputs = CategoryInputs(usage_count=1000)
    value = primary_signal_for("content", inputs)
    assert 0.0 < value < 1.0


def test_primary_signal_infrastructure_uses_install_rate() -> None:
    inputs = CategoryInputs(install_success_rate=0.75)
    assert primary_signal_for("infrastructure", inputs) == 0.75


def test_primary_signal_assets_uses_download_count_log_norm() -> None:
    inputs = CategoryInputs(download_count=COUNT_CEILING)
    assert primary_signal_for("assets", inputs) == pytest.approx(1.0)


def test_primary_signal_services_uses_completion_rate() -> None:
    inputs = CategoryInputs(completion_rate=0.8)
    assert primary_signal_for("services", inputs) == 0.8


def test_primary_signal_data_blends_download_and_freshness() -> None:
    inputs = CategoryInputs(download_count=COUNT_CEILING, data_freshness_score=1.0)
    # 0.5 * 1.0 + 0.5 * 1.0 = 1.0
    assert primary_signal_for("data", inputs) == pytest.approx(1.0)

    inputs_half = CategoryInputs(download_count=0, data_freshness_score=1.0)
    # 0.5 * 0 + 0.5 * 1 = 0.5
    assert primary_signal_for("data", inputs_half) == pytest.approx(0.5)


def test_primary_signal_premium_binary_admin_grant() -> None:
    inputs_granted = CategoryInputs(admin_grant=True)
    inputs_ungranted = CategoryInputs(admin_grant=False)
    assert primary_signal_for("premium", inputs_granted) == 1.0
    assert primary_signal_for("premium", inputs_ungranted) == 0.0


def test_primary_signal_unknown_category_returns_zero() -> None:
    inputs = CategoryInputs(execution_success_rate=0.5, review_count=100)
    assert primary_signal_for("unknown_cat", inputs) == 0.0


# ---------------------------------------------------------------------------
# compute_category_base
# ---------------------------------------------------------------------------


def test_compute_base_content_blends_primary_and_review() -> None:
    """A content listing with mid-range usage + mid-range reviews."""

    inputs = CategoryInputs(
        review_rating_mean_normalised=0.8,
        review_count=50,
        usage_count=500,
    )
    result = compute_category_base(category="content", inputs=inputs)
    # Sanity: base lands between 0.0 and 1.0; bayesian > 0.5 because R>C.
    assert 0.0 <= result.base <= 1.0
    assert result.bayesian > 0.5
    assert 0.0 < result.primary < 1.0


def test_compute_base_unknown_category_still_produces_value() -> None:
    """Unknown category falls back to content weights."""

    inputs = CategoryInputs(review_rating_mean_normalised=0.9, review_count=100)
    result = compute_category_base(category="somethingnew", inputs=inputs)
    assert 0.0 <= result.base <= 1.0
    # With primary=0 and high review, the base should still be > 0.
    assert result.bayesian > 0.7


def test_compute_base_wilson_zero_evidence_falls_back_to_half() -> None:
    """No helpful/flag signal -> Wilson baseline 0.5, not 0.0."""

    inputs = CategoryInputs(
        helpful_count=0,
        flag_count=0,
        review_count=0,
        review_rating_mean_normalised=0.5,
    )
    result = compute_category_base(category="content", inputs=inputs)
    assert result.wilson == 0.5


def test_compute_base_wilson_with_signals_replaces_default() -> None:
    """Populated helpful/flag swaps the 0.5 default for the real lb."""

    inputs = CategoryInputs(
        helpful_count=90,
        flag_count=10,
        review_count=50,
        review_rating_mean_normalised=0.8,
    )
    result = compute_category_base(category="content", inputs=inputs)
    assert result.wilson != 0.5
    assert 0.7 < result.wilson < 0.95


def test_compute_base_premium_short_circuits() -> None:
    """Premium category returns 1.0 iff admin_grant else 0.0."""

    granted = compute_category_base(
        category="premium",
        inputs=CategoryInputs(admin_grant=True),
    )
    assert granted.base == 1.0

    ungranted = compute_category_base(
        category="premium",
        inputs=CategoryInputs(admin_grant=False),
    )
    assert ungranted.base == 0.0


def test_compute_base_output_clamped_to_one() -> None:
    """Even pathological inputs never produce base > 1."""

    inputs = CategoryInputs(
        review_rating_mean_normalised=1.0,
        review_count=10_000,
        helpful_count=10_000,
        flag_count=0,
        execution_success_rate=1.0,
    )
    result = compute_category_base(category="core_agent", inputs=inputs)
    assert result.base <= 1.0
