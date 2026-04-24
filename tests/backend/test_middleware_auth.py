"""AuthMiddleware unit tests.

Covers:
- Missing ``Authorization`` header yields 401 problem+json.
- Invalid scheme (non-Bearer) yields 401.
- Invalid JWT yields 401.
- Valid JWT populates ``request.state.auth`` with the expected principal.
- Public allowlist bypasses auth entirely.
- Pluggable verifier injection works.
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from src.backend.config import Settings
from src.backend.errors import register_problem_handlers
from src.backend.errors.problem_json import CONTENT_TYPE_PROBLEM_JSON
from src.backend.middleware.auth import (
    AuthPrincipal,
    install_auth,
)


def _build_app(settings: Settings, verifier: Any = None) -> FastAPI:
    app = FastAPI()
    register_problem_handlers(app)
    install_auth(app, settings=settings, verifier=verifier)

    @app.get("/v1/private")
    async def private(request: Request) -> dict:
        return {
            "user_id": request.state.auth.user_id,
            "tenant_id": request.state.auth.tenant_id,
            "scopes": sorted(request.state.auth.scopes),
        }

    @app.get("/healthz")
    async def healthz() -> dict:
        return {"status": "ok"}

    return app


def test_public_endpoint_bypasses_auth(test_settings: Settings) -> None:
    app = _build_app(test_settings)
    with TestClient(app) as client:
        response = client.get("/healthz")
    assert response.status_code == 200


def test_missing_authorization_header_returns_401(test_settings: Settings) -> None:
    app = _build_app(test_settings)
    with TestClient(app) as client:
        response = client.get("/v1/private")
    assert response.status_code == 401
    assert response.headers["content-type"].startswith(CONTENT_TYPE_PROBLEM_JSON)
    body = response.json()
    assert body["status"] == 401
    assert body["type"].endswith("/unauthorized")
    assert response.headers.get("www-authenticate", "").lower().startswith("bearer")


def test_non_bearer_scheme_returns_401(test_settings: Settings) -> None:
    app = _build_app(test_settings)
    with TestClient(app) as client:
        response = client.get(
            "/v1/private",
            headers={"Authorization": "Basic dXNlcjpwYXNz"},
        )
    assert response.status_code == 401


def test_invalid_jwt_returns_401(test_settings: Settings) -> None:
    app = _build_app(test_settings)
    with TestClient(app) as client:
        response = client.get(
            "/v1/private",
            headers={"Authorization": "Bearer not-a-real-jwt"},
        )
    assert response.status_code == 401


def test_valid_jwt_populates_principal(
    test_settings: Settings,
    hs256_jwt_factory,
) -> None:
    app = _build_app(test_settings)
    token = hs256_jwt_factory(
        user_id="aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa",
        tenant_id="bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb",
        scopes=["read:listings", "write:listings"],
    )
    with TestClient(app) as client:
        response = client.get(
            "/v1/private",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["user_id"] == "aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa"
    assert body["tenant_id"] == "bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb"
    assert body["scopes"] == ["read:listings", "write:listings"]


def test_pluggable_verifier_is_used(test_settings: Settings) -> None:
    sentinel = AuthPrincipal(
        user_id="sentinel-user",
        tenant_id="sentinel-tenant",
        scopes=frozenset({"sentinel"}),
    )

    def _injected_verifier(token: str, settings: Settings) -> AuthPrincipal:
        assert token == "anything"
        return sentinel

    app = _build_app(test_settings, verifier=_injected_verifier)
    with TestClient(app) as client:
        response = client.get(
            "/v1/private",
            headers={"Authorization": "Bearer anything"},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["user_id"] == "sentinel-user"
    assert body["scopes"] == ["sentinel"]


def test_openapi_spec_path_is_public(test_settings: Settings) -> None:
    """``/openapi.json`` must be reachable for Nemea E2E + dev UX."""

    app = _build_app(test_settings)
    with TestClient(app) as client:
        response = client.get("/openapi.json")
    assert response.status_code == 200


def test_preflight_options_is_not_blocked(test_settings: Settings) -> None:
    app = _build_app(test_settings)
    with TestClient(app) as client:
        response = client.options(
            "/v1/private",
            headers={
                "origin": "https://claude.ai",
                "access-control-request-method": "GET",
            },
        )
    # Without CORS middleware the OPTIONS request falls through to the
    # route's default handler; the point of this test is that auth MUST
    # NOT turn the preflight into a 401. Starlette responds 405 in the
    # absence of an explicit OPTIONS route.
    assert response.status_code != 401
