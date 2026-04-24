"""Consent history endpoints mounted under ``/v1/me/consent*``.

Owner: Eunomia (W2 NP P6 S1).

Endpoints
---------
- ``POST /v1/me/consent``: record a new consent decision for the caller.
- ``GET /v1/me/consent/history``: paginated history.

The Klaro frontend (Session 2 CUT) will drive ``POST`` on every banner
toggle; a server-side settings page may drive the same endpoint with
``source="settings"``.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Body, Query, Request
from pydantic import ConfigDict, Field

from src.backend.errors import UnauthorizedProblem
from src.backend.gdpr import consent as consent_service
from src.backend.models.base import NeriumModel

logger = logging.getLogger(__name__)


class ConsentEventOut(NeriumModel):
    """Wire shape of a single consent event row."""

    model_config = ConfigDict(extra="forbid")

    id: UUID
    consent_type: str
    granted: bool
    source: str
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    created_at: str


class ConsentHistoryResponse(NeriumModel):
    """Paginated envelope for ``GET /v1/me/consent/history``."""

    items: list[ConsentEventOut]
    total: int
    limit: int
    offset: int


class RecordConsentPayload(NeriumModel):
    """Body for ``POST /v1/me/consent``."""

    model_config = ConfigDict(extra="forbid")

    consent_type: str = Field(
        ...,
        description="One of: analytics | marketing | functional | necessary.",
    )
    granted: bool = Field(..., description="True to grant, False to revoke.")
    source: str = Field(
        default="banner",
        description="One of: signup | banner | settings | admin | klaro.",
    )


# Mounted under ``/v1`` -> effective ``/v1/me/consent*``.
router = APIRouter(prefix="/me/consent", tags=["me-consent"])


@router.post("", response_model=ConsentEventOut)
async def record_consent(
    request: Request,
    payload: RecordConsentPayload = Body(...),
) -> ConsentEventOut:
    """Record a consent decision for the caller."""

    user_id, tenant_id = _caller_ids(request)
    event = await consent_service.record_consent(
        user_id=user_id,
        tenant_id=tenant_id,
        consent_type=payload.consent_type,
        granted=payload.granted,
        source=payload.source,
        ip_address=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    return _event_to_wire(event)


@router.get("/history", response_model=ConsentHistoryResponse)
async def list_consent_history(
    request: Request,
    limit: int = Query(
        default=consent_service.DEFAULT_HISTORY_LIMIT,
        ge=1,
        le=consent_service.MAX_HISTORY_LIMIT,
    ),
    offset: int = Query(default=0, ge=0),
) -> ConsentHistoryResponse:
    """Paginated consent history for the caller."""

    user_id, tenant_id = _caller_ids(request)
    events, total = await consent_service.list_consent_history(
        user_id=user_id,
        tenant_id=tenant_id,
        limit=limit,
        offset=offset,
    )
    return ConsentHistoryResponse(
        items=[_event_to_wire(e) for e in events],
        total=total,
        limit=limit,
        offset=offset,
    )


def _caller_ids(request: Request) -> tuple[UUID, UUID]:
    principal = getattr(request.state, "auth", None)
    if principal is None:
        raise UnauthorizedProblem(
            detail="Consent endpoints require an authenticated principal.",
        )
    try:
        user_id = UUID(principal.user_id)
        tenant_id = UUID(principal.tenant_id)
    except (TypeError, ValueError) as exc:
        raise UnauthorizedProblem(
            detail="JWT sub / tenant_id claim is not a valid UUID.",
        ) from exc
    return user_id, tenant_id


def _client_ip(request: Request) -> Optional[str]:
    """Extract caller IP with a conservative X-Forwarded-For parse.

    Trusts only the first value; Aether's TrustedHost middleware
    already enforced the host so a spoofed XFF still falls through the
    trust boundary. For GDPR audit we prefer the first-hop client IP
    over the ASGI transport IP.
    """

    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",", 1)[0].strip() or None
    client = request.client
    if client is not None:
        return client.host
    return None


def _event_to_wire(event: consent_service.ConsentEvent) -> ConsentEventOut:
    created = event.created_at
    if isinstance(created, datetime):
        created_iso = created.isoformat()
    else:
        created_iso = str(created)
    return ConsentEventOut(
        id=event.id,
        consent_type=event.consent_type,
        granted=event.granted,
        source=event.source,
        ip_address=event.ip_address,
        user_agent=event.user_agent,
        created_at=created_iso,
    )


__all__ = ["router"]
