"""Marketplace listing service layer.

Owner: Phanes (W2 NP P1 Session 1). Sits between the router handlers
and the asyncpg query helpers. Responsibilities:

- Slug derivation + uniqueness check.
- Hemera flag gating (``marketplace.live`` for every write,
  ``marketplace.premium_issuance`` for Premium category creates).
- Publish-time validation pipeline + version history snapshot.
- Row-to-wire conversion (asyncpg Record -> Pydantic projection).

Contract refs
-------------
- ``docs/contracts/marketplace_listing.contract.md`` Sections 4.1, 4.2,
  4.3 (CRUD + Premium gate + publish validation).
- ``docs/contracts/feature_flag.contract.md`` ``get_flag`` consumer
  pattern mirroring :mod:`src.backend.ma.whitelist_gate`.

Design notes
------------
- All async public helpers accept ``tenant_id`` + ``user_id`` as UUIDs
  to match the router's ``AuthPrincipal.user_id``/``tenant_id`` string
  -> UUID conversion done at the handler boundary.
- The service owns NO HTTP concerns: it raises ``ProblemException``
  subclasses which the global handler converts to problem+json.
"""

from __future__ import annotations

import json
import logging
import re
import unicodedata
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

import asyncpg

from src.backend.db.pool import get_pool
from src.backend.db.tenant import tenant_scoped
from src.backend.errors import (
    ConflictProblem,
    ForbiddenProblem,
    NotFoundProblem,
    ServiceUnavailableProblem,
    ValidationProblem,
)
from src.backend.flags.service import get_flag
from src.backend.marketplace import queries
from src.backend.marketplace.events import emit_listing_submitted
from src.backend.marketplace.validator import (
    ValidationIssue,
    validate_category_metadata,
    validate_for_publish,
    validate_pricing_details,
    validate_subtype_for_category,
)
from src.backend.models.marketplace_listing import (
    Category,
    License,
    ListingCreate,
    ListingDetail,
    ListingPublic,
    ListingUpdate,
    MarketplaceListing,
    PricingModel,
    Subtype,
)
from src.backend.utils.uuid7 import uuid7

logger = logging.getLogger(__name__)


# Feature flag names consumed here. Kept as module constants so tests
# can monkeypatch at a single import site.
MARKETPLACE_LIVE_FLAG: str = "marketplace.live"
MARKETPLACE_PREMIUM_FLAG: str = "marketplace.premium_issuance"

# History retention cap per contract Open Question 1.
MAX_VERSION_HISTORY: int = 20


# ---------------------------------------------------------------------------
# Hemera gates
# ---------------------------------------------------------------------------


async def enforce_marketplace_live(
    *,
    user_id: UUID,
    tenant_id: UUID,
) -> None:
    """Require ``marketplace.live == True`` for write endpoints.

    Fails closed on any Hemera outage (deny by default for kill-switch
    flags). Pattern mirrors :func:`src.backend.ma.whitelist_gate.enforce_whitelist_gate`.
    """

    try:
        value = await get_flag(
            MARKETPLACE_LIVE_FLAG, user_id=user_id, tenant_id=tenant_id
        )
    except Exception:
        logger.exception(
            "marketplace.live.gate_eval_failed user=%s tenant=%s",
            user_id,
            tenant_id,
        )
        raise ServiceUnavailableProblem(
            detail=(
                "Marketplace write gate could not be evaluated; the feature "
                "flag service is temporarily unavailable."
            ),
            slug="service_unavailable",
        )

    if value is True:
        return

    logger.info(
        "marketplace.live.blocked user=%s tenant=%s value=%r",
        user_id,
        tenant_id,
        value,
    )
    raise ForbiddenProblem(
        detail=(
            "Marketplace write endpoints are currently disabled for this "
            "account. Contact an administrator to request access."
        ),
        slug="forbidden",
    )


async def enforce_premium_issuance(
    *,
    user_id: UUID,
    tenant_id: UUID,
) -> None:
    """Extra gate for Premium category creates/updates per contract 4.2."""

    try:
        value = await get_flag(
            MARKETPLACE_PREMIUM_FLAG, user_id=user_id, tenant_id=tenant_id
        )
    except Exception:
        logger.exception(
            "marketplace.premium.gate_eval_failed user=%s tenant=%s",
            user_id,
            tenant_id,
        )
        raise ServiceUnavailableProblem(
            detail=(
                "Premium category gate could not be evaluated; the feature "
                "flag service is temporarily unavailable."
            ),
            slug="service_unavailable",
        )
    if value is True:
        return
    raise ForbiddenProblem(
        detail=(
            "Premium-category listings are not yet available. Verified "
            "certification issuance workflow is pending per contract open "
            "question 5."
        ),
        slug="forbidden",
    )


# ---------------------------------------------------------------------------
# Slug derivation
# ---------------------------------------------------------------------------


_SLUG_STRIP_RE = re.compile(r"[^a-z0-9]+")
_SLUG_COLLAPSE_RE = re.compile(r"-+")


def derive_slug(title: str, *, max_len: int = 60) -> str:
    """Produce a kebab-case slug from a free-form title.

    Normalises unicode to ASCII where possible, lowercases, collapses
    non-alnum runs into single hyphens, and trims to ``max_len``.

    Guaranteed to match the CHECK constraint
    ``^[a-z0-9]+(-[a-z0-9]+)*$`` so the INSERT never fails on shape.
    """

    folded = unicodedata.normalize("NFKD", title).encode("ascii", "ignore").decode()
    lowered = folded.lower()
    dashed = _SLUG_STRIP_RE.sub("-", lowered)
    collapsed = _SLUG_COLLAPSE_RE.sub("-", dashed).strip("-")
    truncated = collapsed[:max_len].rstrip("-")
    return truncated or "listing"


async def _ensure_unique_slug(
    conn: asyncpg.Connection,
    *,
    candidate: str,
) -> str:
    """Return ``candidate`` unchanged if unused, else append a numeric suffix.

    Walks -2, -3, ... until an unused slug lands. Cap at 99 to avoid
    unbounded scanning; hitting the cap raises ConflictProblem.
    """

    base = candidate
    for suffix in range(1, 100):
        trial = base if suffix == 1 else f"{base[:56]}-{suffix}"[:60]
        row = await queries.select_listing_by_slug(conn, slug=trial)
        if row is None:
            return trial
    raise ConflictProblem(
        detail=(
            f"Slug '{candidate}' and all 99 numeric variants are taken. "
            "Pick a more distinctive title."
        ),
        slug="conflict",
    )


# ---------------------------------------------------------------------------
# Row -> wire projections
# ---------------------------------------------------------------------------


def _decode_jsonb(raw: Any) -> Any:
    """Decode asyncpg jsonb payload. Mirrors flags.service._decode."""

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


def row_to_detail(row: asyncpg.Record) -> ListingDetail:
    """Convert an asyncpg row to the detail wire projection."""

    return ListingDetail(
        id=row["id"],
        tenant_id=row["tenant_id"],
        creator_user_id=row["creator_user_id"],
        category=Category(row["category"]),
        subtype=Subtype(row["subtype"]),
        slug=row["slug"],
        title=row["title"],
        short_description=row["short_description"],
        long_description=row["long_description"],
        capability_tags=list(row["capability_tags"] or []),
        license=License(row["license"]),
        pricing_model=PricingModel(row["pricing_model"]),
        pricing_details=_decode_jsonb(row["pricing_details"]) or {},
        category_metadata=_decode_jsonb(row["category_metadata"]) or {},
        asset_refs=list(row["asset_refs"] or []),
        thumbnail_r2_key=row["thumbnail_r2_key"],
        trust_score_cached=(
            float(row["trust_score_cached"])
            if row["trust_score_cached"] is not None
            else None
        ),
        revenue_split_override=(
            float(row["revenue_split_override"])
            if row["revenue_split_override"] is not None
            else None
        ),
        status=row["status"],
        version=row["version"],
        version_history=_decode_jsonb(row["version_history"]) or [],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        published_at=row["published_at"],
        archived_at=row["archived_at"],
    )


