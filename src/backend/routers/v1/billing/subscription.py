"""``GET /v1/billing/subscription/me`` current-plan read endpoint.

Owner: Plutus (W2 NP P4 S1). Consumer: Marshall P6 "Current plan" badge.

Auth required. Returns the caller's current subscription snapshot or
``{"subscription": null}`` when the user has no row (free tier default).
"""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Request, status

from src.backend.billing.subscription import (
    SubscriptionMeResponse,
    get_subscription_snapshot,
)
from src.backend.errors import UnauthorizedProblem
from src.backend.middleware.auth import AuthPrincipal

logger = logging.getLogger(__name__)

subscription_router = APIRouter(
    prefix="/billing",
    tags=["billing"],
)


def _require_auth(request: Request) -> AuthPrincipal:
    auth = getattr(request.state, "auth", None)
    if not isinstance(auth, AuthPrincipal):
        raise UnauthorizedProblem(detail="no authenticated principal")
    return auth


@subscription_router.get(
    "/subscription/me",
    response_model=SubscriptionMeResponse,
    status_code=status.HTTP_200_OK,
)
async def get_my_subscription(request: Request) -> SubscriptionMeResponse:
    """Return the caller's current subscription snapshot or null.

    Free-tier users (no row) receive ``{"subscription": null}`` rather
    than a 404; the UI treats null as "on Free" and renders the
    upgrade CTA. Soft-deleted rows are hidden (deleted_at IS NULL
    filter in the query).
    """

    principal = _require_auth(request)
    try:
        user_uuid = UUID(principal.user_id)
        tenant_uuid = UUID(principal.tenant_id)
    except (TypeError, ValueError) as exc:
        raise UnauthorizedProblem(
            detail="JWT sub/tenant_id claim is not a valid UUID.",
        ) from exc

    snapshot = await get_subscription_snapshot(
        user_id=user_uuid,
        tenant_id=tenant_uuid,
    )
    return SubscriptionMeResponse(subscription=snapshot)


__all__ = ["subscription_router"]
