"""``POST /v1/billing/webhook/stripe`` Stripe webhook entry point.

Owner: Plutus (W2 NP P4 S1).

No auth required (Stripe signs the body with ``Stripe-Signature``).
The auth middleware allowlists the ``/v1/billing/webhook/stripe`` path
via an explicit entry in :func:`register_billing_webhook_public` or the
tenant binding gate is skipped because this endpoint has no principal.

We return HTTP 200 on every well-signed event (even unhandled types)
so Stripe does not hammer us with retries. Tampered payloads or
malformed bodies yield 401/422.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Header, Request, status

from src.backend.billing.webhook import process_stripe_webhook
from src.backend.errors import UnauthorizedProblem
from src.backend.models.base import NeriumModel

logger = logging.getLogger(__name__)

webhook_router = APIRouter(
    prefix="/billing",
    tags=["billing", "webhook"],
)


class WebhookAckResponse(NeriumModel):
    """Minimal response so tests can assert a shape."""

    received: bool
    event_id: str
    event_type: str
    replay: bool
    handled: bool


@webhook_router.post(
    "/webhook/stripe",
    response_model=WebhookAckResponse,
    status_code=status.HTTP_200_OK,
)
async def receive_stripe_webhook(
    request: Request,
    stripe_signature: str | None = Header(
        default=None,
        alias="Stripe-Signature",
        description="Stripe webhook signature header (t=... v1=... format).",
    ),
) -> WebhookAckResponse:
    """Accept a Stripe webhook POST and dispatch.

    Body is read raw (NOT parsed as JSON by FastAPI) because the
    signature verifier expects the exact bytes Stripe signed.
    """

    if not stripe_signature:
        raise UnauthorizedProblem(
            detail="Missing Stripe-Signature header.",
        )

    payload_bytes = await request.body()
    result = await process_stripe_webhook(
        payload_bytes=payload_bytes,
        sig_header=stripe_signature,
    )

    logger.info(
        "billing.webhook.dispatched event_id=%s type=%s replay=%s handled=%s",
        result.event_id,
        result.event_type,
        result.was_replay,
        result.was_handled,
    )
    return WebhookAckResponse(
        received=True,
        event_id=result.event_id,
        event_type=result.event_type,
        replay=result.was_replay,
        handled=result.was_handled,
    )


__all__ = ["WebhookAckResponse", "webhook_router"]
