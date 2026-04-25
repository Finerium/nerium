"""Pydantic v2 projections for the multi-vendor adapter surface.

Two distinct row types live here:

1. :class:`VendorAdapter` (P0 scaffold) - tenant-scoped per-tenant API
   key configuration. Crius S2 will populate the encrypted columns
   (``config_encrypted``, ``dek_wrapped``); S1 leaves it as a read-only
   projection used by the legacy 038 migration.
2. :class:`VendorAdapterCatalog` (Crius S1) - GLOBAL platform catalogue
   that lists every vendor adapter the dispatcher recognises. Backed
   by ``vendor_adapter_catalog`` (migration 053). Public read surface
   for ``GET /v1/protocol/vendors``.

Crius owns the write + envelope-encryption path on the tenant-scoped
table. The catalogue surface is admin-write / public-read with no
secrets ever stored in ``config_json`` (per Section 4.1 of the
contract: API keys live in env, NEVER in DB columns at S1).
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional
from uuid import UUID

from pydantic import ConfigDict, Field

from src.backend.models.base import NeriumModel, TenantBaseModel

Vendor = Literal["anthropic", "openai", "voyage", "vllm_local", "other"]
RequestType = Literal["chat", "embedding", "image_gen", "tts", "vision"]
AdapterStatus = Literal["active", "disabled", "circuit_open"]


class VendorAdapter(TenantBaseModel):
    """Row projection of ``vendor_adapter`` (tenant-scoped, P0 scaffold).

    Encrypted columns (``config_encrypted``, ``dek_wrapped``) are
    deliberately NOT surfaced here: the wire format only exposes what
    downstream consumers need (vendor + request_type + priority + status).
    Matching migration ``038_vendor_adapter``. Crius S2 will populate
    the envelope-encryption columns at write time.
    """

    vendor: Vendor
    request_type: RequestType
    priority: int = Field(default=100)
    status: AdapterStatus = Field(default="active")
    kill_switch_flag: Optional[str] = Field(
        default=None,
        description="Hemera flag name that forces circuit_open when true.",
    )
    metadata: dict[str, Any] = Field(default_factory=dict)


class VendorAdapterCatalog(NeriumModel):
    """Row projection of ``vendor_adapter_catalog`` (GLOBAL, Crius S1).

    Backed by migration 053. Catalogue rows describe every vendor
    adapter the Crius dispatcher knows about; they carry NO secrets
    (API keys live in env vars). Tenant-scoped per-tenant overrides
    live on the legacy 038 ``vendor_adapter`` table; this catalogue
    is the platform default registry.

    Field semantics
    ---------------
    - ``vendor_slug`` is the lookup key used by ``AdapterRegistry.get``.
    - ``adapter_type`` is intentionally free-form text rather than an
      enum so future capabilities (e.g. ``vision``, ``code_review``)
      can land without a schema migration. Concrete adapters declare
      the type they support and the dispatcher rejects mismatches.
    - ``config_json`` carries non-secret defaults only. Adding a key
      that contains an API token is a contract violation; the router
      will refuse such writes in the S2 CRUD layer.
    - ``enabled`` is the catalogue-level kill switch. The Hemera flag
      ``vendor.<slug>.disabled`` is the runtime kill switch checked
      BEFORE every dispatch. Both must be true (enabled + flag-not-
      disabled) for the adapter to be invoked.
    """

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
        str_strip_whitespace=True,
        extra="forbid",
        validate_assignment=True,
    )

    vendor_id: UUID = Field(..., description="UUID v7 primary key.")
    vendor_slug: str = Field(
        ...,
        min_length=1,
        max_length=64,
        description="Globally unique slug. Lookup key for AdapterRegistry.",
    )
    display_name: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="Human-readable label shown on admin + catalogue UI.",
    )
    adapter_type: str = Field(
        ...,
        min_length=1,
        max_length=64,
        description="Free-form capability label, e.g. chat, embedding, tts.",
    )
    config_json: dict[str, Any] = Field(
        default_factory=dict,
        description="Non-secret vendor configuration. NEVER carries API keys.",
    )
    enabled: bool = Field(
        default=True,
        description="Catalogue-level kill switch. False = adapter not invokable.",
    )
    created_at: datetime = Field(..., description="Row insertion timestamp UTC.")
    updated_at: datetime = Field(..., description="Last mutation timestamp UTC.")


__all__ = [
    "AdapterStatus",
    "RequestType",
    "Vendor",
    "VendorAdapter",
    "VendorAdapterCatalog",
]
