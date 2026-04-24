"""Tests for the consent history service + router."""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.backend.errors import ValidationProblem, register_problem_handlers
from src.backend.gdpr import consent as consent_service
from src.backend.middleware.auth import install_auth
from src.backend.middleware.tenant_binding import install_tenant_binding
from src.backend.routers.v1.me.consent import router as consent_router


async def test_record_consent_inserts_row(fake_gdpr_pool) -> None:
    conn = fake_gdpr_pool._test_conn
    user_id = uuid4()
    tenant_id = uuid4()

    conn.fetchrow = AsyncMock(
        return_value={
            "id": uuid4(),
            "tenant_id": tenant_id,
            "user_id": user_id,
            "consent_type": "analytics",
            "granted": True,
            "source": "banner",
            "ip_address": "203.0.113.5",
            "user_agent": "pytest-agent/1.0",
            "created_at": datetime.now(timezone.utc),
        }
    )

    event = await consent_service.record_consent(
        user_id=user_id,
        tenant_id=tenant_id,
        consent_type="analytics",
        granted=True,
        source="banner",
        ip_address="203.0.113.5",
        user_agent="pytest-agent/1.0",
    )
    assert event.consent_type == "analytics"
    assert event.granted is True
    assert event.ip_address == "203.0.113.5"


async def test_record_consent_rejects_unknown_type(fake_gdpr_pool) -> None:
    with pytest.raises(ValidationProblem):
        await consent_service.record_consent(
            user_id=uuid4(),
            tenant_id=uuid4(),
            consent_type="telemetry",  # not in the enum
            granted=True,
        )


async def test_signup_defaults_seed_four_rows(fake_gdpr_pool) -> None:
    conn = fake_gdpr_pool._test_conn

    def _make_row(consent_type: str, granted: bool) -> dict:
        return {
            "id": uuid4(),
            "tenant_id": uuid4(),
            "user_id": uuid4(),
            "consent_type": consent_type,
            "granted": granted,
            "source": "signup",
            "ip_address": None,
            "user_agent": None,
            "created_at": datetime.now(timezone.utc),
        }

    conn.fetchrow = AsyncMock(
        side_effect=[
            _make_row("necessary", True),
            _make_row("functional", False),
            _make_row("analytics", False),
            _make_row("marketing", False),
        ]
    )

    events = await consent_service.record_signup_defaults(
        user_id=uuid4(), tenant_id=uuid4()
    )
    assert len(events) == 4
    types = [e.consent_type for e in events]
    assert set(types) == {"necessary", "functional", "analytics", "marketing"}
    # necessary is the only default-true.
    for event in events:
        if event.consent_type == "necessary":
            assert event.granted is True
        else:
            assert event.granted is False


def _build_app(settings) -> FastAPI:
    app = FastAPI()
    register_problem_handlers(app)
    install_tenant_binding(app)
    install_auth(app, settings=settings)
    app.include_router(consent_router)
    return app


def test_consent_history_roundtrip(
    test_settings, hs256_jwt_factory, fake_gdpr_pool
) -> None:
    conn = fake_gdpr_pool._test_conn
    user_id_str = "11111111-1111-7111-8111-111111111111"
    tenant_id_str = "22222222-2222-7222-8222-222222222222"

    conn.fetchrow = AsyncMock(
        side_effect=[
            # POST /me/consent INSERT RETURNING
            {
                "id": uuid4(),
                "tenant_id": tenant_id_str,
                "user_id": user_id_str,
                "consent_type": "analytics",
                "granted": True,
                "source": "banner",
                "ip_address": "203.0.113.5",
                "user_agent": "pytest",
                "created_at": datetime.now(timezone.utc),
            },
            # GET /me/consent/history SELECT COUNT
            {"total": 1},
        ]
    )
    conn.fetch = AsyncMock(
        return_value=[
            {
                "id": uuid4(),
                "tenant_id": tenant_id_str,
                "user_id": user_id_str,
                "consent_type": "analytics",
                "granted": True,
                "source": "banner",
                "ip_address": "203.0.113.5",
                "user_agent": "pytest",
                "created_at": datetime.now(timezone.utc),
            }
        ]
    )

    token = hs256_jwt_factory(user_id=user_id_str, tenant_id=tenant_id_str)
    app = _build_app(test_settings)
    with TestClient(app) as client:
        post_response = client.post(
            "/me/consent",
            headers={"authorization": f"Bearer {token}"},
            json={
                "consent_type": "analytics",
                "granted": True,
                "source": "banner",
            },
        )
        assert post_response.status_code == 200, post_response.text
        post_body = post_response.json()
        assert post_body["consent_type"] == "analytics"
        assert post_body["granted"] is True

        history_response = client.get(
            "/me/consent/history",
            headers={"authorization": f"Bearer {token}"},
        )
        assert history_response.status_code == 200, history_response.text
        body = history_response.json()
        assert body["total"] == 1
        assert body["items"][0]["consent_type"] == "analytics"
