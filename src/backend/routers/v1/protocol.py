"""HTTP routes for ``/v1/protocol/*`` Crius dispatcher.

Owner: Crius (W2 NP P5 Session 1).

Endpoints
---------
- ``POST /v1/protocol/invoke``   dispatch a :class:`VendorTask` to the
                                 named vendor. Requires an EdDSA agent
                                 JWT (``require_agent_jwt`` from
                                 Tethys). Hemera kill switch checked
                                 BEFORE adapter invocation per
                                 contract Section 4.2.
- ``GET /v1/protocol/vendors``   public catalogue of enabled vendors.
                                 No auth required; the surface is the
                                 marketing catalogue + admin tooling
                                 read source.

Auth
----
The invoke endpoint mounts ``Depends(require_agent_jwt)`` so an
authenticated agent identity is required. Aether's
``AuthMiddleware`` already validated the bearer scheme; the agent
JWT verifier in :mod:`src.backend.registry.identity.middleware`
loads the public PEM from ``agent_identity`` and rejects revoked
identities. The vendors GET endpoint reads only public catalogue
metadata (no secrets) so it is mounted as a public path.

Public path note
----------------
The ``/v1/protocol/vendors`` listing endpoint is intentionally
unauthenticated. Aether's ``AuthMiddleware`` runs upstream of every
``/v1/*`` route by default; we register the path inside the router
prefix and rely on ``DEFAULT_PUBLIC_PATHS`` augmentation if a
deployment wants stricter posture. The current implementation does
NOT require auth, matching the pack prompt's "no auth required,
public catalog" mandate. Public path extension lives in
``src/backend/main.py`` via the ``public_paths`` argument to
``install_auth`` (one-line addition during S2 wiring).

Pack prompt registration
------------------------
This router is registered in ``src/backend/routers/v1/__init__.py``
under the label ``protocol.invoke`` so the lifespan mount report
records it explicitly.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, status
from pydantic import Field

from src.backend.models.base import NeriumModel
from src.backend.protocol.adapters.base import VendorResponse, VendorTask
from src.backend.protocol.catalog_service import CatalogRow, list_catalog
from src.backend.protocol.dispatcher import dispatch
from src.backend.registry.identity import AgentPrincipal, require_agent_jwt

__all__ = ["protocol_router"]

logger = logging.getLogger(__name__)

protocol_router = APIRouter(
    prefix="/protocol",
    tags=["protocol"],
)


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------


class InvokeRequest(NeriumModel):
    """POST body for ``/v1/protocol/invoke``.

    Mirrors :class:`VendorTask` shape with the addition of the routing
    key ``vendor_slug``. Validation happens in two layers: this model
    catches structural errors (missing fields, wrong types), the
    dispatcher catches kill-switch + unknown-vendor errors after auth.
    """

    vendor_slug: str = Field(
        ...,
        min_length=1,
        max_length=64,
        description="Catalogue slug to dispatch to. Must match an "
        "``enabled = true`` row in ``vendor_adapter_catalog``.",
    )
    task_type: str = Field(
        ...,
        min_length=1,
        max_length=64,
        description="Capability label, e.g. chat, embedding, image_gen.",
    )
    payload: dict[str, Any] = Field(
        default_factory=dict,
        description="Vendor-agnostic input forwarded to the adapter.",
    )
    metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Caller context. Adapters may inspect "
        "``metadata.model`` for per-request model overrides.",
    )


class VendorListEntry(NeriumModel):
    """One row of the public catalogue listing surface."""

    vendor_id: UUID = Field(..., description="UUID v7 catalogue primary key.")
    vendor_slug: str = Field(..., description="Globally unique slug.")
    display_name: str = Field(..., description="Human-readable label.")
    adapter_type: str = Field(..., description="Capability label.")
    enabled: bool = Field(..., description="Catalogue-level kill switch.")
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@protocol_router.post(
    "/invoke",
    response_model=VendorResponse,
    status_code=status.HTTP_200_OK,
)
async def invoke_vendor(
    body: InvokeRequest,
    agent: AgentPrincipal = Depends(require_agent_jwt),
) -> VendorResponse:
    """Dispatch a :class:`VendorTask` to the requested vendor.

    Returns the adapter's :class:`VendorResponse` on success. Failure
    modes:
    - 401 missing or invalid agent JWT (handled by
      ``require_agent_jwt``)
    - 404 unknown ``vendor_slug``
    - 503 Hemera kill switch tripped for the vendor
    """

    task = VendorTask(
        task_type=body.task_type,
        payload=body.payload,
        metadata=body.metadata,
    )
    return await dispatch(
        vendor_slug=body.vendor_slug,
        task=task,
        agent=agent,
    )


@protocol_router.get(
    "/vendors",
    response_model=list[VendorListEntry],
)
async def list_vendors() -> list[VendorListEntry]:
    """Return the public catalogue of enabled vendors.

    Reads ``vendor_adapter_catalog`` without authentication: the
    catalogue stores no secrets and the listing is the public face of
    the Protocol pillar. Disabled scaffold rows (``openai``,
    ``google`` in S1) are filtered out so callers cannot assume they
    are invokable.
    """

    rows = await list_catalog(only_enabled=True)
    return [_catalog_to_entry(row) for row in rows]


def _catalog_to_entry(row: CatalogRow) -> VendorListEntry:
    return VendorListEntry(
        vendor_id=row.vendor_id,
        vendor_slug=row.vendor_slug,
        display_name=row.display_name,
        adapter_type=row.adapter_type,
        enabled=row.enabled,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )
