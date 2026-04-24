"""Scope gate on admin moderation routes.

A bearer token without the broad ``admin`` scope or the narrow
``admin:moderation`` scope must receive 403 problem+json when hitting
any ``/v1/admin/moderation/*`` route. Missing bearer yields 401.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.backend.errors import register_problem_handlers
from src.backend.middleware.auth import install_auth
from src.backend.routers.v1.admin.moderation import router as moderation_router


def _build_app(settings) -> FastAPI:
    """Build a minimal app with auth + the moderation router mounted.

    Tenant binding is intentionally omitted because the test only
    exercises auth + admin-scope enforcement on the route dependency.
    The moderation router is mounted at the root so the paths in this
    test read ``/admin/moderation/...`` which is the same shape the
    production mount serves under ``/v1``.
    """

    app = FastAPI()
    register_problem_handlers(app)
    install_auth(app, settings=settings)
    app.include_router(moderation_router)
    return app


def test_missing_bearer_returns_401(test_settings) -> None:
    app = _build_app(test_settings)
    with TestClient(app) as client:
        response = client.get("/admin/moderation/listings")
    assert response.status_code == 401
    assert response.headers["content-type"].startswith("application/problem+json")


def test_non_admin_scope_returns_403(test_settings, hs256_jwt_factory) -> None:
    token = hs256_jwt_factory(scopes=["mcp:read"])
    app = _build_app(test_settings)
    with TestClient(app) as client:
        response = client.get(
            "/admin/moderation/listings",
            headers={"authorization": f"Bearer {token}"},
        )
    assert response.status_code == 403
    assert response.headers["content-type"].startswith("application/problem+json")
    body = response.json()
    assert body["status"] == 403
    assert "admin" in body["detail"].lower()


def test_broad_admin_scope_passes_gate(
    test_settings, hs256_jwt_factory, fake_admin_pool
) -> None:
    """A caller with the ``admin`` scope gets past the dependency.

    The underlying query still runs; we pin the fake pool to return an
    empty queue so the request reaches 200 end-to-end.
    """

    conn = fake_admin_pool._test_conn
    conn.fetch.return_value = []
    conn.fetchrow.return_value = {"total": 0}

    token = hs256_jwt_factory(scopes=["admin"])
    app = _build_app(test_settings)
    with TestClient(app) as client:
        response = client.get(
            "/admin/moderation/listings",
            headers={"authorization": f"Bearer {token}"},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 0
    assert body["items"] == []


def test_narrow_admin_moderation_scope_passes_gate(
    test_settings, hs256_jwt_factory, fake_admin_pool
) -> None:
    conn = fake_admin_pool._test_conn
    conn.fetch.return_value = []
    conn.fetchrow.return_value = {"total": 0}

    token = hs256_jwt_factory(scopes=["admin:moderation"])
    app = _build_app(test_settings)
    with TestClient(app) as client:
        response = client.get(
            "/admin/moderation/listings",
            headers={"authorization": f"Bearer {token}"},
        )
    assert response.status_code == 200
