"""Stripe Checkout Session create helper.

Owner: Plutus (W2 NP P4 S1).

``POST /v1/billing/checkout`` accepts a tier + optional URL overrides
and returns the hosted Checkout Session URL. The frontend redirects the
browser to that URL; Stripe handles card collection + SCA challenge +
3DS flow and redirects back to ``success_url`` with the session id in a
query param. The webhook handler (see :mod:`.webhook`) completes the
``subscription`` upsert on ``checkout.session.completed``.

Test mode only per V4 Gate 4. Live mode gated on Hemera flag via
:func:`src.backend.billing.stripe_client.ensure_live_mode_disabled`.
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from src.backend.billing.plans import PAID_TIERS, Tier, plan_by_tier
from src.backend.billing.stripe_client import (
    StripeNotConfiguredProblem,
    ensure_live_mode_disabled,
    get_stripe_client,
)
from src.backend.config import get_settings

logger = logging.getLogger(__name__)


async def create_checkout_session(
    *,
    tier: Tier,
    user_id: UUID,
    tenant_id: UUID,
    user_email: str | None = None,
    success_url: str | None = None,
    cancel_url: str | None = None,
) -> dict[str, Any]:
    """Build a Stripe Checkout Session for ``tier`` and return its payload.

    Returns a dict with two public fields:
    - ``checkout_url``: the hosted Stripe URL to redirect the user to.
    - ``session_id``: the ``cs_test_...`` id for client-side reference.

    Raises
    ------
    StripeLiveModeForbiddenProblem
        When the Hemera live-mode flag is enabled pre-Atlas.
    StripeNotConfiguredProblem
        When the TEST secret key is missing or the tier has no Price id.
    ValueError
        When tier is free or unknown.
    """

    await ensure_live_mode_disabled(user_id=user_id, tenant_id=tenant_id)

    if tier not in PAID_TIERS:
        raise ValueError(
            f"tier must be one of {PAID_TIERS}; got {tier!r}"
        )
    plan = plan_by_tier(tier)
    if plan is None:  # pragma: no cover - defensive, PAID_TIERS is static
        raise ValueError(f"unknown tier {tier!r}")
    if not plan.stripe_price_id:
        raise StripeNotConfiguredProblem(
            detail=(
                f"Stripe Price id for tier {tier!r} is unset. "
                f"Populate NERIUM_STRIPE_PRICE_ID_{tier.upper()}."
            )
        )

    settings = get_settings()
    final_success_url = _with_session_id(success_url or settings.stripe_success_url)
    final_cancel_url = cancel_url or settings.stripe_cancel_url

    client = get_stripe_client()

    # Metadata carries the tenant + user UUIDs as strings so the
    # webhook can resolve them back to the subscription row without a
    # side-channel lookup. Stripe limits metadata values to 500 chars
    # each; UUID strings are 36 so we are safe.
    metadata = {
        "nerium_user_id": str(user_id),
        "nerium_tenant_id": str(tenant_id),
        "nerium_tier": tier,
    }

    params: dict[str, Any] = {
        "mode": "subscription",
        "line_items": [
            {
                "price": plan.stripe_price_id,
                "quantity": 1,
            }
        ],
        "success_url": final_success_url,
        "cancel_url": final_cancel_url,
        "metadata": metadata,
        "subscription_data": {"metadata": metadata},
        "client_reference_id": str(user_id),
        "allow_promotion_codes": True,
    }
    if user_email:
        params["customer_email"] = user_email

    # ``StripeClient.checkout.sessions.create`` on v12 is sync-on-thread
    # internally; using the normal call works under FastAPI because
    # Stripe's HTTP client releases the GIL. If profiling later shows
    # this blocks the event loop for large batches, wrap in
    # ``asyncio.to_thread``.
    session = client.checkout.sessions.create(params=params)
    logger.info(
        "billing.checkout.session_created session_id=%s tier=%s user_id=%s",
        getattr(session, "id", None),
        tier,
        user_id,
    )

    return {
        "checkout_url": getattr(session, "url", None),
        "session_id": getattr(session, "id", None),
    }


def _with_session_id(url: str) -> str:
    """Append the ``{CHECKOUT_SESSION_ID}`` placeholder to a success URL.

    Stripe docs: the string ``{CHECKOUT_SESSION_ID}`` is replaced by
    Stripe at redirect time so the success page can fetch the session
    payload. Our default success url carries the placeholder; custom
    URLs from callers are left untouched so they can pass their own
    bounce target.
    """

    if "{CHECKOUT_SESSION_ID}" in url:
        return url
    joiner = "&" if "?" in url else "?"
    return f"{url}{joiner}session_id={{CHECKOUT_SESSION_ID}}"


__all__ = ["create_checkout_session"]
