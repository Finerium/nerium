"""HTTP routes for ``/v1/realtime/ticket*``.

Owner: Nike (W2 NP P3 S2).

Endpoints
---------
- ``POST /v1/realtime/ticket``: mint a short-lived realtime ticket
  scoped to a single resource. Requires an authenticated Aether
  session (bearer JWT on the request).
- ``POST /v1/realtime/ticket/revoke``: revoke an outstanding ticket by
  jti. Caller must match the original mint's ``sub`` claim.

Response shapes are locked by ``realtime_bus.contract.md`` Section 4.5
and extended with the ``jti`` + ``resource`` fields needed by the
Builder UI + Boreas chat shells at revocation time.
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field, field_validator

from src.backend.errors import UnauthorizedProblem, ValidationProblem
from src.backend.middleware.auth import AuthPrincipal
from src.backend.realtime.jwt_tokens import (
    DEFAULT_TICKET_TTL_S,
    MAX_TICKET_TTL_S,
)
from src.backend.realtime.ticket_service import (
    MintedTicket,
    mint_ticket_for_caller,
    revoke_ticket_by_jti,
)
from src.backend.redis_client import get_redis_client

logger = logging.getLogger(__name__)

ticket_router = APIRouter(
    prefix="/realtime",
    tags=["realtime"],
)


def _require_auth(request: Request) -> AuthPrincipal:
    """Return the authenticated principal or raise 401.

    The router is mounted inside ``/v1`` so Aether's ``AuthMiddleware``
    has already populated ``request.state.auth`` on the success path.
    A missing state attribute is almost always a mis-configured test
    client bypassing middleware; we map it to a clear 401 rather than
    a 500.
    """

    principal = getattr(request.state, "auth", None)
    if isinstance(principal, AuthPrincipal):
        return principal
    raise UnauthorizedProblem(
        detail="Authentication required to mint a realtime ticket."
    )


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------


class MintTicketRequest(BaseModel):
    """Body accepted by ``POST /v1/realtime/ticket``."""

    resource: str = Field(
        ...,
        description=(
            "Canonical resource string this ticket authorises. "
            "Shapes: 'ma:session:<uuid>' / 'builder:session:<uuid>', "
            "'user:<uuid>', 'tenant:<uuid>'."
        ),
        min_length=3,
        max_length=256,
    )
    ttl_seconds: Optional[int] = Field(
        default=None,
        ge=1,
        le=MAX_TICKET_TTL_S,
        description=(
            f"Requested TTL in seconds. Clamped to [1, {MAX_TICKET_TTL_S}]. "
            f"Default: {DEFAULT_TICKET_TTL_S} s."
        ),
    )

    @field_validator("resource")
    @classmethod
    def _strip_resource(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("resource must not be empty")
        return stripped


class MintTicketResponse(BaseModel):
    """Response body for the mint endpoint."""

    ticket: str
    jti: str
    resource: str
    issued_at: int
    expires_at: int
    expires_in: int


class RevokeTicketRequest(BaseModel):
    """Body accepted by ``POST /v1/realtime/ticket/revoke``."""

    jti: str = Field(
        ...,
        min_length=8,
        max_length=64,
        description="jti claim of the ticket to revoke.",
    )


class RevokeTicketResponse(BaseModel):
    revoked: bool
    jti: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@ticket_router.post(
    "/ticket",
    response_model=MintTicketResponse,
    status_code=200,
    summary="Mint a realtime ticket",
)
async def mint_ticket_endpoint(
    body: MintTicketRequest,
    request: Request,
) -> MintTicketResponse:
    """Mint a short-lived realtime ticket for the caller."""

    principal = _require_auth(request)

    try:
        minted: MintedTicket = await mint_ticket_for_caller(
            redis=get_redis_client(),
            principal=principal,
            resource=body.resource,
            ttl_s=body.ttl_seconds,
        )
    except ValueError as exc:
        # Resource pattern rejected at normalise time. Map to 422 so
        # the client sees a structured validation failure rather than
        # a generic 500.
        raise ValidationProblem(
            detail=str(exc),
            extensions={"errors": [{"field": "resource", "message": str(exc)}]},
        )

    logger.info(
        "realtime.ticket.issued user_id=%s tenant_id=%s resource=%s jti=%s ttl=%d",
        principal.user_id,
        principal.tenant_id,
        minted.resource,
        minted.jti,
        minted.expires_at - minted.issued_at,
    )

    return MintTicketResponse(
        ticket=minted.ticket,
        jti=minted.jti,
        resource=minted.resource,
        issued_at=minted.issued_at,
        expires_at=minted.expires_at,
        expires_in=minted.expires_at - minted.issued_at,
    )


@ticket_router.post(
    "/ticket/revoke",
    response_model=RevokeTicketResponse,
    status_code=200,
    summary="Revoke a realtime ticket by jti",
)
async def revoke_ticket_endpoint(
    body: RevokeTicketRequest,
    request: Request,
) -> RevokeTicketResponse:
    """Revoke an outstanding realtime ticket the caller owns."""

    principal = _require_auth(request)

    revoked = await revoke_ticket_by_jti(
        redis=get_redis_client(),
        jti=body.jti,
        principal=principal,
    )
    logger.info(
        "realtime.ticket.revoked user_id=%s jti=%s fresh=%s",
        principal.user_id,
        body.jti,
        revoked,
    )
    return RevokeTicketResponse(revoked=revoked, jti=body.jti)


__all__ = ["ticket_router"]
