"""Wilson score lower bound for binary helpful/flag trust signals.

Owner: Astraea (W2 Registry trust, NP P1 S1).

Formula (per ``docs/contracts/trust_score.contract.md`` Section 3.1,
Wilson 1927)::

    p_hat = pos / n                     where n = pos + neg
    wilson_lb = (p_hat + z**2/(2n)
                 - z * sqrt(p_hat*(1 - p_hat)/n + z**2/(4*n*n)))
                / (1 + z**2/n)

at ``z = 1.96`` for a 95 percent confidence lower bound.

Why Wilson instead of a raw proportion
--------------------------------------
For small ``n`` the naive ``pos/n`` over-rewards a handful of helpful
votes. Wilson's lower bound is the smallest ``p`` that is consistent
with the observed counts under the binomial model at 95 percent
confidence. One helpful vote out of one total (p_hat = 1.0) maps to
``wilson_lb ~ 0.207`` (not 1.0); 100 out of 100 maps to ``~ 0.964``;
the function is monotonically non-decreasing in ``n`` for a fixed
``p_hat`` so "more evidence -> higher confidence" always holds.

Precision
---------
The contract calls out Wilson math precision edges at extreme counts
(``pos + neg`` near integer-overflow or near zero). We compute every
intermediate in ``float`` because Python ``float`` is IEEE-754 double
(15-17 significant digits) which is more than enough for
``n <= 10^15``. ``math.sqrt`` is correctly rounded; the formula above
does not hit a catastrophic cancellation path for non-negative
integer inputs. We keep the deliberately numeric rearrangement from
the contract's Section 3.1 reference implementation for bitwise
regression testing.
"""

from __future__ import annotations

import math

# 95 percent confidence lower bound. z = 1.96 is the contract-locked
# default; tests that hit the edge with z = 1.0 (68 percent band) are
# tolerated via the explicit argument so the function stays composable.
DEFAULT_Z_SCORE: float = 1.96
"""Standard-normal quantile for a 95 percent one-sided interval."""

# Precomputed constants that the contract's numeric-implementation
# reference exposes. z ** 2 = 3.8416 and z ** 2 / 2 = 1.9208 at z=1.96.
_Z_SQ_DEFAULT: float = DEFAULT_Z_SCORE * DEFAULT_Z_SCORE  # 3.8416


def wilson_lower_bound(
    *,
    positive: int,
    total: int,
    z: float = DEFAULT_Z_SCORE,
) -> float:
    """Return the Wilson 95%-CI lower bound of the positive rate.

    Parameters
    ----------
    positive
        Count of positive observations (helpful votes, passing runs).
    total
        Count of ALL observations (positive + negative).
    z
        One-sided confidence z-score. Defaults to ``1.96`` (95 percent).

    Returns
    -------
    float
        Lower bound in ``[0.0, 1.0]``.

        - Returns ``0.0`` when ``total == 0`` (no evidence).
        - Returns ``0.0`` when ``positive == 0`` and ``total > 0``
          (no positives -> no confidence in a positive rate).
        - Strictly less than the point estimate ``positive / total``
          for all finite ``total`` (the whole point of the interval).

    Raises
    ------
    ValueError
        If ``positive`` is negative, ``total`` is negative, or
        ``positive > total``. These are caller contract violations
        rather than recoverable edge cases.
    """

    if positive < 0:
        raise ValueError(f"positive must be >= 0, got {positive}")
    if total < 0:
        raise ValueError(f"total must be >= 0, got {total}")
    if positive > total:
        raise ValueError(
            f"positive ({positive}) must be <= total ({total})."
        )

    if total == 0:
        # Empty sample -> no claim of positive confidence.
        return 0.0

    n = float(total)
    p_hat = float(positive) / n
    z_sq = z * z

    # Rearranged form matches the contract Section 3.1 numeric reference.
    # Keeping the breakdown explicit so a future reader can map to the
    # standard textbook form line-for-line.
    centre = p_hat + z_sq / (2.0 * n)
    denominator = 1.0 + z_sq / n
    radicand = p_hat * (1.0 - p_hat) / n + z_sq / (4.0 * n * n)
    # Radicand is analytically >= 0; clamp against float noise at
    # extreme counts so sqrt never sees a micro-negative input.
    spread = z * math.sqrt(max(0.0, radicand))

    lb = (centre - spread) / denominator
    return max(0.0, min(1.0, lb))


def wilson_lower_bound_from_signals(
    *,
    helpful_count: int,
    flag_count: int,
    z: float = DEFAULT_Z_SCORE,
) -> float:
    """Alias for the contract 4.2 reference's helpful/flag call shape.

    The domain model calls "helpful" the positive signal and "flag"
    the negative signal. Kept as a named helper so the service layer
    reads with domain vocabulary rather than the generic pos/total
    pair.
    """

    return wilson_lower_bound(
        positive=helpful_count,
        total=helpful_count + flag_count,
        z=z,
    )


__all__ = [
    "DEFAULT_Z_SCORE",
    "wilson_lower_bound",
    "wilson_lower_bound_from_signals",
]
