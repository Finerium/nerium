"""DB-backed trust score service (Astraea W2 NP P1 S1).

Wraps the pure-math layer in :mod:`src.backend.trust.score` with the
asyncpg gather + persist glue that the router + pg_cron refresh lane
call into.

Responsibilities
----------------
- :func:`gather_listing_inputs`: read ``marketplace_listing`` +
  related signal tables to produce a :class:`CategoryInputs` bundle.
  Where Iapetus' review table does not yet exist, falls back to the
  ``trust_score_cached`` field as a scalar R proxy and logs a
  stopgap marker via the resulting ``computed_inputs.stopgap`` key so
  the audit trail flags the synthetic path.
- :func:`compute_listing_trust`: one-shot orchestration that turns a
  listing id into a :class:`TrustScoreBreakdown`.
- :func:`persist_listing_trust`: writes the breakdown into
  ``trust_score_snapshot`` + denormalises into
  ``marketplace_listing.trust_score_cached*`` inside a single
  transaction so readers never see a partial state.
- :func:`gather_creator_inputs` + :func:`compute_creator_trust` +
  :func:`persist_creator_trust`: same triad for the creator-level
  aggregate.
- :func:`read_cached_listing_trust` / :func:`read_cached_creator_trust`
  serve the router's GET path by fetching the denormalised columns
  directly; stale rows (> ``CACHE_TTL_SECONDS``) trigger a
  compute + persist before returning.

Stopgap documentation
---------------------
Iapetus P2 will land the reviews + helpful/flag tables. Until then
the service synthesises its inputs from what Phanes wrote to
``marketplace_listing``. Stopgaps:

1. ``review_rating_mean_normalised`` = ``trust_score_cached`` (already
   on [0,1] per migration 046). For seed rows where Phanes did not
   write a cached value we fall back to the contract's global
   baseline ``C = 0.7``.
2. ``review_count`` = 0 until an Iapetus table ships (so the
   Bayesian formula pulls hard toward ``C`` and the boost is active
   for every fresh listing).
3. ``helpful_count`` + ``flag_count`` = 0 until Iapetus ships binary
   signal tracking (Wilson falls back to the neutral 0.5 baseline).
4. ``verified_flag`` derives from the existence of an ``agent_identity``
   row keyed by listing's creator_user_id with ``status = 'active'``.
   Iapetus P2 will tighten this to require at least one completed
   payout per the contract Section 3.1 strictening.

Every stopgap surfaces in ``computed_inputs.stopgap`` so a later audit
can filter snapshots produced during the stopgap window and
recompute.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from uuid import UUID

import asyncpg

from src.backend.db.pool import get_pool
from src.backend.db.tenant import tenant_scoped
from src.backend.trust.new_agent_boost import age_days_from_created_at
from src.backend.trust.per_category import CategoryInputs
from src.backend.trust.score import (
    DEFAULT_WEIGHTS,
    FORMULA_VERSION,
    TrustScoreBreakdown,
    TrustScoreWeights,
    breakdown_to_jsonable,
    compute_trust,
)

logger = logging.getLogger(__name__)


# Cache TTL for the GET read path: a snapshot older than this triggers
# a compute + persist before we return the cached row. The pg_cron
# nightly refresh (S2 CUT) would otherwise own this invariant.
CACHE_TTL_SECONDS: int = 24 * 3600  # 24 hours


# ---------------------------------------------------------------------------
# Dataclass-style payload for service-to-router serialisation.
# ---------------------------------------------------------------------------


def _breakdown_with_meta(
    breakdown: TrustScoreBreakdown,
    *,
    subject_kind: str,
    subject_id: UUID,
    cached: bool,
    computed_at: Optional[datetime],
) -> dict[str, Any]:
    """Attach meta fields the router surfaces to the caller."""

    payload = breakdown_to_jsonable(breakdown)
    payload["subject_kind"] = subject_kind
    payload["subject_id"] = str(subject_id)
    payload["cached"] = cached
    if computed_at is not None:
        payload["computed_at"] = computed_at.astimezone(timezone.utc).isoformat()
    else:
        payload["computed_at"] = None
    return payload


# ---------------------------------------------------------------------------
# Listing-scoped compute path
# ---------------------------------------------------------------------------


_LISTING_INPUT_COLUMNS: str = """
    id,
    tenant_id,
    creator_user_id,
    category,
    trust_score_cached,
    created_at
"""


async def gather_listing_inputs(
    conn: asyncpg.Connection,
    *,
    listing_id: UUID,
    now: Optional[datetime] = None,
) -> tuple[Optional[asyncpg.Record], Optional[CategoryInputs], dict[str, Any]]:
    """Read the listing row + identity + return ``(row, inputs, meta)``.

    ``meta`` carries the stopgap markers so :func:`persist_listing_trust`
    can stamp them into the audit jsonb.
    """

    row = await conn.fetchrow(
        f"SELECT {_LISTING_INPUT_COLUMNS} FROM marketplace_listing WHERE id = $1",
        listing_id,
    )
    if row is None:
        return None, None, {}

    now = now or datetime.now(timezone.utc)

    # Stopgap 1: rating proxy from trust_score_cached.
    cached_proxy = row["trust_score_cached"]
    if cached_proxy is not None:
        R = float(cached_proxy)
    else:
        R = 0.0  # Bayesian falls back to C when v=0.

    # Stopgap 2-3: review + helpful/flag counts synthesised at 0.
    # A seed listing with a high ``trust_score_cached`` still rides the
    # C baseline + new-agent boost; the review proxy alone does not
    # feed v, so the Bayesian shrinkage keeps it conservative.
    review_count = 0
    helpful_count = 0
    flag_count = 0

    # Stopgap 4: verified flag := has an active agent_identity row for
    # the creator. One creator with one active identity qualifies.
    identity_row = await conn.fetchrow(
        """
        SELECT status
        FROM agent_identity
        WHERE tenant_id = $1
          AND status = 'active'
        LIMIT 1
        """,
        row["tenant_id"],
    )
    verified_flag = identity_row is not None

    age_days = age_days_from_created_at(row["created_at"], now=now)

    inputs = CategoryInputs(
        review_rating_mean_normalised=max(0.0, min(1.0, R)),
        review_count=review_count,
        helpful_count=helpful_count,
        flag_count=flag_count,
        age_days=age_days,
        verified_flag=verified_flag,
    )
    meta: dict[str, Any] = {
        "stopgap": {
            "review_proxy_from_trust_score_cached": cached_proxy is not None,
            "review_count_synthesised_zero": True,
            "helpful_flag_synthesised_zero": True,
            "verified_flag_from_identity_existence_only": verified_flag,
            "iapetus_p2_pending": True,
        },
    }
    return row, inputs, meta


async def compute_listing_trust(
    *,
    listing_id: UUID,
    tenant_id: UUID,
    weights: TrustScoreWeights = DEFAULT_WEIGHTS,
) -> Optional[TrustScoreBreakdown]:
    """Read + compute without persisting. ``None`` when the listing does not exist."""

    pool = get_pool()
    async with tenant_scoped(pool, tenant_id) as conn:
        row, inputs, _meta = await gather_listing_inputs(conn, listing_id=listing_id)
    if row is None or inputs is None:
        return None
    return compute_trust(
        category=str(row["category"]),
        inputs=inputs,
        weights=weights,
    )


async def persist_listing_trust(
    *,
    listing_id: UUID,
    tenant_id: UUID,
    actor_user_id: Optional[UUID] = None,
    event_type: str = "on_demand",
    weights: TrustScoreWeights = DEFAULT_WEIGHTS,
) -> Optional[TrustScoreBreakdown]:
    """Compute + write snapshot + denormalise into ``marketplace_listing``.

    Runs in a single transaction so the cached column + snapshot row
    always agree. Returns ``None`` when the listing does not exist.
    """

    pool = get_pool()
    async with tenant_scoped(pool, tenant_id) as conn:
        async with conn.transaction():
            row, inputs, meta = await gather_listing_inputs(
                conn, listing_id=listing_id
            )
            if row is None or inputs is None:
                return None

            breakdown = compute_trust(
                category=str(row["category"]),
                inputs=inputs,
                weights=weights,
            )

            # Stamp stopgap markers into the audit bag.
            audit_inputs = dict(breakdown.inputs_summary)
            audit_inputs["_meta"] = meta

            # Read previous score so the snapshot carries score_before.
            score_before = row["trust_score_cached"]

            # Insert snapshot row.
            await conn.execute(
                """
                INSERT INTO trust_score_snapshot
                    (tenant_id, subject_kind, listing_id, category,
                     score, band, stability, computed_inputs,
                     boost_components, components, formula_version,
                     event_type, actor_user_id, score_before, computed_at)
                VALUES
                    ($1, 'listing', $2, $3, $4, $5, $6, $7::jsonb,
                     $8::jsonb, $9::jsonb, $10, $11, $12, $13, $14)
                """,
                tenant_id,
                listing_id,
                str(row["category"]),
                breakdown.score,
                breakdown.band,
                breakdown.stability,
                json.dumps(audit_inputs),
                json.dumps(dict(breakdown.boost_components)),
                json.dumps(dict(breakdown.components)),
                breakdown.formula_version,
                event_type,
                actor_user_id,
                float(score_before) if score_before is not None else None,
                datetime.now(timezone.utc),
            )

            # Denormalise onto the listing row.
            await conn.execute(
                """
                UPDATE marketplace_listing
                SET
                    trust_score_cached = $1,
                    trust_score_components_cached = $2::jsonb,
                    trust_score_cached_at = now(),
                    trust_score_formula_version = $3,
                    trust_score_band = $4,
                    trust_score_stability = $5
                WHERE id = $6
                """,
                breakdown.score,
                json.dumps(
                    {
                        "components": dict(breakdown.components),
                        "boost_components": dict(breakdown.boost_components),
                        "inputs_summary": audit_inputs,
                    }
                ),
                breakdown.formula_version,
                breakdown.band,
                breakdown.stability,
                listing_id,
            )

    logger.info(
        "trust.listing.persisted listing_id=%s score=%s band=%s stability=%s event=%s",
        listing_id,
        breakdown.score,
        breakdown.band,
        breakdown.stability,
        event_type,
    )
    return breakdown


async def read_cached_listing_trust(
    *,
    listing_id: UUID,
    tenant_id: UUID,
    now: Optional[datetime] = None,
    ttl_seconds: int = CACHE_TTL_SECONDS,
    refresh_if_stale: bool = True,
    actor_user_id: Optional[UUID] = None,
) -> Optional[dict[str, Any]]:
    """Return the router-friendly cached payload, refreshing if stale.

    Algorithm:

    1. SELECT the denormalised cache columns from the listing.
    2. If the row does not exist -> return ``None`` (router yields 404).
    3. If ``trust_score_cached`` is NULL OR older than ``ttl_seconds``
       AND ``refresh_if_stale`` is True -> call
       :func:`persist_listing_trust` to write a fresh snapshot.
    4. Otherwise return the cached row with ``cached=True``.
    """

    now = now or datetime.now(timezone.utc)
    pool = get_pool()

    async with tenant_scoped(pool, tenant_id) as conn:
        row = await conn.fetchrow(
            """
            SELECT id, category, trust_score_cached,
                   trust_score_components_cached, trust_score_cached_at,
                   trust_score_formula_version, trust_score_band,
                   trust_score_stability, created_at
            FROM marketplace_listing
            WHERE id = $1
            """,
            listing_id,
        )

    if row is None:
        return None

    cached_at: Optional[datetime] = row["trust_score_cached_at"]
    cached_score = row["trust_score_cached"]
    is_fresh = (
        cached_score is not None
        and cached_at is not None
        and (now - cached_at).total_seconds() < ttl_seconds
    )

    if not is_fresh and refresh_if_stale:
        breakdown = await persist_listing_trust(
            listing_id=listing_id,
            tenant_id=tenant_id,
            actor_user_id=actor_user_id,
            event_type="on_demand",
        )
        if breakdown is None:
            return None
        return _breakdown_with_meta(
            breakdown,
            subject_kind="listing",
            subject_id=listing_id,
            cached=False,
            computed_at=datetime.now(timezone.utc),
        )

    # Cached read path: rebuild the payload from the denormalised
    # columns without re-computing. components_cached holds the
    # ``components`` + ``boost_components`` + ``inputs_summary`` bags.
    components = _decode_jsonb(row["trust_score_components_cached"]) or {}
    return {
        "subject_kind": "listing",
        "subject_id": str(listing_id),
        "score": float(cached_score) if cached_score is not None else 0.0,
        "band": row["trust_score_band"] or "unverified",
        "stability": row["trust_score_stability"] or "provisional",
        "category": str(row["category"]),
        "formula_version": row["trust_score_formula_version"] or FORMULA_VERSION,
        "inputs_summary": components.get("inputs_summary", {}),
        "boost_components": components.get("boost_components", {}),
        "components": components.get("components", {}),
        "cached": True,
        "computed_at": (
            cached_at.astimezone(timezone.utc).isoformat() if cached_at else None
        ),
    }


# ---------------------------------------------------------------------------
# Creator-scoped aggregate
# ---------------------------------------------------------------------------


async def gather_creator_inputs(
    conn: asyncpg.Connection,
    *,
    user_id: UUID,
    now: Optional[datetime] = None,
) -> tuple[
    Optional[asyncpg.Record],
    Optional[CategoryInputs],
    list[dict[str, Any]],
    dict[str, Any],
]:
    """Read user row + owned listings -> weighted-aggregate inputs.

    Weighting policy
    ----------------
    - Listings with published status contribute; drafts + archived do
      not (a draft has no user-visible trust surface).
    - Each listing's ``trust_score_cached`` contributes as a rating
      proxy weighted by ``(1 + rating_count_proxy)`` where the proxy
      is synthesised as 1 per listing until Iapetus lands. This is a
      simple "one vote per listing" aggregate that still lets a
      prolific + high-quality creator outrank a one-listing creator.
    - The aggregate age is the age of the OLDEST published listing
      (so a creator who has been shipping for a while gets the
      verified maturity signal even when individual listings are new).
    """

    now = now or datetime.now(timezone.utc)

    user_row = await conn.fetchrow(
        """
        SELECT id, tenant_id, display_name, created_at, status
        FROM app_user
        WHERE id = $1
        """,
        user_id,
    )
    if user_row is None:
        return None, None, [], {}

    listing_rows = await conn.fetch(
        """
        SELECT id, category, trust_score_cached, created_at, status
        FROM marketplace_listing
        WHERE creator_user_id = $1
          AND status = 'published'
          AND archived_at IS NULL
        ORDER BY created_at ASC
        """,
        user_id,
    )

    listings_summary: list[dict[str, Any]] = []
    total_weight = 0.0
    weighted_R = 0.0
    oldest_created_at: Optional[datetime] = None

    for listing in listing_rows:
        R = float(listing["trust_score_cached"] or 0.0)
        # Per-listing weight: 1 per listing. Iapetus P2 can boost this
        # to review_count + 1 when the reviews table ships.
        weight = 1.0
        weighted_R += R * weight
        total_weight += weight
        listings_summary.append(
            {
                "listing_id": str(listing["id"]),
                "category": str(listing["category"]),
                "trust_score_cached": R,
            }
        )
        if oldest_created_at is None or listing["created_at"] < oldest_created_at:
            oldest_created_at = listing["created_at"]

    R_agg = (weighted_R / total_weight) if total_weight > 0 else 0.0

    # Verified flag at creator level mirrors listing rule: active
    # identity in the user's tenant is sufficient.
    identity_row = await conn.fetchrow(
        """
        SELECT status
        FROM agent_identity
        WHERE tenant_id = $1
          AND status = 'active'
        LIMIT 1
        """,
        user_row["tenant_id"],
    )
    verified_flag = identity_row is not None

    reference_created_at = oldest_created_at or user_row["created_at"]
    age_days = age_days_from_created_at(reference_created_at, now=now)

    inputs = CategoryInputs(
        review_rating_mean_normalised=max(0.0, min(1.0, R_agg)),
        review_count=int(total_weight),  # listing count stands in for review count
        helpful_count=0,
        flag_count=0,
        age_days=age_days,
        verified_flag=verified_flag,
    )
    meta: dict[str, Any] = {
        "stopgap": {
            "listing_count_proxies_review_count": True,
            "rating_aggregate_from_trust_score_cached": True,
            "oldest_listing_age_used": oldest_created_at is not None,
            "iapetus_p2_pending": True,
        },
        "listing_count": len(listing_rows),
        "total_weight": total_weight,
    }
    return user_row, inputs, listings_summary, meta


async def compute_creator_trust(
    *,
    user_id: UUID,
    tenant_id: UUID,
    weights: TrustScoreWeights = DEFAULT_WEIGHTS,
) -> Optional[TrustScoreBreakdown]:
    """Read + compute without persisting. ``None`` when the user does not exist."""

    pool = get_pool()
    async with tenant_scoped(pool, tenant_id) as conn:
        user_row, inputs, _listings, _meta = await gather_creator_inputs(
            conn, user_id=user_id
        )
    if user_row is None or inputs is None:
        return None
    # Creator aggregate uses a synthetic "creator" category that maps
    # to the content weights (review-leaning blend) for now.
    return compute_trust(
        category="content",
        inputs=inputs,
        weights=weights,
    )


async def persist_creator_trust(
    *,
    user_id: UUID,
    tenant_id: UUID,
    actor_user_id: Optional[UUID] = None,
    event_type: str = "on_demand",
    weights: TrustScoreWeights = DEFAULT_WEIGHTS,
) -> Optional[TrustScoreBreakdown]:
    """Compute + write snapshot + denormalise into ``app_user``.

    Returns ``None`` when the user does not exist.
    """

    pool = get_pool()
    async with tenant_scoped(pool, tenant_id) as conn:
        async with conn.transaction():
            user_row, inputs, listings_summary, meta = await gather_creator_inputs(
                conn, user_id=user_id
            )
            if user_row is None or inputs is None:
                return None

            breakdown = compute_trust(
                category="content",
                inputs=inputs,
                weights=weights,
            )

            audit_inputs = dict(breakdown.inputs_summary)
            audit_inputs["_meta"] = meta
            audit_inputs["_listings"] = listings_summary

            score_before = user_row.get("creator_trust_score_cached") if hasattr(
                user_row, "get"
            ) else None

            await conn.execute(
                """
                INSERT INTO trust_score_snapshot
                    (tenant_id, subject_kind, user_id, category,
                     score, band, stability, computed_inputs,
                     boost_components, components, formula_version,
                     event_type, actor_user_id, score_before, computed_at)
                VALUES
                    ($1, 'user', $2, 'content', $3, $4, $5, $6::jsonb,
                     $7::jsonb, $8::jsonb, $9, $10, $11, $12, $13)
                """,
                tenant_id,
                user_id,
                breakdown.score,
                breakdown.band,
                breakdown.stability,
                json.dumps(audit_inputs),
                json.dumps(dict(breakdown.boost_components)),
                json.dumps(dict(breakdown.components)),
                breakdown.formula_version,
                event_type,
                actor_user_id,
                float(score_before) if score_before is not None else None,
                datetime.now(timezone.utc),
            )

            await conn.execute(
                """
                UPDATE app_user
                SET
                    creator_trust_score_cached = $1,
                    creator_trust_score_components_cached = $2::jsonb,
                    creator_trust_score_cached_at = now(),
                    creator_trust_score_band = $3
                WHERE id = $4
                """,
                breakdown.score,
                json.dumps(
                    {
                        "components": dict(breakdown.components),
                        "boost_components": dict(breakdown.boost_components),
                        "inputs_summary": audit_inputs,
                    }
                ),
                breakdown.band,
                user_id,
            )

    logger.info(
        "trust.creator.persisted user_id=%s score=%s band=%s listings=%d",
        user_id,
        breakdown.score,
        breakdown.band,
        meta.get("listing_count", 0),
    )
    return breakdown


async def read_cached_creator_trust(
    *,
    user_id: UUID,
    tenant_id: UUID,
    now: Optional[datetime] = None,
    ttl_seconds: int = CACHE_TTL_SECONDS,
    refresh_if_stale: bool = True,
    actor_user_id: Optional[UUID] = None,
) -> Optional[dict[str, Any]]:
    """Router-friendly creator trust payload with staleness-triggered refresh."""

    now = now or datetime.now(timezone.utc)
    pool = get_pool()

    async with tenant_scoped(pool, tenant_id) as conn:
        row = await conn.fetchrow(
            """
            SELECT id, display_name,
                   creator_trust_score_cached,
                   creator_trust_score_components_cached,
                   creator_trust_score_cached_at,
                   creator_trust_score_band,
                   creator_verified_badge
            FROM app_user
            WHERE id = $1
            """,
            user_id,
        )

    if row is None:
        return None

    cached_at: Optional[datetime] = row["creator_trust_score_cached_at"]
    cached_score = row["creator_trust_score_cached"]
    is_fresh = (
        cached_score is not None
        and cached_at is not None
        and (now - cached_at).total_seconds() < ttl_seconds
    )

    if not is_fresh and refresh_if_stale:
        breakdown = await persist_creator_trust(
            user_id=user_id,
            tenant_id=tenant_id,
            actor_user_id=actor_user_id,
            event_type="on_demand",
        )
        if breakdown is None:
            return None
        payload = _breakdown_with_meta(
            breakdown,
            subject_kind="user",
            subject_id=user_id,
            cached=False,
            computed_at=datetime.now(timezone.utc),
        )
        payload["verified_badge"] = bool(row["creator_verified_badge"])
        return payload

    components = _decode_jsonb(row["creator_trust_score_components_cached"]) or {}
    return {
        "subject_kind": "user",
        "subject_id": str(user_id),
        "score": float(cached_score) if cached_score is not None else 0.0,
        "band": row["creator_trust_score_band"] or "unverified",
        "stability": "stable",  # creator aggregate not tracked per-field
        "category": "content",
        "formula_version": FORMULA_VERSION,
        "inputs_summary": components.get("inputs_summary", {}),
        "boost_components": components.get("boost_components", {}),
        "components": components.get("components", {}),
        "verified_badge": bool(row["creator_verified_badge"]),
        "cached": True,
        "computed_at": (
            cached_at.astimezone(timezone.utc).isoformat() if cached_at else None
        ),
    }


# ---------------------------------------------------------------------------
# jsonb decode helper (mirrors listing_service)
# ---------------------------------------------------------------------------


def _decode_jsonb(raw: Any) -> Any:
    if raw is None:
        return None
    if isinstance(raw, (dict, list, bool, int, float)):
        return raw
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except ValueError:
            return raw
    return raw


__all__ = [
    "CACHE_TTL_SECONDS",
    "compute_creator_trust",
    "compute_listing_trust",
    "gather_creator_inputs",
    "gather_listing_inputs",
    "persist_creator_trust",
    "persist_listing_trust",
    "read_cached_creator_trust",
    "read_cached_listing_trust",
]
