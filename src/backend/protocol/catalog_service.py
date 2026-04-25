"""Read-only catalogue service for ``vendor_adapter_catalog``.

Owner: Crius (W2 NP P5 Session 1).

Single helper used by ``GET /v1/protocol/vendors``: fetches every
catalogue row, filters to ``enabled = true`` rows, and returns trim
projections suitable for the public catalogue surface.

The catalogue table is GLOBAL (no tenant_id, no RLS) so the helper
acquires a raw connection from the pool rather than wrapping in
``tenant_scoped``. There are no secrets in this table; the public
listing is safe to expose without authentication.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any
from uuid import UUID

from src.backend.db.pool import get_pool

__all__ = ["CatalogRow", "list_catalog"]


@dataclass(frozen=True)
class CatalogRow:
    """Trim projection of ``vendor_adapter_catalog`` for the listing route.

    Excludes ``config_json`` from the public surface to avoid leaking
    operator-specific defaults (e.g. base URL overrides). The admin
    surface in S2 will surface the full row.
    """

    vendor_id: UUID
    vendor_slug: str
    display_name: str
    adapter_type: str
    enabled: bool
    created_at: datetime
    updated_at: datetime


async def list_catalog(*, only_enabled: bool = True) -> list[CatalogRow]:
    """Return catalogue rows ordered by ``vendor_slug`` ascending.

    Parameters
    ----------
    only_enabled
        When True (default) returns only ``enabled = true`` rows so the
        public listing surfaces invokable vendors. Tests may pass
        False to assert the full catalogue including scaffolds.
    """

    pool = get_pool()
    query = (
        "SELECT vendor_id, vendor_slug, display_name, adapter_type, "
        "enabled, created_at, updated_at "
        "FROM vendor_adapter_catalog "
    )
    if only_enabled:
        query += "WHERE enabled = true "
    query += "ORDER BY vendor_slug ASC"

    async with pool.acquire() as conn:
        rows = await conn.fetch(query)

    return [_row_to_dataclass(row) for row in rows]


def _row_to_dataclass(row: Any) -> CatalogRow:
    return CatalogRow(
        vendor_id=row["vendor_id"],
        vendor_slug=row["vendor_slug"],
        display_name=row["display_name"],
        adapter_type=row["adapter_type"],
        enabled=row["enabled"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )
