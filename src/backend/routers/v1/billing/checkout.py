"""``POST /v1/billing/checkout`` Stripe Checkout Session create.

Owner: Plutus (W2 NP P4 S1).

Auth required. Validates tier in {starter, pro, team}; Free is rejected
with 400 since no Stripe flow is needed. Live-mode gate runs inside
:func:`src.backend.billing.checkout.create_checkout_session` via the
shared :mod:`.stripe_client` helper, so the router stays thin.
"""

from __future__ import annotations

import logging
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Request, status
from pydantic import Field, HttpUrl

from src.backend.billing.checkout import create_checkout_session
from src.backend.billing.plans import PAID_TIERS, Tier
from src.backend.billing.stripe_client import (
    StripeNotConfiguredProblem,
)
from src.backend.errors import (
    UnauthorizedProblem,
    ValidationProblem,
)
from src.backend.middleware.auth import AuthPrincipal
from src.backend.models.base import NeriumModel

logger = logging.getLogger(__name__)

checkout_router = APIRouter(
    prefix="/billing",
    tags=["billing"],
)


class CheckoutRequest(NeriumModel):
    """POST body.

    ``success_url`` and ``cancel_url`` are optional overrides; the
    handler defaults to ``NERIUM_STRIPE_SUCCESS_URL`` +
    ``NERIUM_STRIPE_CANCEL_URL`` from config when omitted.
    """

    tier: Literal["starter", "pro", "team"] = Field(
        ...,
        description="Target subscription tier. Free tier is not a Checkout flow.",
    )
    success_url: HttpUrl | None = Field(
        default=None,
        description="Override redirect target on success. Defaults to config.",
    )
    cancel_url: HttpUrl | None = Field(
        default=None,
        description="Override redirect target on cancel. Defaults to config.",
    )


class CheckoutResponse(NeriumModel):
    """POST response."""

    checkout_url: str = Field(
        ...,
        description="Stripe-hosted Checkout Session URL; redirect the browser here.",
    )
    session_id: str = Field(
        ...,
        description="Stripe Checkout Session id (cs_test_...).",
    )


def _require_auth(request: Request) -> AuthPrincipal:
    auth = getattr(request.state, "auth", None)
    if not isinstance(auth, AuthPrincipal):
        raise UnauthorizedProblem(detail="no authenticated principal")
    return auth


@checkout_router.post(
    "/checkout",
    response_model=CheckoutResponse,
    status_code=status.HTTP_200_OK,
)
async def create_billing_checkout(
    request: Request,
    body: CheckoutRequest,
) -> CheckoutResponse:
    """Create a Stripe Checkout Session for the caller.

    Returns the hosted URL so the frontend can redirect. The webhook at
    ``/v1/billing/webhook/stripe`` completes the subscription row on
    ``checkout.session.completed``.
    """

    principal = _require_auth(request)
    tier: Tier = body.tier  # type: ignore[assignment]

    if tier not in PAID_TIERS:  # defense-in-depth, pydantic already filtered
        raise ValidationProblem(
            detail="Tier must be one of starter, pro, team.",
        )

    try:
        user_uuid = UUID(principal.user_id)
        tenant_uuid = UUID(principal.tenant_id)
    except (TypeError, ValueError) as exc:
        raise UnauthorizedProblem(
            detail="JWT sub/tenant_id claim is not a valid UUID.",
        ) from exc

    user_email = _claim_str(principal, "email")

    try:
        result = await create_checkout_session(
            tier=tier,
            user_id=user_uuid,
            tenant_id=tenant_uuid,
            user_email=user_email,
            success_url=str(body.success_url) if body.success_url else None,
            cancel_url=str(body.cancel_url) if body.cancel_url else None,
        )
    except StripeNotConfiguredProblem:
        raise
    except ValueError as exc:
        raise ValidationProblem(detail=str(exc)) from exc

    checkout_url = result.get("checkout_url")
    session_id = result.get("session_id")
    if not checkout_url or not session_id:  # pragma: no cover - defensive
        raise StripeNotConfiguredProblem(
            detail="Stripe returned an empty Checkout Session payload."
        )
    return CheckoutResponse(
        checkout_url=checkout_url,
        session_id=session_id,
    )


def _claim_str(principal: AuthPrincipal, key: str) -> str | None:
    """Return a string claim from raw JWT claims or None."""

    value = principal.raw_claims.get(key)
    if isinstance(value, str) and value:
        return value
    return None


__all__ = [
    "CheckoutRequest",
    "CheckoutResponse",
    "checkout_router",
]
