"""Bayesian smoothed mean for trust-score primary sort signal.

Owner: Astraea (W2 Registry trust, NP P1 S1).

Formula (per ``docs/contracts/trust_score.contract.md`` Section 3.1)::

    bayesian = (v / (v + m)) * R + (m / (v + m)) * C

where

- ``v`` is the vote / review count.
- ``R`` is the observed mean rating normalised to ``[0.0, 1.0]``.
- ``m`` is the prior weight (default ``15``, single global tuning knob).
- ``C`` is the global baseline mean, default ``0.7`` (re-seeded nightly
  by the batch refresh; pure-math layer accepts it as an input).

Rationale
---------
The shrinkage keeps low-sample listings from rocketing to the top of
the sort order on a single 5-star review: with ``v = 0`` the score
collapses to ``C`` exactly, and it approaches ``R`` only as ``v``
grows large vs ``m``. This is the classic IMDb Top-250 trick.

Changing ``m`` is a strategic lock per the agent prompt: any tuning
must ferry via V4 rather than landing as a silent code edit. The
weights are surfaced as arguments so the caller (service layer) can
supply a formula-versioned bundle loaded from ``trust_formula_weights``.
"""

from __future__ import annotations

from typing import Iterable

# Contract-locked defaults. Mirrored into
# ``src/backend/trust/formula_weights.json`` when that ships; the
# constants here are the Python-level source of truth for unit tests
# that assert on the default behaviour.
DEFAULT_PRIOR_WEIGHT_M: int = 15
"""Bayesian prior weight. Contract Section 3.1 locks 15 as the default."""

DEFAULT_GLOBAL_BASELINE_C: float = 0.7
"""Global baseline mean on [0,1]. Rewritten nightly by refresh_batch."""

_MIN_PRIOR_WEIGHT: int = 1
"""Guard against ``m <= 0`` which would divide the prior away."""


def bayesian_smoothed_mean(
    *,
    R: float,
    v: int,
    C: float = DEFAULT_GLOBAL_BASELINE_C,
    m: int = DEFAULT_PRIOR_WEIGHT_M,
) -> float:
    """Return the Bayesian smoothed mean in ``[0.0, 1.0]``.

    Parameters
    ----------
    R
        Observed mean rating, normalised to ``[0, 1]``. Values outside
        the range are clamped (defensive; upstream validators should
        catch bogus inputs earlier).
    v
        Vote / review count. Negative values clamp to 0.
    C
        Global baseline mean. Same normalisation as ``R``.
    m
        Prior weight (shrinkage strength). Must be >= 1.

    Returns
    -------
    float
        Smoothed mean in ``[0, 1]``.

    Notes
    -----
    - ``v == 0`` returns ``C`` exactly (no evidence -> fall back to
      the population average).
    - ``v -> infty`` returns ``R`` (enough evidence to override the
      prior entirely).
    - ``v == m`` returns ``(R + C) / 2`` (equal-weight midpoint).
    """

    if m < _MIN_PRIOR_WEIGHT:
        raise ValueError(
            f"Bayesian prior weight m must be >= {_MIN_PRIOR_WEIGHT}, got {m}."
        )

    v = max(0, int(v))
    R_c = min(1.0, max(0.0, float(R)))
    C_c = min(1.0, max(0.0, float(C)))

    total = v + m
    return (v / total) * R_c + (m / total) * C_c


def normalise_rating_mean(
    ratings: Iterable[float],
    *,
    scale_max: float = 5.0,
) -> tuple[float, int]:
    """Return ``(R_normalised, vote_count)`` for a rating iterable.

    Maps an input list of per-review star ratings on ``[0, scale_max]``
    to the ``[0, 1]`` internal scale the Bayesian formula consumes.

    If the iterable is empty the function returns ``(0.0, 0)``; callers
    should pass the resulting 0 count into :func:`bayesian_smoothed_mean`
    and the formula will correctly fall back to ``C``.
    """

    if scale_max <= 0:
        raise ValueError(f"scale_max must be > 0, got {scale_max}")

    count = 0
    total = 0.0
    for r in ratings:
        clamped = min(scale_max, max(0.0, float(r)))
        total += clamped
        count += 1

    if count == 0:
        return (0.0, 0)
    return (total / (count * scale_max), count)


def normalise_scalar_rating(
    avg: float,
    *,
    scale_max: float = 5.0,
) -> float:
    """Scalar form of :func:`normalise_rating_mean`.

    Convenience for the common service-layer case where the caller
    already has an aggregated mean (e.g. ``marketplace_listing
    .trust_score_cached`` round-tripped, or an Iapetus review summary)
    rather than the raw per-review list. Clamps to ``[0, 1]``.
    """

    if scale_max <= 0:
        raise ValueError(f"scale_max must be > 0, got {scale_max}")
    if avg is None:
        return 0.0
    return min(1.0, max(0.0, float(avg) / scale_max))


__all__ = [
    "DEFAULT_GLOBAL_BASELINE_C",
    "DEFAULT_PRIOR_WEIGHT_M",
    "bayesian_smoothed_mean",
    "normalise_rating_mean",
    "normalise_scalar_rating",
]
