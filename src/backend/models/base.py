"""Shared Pydantic v2 base models for NERIUM row projections.

Consumer agents (Phanes, Plutus, Astraea, Tethys, Crius, Khronos, etc.)
inherit from the base classes here so the wire representation of every
tenant-scoped row stays consistent: same UUID format, same datetime ISO
encoding, same ``tenant_id`` placement, same ``from_attributes=True``
config so asyncpg ``Record`` instances deserialize cleanly.

Contract references
-------------------
- ``docs/contracts/rest_api_base.contract.md`` Section 3.5 UUID v7 + ISO-8601
  datetime rules on the API surface.
- ``docs/contracts/postgres_multi_tenant.contract.md`` Section 3.2 tenant
  column convention.

Design notes
------------
- ``model_config`` uses ``ConfigDict`` (Pydantic v2 API). No ``class
  Config`` legacy hook.
- ``from_attributes=True`` enables round-trip from asyncpg ``Record`` (and
  any object with attribute-style access) via ``Model.model_validate``.
- ``populate_by_name=True`` allows both field names and aliases during
  validation so downstream agents can expose an API-facing alias without
  breaking internal code paths that use the snake_case attribute.
- ``str_strip_whitespace=True`` avoids trivial whitespace-only validation
  bugs; tenant string fields rely on this.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class _BaseModel(BaseModel):
    """Project-wide base with the shared Pydantic v2 configuration.

    Kept private (underscore-prefixed) so consumers import the public
    wrappers below. Changing settings here is a cross-cutting decision.
    """

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
        str_strip_whitespace=True,
        extra="forbid",
        validate_assignment=True,
    )


class NeriumModel(_BaseModel):
    """Public model base for request payloads + non-row DTOs.

    Use this for inputs and outputs that are not direct row projections:
    request bodies, aggregate responses, streaming payload envelopes.
    Row projections (database-backed) use :class:`TenantBaseModel`.
    """


class TenantBaseModel(_BaseModel):
    """Projection base for any tenant-scoped row.

    Consumers subclass this and add their entity-specific columns. The
    four common columns (``id``, ``tenant_id``, ``created_at``,
    ``updated_at``) are declared here so JSON output shape is consistent
    across every table row the API returns.

    The field order follows the SQL column order used by every NERIUM
    tenant-scoped table (id first, tenant_id second, updated_at last)
    which keeps asyncpg ``Record`` unpack-by-position semantics aligned
    with Pydantic field order.
    """

    id: UUID = Field(..., description="UUID v7 primary key.")
    tenant_id: UUID = Field(..., description="Owning tenant.")
    created_at: datetime = Field(..., description="Row insertion timestamp UTC.")
    updated_at: datetime = Field(..., description="Last mutation timestamp UTC.")


def dump_row(model: BaseModel, **extra: Any) -> dict[str, Any]:
    """Serialize a Pydantic model + arbitrary extras to a plain dict.

    Convenience wrapper used by router handlers: takes a validated
    model, converts it, and merges any additional fields (e.g.,
    computed pagination cursor) in a single call.
    """

    payload = model.model_dump(mode="json")
    payload.update(extra)
    return payload


__all__ = [
    "NeriumModel",
    "TenantBaseModel",
    "dump_row",
]