def row_to_public(row: asyncpg.Record) -> ListingPublic:
    """Convert an asyncpg row to the public card projection."""

    return ListingPublic(
        id=row["id"],
        creator_user_id=row["creator_user_id"],
        category=Category(row["category"]),
        subtype=Subtype(row["subtype"]),
        slug=row["slug"],
        title=row["title"],
        short_description=row["short_description"],
        capability_tags=list(row["capability_tags"] or []),
        license=License(row["license"]),
        pricing_model=PricingModel(row["pricing_model"]),
        pricing_details=_decode_jsonb(row["pricing_details"]) or {},
        thumbnail_r2_key=row["thumbnail_r2_key"],
        trust_score_cached=(
            float(row["trust_score_cached"])
            if row["trust_score_cached"] is not None
            else None
        ),
        status=row["status"],
        version=row["version"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        published_at=row["published_at"],
    )


def row_to_model(row: asyncpg.Record) -> MarketplaceListing:
    """Convert an asyncpg row to the full projection (internal use).

    Exposed so Hyperion's embedding ingestor + Astraea's trust-scorer
    can round-trip through the typed shape without re-authoring the
    column mapping.
    """

    return MarketplaceListing(
        id=row["id"],
        tenant_id=row["tenant_id"],
        creator_user_id=row["creator_user_id"],
        category=Category(row["category"]),
        subtype=Subtype(row["subtype"]),
        slug=row["slug"],
        title=row["title"],
        description=row["description"],
        short_description=row["short_description"],
        long_description=row["long_description"],
        capability_tags=list(row["capability_tags"] or []),
        license=License(row["license"]),
        pricing=_decode_jsonb(row["pricing"]) or {},
        pricing_model=PricingModel(row["pricing_model"]),
        pricing_details=_decode_jsonb(row["pricing_details"]) or {},
        category_metadata=_decode_jsonb(row["category_metadata"]) or {},
        asset_refs=list(row["asset_refs"] or []),
        thumbnail_r2_key=row["thumbnail_r2_key"],
        trust_score_cached=(
            float(row["trust_score_cached"])
            if row["trust_score_cached"] is not None
            else None
        ),
        revenue_split_override=(
            float(row["revenue_split_override"])
            if row["revenue_split_override"] is not None
            else None
        ),
        status=row["status"],
        version=row["version"],
        version_history=_decode_jsonb(row["version_history"]) or [],
        metadata=_decode_jsonb(row["metadata"]) or {},
        published_at=row["published_at"],
        archived_at=row["archived_at"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


# ---------------------------------------------------------------------------
# CRUD orchestration
# ---------------------------------------------------------------------------


async def create_listing(
    *,
    body: ListingCreate,
    tenant_id: UUID,
    user_id: UUID,
) -> ListingDetail:
    """Run the Hemera gate, derive a unique slug, insert the draft row."""

    await enforce_marketplace_live(user_id=user_id, tenant_id=tenant_id)
    if body.category == Category.PREMIUM:
        await enforce_premium_issuance(user_id=user_id, tenant_id=tenant_id)

    # Structural validation at body-parse time catches subtype + category
    # pair mismatches via ListingCreate's @model_validator. Metadata sub-
    # schema is checked here so invalid shapes fail at create (not only
    # at publish) for a nicer submission-wizard UX.
    subtype_issues = validate_subtype_for_category(
        category=body.category, subtype=body.subtype
    )
    if subtype_issues:
        _raise_validation(subtype_issues)

    meta_issues = validate_category_metadata(
        category=body.category, category_metadata=body.category_metadata
    )
    if meta_issues:
        _raise_validation(meta_issues)

    pricing_issues = validate_pricing_details(
        pricing_model=body.pricing_model, pricing_details=body.pricing_details
    )
    if pricing_issues:
        _raise_validation(pricing_issues)

    slug_candidate = body.slug or derive_slug(body.title)

    listing_id = uuid7()
    pool = get_pool()
    async with tenant_scoped(pool, tenant_id) as conn:
        async with conn.transaction():
            slug = await _ensure_unique_slug(conn, candidate=slug_candidate)
            row = await queries.insert_listing(
                conn,
                listing_id=listing_id,
                tenant_id=tenant_id,
                creator_user_id=user_id,
                category=body.category.value,
                subtype=body.subtype.value,
                slug=slug,
                title=body.title,
                short_description=body.short_description,
                long_description=body.long_description,
                capability_tags=body.capability_tags,
                license_value=body.license.value,
                pricing_model=body.pricing_model.value,
                pricing_details=body.pricing_details,
                category_metadata=body.category_metadata,
                asset_refs=body.asset_refs,
                thumbnail_r2_key=body.thumbnail_r2_key,
                version=body.version,
            )

    logger.info(
        "marketplace.listing.created id=%s tenant=%s creator=%s category=%s subtype=%s",
        row["id"],
        row["tenant_id"],
        row["creator_user_id"],
        row["category"],
        row["subtype"],
    )
    return row_to_detail(row)


async def get_listing(
    *,
    listing_id: UUID,
    tenant_id: UUID,
) -> ListingDetail:
    """Fetch a listing by id. Raises :class:`NotFoundProblem` on miss."""

    pool = get_pool()
    async with tenant_scoped(pool, tenant_id) as conn:
        row = await queries.select_listing_by_id(conn, listing_id=listing_id)
    if row is None:
        raise NotFoundProblem(detail="marketplace listing not found")
    return row_to_detail(row)


async def list_listings(
    *,
    tenant_id: UUID,
    category: Optional[Category] = None,
    subtype: Optional[Subtype] = None,
    status: Optional[str] = "published",
    creator_user_id: Optional[UUID] = None,
    sort: str = "recent",
    cursor_ts: Optional[datetime] = None,
    cursor_id: Optional[UUID] = None,
    limit: int = 25,
) -> tuple[list[ListingPublic], bool, Optional[asyncpg.Record]]:
    """Return (items, has_more, last_row) for cursor pagination.

    The caller builds the next cursor from ``last_row`` (the final row
    of the current page) and encodes it via
    :func:`src.backend.pagination.cursor.encode_cursor`.
    """

    pool = get_pool()
    async with tenant_scoped(pool, tenant_id) as conn:
        rows = await queries.list_listings(
            conn,
            category=category.value if category else None,
            subtype=subtype.value if subtype else None,
            status=status,
            creator_user_id=creator_user_id,
            sort=sort,
            cursor_ts=cursor_ts,
            cursor_id=cursor_id,
            limit=limit,
        )

    has_more = len(rows) > limit
    page_rows = rows[:limit]
    items = [row_to_public(r) for r in page_rows]
    last = page_rows[-1] if page_rows and has_more else None
    return items, has_more, last


async def update_listing(
    *,
    listing_id: UUID,
    body: ListingUpdate,
    tenant_id: UUID,
    user_id: UUID,
) -> ListingDetail:
    """Apply a PATCH to a listing. Owner-only. Runs the Hemera gate."""

    await enforce_marketplace_live(user_id=user_id, tenant_id=tenant_id)

    pool = get_pool()
    async with tenant_scoped(pool, tenant_id) as conn:
        async with conn.transaction():
            row = await queries.select_listing_by_id(conn, listing_id=listing_id)
            if row is None:
                raise NotFoundProblem(detail="marketplace listing not found")
            if row["creator_user_id"] != user_id:
                raise ForbiddenProblem(
                    detail="only the listing owner may update this row",
                    slug="forbidden",
                )

            current_category = Category(row["category"])
            new_category_metadata: Optional[dict[str, Any]] = body.category_metadata
            new_pricing_model = body.pricing_model or PricingModel(row["pricing_model"])
            new_pricing_details: Optional[dict[str, Any]] = body.pricing_details

            # Premium re-gate if the body touches pricing or metadata on
            # a Premium-category listing. Keeps the post-update state
            # consistent with 4.2.
            if current_category == Category.PREMIUM and (
                new_category_metadata is not None
                or new_pricing_details is not None
            ):
                await enforce_premium_issuance(user_id=user_id, tenant_id=tenant_id)

            if new_category_metadata is not None:
                issues = validate_category_metadata(
                    category=current_category,
                    category_metadata=new_category_metadata,
                )
                if issues:
                    _raise_validation(issues)

            if body.pricing_details is not None or body.pricing_model is not None:
                issues = validate_pricing_details(
                    pricing_model=new_pricing_model,
                    pricing_details=(
                        new_pricing_details
                        if new_pricing_details is not None
                        else _decode_jsonb(row["pricing_details"]) or {}
                    ),
                )
                if issues:
                    _raise_validation(issues)

            fields = body.model_dump(exclude_unset=True)
            # License + pricing_model come in as enums; serialise to string.
            if "license" in fields and fields["license"] is not None:
                fields["license"] = (
                    fields["license"].value
                    if isinstance(fields["license"], License)
                    else fields["license"]
                )
            if "pricing_model" in fields and fields["pricing_model"] is not None:
                fields["pricing_model"] = (
                    fields["pricing_model"].value
                    if isinstance(fields["pricing_model"], PricingModel)
                    else fields["pricing_model"]
                )

            row = await queries.update_listing_fields(
                conn, listing_id=listing_id, fields=fields
            )
            assert row is not None
    return row_to_detail(row)


async def publish_listing(
    *,
    listing_id: UUID,
    tenant_id: UUID,
    user_id: UUID,
) -> ListingDetail:
    """Flip a draft to published after running the full validation pipeline.

    On publish we also snapshot the current row into ``version_history``
    so the previous shape is auditable. History is capped at
    :data:`MAX_VERSION_HISTORY` entries.
    """

    await enforce_marketplace_live(user_id=user_id, tenant_id=tenant_id)

    pool = get_pool()
    async with tenant_scoped(pool, tenant_id) as conn:
        async with conn.transaction():
            row = await queries.select_listing_by_id(conn, listing_id=listing_id)
            if row is None:
                raise NotFoundProblem(detail="marketplace listing not found")
            if row["creator_user_id"] != user_id:
                raise ForbiddenProblem(
                    detail="only the listing owner may publish this row",
                    slug="forbidden",
                )

            category = Category(row["category"])
            subtype = Subtype(row["subtype"])
            pricing_model = PricingModel(row["pricing_model"])

            if category == Category.PREMIUM:
                await enforce_premium_issuance(user_id=user_id, tenant_id=tenant_id)

            issues = validate_for_publish(
                category=category,
                subtype=subtype,
                pricing_model=pricing_model,
                pricing_details=_decode_jsonb(row["pricing_details"]) or {},
                category_metadata=_decode_jsonb(row["category_metadata"]) or {},
                long_description=row["long_description"],
            )
            if issues:
                _raise_validation(issues)

            new_history = list(_decode_jsonb(row["version_history"]) or [])
            new_history.append(
                {
                    "version": row["version"],
                    "snapshot_at": datetime.now(timezone.utc).isoformat(),
                    "status_before": row["status"],
                    "title": row["title"],
                }
            )
            if len(new_history) > MAX_VERSION_HISTORY:
                new_history = new_history[-MAX_VERSION_HISTORY:]

            updated = await queries.update_listing_fields(
                conn,
                listing_id=listing_id,
                fields={
                    "status": "published",
                    "published_at": datetime.now(timezone.utc),
                    "version_history": new_history,
                },
            )
            assert updated is not None

    logger.info(
        "marketplace.listing.published id=%s version=%s",
        listing_id,
        updated["version"],
    )

    # Emit ``marketplace.listing.submitted`` for P6 Eunomia's moderation
    # queue. The stub logs + buffers the event; the real consumer lands
    # with Eunomia. Any failure is swallowed inside the emitter so the
    # publish path stays flag-safe even when observability is degraded.
    try:
        await emit_listing_submitted(
            listing_id=listing_id, actor_user_id=user_id
        )
    except Exception:  # pragma: no cover - emitter swallows its own errors
        logger.exception(
            "marketplace.listing.submitted_emit_failed id=%s", listing_id
        )

    # Hyperion W2 NP P1 S1: schedule an embedding reindex so the listing
    # becomes searchable via the semantic branch. The enqueue helper
    # fails soft when Arq is offline so the publish path stays 200-OK
    # even in degraded test environments.
    try:
        # Local import keeps the listing_service import graph free of the
        # Arq worker registry when the search stack is not mounted (tests
        # patching listing_service do not pay the import cost).
        from src.backend.marketplace.indexer import enqueue_reindex

        await enqueue_reindex(listing_id)
    except Exception:  # pragma: no cover - enqueue swallows its own errors
        logger.exception(
            "marketplace.reindex.enqueue_failed id=%s", listing_id
        )
    return row_to_detail(updated)


async def delete_listing(
    *,
    listing_id: UUID,
    tenant_id: UUID,
    user_id: UUID,
) -> None:
    """Soft-delete (archive) a listing. Owner-only."""

    await enforce_marketplace_live(user_id=user_id, tenant_id=tenant_id)

    pool = get_pool()
    async with tenant_scoped(pool, tenant_id) as conn:
        async with conn.transaction():
            row = await queries.select_listing_by_id(
                conn, listing_id=listing_id, include_archived=True
            )
            if row is None:
                raise NotFoundProblem(detail="marketplace listing not found")
            if row["archived_at"] is not None:
                # Idempotent: already archived. Treat as success.
                return
            if row["creator_user_id"] != user_id:
                raise ForbiddenProblem(
                    detail="only the listing owner may delete this row",
                    slug="forbidden",
                )
            await queries.archive_listing(conn, listing_id=listing_id)

    logger.info("marketplace.listing.archived id=%s", listing_id)


def _raise_validation(issues: list[ValidationIssue]) -> None:
    """Raise a 422 ``ValidationProblem`` carrying ``errors=[...]``."""

    raise ValidationProblem(
        detail="marketplace listing validation failed",
        extensions={"errors": [i.to_dict() for i in issues]},
    )


__all__ = [
    "MARKETPLACE_LIVE_FLAG",
    "MARKETPLACE_PREMIUM_FLAG",
    "MAX_VERSION_HISTORY",
    "create_listing",
    "delete_listing",
    "derive_slug",
    "enforce_marketplace_live",
    "enforce_premium_issuance",
    "get_listing",
    "list_listings",
    "publish_listing",
    "row_to_detail",
    "row_to_model",
    "row_to_public",
    "update_listing",
]
