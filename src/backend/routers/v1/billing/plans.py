"""``GET /v1/billing/plans`` public pricing endpoint.

Owner: Plutus (W2 NP P4 S1). Consumer: Marshall P6 pricing landing.

Public route (no auth required). The pricing landing must render
without an authenticated session so judges can browse tiers before
signing up. The router does not touch Postgres; every response is a
static catalogue snapshot with Stripe Price IDs resolved from env via
:func:`src.backend.billing.plans.resolve_plans`.

Contract: ``docs/contracts/payment_stripe.contract.md`` Section 3.2 +
prompt-authoritative 4-tier rename (free/starter/pro/team).
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, status

from src.backend.billing.plans import PlansListResponse, resolve_plans

logger = logging.getLogger(__name__)

plans_router = APIRouter(
    prefix="/billing",
    tags=["billing", "public"],
)


# The auth middleware skips this path because the billing pricing
# landing is public. We register it under a ``/billing/plans`` sub-path
# that is NOT in the :data:`DEFAULT_PUBLIC_PATHS` registry but is
# exempted from the tenant binding via the explicit ``request.state``
# check: no principal means the handler cannot read any tenant row.
# Since the handler does not hit Postgres at all, RLS is moot.
@plans_router.get(
    "/plans",
    response_model=PlansListResponse,
    status_code=status.HTTP_200_OK,
)
async def get_billing_plans() -> PlansListResponse:
    """Return the 4-tier subscription catalogue.

    Response is cacheable (static catalogue) though we don't set cache
    headers here; the CDN or reverse-proxy applies a short TTL.
    """

    return PlansListResponse(plans=resolve_plans())


__all__ = ["plans_router"]
