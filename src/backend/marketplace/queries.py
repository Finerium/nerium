"""asyncpg raw-SQL helpers for the marketplace_listing table.

Owner: Phanes (W2 NP P1 Session 1). The router never issues SQL directly;
it calls these helpers inside a ``tenant_scoped(pool, tenant_id)`` block
so RLS is enforced automatically.

Contract refs
-------------
- ``docs/contracts/marketplace_listing.contract.md`` Section 3.3 DDL +
  Section 4.1 endpoint semantics.
- ``docs/contracts/postgres_multi_tenant.contract.md`` Section 4.2
  tenant-binding + RLS enforcement.

Design notes
------------
- Every helper takes ``conn: asyncpg.Connection`` so the caller decides
  the transaction boundary. Batch callers (publish-with-version-snapshot)
  can wrap several helpers in one ``async with conn.transaction()``.
- ``jsonb`` values are passed as pre-serialized JSON text because the
  pool ships without a custom codec (see ``src.backend.flags.service``
  ``_decode`` comment for precedent).
- The SELECT list is explicit so new columns added by later migrations
  do NOT accidentally change the row shape that downstream consumers
  (Hyperion embedding ingestor) rely on.
"""

from __future__ import annotations

import json
from typing import Any, Optional, Sequence
from uuid import UUID

import asyncpg


# Column projection for detail + public reads. Keeps the list in one
# place so we do not drift between list/get/publish read paths.
_LISTING_COLUMNS: str = """
    id,
    tenant_id,
    creator_user_id,
    category,
    subtype,
    slug,
    title,
    description,
    short_description,
    long_description,
    capability_tags,
    license,
    pricing,
    pricing_model,
    pricing_details,
    category_metadata,
    asset_refs,
    thumbnail_r2_key,
    trust_score_cached,
    revenue_split_override,
    status,
    version,
    version_history,
    metadata,
    published_at,
    archived_at,
    created_at,
    updated_at
"""


async def insert_listing(
    conn: asyncpg.Connection,
    *,
    listing_id: UUID,
    tenant_id: UUID,
    creator_user_id: UUID,
    category: str,
    subtype: str,
    slug: Optional[str],
    title: str,
    short_description: Optional[str],
    long_description: Optional[str],
    capability_tags: Sequence[str],
    license_value: str,
    pricing_model: str,
    pricing_details: dict[str, Any],
    category_metadata: dict[str, Any],
    asset_refs: Sequence[UUID],
    thumbnail_r2_key: Optional[str],
    version: str,
) -> asyncpg.Record:
    """Insert a fresh draft row and return the row projection."""

    query = f"""
        INSERT INTO marketplace_listing (
            id, tenant_id, creator_user_id,
            category, subtype, slug,
            title, description, short_description, long_description,
            capability_tags, license,
            pricing, pricing_model, pricing_details,
            category_metadata, asset_refs, thumbnail_r2_key,
            status, version, version_history, metadata
        ) VALUES (
            $1, $2, $3,
            $4, $5, $6,
            $7, $8, $9, $10,
            $11::text[], $12,
            '{{}}'::jsonb, $13, $14::jsonb,
            $15::jsonb, $16::uuid[], $17,
            'draft', $18, '[]'::jsonb, '{{}}'::jsonb
        )
        RETURNING {_LISTING_COLUMNS}
    """
    row = await conn.fetchrow(
        query,
        listing_id,
        tenant_id,
        creator_user_id,
        category,
        subtype,
        slug,
        title,
        long_description or short_description or "",  # description legacy backfill
        short_description,
        long_description,
        list(capability_tags),
        license_value,
        pricing_model,
        json.dumps(pricing_details, separators=(",", ":"), sort_keys=True),
        json.dumps(category_metadata, separators=(",", ":"), sort_keys=True),
        list(asset_refs),
        thumbnail_r2_key,
        version,
    )
    assert row is not None  # INSERT ... RETURNING always yields a row
    return row


async def select_listing_by_id(
    conn: asyncpg.Connection,
    *,
    listing_id: UUID,
    include_archived: bool = False,
) -> Optional[asyncpg.Record]:
    """Fetch a single listing by id.

    When ``include_archived`` is False (default) rows with
    ``archived_at IS NOT NULL`` are filtered out so the caller does not
    need to check and so soft-deleted rows return 404.
    """

    archived_clause = "" if include_archived else "AND archived_at IS NULL"
    row = await conn.fetchrow(
        f"""
        SELECT {_LISTING_COLUMNS}
        FROM marketplace_listing
        WHERE id = $1 {archived_clause}
        """,
        listing_id,
    )
    return row


async def select_listing_by_slug(
    conn: asyncpg.Connection,
    *,
    slug: str,
) -> Optional[asyncpg.Record]:
    """Fetch a listing by slug. Used by the conflict check at create."""

    row = await conn.fetchrow(
        f"""
        SELECT {_LISTING_COLUMNS}
        FROM marketplace_listing
        WHERE slug = $1 AND archived_at IS NULL
        """,
        slug,
    )
    return row


