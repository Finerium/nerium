"""Tests for the Stripe Checkout Session helper + router.

Owner: Plutus (W2 NP P4 S1).
"""

from __future__ import annotations

from unittest.mock import MagicMock
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import SecretStr

from src.backend.billing.checkout import create_checkout_session
from src.backend.billing.stripe_client import (
    StripeLiveModeForbiddenProblem,
    StripeNotConfiguredProblem,
)
from src.backend.config import Settings
from src.backend.errors import register_problem_handlers
from src.backend.middleware.auth import install_auth
from src.backend.routers.v1.billing.checkout import checkout_router


TENANT_ID = UUID("22222222-2222-7222-8222-222222222222")
USER_ID = UUID("11111111-1111-7111-8111-111111111111")


@pytest.fixture
def _test_settings(billing_settings) -> Settings:
    """Reuse the billing_settings fixture as the auth middleware secret source."""

    return billing_settings


# ---------------------------------------------------------------------------
# create_checkout_session (unit)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_checkout_rejects_free_tier(
    billing_settings, fake_stripe_client, flag_false
) -> None:
    with pytest.raises(ValueError):
        await create_checkout_session(
            tier="free",  # type: ignore[arg-type]
            user_id=USER_ID,
            tenant_id=TENANT_ID,
        )


@pytest.mark.asyncio
async def test_create_checkout_blocks_when_live_flag(
    billing_settings, fake_stripe_client, flag_true
) -> None:
    with pytest.raises(StripeLiveModeForbiddenProblem):
        await create_checkout_session(
            tier="pro",
            user_id=USER_ID,
            tenant_id=TENANT_ID,
        )


@pytest.mark.asyncio
async def test_create_checkout_raises_when_price_unset(
    monkeypatch, fake_stripe_client, flag_false
) -> None:
    """Paid tier with missing NERIUM_STRIPE_PRICE_ID_PRO leads to 503."""

    settings = Settings(
        env="development",
        stripe_secret_key_test=SecretStr("sk_test_dummy"),
        stripe_price_id_starter="price_test_starter",
        stripe_price_id_pro="",  # unset
        stripe_price_id_team="price_test_team",
    )
    monkeypatch.setattr("src.backend.config.get_settings", lambda: settings)
    monkeypatch.setattr(
        "src.backend.billing.stripe_client.get_settings", lambda: settings
    )
    monkeypatch.setattr(
        "src.backend.billing.plans.get_settings", lambda: settings
    )
    monkeypatch.setattr(
        "src.backend.billing.checkout.get_settings", lambda: settings
    )
    with pytest.raises(StripeNotConfiguredProblem):
        await create_checkout_session(
            tier="pro",
            user_id=USER_ID,
            tenant_id=TENANT_ID,
        )


@pytest.mark.asyncio
async def test_create_checkout_returns_url_and_session_id(
    billing_settings, fake_stripe_client, flag_false
) -> None:
    out = await create_checkout_session(
        tier="pro",
        user_id=USER_ID,
        tenant_id=TENANT_ID,
        user_email="ghaisan@nerium.com",
    )
    assert out["checkout_url"].startswith("https://checkout.stripe.com/")
    assert out["session_id"] == "cs_test_stub123"

    # Inspect the params passed to stripe.checkout.sessions.create.
    call = fake_stripe_client.checkout.sessions.create.call_args
    params = call.kwargs["params"]
    assert params["mode"] == "subscription"
    assert params["line_items"][0]["price"] == "price_test_pro"
    # Metadata carries the user + tenant + tier triple.
    assert params["metadata"]["nerium_user_id"] == str(USER_ID)
    assert params["metadata"]["nerium_tenant_id"] == str(TENANT_ID)
    assert params["metadata"]["nerium_tier"] == "pro"
    assert params["subscription_data"]["metadata"]["nerium_tier"] == "pro"
    assert params["customer_email"] == "ghaisan@nerium.com"
    # Success URL carries the {CHECKOUT_SESSION_ID} placeholder injected
    # by _with_session_id so Stripe can fill it at redirect time.
    assert "CHECKOUT_SESSION_ID" in params["success_url"]


