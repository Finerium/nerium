"""HTTP-level tests for the moderation approve/reject routes.

Exercises the router + service together via a minimal FastAPI app so
the path dependency, scope gate, and problem+json error envelope all
ride the real middleware stack.
"""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock
from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.backend.errors import register_problem_handlers
from src.backend.middleware.auth import install_auth
from src.backend.routers.v1.admin.moderation import router as moderation_router
from tests.backend.admin.conftest import (
    listing_row_for_moderation,
    moderation_event_row,
)


def _build_app(settings) -> FastAPI:
    app = FastAPI()
    register_problem_handlers(app)
    install_auth(app, settings=settings)
    app.include_router(moderation_router)
    return app


def test_list_pending_listings_returns_queue(
    test_settings, hs256_jwt_factory, fake_admin_pool
) -> None:
    conn = fake_admin_pool._test_conn
    listing_id = uuid4()
    tenant_id = uuid4()
    creator_user_id = uuid4()
    now = datetime.now(timezone.utc)

    conn.fetch.return_value = [
        {
            "listing_id": listing_id,
            "tenant_id": tenant_id,
            "creator_user_id": creator_user_id,
            "title": "Sample pending",
            "category": "content",
            "subtype": "prompt",
            "short_description": "short",
            "slug": "sample-pending",
            "published_at": now,
            "created_at": now,
        }
    ]
    conn.fetchrow.return_value = {"total": 1}

    token = hs256_jwt_factory(scopes=["admin"])
    app = _build_app(test_settings)
    with TestClient(app) as client:
        response = client.get(
            "/admin/moderation/listings",
            headers={"authorization": f"Bearer {token}"},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["title"] == "Sample pending"
    assert body["items"][0]["listing_id"] == str(listing_id)


def test_approve_route_records_audit(
    test_settings, hs256_jwt_factory, fake_admin_pool
) -> None:
    conn = fake_admin_pool._test_conn
    listing_id = uuid4()
    tenant_id = uuid4()
    moderator_id_str = "11111111-1111-7111-8111-111111111111"

    conn.fetchrow = AsyncMock(
        side_effect=[
            listing_row_for_moderation(
                listing_id=listing_id, tenant_id=tenant_id
            ),
            None,  # idempotency probe
            moderation_event_row(
                listing_id=listing_id,
                tenant_id=tenant_id,
                moderator_id=uuid4(),
                action="approve",
            ),
        ]
    )

    token = hs256_jwt_factory(
        user_id=moderator_id_str, scopes=["admin:moderation"]
    )
    app = _build_app(test_settings)
    with TestClient(app) as client:
        response = client.post(
            f"/admin/moderation/listings/{listing_id}/approve",
            headers={"authorization": f"Bearer {token}"},
            json={},
        )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["action"] == "approve"
    assert body["listing_id"] == str(listing_id)


def test_reject_route_requires_reason(
    test_settings, hs256_jwt_factory
) -> None:
    token = hs256_jwt_factory(scopes=["admin:moderation"])
    app = _build_app(test_settings)
    with TestClient(app) as client:
        response = client.post(
            f"/admin/moderation/listings/{uuid4()}/reject",
            headers={"authorization": f"Bearer {token}"},
            json={"reason": "  "},
        )
    # Pydantic rejects ``min_length=1`` on whitespace-only via the
    # schema validator, so the handler never runs. Either 422 (pydantic)
    # or 422 (service ValidationProblem) is acceptable; we accept both.
    assert response.status_code == 422


def test_reject_route_records_audit_and_suspends(
    test_settings, hs256_jwt_factory, fake_admin_pool
) -> None:
    conn = fake_admin_pool._test_conn
    listing_id = uuid4()
    tenant_id = uuid4()

    conn.fetchrow = AsyncMock(
        side_effect=[
            listing_row_for_moderation(
                listing_id=listing_id, tenant_id=tenant_id
            ),
            moderation_event_row(
                listing_id=listing_id,
                tenant_id=tenant_id,
                action="reject",
                reason="Policy violation.",
            ),
        ]
    )

    token = hs256_jwt_factory(scopes=["admin"])
    app = _build_app(test_settings)
    with TestClient(app) as client:
        response = client.post(
            f"/admin/moderation/listings/{listing_id}/reject",
            headers={"authorization": f"Bearer {token}"},
            json={"reason": "Policy violation."},
        )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["action"] == "reject"
    assert body["reason"] == "Policy violation."
    # Suspension UPDATE fired.
    sql_calls = [call.args[0] for call in conn.execute.await_args_list]
    assert any("SET status = 'suspended'" in sql for sql in sql_calls), (
        f"missing suspension UPDATE; saw: {sql_calls!r}"
    )
