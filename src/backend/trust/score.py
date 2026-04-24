"""Top-level trust score orchestration.

Owner: Astraea (W2 Registry trust, NP P1 S1).

Pure-math layer that glues Bayesian + Wilson + per-category dispatch
+ new-agent boost + verified boost into the single
:class:`TrustScoreBreakdown` that the DB-backed service layer persists
to ``trust_score_snapshot`` + ``marketplace_listing.trust_score_cached``.

Contract refs
-------------
- ``docs/contracts/trust_score.contract.md`` Section 3.1 formulas +
  Section 3.5 band thresholds + Section 4.2 reference implementation.

Separation of concerns
----------------------
This module contains NO DB access. The :mod:`src.backend.trust.service`
module wraps it with asyncpg gather / persist logic so the math layer
stays fast to unit-test (no fixtures, no pool, no network).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

from src.backend.trust.bayesian import (
    DEFAULT_GLOBAL_BASELINE_C,
    DEFAULT_PRIOR_WEIGHT_M,
)
from src.backend.trust.new_agent_boost import (
    DEFAULT_CUTOFF_DAYS,
    DEFAULT_DECAY_TAU_DAYS,
    DEFAULT_MAX_BOOST,
    new_agent_boost,
)
from src.backend.trust.per_category import (
    CategoryBase,
    CategoryInputs,
    KNOWN_CATEGORIES,
    compute_category_base,
)

TrustBand = Literal[
    "unverified",
    "emerging",
    "established",
    "trusted",
    "elite",
]
"""Five bands per contract Section 3.5."""

TrustStability = Literal["provisional", "stable"]
"""Confidence tag: provisional until review_count >= 10."""

# Formula version string. Bumping this is a contract event (re-seed C
# global average, write new ``trust_formula_weights`` row, bump this
# string, new snapshots carry the new version). We therefore treat it
# as a module constant the service layer reads on every compute.
FORMULA_VERSION: str = "bayesian_wilson_v1"

# Verified boost: +0.05 per contract Section 3.1 when the creator's
# agent_identity row is active AND has at least one completed payout.
# The math layer accepts a plain boolean; the service layer resolves
# the gated truth value from Tethys + Iapetus signals. Stopgap until
# Iapetus P2 ships review payouts: we treat a published listing with
# ``identity_verified == True`` alone as sufficient; document this.
VERIFIED_BOOST_AMOUNT: float = 0.05

# Stability threshold: contract Section 3.5 uses review_count >= 10.
STABILITY_REVIEW_THRESHOLD: int = 10


# ---------------------------------------------------------------------------
# Breakdown + weights bundle
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class TrustScoreBreakdown:
    """Result of a single ``compute_trust`` call.

    Mirrors the audit fields persisted to
    ``trust_score_snapshot.computed_inputs`` +
    ``trust_score_snapshot.boost_components``.
    """

    score: float
    band: TrustBand
    stability: TrustStability
    category: str
    formula_version: str
    # Ingredients (safe to surface on the public API response).
    inputs_summary: dict[str, float] = field(default_factory=dict)
    # Boost breakdown persisted as a jsonb column for the audit trail.
    boost_components: dict[str, float] = field(default_factory=dict)
    # Per-component internal breakdown for debug / UI "why this score?"
    components: dict[str, float] = field(default_factory=dict)


@dataclass(frozen=True)
class TrustScoreWeights:
    """Bundle of every tunable the ``compute_trust`` orchestrator reads.

    Kept as a value object so the service layer can pass a single
    "formula snapshot" loaded from ``trust_formula_weights`` instead
    of threading six kwargs through.
    """

    formula_version: str = FORMULA_VERSION
    C: float = DEFAULT_GLOBAL_BASELINE_C
    m: int = DEFAULT_PRIOR_WEIGHT_M
    new_agent_max_boost: float = DEFAULT_MAX_BOOST
    new_agent_tau_days: float = DEFAULT_DECAY_TAU_DAYS
    new_agent_cutoff_days: float = DEFAULT_CUTOFF_DAYS
    verified_boost_amount: float = VERIFIED_BOOST_AMOUNT


DEFAULT_WEIGHTS: TrustScoreWeights = TrustScoreWeights()


# ---------------------------------------------------------------------------
# Band + stability derivation
# ---------------------------------------------------------------------------


_BAND_THRESHOLDS: tuple[tuple[float, TrustBand], ...] = (
    (0.85, "elite"),
    (0.60, "trusted"),
    (0.40, "established"),
    (0.20, "emerging"),
    (0.00, "unverified"),
)


def derive_band(score: float) -> TrustBand:
    """Map a ``[0, 1]`` score to one of the five bands.

    Boundaries per contract Section 3.5:

    =======  ==================================
    Band     Range
    =======  ==================================
    unverified   ``0.00 <= s < 0.20``
    emerging     ``0.20 <= s < 0.40``
    established  ``0.40 <= s < 0.60``
    trusted      ``0.60 <= s < 0.85``
    elite        ``0.85 <= s <= 1.00``
    =======  ==================================
    """

    s = min(1.0, max(0.0, float(score)))
    # Walk from the top so ties at the threshold resolve upward:
    # score == 0.85 -> elite, score == 0.60 -> trusted.
    for threshold, band in _BAND_THRESHOLDS:
        if s >= threshold:
            return band
    # Unreachable but keeps mypy happy.
    return "unverified"


def derive_stability(review_count: int) -> TrustStability:
    """Return ``stable`` when review_count >= threshold, else ``provisional``."""

    return "stable" if review_count >= STABILITY_REVIEW_THRESHOLD else "provisional"


# ---------------------------------------------------------------------------
# Top-level orchestration
# ---------------------------------------------------------------------------


def compute_trust(
    *,
    category: str,
    inputs: CategoryInputs,
    weights: TrustScoreWeights = DEFAULT_WEIGHTS,
) -> TrustScoreBreakdown:
    """Return a full :class:`TrustScoreBreakdown` for one subject.

    Pure function (no I/O). The service layer wraps this with the
    asyncpg gather + persist loop.

    Algorithm
    ---------
    1. Dispatch to ``compute_category_base`` for the per-category
       weighted blend of primary + Bayesian + Wilson components.
    2. Add ``new_agent_boost`` when ``age_days < cutoff``.
    3. Add ``verified_boost`` when ``inputs.verified_flag``.
    4. Clamp final to ``[0, 1]``.
    5. Derive band + stability.
    """

    base: CategoryBase = compute_category_base(
        category=category,
        inputs=inputs,
        C=weights.C,
        m=weights.m,
    )

    boost_new = new_agent_boost(
        age_days=inputs.age_days,
        max_boost=weights.new_agent_max_boost,
        tau_days=weights.new_agent_tau_days,
        cutoff_days=weights.new_agent_cutoff_days,
    )
    boost_verified = weights.verified_boost_amount if inputs.verified_flag else 0.0

    # Premium listings ignore the boosts entirely: a hand-curated
    # Verified Certification is already at the top of the trust
    # ladder, stacking new-agent + verified would trivially push
    # every premium listing to 1.0 + overflow.
    if category == "premium":
        boost_new = 0.0
        boost_verified = 0.0

    raw = base.base + boost_new + boost_verified
    score = min(1.0, max(0.0, raw))

    band = derive_band(score)
    stability = derive_stability(inputs.review_count)

    inputs_summary: dict[str, float] = {
        "R": float(inputs.review_rating_mean_normalised),
        "v": float(inputs.review_count),
        "helpful_count": float(inputs.helpful_count),
        "flag_count": float(inputs.flag_count),
        "age_days": float(inputs.age_days),
        "execution_success_rate": float(inputs.execution_success_rate),
        "install_success_rate": float(inputs.install_success_rate),
        "completion_rate": float(inputs.completion_rate),
        "usage_count": float(inputs.usage_count),
        "download_count": float(inputs.download_count),
        "data_freshness_score": float(inputs.data_freshness_score),
        "verified_flag": 1.0 if inputs.verified_flag else 0.0,
        "admin_grant": 1.0 if inputs.admin_grant else 0.0,
    }
    boost_components: dict[str, float] = {
        "new_agent_boost": round(boost_new, 6),
        "verified_boost": round(boost_verified, 6),
    }
    components: dict[str, float] = {
        "primary": round(base.primary, 6),
        "bayesian": round(base.bayesian, 6),
        "wilson": round(base.wilson, 6),
        "weight_primary": base.weights.primary,
        "weight_review": base.weights.review,
        "weight_wilson": base.weights.wilson,
        "base_before_boost": round(base.base, 6),
        "raw_before_clamp": round(raw, 6),
    }

    return TrustScoreBreakdown(
        score=round(score, 4),
        band=band,
        stability=stability,
        category=category,
        formula_version=weights.formula_version,
        inputs_summary=inputs_summary,
        boost_components=boost_components,
        components=components,
    )


def breakdown_to_jsonable(breakdown: TrustScoreBreakdown) -> dict[str, Any]:
    """Shallow ``dataclasses.asdict`` alternative without the recursion cost.

    The dataclass is frozen so a shallow dict is safe to mutate
    downstream.
    """

    return {
        "score": breakdown.score,
        "band": breakdown.band,
        "stability": breakdown.stability,
        "category": breakdown.category,
        "formula_version": breakdown.formula_version,
        "inputs_summary": dict(breakdown.inputs_summary),
        "boost_components": dict(breakdown.boost_components),
        "components": dict(breakdown.components),
    }


__all__ = [
    "DEFAULT_WEIGHTS",
    "FORMULA_VERSION",
    "KNOWN_CATEGORIES",
    "STABILITY_REVIEW_THRESHOLD",
    "TrustBand",
    "TrustScoreBreakdown",
    "TrustScoreWeights",
    "TrustStability",
    "VERIFIED_BOOST_AMOUNT",
    "breakdown_to_jsonable",
    "compute_trust",
    "derive_band",
    "derive_stability",
]