@pytest.mark.asyncio
async def test_create_checkout_honors_explicit_urls(
    billing_settings, fake_stripe_client, flag_false
) -> None:
    await create_checkout_session(
        tier="starter",
        user_id=USER_ID,
        tenant_id=TENANT_ID,
        success_url="https://app.nerium.com/welcome?x=1",
        cancel_url="https://app.nerium.com/back",
    )
    call = fake_stripe_client.checkout.sessions.create.call_args
    params = call.kwargs["params"]
    # Explicit success URL still gets the CHECKOUT_SESSION_ID placeholder
    # appended so Stripe can round-trip the session id to the app.
    assert params["success_url"].startswith("https://app.nerium.com/welcome?x=1")
    assert "CHECKOUT_SESSION_ID" in params["success_url"]
    assert params["cancel_url"] == "https://app.nerium.com/back"


@pytest.mark.asyncio
async def test_create_checkout_preserves_placeholder_if_given(
    billing_settings, fake_stripe_client, flag_false
) -> None:
    """When caller already supplies the placeholder we don't append twice."""

    await create_checkout_session(
        tier="starter",
        user_id=USER_ID,
        tenant_id=TENANT_ID,
        success_url="https://app.nerium.com/welcome?sid={CHECKOUT_SESSION_ID}",
    )
    params = fake_stripe_client.checkout.sessions.create.call_args.kwargs["params"]
    assert params["success_url"].count("CHECKOUT_SESSION_ID") == 1


# ---------------------------------------------------------------------------
# Router integration (POST /v1/billing/checkout)
# ---------------------------------------------------------------------------


def _build_checkout_app(settings: Settings) -> FastAPI:
    app = FastAPI()
    register_problem_handlers(app)
    install_auth(app, settings=settings)
    app.include_router(checkout_router, prefix="/v1")
    return app


def test_checkout_route_requires_auth(
    _test_settings, fake_stripe_client, flag_false
) -> None:
    app = _build_checkout_app(_test_settings)
    with TestClient(app) as client:
        resp = client.post("/v1/billing/checkout", json={"tier": "pro"})
    assert resp.status_code == 401


def test_checkout_route_rejects_free(
    _test_settings, fake_stripe_client, flag_false, hs256_jwt_factory
) -> None:
    token = hs256_jwt_factory(
        user_id=str(USER_ID), tenant_id=str(TENANT_ID)
    )
    app = _build_checkout_app(_test_settings)
    with TestClient(app) as client:
        resp = client.post(
            "/v1/billing/checkout",
            json={"tier": "free"},
            headers={"Authorization": f"Bearer {token}"},
        )
    # Pydantic filters free out at request validation time (Literal enum).
    assert resp.status_code == 422


def test_checkout_route_happy_path(
    _test_settings, fake_stripe_client, flag_false, hs256_jwt_factory
) -> None:
    token = hs256_jwt_factory(
        user_id=str(USER_ID), tenant_id=str(TENANT_ID)
    )
    app = _build_checkout_app(_test_settings)
    with TestClient(app) as client:
        resp = client.post(
            "/v1/billing/checkout",
            json={"tier": "pro"},
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["session_id"] == "cs_test_stub123"
    assert "checkout.stripe.com" in body["checkout_url"]


def test_checkout_route_rejects_live_flag(
    _test_settings, fake_stripe_client, flag_true, hs256_jwt_factory
) -> None:
    token = hs256_jwt_factory(
        user_id=str(USER_ID), tenant_id=str(TENANT_ID)
    )
    app = _build_checkout_app(_test_settings)
    with TestClient(app) as client:
        resp = client.post(
            "/v1/billing/checkout",
            json={"tier": "pro"},
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 403
    body = resp.json()
    assert "stripe_live_disabled" in body["type"]
