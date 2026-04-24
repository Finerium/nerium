"""Tests for ``GET /v1/billing/subscription/me``.

Owner: Plutus (W2 NP P4 S1).
"""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock
from uuid import UUID

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.backend.config import Settings
from src.backend.errors import register_problem_handlers
from src.backend.middleware.auth import install_auth
from src.backend.routers.v1.billing.subscription import subscription_router


TENANT_ID = UUID("22222222-2222-7222-8222-222222222222")
USER_ID = UUID("11111111-1111-7111-8111-111111111111")


def _build_app(settings: Settings) -> FastAPI:
    app = FastAPI()
    register_problem_handlers(app)
    install_auth(app, settings=settings)
    app.include_router(subscription_router, prefix="/v1")
    return app


def test_requires_auth(billing_settings) -> None:
    with TestClient(_build_app(billing_settings)) as client:
        resp = client.get("/v1/billing/subscription/me")
    assert resp.status_code == 401


def test_returns_null_for_free_user(
    billing_settings, fake_billing_pool, hs256_jwt_factory
) -> None:
    conn = fake_billing_pool._test_conn
    conn.fetchrow = AsyncMock(return_value=None)

    token = hs256_jwt_factory(
        user_id=str(USER_ID), tenant_id=str(TENANT_ID)
    )
    with TestClient(_build_app(billing_settings)) as client:
        resp = client.get(
            "/v1/billing/subscription/me",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 200
    assert resp.json() == {"subscription": None}


def test_returns_snapshot_for_active_user(
    billing_settings, fake_billing_pool, hs256_jwt_factory
) -> None:
    conn = fake_billing_pool._test_conn
    now = datetime.now(timezone.utc)
    conn.fetchrow = AsyncMock(
        return_value={
            "id": UUID("33333333-3333-7333-8333-333333333333"),
            "tenant_id": TENANT_ID,
            "user_id": USER_ID,
            "stripe_customer_id": "cus_1",
            "stripe_subscription_id": "sub_1",
            "tier": "pro",
            "status": "active",
            "current_period_start": now,
            "current_period_end": now,
            "cancel_at_period_end": False,
            "created_at": now,
            "updated_at": now,
            "deleted_at": None,
        }
    )

    token = hs256_jwt_factory(
        user_id=str(USER_ID), tenant_id=str(TENANT_ID)
    )
    with TestClient(_build_app(billing_settings)) as client:
        resp = client.get(
            "/v1/billing/subscription/me",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["subscription"]["tier"] == "pro"
    assert body["subscription"]["status"] == "active"
    assert body["subscription"]["cancel_at_period_end"] is False


def test_snapshot_reflects_cancel_at_period_end(
    billing_settings, fake_billing_pool, hs256_jwt_factory
) -> None:
    conn = fake_billing_pool._test_conn
    now = datetime.now(timezone.utc)
    conn.fetchrow = AsyncMock(
        return_value={
            "id": UUID("33333333-3333-7333-8333-333333333333"),
            "tenant_id": TENANT_ID,
            "user_id": USER_ID,
            "stripe_customer_id": "cus_2",
            "stripe_subscription_id": "sub_2",
            "tier": "team",
            "status": "active",
            "current_period_start": now,
            "current_period_end": now,
            "cancel_at_period_end": True,
            "created_at": now,
            "updated_at": now,
            "deleted_at": None,
        }
    )

    token = hs256_jwt_factory(
        user_id=str(USER_ID), tenant_id=str(TENANT_ID)
    )
    with TestClient(_build_app(billing_settings)) as client:
        resp = client.get(
            "/v1/billing/subscription/me",
            headers={"Authorization": f"Bearer {token}"},
        )
    body = resp.json()
    assert body["subscription"]["cancel_at_period_end"] is True
