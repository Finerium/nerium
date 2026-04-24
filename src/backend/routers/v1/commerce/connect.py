"""``/v1/commerce/connect/*`` Stripe Connect Express routes.

Owner: Iapetus (W2 NP P4 S1).

Endpoints
---------
- ``POST /v1/commerce/connect/onboard``  find-or-create Connect account
                                          + mint onboarding AccountLink.
- ``POST /v1/commerce/connect/refresh``  re-issue a fresh AccountLink
                                          (used when the previous link
                                          expired before the creator
                                          finished onboarding).
- ``GET  /v1/commerce/connect/status``   current charges/payouts flags
                                          + requirements hash for the
                                          authenticated creator.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Request, status
from pydantic import Field, HttpUrl

from src.backend.billing.stripe_client import ensure_live_mode_disabled
from src.backend.commerce.connect import (
    create_onboarding_link,
    create_or_get_connect_account,
    get_connect_account_by_user,
    sync_account_from_stripe,
)
from src.backend.errors import NotFoundProblem, UnauthorizedProblem
from src.backend.middleware.auth import AuthPrincipal
from src.backend.models.base import NeriumModel

logger = logging.getLogger(__name__)

connect_router = APIRouter(
    prefix="/commerce/connect",
    tags=["commerce", "connect"],
)


# ---------------------------------------------------------------------------
# Request/response models
# ---------------------------------------------------------------------------


class ConnectOnboardRequest(NeriumModel):
    """POST body for onboard + refresh."""

    return_url: HttpUrl = Field(
        ...,
        description="Where Stripe redirects the browser on completion.",
    )
    refresh_url: HttpUrl = Field(
        ...,
        description="Where Stripe redirects if the link expires.",
    )
    country: str = Field(
        default="US",
        min_length=2,
        max_length=2,
        description="ISO 3166 alpha-2 country code for the Stripe Account.",
    )
    default_currency: str = Field(
        default="USD",
        min_length=3,
        max_length=3,
        description="ISO 4217 currency code for the Stripe Account.",
    )


class ConnectOnboardResponse(NeriumModel):
    """POST response surfacing the hosted onboarding URL."""

    onboarding_url: str = Field(
        ..., description="Stripe-hosted AccountLink URL."
    )
    connect_account_id: str = Field(
        ..., description="Stripe Account id (acct_...)."
    )
    expires_at: Optional[datetime] = Field(
        default=None,
        description="ISO-8601 expiry of the onboarding URL (default 5 min).",
    )


class ConnectStatusResponse(NeriumModel):
    """GET /v1/commerce/connect/status response."""

    account_id: str = Field(
        ..., description="Stripe Account id bound to this creator."
    )
    onboarding_status: str = Field(
        ..., description="pending | incomplete | verified | suspended."
    )
    charges_enabled: bool
    payouts_enabled: bool
    details_submitted: bool
    requirements_currently_due: list[str] = Field(
        default_factory=list,
        description="Requirement ids that Stripe still needs from the creator.",
    )
    country: Optional[str] = None
    default_currency: Optional[str] = None
    last_synced_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _require_auth(request: Request) -> AuthPrincipal:
    auth = getattr(request.state, "auth", None)
    if not isinstance(auth, AuthPrincipal):
        raise UnauthorizedProblem(detail="no authenticated principal")
    return auth


def _claim_str(principal: AuthPrincipal, key: str) -> Optional[str]:
    value = principal.raw_claims.get(key)
    if isinstance(value, str) and value:
        return value
    return None


def _extract_currently_due(requirements: dict) -> list[str]:
    """Flatten Stripe's ``requirements.currently_due`` array.

    Stripe returns ``requirements`` as either a dict or a StripeObject
    with ``currently_due`` as a list. We tolerate both.
    """

    if not requirements:
        return []
    raw = requirements.get("currently_due")
    if isinstance(raw, list):
        return [str(item) for item in raw]
    return []


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@connect_router.post(
    "/onboard",
    response_model=ConnectOnboardResponse,
    status_code=status.HTTP_200_OK,
)
async def connect_onboard_endpoint(
    body: ConnectOnboardRequest,
    request: Request,
) -> ConnectOnboardResponse:
    """Find-or-create the Connect account + mint an onboarding URL."""

    principal = _require_auth(request)
    try:
        user_uuid = UUID(principal.user_id)
        tenant_uuid = UUID(principal.tenant_id)
    except (TypeError, ValueError) as exc:
        raise UnauthorizedProblem(
            detail="JWT sub/tenant_id claim is not a valid UUID.",
        ) from exc

    await ensure_live_mode_disabled(user_id=user_uuid, tenant_id=tenant_uuid)

    email = _claim_str(principal, "email")
    account = await create_or_get_connect_account(
        tenant_id=tenant_uuid,
        user_id=user_uuid,
        email=email,
        country=body.country.upper(),
        default_currency=body.default_currency.upper(),
    )
    link = await create_onboarding_link(
        stripe_account_id=account.stripe_account_id,
        return_url=str(body.return_url),
        refresh_url=str(body.refresh_url),
    )

    expires_at: Optional[datetime] = None
    if link.get("expires_at") is not None:
        try:
            expires_at = datetime.fromtimestamp(
                int(link["expires_at"]), tz=timezone.utc
            )
        except (TypeError, ValueError):
            expires_at = None

    return ConnectOnboardResponse(
        onboarding_url=link["url"],
        connect_account_id=account.stripe_account_id,
        expires_at=expires_at,
    )


@connect_router.post(
    "/refresh",
    response_model=ConnectOnboardResponse,
    status_code=status.HTTP_200_OK,
)
async def connect_refresh_endpoint(
    body: ConnectOnboardRequest,
    request: Request,
) -> ConnectOnboardResponse:
    """Re-issue the onboarding link when the previous one expired.

    Creator must already have an onboarding-started row. If not, we
    fall back to the onboard path which creates the account first.
    """

    principal = _require_auth(request)
    try:
        user_uuid = UUID(principal.user_id)
        tenant_uuid = UUID(principal.tenant_id)
    except (TypeError, ValueError) as exc:
        raise UnauthorizedProblem(
            detail="JWT sub/tenant_id claim is not a valid UUID.",
        ) from exc

    await ensure_live_mode_disabled(user_id=user_uuid, tenant_id=tenant_uuid)

    account = await get_connect_account_by_user(
        tenant_id=tenant_uuid, user_id=user_uuid
    )
    if account is None:
        # Onboarding never started; treat refresh as onboard. Keeps
        # the client simple: it can always POST /refresh after a
        # link expires even if the DB row has since been cleared.
        return await connect_onboard_endpoint(body=body, request=request)

    link = await create_onboarding_link(
        stripe_account_id=account.stripe_account_id,
        return_url=str(body.return_url),
        refresh_url=str(body.refresh_url),
    )
    expires_at: Optional[datetime] = None
    if link.get("expires_at") is not None:
        try:
            expires_at = datetime.fromtimestamp(
                int(link["expires_at"]), tz=timezone.utc
            )
        except (TypeError, ValueError):
            expires_at = None

    return ConnectOnboardResponse(
        onboarding_url=link["url"],
        connect_account_id=account.stripe_account_id,
        expires_at=expires_at,
    )


@connect_router.get(
    "/status",
    response_model=ConnectStatusResponse,
    status_code=status.HTTP_200_OK,
)
async def connect_status_endpoint(request: Request) -> ConnectStatusResponse:
    """Return the creator's Connect account readiness + requirements."""

    principal = _require_auth(request)
    try:
        user_uuid = UUID(principal.user_id)
        tenant_uuid = UUID(principal.tenant_id)
    except (TypeError, ValueError) as exc:
        raise UnauthorizedProblem(
            detail="JWT sub/tenant_id claim is not a valid UUID.",
        ) from exc

    account = await get_connect_account_by_user(
        tenant_id=tenant_uuid, user_id=user_uuid
    )
    if account is None:
        raise NotFoundProblem(
            detail=(
                "No Stripe Connect account on file. "
                "POST /v1/commerce/connect/onboard to start onboarding."
            )
        )

    # Best-effort sync with Stripe so the returned flags match live.
    try:
        synced = await sync_account_from_stripe(
            stripe_account_id=account.stripe_account_id,
            tenant_id=tenant_uuid,
        )
        if synced is not None:
            account = synced
    except Exception as exc:
        logger.warning(
            "commerce.connect.status_sync_failed user_id=%s err=%s",
            user_uuid,
            exc,
        )

    return ConnectStatusResponse(
        account_id=account.stripe_account_id,
        onboarding_status=account.onboarding_status,
        charges_enabled=account.charges_enabled,
        payouts_enabled=account.payouts_enabled,
        details_submitted=account.details_submitted,
        requirements_currently_due=_extract_currently_due(account.requirements),
        country=account.country,
        default_currency=account.default_currency,
        last_synced_at=account.last_synced_at,
    )


__all__ = [
    "ConnectOnboardRequest",
    "ConnectOnboardResponse",
    "ConnectStatusResponse",
    "connect_router",
]
