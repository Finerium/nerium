"""``POST /v1/commerce/purchase`` marketplace buyer flow.

Owner: Iapetus (W2 NP P4 S1).

Auth required. Creates a Stripe PaymentIntent with the revenue split
baked in + persists a ``marketplace_purchase`` row. Returns the
Stripe ``client_secret`` so the frontend can confirm the payment via
Stripe.js.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Request, status
from pydantic import Field

from src.backend.billing.stripe_client import ensure_live_mode_disabled
from src.backend.commerce.purchase import create_purchase_intent
from src.backend.errors import UnauthorizedProblem
from src.backend.middleware.auth import AuthPrincipal
from src.backend.models.base import NeriumModel

logger = logging.getLogger(__name__)

purchase_router = APIRouter(
    prefix="/commerce",
    tags=["commerce", "purchase"],
)


class PurchaseRequest(NeriumModel):
    """POST body."""

    listing_id: UUID = Field(
        ..., description="UUID v7 of the listing the buyer wants to purchase."
    )
    idempotency_key: Optional[str] = Field(
        default=None,
        max_length=128,
        description=(
            "Optional client-provided idempotency anchor. Repeat POSTs with "
            "the same key return the existing purchase row instead of "
            "creating a duplicate."
        ),
    )


class PurchaseSplitResponse(NeriumModel):
    """Revenue split surfaced for UI transparency."""

    gross_amount_cents: int
    platform_fee_cents: int
    creator_net_cents: int
    take_rate_percent: int
    minimum_floor_applied: bool


class PurchaseResponse(NeriumModel):
    """POST response."""

    purchase_id: UUID
    status: str
    payment_intent_id: str
    client_secret: Optional[str] = Field(
        default=None,
        description=(
            "Stripe PaymentIntent client_secret. Null when the request was "
            "an idempotency replay of a previous create."
        ),
    )
    currency: str
    split: PurchaseSplitResponse
    created_at: datetime


def _require_auth(request: Request) -> AuthPrincipal:
    auth = getattr(request.state, "auth", None)
    if not isinstance(auth, AuthPrincipal):
        raise UnauthorizedProblem(detail="no authenticated principal")
    return auth


@purchase_router.post(
    "/purchase",
    response_model=PurchaseResponse,
    status_code=status.HTTP_200_OK,
)
async def commerce_purchase_endpoint(
    body: PurchaseRequest,
    request: Request,
) -> PurchaseResponse:
    """Create a purchase intent for the authenticated buyer."""

    principal = _require_auth(request)
    try:
        buyer_uuid = UUID(principal.user_id)
        tenant_uuid = UUID(principal.tenant_id)
    except (TypeError, ValueError) as exc:
        raise UnauthorizedProblem(
            detail="JWT sub/tenant_id claim is not a valid UUID.",
        ) from exc

    await ensure_live_mode_disabled(user_id=buyer_uuid, tenant_id=tenant_uuid)

    result = await create_purchase_intent(
        tenant_id=tenant_uuid,
        buyer_user_id=buyer_uuid,
        listing_id=body.listing_id,
        idempotency_key=body.idempotency_key,
    )

    return PurchaseResponse(
        purchase_id=result.purchase.id,
        status=result.purchase.status,
        payment_intent_id=result.payment_intent_id,
        client_secret=result.client_secret,
        currency=result.purchase.currency,
        split=PurchaseSplitResponse(
            gross_amount_cents=result.split.gross_amount_cents,
            platform_fee_cents=result.split.platform_fee_cents,
            creator_net_cents=result.split.creator_net_cents,
            take_rate_percent=result.split.take_rate_percent,
            minimum_floor_applied=result.split.minimum_floor_applied,
        ),
        created_at=result.purchase.created_at,
    )


__all__ = [
    "PurchaseRequest",
    "PurchaseResponse",
    "PurchaseSplitResponse",
    "purchase_router",
]
