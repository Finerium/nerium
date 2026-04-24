"""Per-category formula dispatch for the trust score.

Owner: Astraea (W2 Registry trust, NP P1 S1).

Per ``docs/contracts/trust_score.contract.md`` Section 3.2 different
marketplace categories weigh their inputs differently:

=====================  =============================================
Category               Primary / secondary inputs
=====================  =============================================
``core_agent``         execution_success_rate + review_weighted_mean
``content``            usage_count_normalised + review_weighted_mean
``infrastructure``     install_success_rate + review_weighted_mean
``assets``             download_count_normalised + review_weighted_mean
``services``           completion_rate + review_weighted_mean
``premium``            admin_grant (binary) + hand-curated
``data``               download_count_normalised + review_weighted_mean
                       + data_freshness_score
=====================  =============================================

This module:

- Exposes :class:`CategoryInputs`, the normalised input bundle every
  category-specific formula consumes.
- Exposes :class:`CategoryWeights`, the blend weights per category.
- Exposes :func:`compute_category_base`, the pre-boost, pre-clamp
  scalar in ``[0, 1]`` that the top-level :mod:`score` orchestrator
  combines with new-agent + verified boosts.
- Exposes :func:`log_normalise_count`, the ``log(x + 1) / log(10000)``
  transform used by every count-based input (capped at 1.0).

The weights here are the ``bayesian_wilson_v1`` defaults. A later
formula version can override them via the
``trust_formula_weights.weights.category_weights`` JSON column.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Literal, Optional

from src.backend.trust.bayesian import (
    DEFAULT_GLOBAL_BASELINE_C,
    DEFAULT_PRIOR_WEIGHT_M,
    bayesian_smoothed_mean,
)
from src.backend.trust.wilson import wilson_lower_bound_from_signals

# Category identifiers mirror the marketplace_listing Category enum so
# a string comparison is enough; we do not import the enum directly to
# keep this module free of Pydantic / listing imports (pure math +
# dataclasses, fast to test).
Category = Literal[
    "core_agent",
    "content",
    "infrastructure",
    "assets",
    "services",
    "premium",
    "data",
]

KNOWN_CATEGORIES: tuple[Category, ...] = (
    "core_agent",
    "content",
    "infrastructure",
    "assets",
    "services",
    "premium",
    "data",
)

# Log-normalisation ceiling: we cap the count-based inputs at
# ``count = COUNT_CEILING`` so the transform saturates at 1.0.
# 10_000 is a generous ceiling for hackathon-scale usage and matches
# the contract Section 3.2 note.
COUNT_CEILING: int = 10_000
_LOG_CEILING: float = math.log(COUNT_CEILING + 1)


def log_normalise_count(count: int, *, ceiling: int = COUNT_CEILING) -> float:
    """Return ``log(count + 1) / log(ceiling + 1)`` clamped to ``[0, 1]``.

    Used for usage_count, download_count, install_count style inputs.

    - ``count == 0`` -> ``0.0``
    - ``count == ceiling`` -> ``1.0`` exactly
    - ``count > ceiling`` -> ``1.0`` (clamped)
    - Negative count clamps to 0.
    """

    if ceiling <= 0:
        raise ValueError(f"ceiling must be > 0, got {ceiling}")
    c = max(0, int(count))
    log_c = math.log(c + 1)
    log_cap = math.log(ceiling + 1) if ceiling != COUNT_CEILING else _LOG_CEILING
    return min(1.0, max(0.0, log_c / log_cap))


# ---------------------------------------------------------------------------
# Input + weights dataclasses
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class CategoryInputs:
    """Normalised per-category input bundle.

    All count fields are raw integers (the per-category helper applies
    the log-normalisation). All rate-style fields are already in
    ``[0, 1]``; callers supplying unclamped values will see them
    clamped defensively inside the per-category helper.
    """

    # Review signals (shared across every category that has reviews).
    review_rating_mean_normalised: float = 0.0  # in [0, 1]
    review_count: int = 0

    # Binary helpful / flag signals (Wilson lower bound domain).
    helpful_count: int = 0
    flag_count: int = 0

    # Category-specific numerical inputs. Any unused field stays at
    # its default; per-category formulas ignore what they do not need.
    execution_success_rate: float = 0.0     # core_agent
    install_success_rate: float = 0.0       # infrastructure
    completion_rate: float = 0.0            # services
    usage_count: int = 0                    # content
    download_count: int = 0                 # assets + data
    data_freshness_score: float = 0.0       # data

    # Premium curated gate.
    admin_grant: bool = False

    # Boost context (consumed by top-level orchestrator but carried
    # here so the inputs dict surfacing in the audit trail contains
    # every ingredient Astraea looked at).
    age_days: float = 0.0
    verified_flag: bool = False


@dataclass(frozen=True)
class CategoryWeights:
    """Per-category blend weights for the ``bayesian_wilson_v1`` formula.

    ``primary`` is multiplied with the category's primary signal
    (success rate / completion rate / count-normalised), ``review``
    with the Bayesian review mean, ``wilson`` with the helpful/flag
    Wilson lower bound. The three weights MUST sum to 1.0.
    """

    primary: float
    review: float
    wilson: float

    def __post_init__(self) -> None:
        total = self.primary + self.review + self.wilson
        if abs(total - 1.0) > 1e-6:
            raise ValueError(
                f"CategoryWeights must sum to 1.0, got {total:.6f} "
                f"(primary={self.primary}, review={self.review}, wilson={self.wilson})."
            )


# ``bayesian_wilson_v1`` defaults. These mirror the contract's
# reference allocation: review mean carries the bulk for categories
# where reviews are the best signal; success/completion rate leads
# for execution-style categories. Premium has no blend (admin binary).
DEFAULT_CATEGORY_WEIGHTS: dict[Category, CategoryWeights] = {
    "core_agent": CategoryWeights(primary=0.4, review=0.4, wilson=0.2),
    "content": CategoryWeights(primary=0.3, review=0.5, wilson=0.2),
    "infrastructure": CategoryWeights(primary=0.4, review=0.4, wilson=0.2),
    "assets": CategoryWeights(primary=0.3, review=0.5, wilson=0.2),
    "services": CategoryWeights(primary=0.4, review=0.4, wilson=0.2),
    "data": CategoryWeights(primary=0.3, review=0.5, wilson=0.2),
    # Premium is a degenerate case: admin_grant alone drives the score.
    # We still hold a row here so ``get_category_weights`` never raises
    # KeyError; the per-category formula below short-circuits on the
    # admin_grant branch before touching these weights.
    "premium": CategoryWeights(primary=1.0, review=0.0, wilson=0.0),
}


def get_category_weights(
    category: str,
    *,
    override: Optional[dict[Category, CategoryWeights]] = None,
) -> CategoryWeights:
    """Return weights for ``category`` with optional per-version override.

    Unknown categories fall back to the ``content`` weights (safest
    default: review-heavy blend) and log a debug message via the
    caller's logger when the weight is looked up. We deliberately do
    NOT raise: Astraea must stay robust to a new category landing in
    ``marketplace_listing`` before this module is updated.
    """

    source = override or DEFAULT_CATEGORY_WEIGHTS
    if category in source:
        return source[category]  # type: ignore[index]
    return source.get("content", CategoryWeights(primary=0.3, review=0.5, wilson=0.2))  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# Primary-signal extractor
# ---------------------------------------------------------------------------


def primary_signal_for(
    category: str,
    inputs: CategoryInputs,
) -> float:
    """Return the category's primary-signal value in ``[0, 1]``.

    Dispatch table is a plain ``if/elif`` cascade rather than a dict of
    callables so the branch is inlineable + stepthrough-friendly.
    """

    if category == "core_agent":
        return _clamp01(inputs.execution_success_rate)
    if category == "content":
        return log_normalise_count(inputs.usage_count)
    if category == "infrastructure":
        return _clamp01(inputs.install_success_rate)
    if category == "assets":
        return log_normalise_count(inputs.download_count)
    if category == "services":
        return _clamp01(inputs.completion_rate)
    if category == "data":
        # Data blends download count + freshness on equal weight.
        return 0.5 * log_normalise_count(inputs.download_count) + 0.5 * _clamp01(
            inputs.data_freshness_score
        )
    if category == "premium":
        # Binary admin curation -> 1.0 when granted, 0.0 otherwise.
        return 1.0 if inputs.admin_grant else 0.0
    # Unknown category: degrade to review mean alone.
    return 0.0


# ---------------------------------------------------------------------------
# Top-level per-category base composition
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class CategoryBase:
    """Pre-boost, pre-clamp composition of the three blended components."""

    primary: float
    bayesian: float
    wilson: float
    base: float
    weights: CategoryWeights


def compute_category_base(
    *,
    category: str,
    inputs: CategoryInputs,
    C: float = DEFAULT_GLOBAL_BASELINE_C,
    m: int = DEFAULT_PRIOR_WEIGHT_M,
    weights_override: Optional[dict[Category, CategoryWeights]] = None,
) -> CategoryBase:
    """Return the pre-boost category base score + ingredient breakdown.

    The top-level :func:`src.backend.trust.score.compute_trust` takes
    ``CategoryBase.base``, adds new-agent + verified boosts, and clamps
    to ``[0, 1]``. We split the computation so the ingredient values
    surface in the ``computed_inputs`` audit jsonb.
    """

    weights = get_category_weights(category, override=weights_override)

    # Premium short-circuit: the curated binary gate already captures
    # the value. Skipping the Bayesian branch avoids polluting the
    # audit trail with meaningless review-based ingredients on hand-
    # curated listings.
    if category == "premium":
        base = 1.0 if inputs.admin_grant else 0.0
        return CategoryBase(
            primary=base,
            bayesian=0.0,
            wilson=0.0,
            base=base,
            weights=weights,
        )

    primary = primary_signal_for(category, inputs)
    bayesian = bayesian_smoothed_mean(
        R=inputs.review_rating_mean_normalised,
        v=inputs.review_count,
        C=C,
        m=m,
    )
    # Wilson handles the zero-evidence case by returning 0.0 exactly;
    # we want a neutral 0.5 baseline instead for categories that have
    # not yet accumulated helpful/flag signal because a hard 0
    # over-penalises listings with only review data. This matches the
    # contract Section 4.2 reference implementation
    # (``if inputs.helpful_count + inputs.flag_count > 0 else 0.5``).
    if inputs.helpful_count + inputs.flag_count > 0:
        wilson = wilson_lower_bound_from_signals(
            helpful_count=inputs.helpful_count,
            flag_count=inputs.flag_count,
        )
    else:
        wilson = 0.5

    base = (
        weights.primary * primary
        + weights.review * bayesian
        + weights.wilson * wilson
    )
    return CategoryBase(
        primary=primary,
        bayesian=bayesian,
        wilson=wilson,
        base=_clamp01(base),
        weights=weights,
    )


def _clamp01(value: float) -> float:
    """Clamp a float to ``[0, 1]`` defensively."""

    return min(1.0, max(0.0, float(value)))


__all__ = [
    "COUNT_CEILING",
    "Category",
    "CategoryBase",
    "CategoryInputs",
    "CategoryWeights",
    "DEFAULT_CATEGORY_WEIGHTS",
    "KNOWN_CATEGORIES",
    "compute_category_base",
    "get_category_weights",
    "log_normalise_count",
    "primary_signal_for",
]
