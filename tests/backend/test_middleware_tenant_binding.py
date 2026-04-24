"""TenantBindingMiddleware tests.

Covers:
- Tenant id is copied from ``request.state.auth`` to
  ``request.state.tenant_id``.
- Public paths bypass the binding.
- Cross-tenant admin paths bypass the binding.
- Missing principal on a tenant-scoped route yields 403.
"""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from src.backend.config import Settings
from src.backend.errors import register_problem_handlers
from src.backend.middleware.auth import install_auth
from src.backend.middleware.tenant_binding import install_tenant_binding


def _build_full_stack(settings: Settings) -> FastAPI:
    app = FastAPI()
    register_problem_handlers(app)
    install_tenant_binding(app)
    install_auth(app, settings=settings)

    @app.get("/v1/scoped")
    async def scoped(request: Request) -> dict:
        return {
            "tenant_id": getattr(request.state, "tenant_id", None),
            "auth_tenant_id": request.state.auth.tenant_id,
        }

    @app.get("/v1/admin/overview")
    async def admin_overview(request: Request) -> dict:
        return {"tenant_id": getattr(request.state, "tenant_id", None)}

    @app.get("/admin/console")
    async def admin_console(request: Request) -> dict:
        return {"tenant_id": getattr(request.state, "tenant_id", None)}

    @app.get("/healthz")
    async def healthz() -> dict:
        return {"status": "ok"}

    return app


def test_tenant_binding_copies_from_auth(
    test_settings: Settings,
    hs256_jwt_factory,
) -> None:
    app = _build_full_stack(test_settings)
    token = hs256_jwt_factory(tenant_id="cccccccc-cccc-7ccc-8ccc-cccccccccccc")
    with TestClient(app) as client:
        response = client.get(
            "/v1/scoped",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["tenant_id"] == "cccccccc-cccc-7ccc-8ccc-cccccccccccc"
    assert body["auth_tenant_id"] == body["tenant_id"]


def test_tenant_binding_skips_public_paths(test_settings: Settings) -> None:
    app = _build_full_stack(test_settings)
    with TestClient(app) as client:
        response = client.get("/healthz")
    assert response.status_code == 200


def test_admin_prefix_skips_tenant_binding(
    test_settings: Settings,
    hs256_jwt_factory,
) -> None:
    """``/admin/*`` paths are cross-tenant by design (Eunomia)."""

    app = _build_full_stack(test_settings)
    token = hs256_jwt_factory(tenant_id="dddddddd-dddd-7ddd-8ddd-dddddddddddd")
    with TestClient(app) as client:
        response = client.get(
            "/admin/console",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert response.status_code == 200
    # Without tenant binding the state attribute is never set.
    assert response.json()["tenant_id"] is None


def test_missing_principal_returns_403(test_settings: Settings) -> None:
    """If someone wires TenantBinding without AuthMiddleware in front of
    a non-public route, we should 403 rather than silently proceed.

    We simulate that configuration by installing only tenant binding
    (skipping auth) and hitting a non-public route.
    """

    app = FastAPI()
    register_problem_handlers(app)
    install_tenant_binding(app)

    @app.get("/v1/leaky")
    async def leaky(request: Request) -> dict:
        return {"tenant_id": getattr(request.state, "tenant_id", None)}

    with TestClient(app) as client:
        response = client.get("/v1/leaky")
    assert response.status_code == 403
    body = response.json()
    assert body["type"].endswith("/forbidden")