async def list_listings(
    conn: asyncpg.Connection,
    *,
    category: Optional[str] = None,
    subtype: Optional[str] = None,
    status: Optional[str] = "published",
    creator_user_id: Optional[UUID] = None,
    sort: str = "recent",
    cursor_ts: Optional[Any] = None,
    cursor_id: Optional[UUID] = None,
    limit: int = 25,
) -> list[asyncpg.Record]:
    """Cursor-paginated list with per-facet filters.

    The caller drives pagination via keyset (cursor_ts, cursor_id) so
    this function is a thin parametrised wrapper around the same SELECT
    shape. ``limit + 1`` is returned to the caller so the service layer
    knows whether another page exists.

    ``sort='recent'`` orders by created_at DESC, id DESC.
    ``sort='rating'`` orders by trust_score_cached DESC NULLS LAST, id DESC.
    """

    where: list[str] = ["archived_at IS NULL"]
    args: list[Any] = []

    def _next_placeholder() -> str:
        return f"${len(args) + 1}"

    if status is not None:
        args.append(status)
        where.append(f"status = {_next_placeholder()}")
    if category is not None:
        args.append(category)
        where.append(f"category = {_next_placeholder()}")
    if subtype is not None:
        args.append(subtype)
        where.append(f"subtype = {_next_placeholder()}")
    if creator_user_id is not None:
        args.append(creator_user_id)
        where.append(f"creator_user_id = {_next_placeholder()}")

    if cursor_ts is not None and cursor_id is not None:
        # Keyset: strictly-before the boundary on the DESC axis.
        args.append(cursor_ts)
        ts_ph = _next_placeholder()
        args.append(cursor_id)
        id_ph = _next_placeholder()
        where.append(f"(created_at, id) < ({ts_ph}, {id_ph})")

    if sort == "rating":
        order_clause = (
            "ORDER BY trust_score_cached DESC NULLS LAST, "
            "created_at DESC, id DESC"
        )
    else:
        order_clause = "ORDER BY created_at DESC, id DESC"

    args.append(limit + 1)
    limit_ph = _next_placeholder()

    query = (
        f"SELECT {_LISTING_COLUMNS} "
        "FROM marketplace_listing "
        f"WHERE {' AND '.join(where)} "
        f"{order_clause} "
        f"LIMIT {limit_ph}"
    )
    rows = await conn.fetch(query, *args)
    return list(rows)


async def update_listing_fields(
    conn: asyncpg.Connection,
    *,
    listing_id: UUID,
    fields: dict[str, Any],
) -> Optional[asyncpg.Record]:
    """Apply a partial update.

    ``fields`` MUST already be normalized by the caller: jsonb columns
    as dict (serialized here), arrays as list, enums as string. Unknown
    keys are rejected defensively so a typo does not silently pass.
    """

    allowed = {
        "title",
        "short_description",
        "long_description",
        "capability_tags",
        "license",
        "pricing_model",
        "pricing_details",
        "category_metadata",
        "asset_refs",
        "thumbnail_r2_key",
        "version",
        "status",
        "version_history",
        "published_at",
        "archived_at",
        "trust_score_cached",
        "revenue_split_override",
    }
    sets: list[str] = []
    args: list[Any] = []
    for key, value in fields.items():
        if key not in allowed:
            raise ValueError(f"unknown field {key!r} in update_listing_fields")
        args.append(
            json.dumps(value, separators=(",", ":"), sort_keys=True)
            if key in {"pricing_details", "category_metadata", "version_history"}
            else value
        )
        ph = f"${len(args)}"
        if key in {"pricing_details", "category_metadata", "version_history"}:
            sets.append(f"{key} = {ph}::jsonb")
        elif key == "capability_tags":
            sets.append(f"{key} = {ph}::text[]")
        elif key == "asset_refs":
            sets.append(f"{key} = {ph}::uuid[]")
        else:
            sets.append(f"{key} = {ph}")

    if not sets:
        # No-op update; still return the current row so PATCH responses stay shaped.
        return await select_listing_by_id(conn, listing_id=listing_id)

    args.append(listing_id)
    id_ph = f"${len(args)}"

    query = (
        "UPDATE marketplace_listing "
        f"SET {', '.join(sets)} "
        f"WHERE id = {id_ph} "
        f"RETURNING {_LISTING_COLUMNS}"
    )
    row = await conn.fetchrow(query, *args)
    return row


async def archive_listing(
    conn: asyncpg.Connection,
    *,
    listing_id: UUID,
) -> Optional[asyncpg.Record]:
    """Soft-delete by setting ``archived_at = now()`` and ``status = archived``."""

    row = await conn.fetchrow(
        f"""
        UPDATE marketplace_listing
           SET archived_at = now(),
               status      = 'archived'
         WHERE id = $1
           AND archived_at IS NULL
        RETURNING {_LISTING_COLUMNS}
        """,
        listing_id,
    )
    return row


__all__ = [
    "archive_listing",
    "insert_listing",
    "list_listings",
    "select_listing_by_id",
    "select_listing_by_slug",
    "update_listing_fields",
]
