"""Per-category revenue split math (Iapetus W2 NP P4 S1).

Contract refs:
    - docs/contracts/marketplace_commerce.contract.md Section 3.2
      platform fee policy (default 20 percent, Verified 15 percent,
      Premium 25 percent, minimum fee USD 0.50 on transactions under
      USD 2.50).
    - docs/contracts/marketplace_listing.contract.md Section 3.1
      Category enum.

Design
------
- All math in BIGINT minor units (USD cents; never FLOAT). We follow
  Stripe's own convention: round-half-to-even on the platform fee and
  give the remainder to the creator so the two legs always sum to the
  gross. This matches the invariant the DB CHECK constraint enforces:
  ``platform_fee_cents + creator_net_cents = gross_amount_cents``.
- The default take rate is a Hemera flag (``marketplace.platform_fee_pct``)
  so a future operator flip (e.g., promotional 10 percent week) does
  not require a code deploy. When the flag is absent we fall back to
  the contract default of 20.
- Per-category override map: Premium = 25, Services = 15 (we keep the
  contract value as the floor, though Services listings lean on labor
  margin so the smaller platform cut is intentional).
- Per-listing override: ``marketplace_listing.revenue_split_override``
  stores the CREATOR share in the [0, 1] float range. If set we honour
  it (take rate = 1 - override). Tests cover the override precedence.
- Minimum fee floor: for gross < USD 2.50 the platform fee is 50 cents.
  A 250-cent purchase with 20 percent rate would otherwise yield 50
  cents anyway; the floor matters for cheaper listings where the
  percentage math would undershoot the processing cost.

Public helpers
--------------
- :func:`resolve_take_rate_percent`: resolve the percent applied to a
  purchase given category + verified flag + per-listing override +
  Hemera platform default.
- :func:`compute_split`: split a gross amount into (platform, creator)
  in cents. Sum invariant enforced. Minimum fee floor applied.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional
from uuid import UUID

from src.backend.flags.service import get_flag

logger = logging.getLogger(__name__)


# Hemera flag names. Values are numeric percent integers (20 = 20%).
PLATFORM_FEE_PCT_FLAG: str = "marketplace.platform_fee_pct"
VERIFIED_TAKE_RATE_FLAG: str = "commerce.verified_take_rate"


# Contract defaults (Section 3.2). Used when Hemera returns None.
DEFAULT_TAKE_RATE_PCT: int = 20
VERIFIED_TAKE_RATE_PCT: int = 15
PREMIUM_TAKE_RATE_PCT: int = 25
SERVICES_TAKE_RATE_PCT: int = 15

# Minimum platform fee floor in cents. Applied when the computed fee
# would be below this on purchases under USD 2.50.
MIN_FEE_CENTS: int = 50
MIN_FEE_GROSS_CEILING_CENTS: int = 250


# Per-category overrides. Kept in this module (not in the DB) because
# they are policy decisions that ship with code: a promotional rate
# would flip the Hemera flag globally rather than the table.
_CATEGORY_TAKE_RATE_PCT: dict[str, int] = {
    "premium": PREMIUM_TAKE_RATE_PCT,
    "services": SERVICES_TAKE_RATE_PCT,
    # core_agent / content / infrastructure / assets / data use the
    # resolved platform default.
}


@dataclass(frozen=True)
class SplitResult:
    """Two-leg split result.

    ``platform_fee_cents + creator_net_cents == gross_amount_cents``
    always holds; the DB CHECK constraint double-enforces it.
    ``take_rate_percent`` is the effective percent applied (after
    Hemera + category + override precedence) and is surfaced for
    logging + audit trail.
    """

    gross_amount_cents: int
    platform_fee_cents: int
    creator_net_cents: int
    take_rate_percent: int
    minimum_floor_applied: bool


async def resolve_take_rate_percent(
    *,
    category: str,
    user_id: Optional[UUID] = None,
    tenant_id: Optional[UUID] = None,
    verified_creator: bool = False,
    revenue_split_override: Optional[float] = None,
) -> int:
    """Resolve the effective platform take rate percent.

    Precedence (highest to lowest):

    1. ``revenue_split_override`` on the listing. Stored as the creator
       share in ``[0, 1]``; we return ``round((1 - share) * 100)``.
    2. Verified-creator flag lowers the floor to 15 percent regardless
       of category (rewards trusted creators).
    3. Category-specific override map (``premium`` = 25, ``services`` =
       15).
    4. Hemera flag ``marketplace.platform_fee_pct`` platform default.
    5. Contract fallback ``DEFAULT_TAKE_RATE_PCT`` (20).

    The returned integer is always in ``[0, 100]``.
    """

    # 1. Per-listing override takes precedence when set.
    if revenue_split_override is not None:
        share = max(0.0, min(1.0, float(revenue_split_override)))
        take_rate = round((1.0 - share) * 100.0)
        return max(0, min(100, int(take_rate)))

    # 2. Verified creators get the lower rate.
    if verified_creator:
        verified_pct = await _resolve_int_flag(
            VERIFIED_TAKE_RATE_FLAG,
            user_id=user_id,
            tenant_id=tenant_id,
            fallback=VERIFIED_TAKE_RATE_PCT,
        )
        return _clamp_pct(verified_pct)

    # 3. Category override.
    if category in _CATEGORY_TAKE_RATE_PCT:
        return _clamp_pct(_CATEGORY_TAKE_RATE_PCT[category])

    # 4 + 5. Hemera default with contract fallback.
    default_pct = await _resolve_int_flag(
        PLATFORM_FEE_PCT_FLAG,
        user_id=user_id,
        tenant_id=tenant_id,
        fallback=DEFAULT_TAKE_RATE_PCT,
    )
    return _clamp_pct(default_pct)


def compute_split(
    *,
    gross_amount_cents: int,
    take_rate_percent: int,
) -> SplitResult:
    """Split a gross amount into platform + creator cents.

    Parameters
    ----------
    gross_amount_cents
        Total buyer-paid amount in cents. Must be non-negative.
    take_rate_percent
        Platform share as an integer percent in ``[0, 100]``. Caller
        resolves via :func:`resolve_take_rate_percent`.

    Returns
    -------
    SplitResult
        Guarantees ``platform_fee_cents + creator_net_cents == gross``.

    Rounding strategy
    -----------------
    Integer truncation via ``(gross * pct) // 100`` for the platform
    fee. Remainder goes to the creator. This is Stripe's own split
    rounding behaviour (favours the destination of the larger share
    when the percent does not divide evenly) and keeps the invariant
    without a half-up tiebreak.

    Minimum floor
    -------------
    For small-ticket purchases where the percentage math undershoots
    the processing floor we bump the platform fee to
    :data:`MIN_FEE_CENTS`. Only applies when gross is under
    :data:`MIN_FEE_GROSS_CEILING_CENTS`. When bump would exceed gross
    itself (rare, gross below 50 cents) we clamp the platform fee to
    the whole gross and creator gets zero.
    """

    if gross_amount_cents < 0:
        raise ValueError(
            f"gross_amount_cents must be non-negative; got {gross_amount_cents}"
        )
    if not (0 <= take_rate_percent <= 100):
        raise ValueError(
            f"take_rate_percent must be in [0, 100]; got {take_rate_percent}"
        )

    platform_fee = (gross_amount_cents * take_rate_percent) // 100
    floor_applied = False

    # Minimum fee floor for cheap transactions.
    if (
        gross_amount_cents < MIN_FEE_GROSS_CEILING_CENTS
        and platform_fee < MIN_FEE_CENTS
        and gross_amount_cents > 0
    ):
        platform_fee = min(MIN_FEE_CENTS, gross_amount_cents)
        floor_applied = True

    creator_net = gross_amount_cents - platform_fee
    if creator_net < 0:
        # Defence: floor bump exceeded gross. Shouldn't happen given
        # the clamp above but assert the invariant anyway.
        raise ValueError(
            "split invariant broken: platform_fee > gross_amount after floor"
        )

    return SplitResult(
        gross_amount_cents=gross_amount_cents,
        platform_fee_cents=platform_fee,
        creator_net_cents=creator_net,
        take_rate_percent=take_rate_percent,
        minimum_floor_applied=floor_applied,
    )


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------


def _clamp_pct(value: int) -> int:
    """Clamp a percent to [0, 100]."""

    return max(0, min(100, int(value)))


async def _resolve_int_flag(
    flag_name: str,
    *,
    user_id: Optional[UUID],
    tenant_id: Optional[UUID],
    fallback: int,
) -> int:
    """Read a Hemera flag and coerce to int with a safe fallback.

    Fails open: any flag lookup exception (Redis down, flag service
    outage) yields the fallback so purchases still complete rather
    than 5xx the buyer. We log at WARN so operators see the fallback.
    """

    try:
        raw = await get_flag(
            flag_name, user_id=user_id, tenant_id=tenant_id
        )
    except Exception as exc:
        logger.warning(
            "commerce.revenue_split.flag_lookup_failed flag=%s err=%s fallback=%s",
            flag_name,
            exc,
            fallback,
        )
        return fallback

    if raw is None:
        return fallback
    try:
        return int(raw)
    except (TypeError, ValueError):
        logger.warning(
            "commerce.revenue_split.flag_invalid flag=%s raw=%r fallback=%s",
            flag_name,
            raw,
            fallback,
        )
        return fallback


__all__ = [
    "DEFAULT_TAKE_RATE_PCT",
    "MIN_FEE_CENTS",
    "MIN_FEE_GROSS_CEILING_CENTS",
    "PLATFORM_FEE_PCT_FLAG",
    "PREMIUM_TAKE_RATE_PCT",
    "SERVICES_TAKE_RATE_PCT",
    "SplitResult",
    "VERIFIED_TAKE_RATE_FLAG",
    "VERIFIED_TAKE_RATE_PCT",
    "compute_split",
    "resolve_take_rate_percent",
]
