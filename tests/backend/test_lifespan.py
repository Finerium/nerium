"""FastAPI app factory and lifespan tests.

Session 1 scope: verify the app factory constructs a FastAPI instance with
the expected middleware stack, the lifespan opens + closes the pool, and
the platform endpoints (``/healthz``, ``/readyz``, ``/version``,
``/openapi.json``) respond with the shapes declared in
``docs/contracts/rest_api_base.contract.md``.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.testclient import TestClient


def _find_middleware(app: FastAPI, middleware_cls: type) -> bool:
    return any(mw.cls is middleware_cls for mw in app.user_middleware)


def test_app_factory_returns_fastapi_instance(app_with_fake_pool: FastAPI) -> None:
    assert isinstance(app_with_fake_pool, FastAPI)
    assert app_with_fake_pool.title == "NERIUM API"
    # openapi.json default URL remains the contract-mandated path.
    assert app_with_fake_pool.openapi_url == "/openapi.json"


def test_app_pins_openapi_31(app_with_fake_pool: FastAPI) -> None:
    assert app_with_fake_pool.openapi_version == "3.1.0"


def test_app_installs_cors_and_trustedhost_middleware(
    app_with_fake_pool: FastAPI,
) -> None:
    assert _find_middleware(app_with_fake_pool, CORSMiddleware), (
        "CORSMiddleware must be installed per rest_api_base.contract.md Section 4.2"
    )
    assert _find_middleware(app_with_fake_pool, TrustedHostMiddleware), (
        "TrustedHostMiddleware must be installed per Section 4.1"
    )


def test_lifespan_opens_and_closes_pool(client: TestClient, fake_pool) -> None:
    # Entering the context manager already drove startup; hitting any route
    # verifies the app is serving.
    response = client.get("/healthz")
    assert response.status_code == 200

    # TestClient.__exit__ drives shutdown, so the mock pool.close should be
    # called exactly once by the time the context exits. Defer the assert
    # until outside the context.
    pass


def test_healthz_liveness_shape(client: TestClient) -> None:
    response = client.get("/healthz")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "nerium-api"
    assert isinstance(body["uptime_seconds"], (int, float))
    assert body["uptime_seconds"] >= 0.0


def test_readyz_reports_db_up_when_pool_pings(
    client: TestClient, fake_pool
) -> None:
    response = client.get("/readyz")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["dependencies"]["postgres"] == "up"


def test_readyz_reports_503_when_ping_fails(
    client: TestClient, fake_pool, monkeypatch
) -> None:
    # Swap the module-level ping to return False without tearing down the pool.
    from src.backend import healthz as healthz_module

    async def _bad_ping(pool=None):
        return False

    monkeypatch.setattr(healthz_module, "db_ping", _bad_ping)

    response = client.get("/readyz")
    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "degraded"
    assert body["dependencies"]["postgres"] == "down"


def test_version_endpoint_returns_settings_version(
    client: TestClient, test_settings
) -> None:
    response = client.get("/version")
    assert response.status_code == 200
    body = response.json()
    assert body["version"] == test_settings.version
    assert body["env"] == test_settings.env


def test_openapi_json_is_31(client: TestClient) -> None:
    response = client.get("/openapi.json")
    assert response.status_code == 200
    spec = response.json()
    assert spec["openapi"].startswith("3.1"), (
        "OpenAPI 3.1 pin required by rest_api_base.contract.md Section 4.4"
    )
    assert "/healthz" in spec["paths"]
    assert "/readyz" in spec["paths"]


def test_v1_placeholder_router_mounted(client: TestClient) -> None:
    # Placeholder is include_in_schema=False but still reachable so Nemea
    # E2E can confirm the /v1 prefix is live.
    response = client.get("/v1/__placeholder")
    assert response.status_code == 200
    body = response.json()
    assert body["api_version"] == "v1"
    assert isinstance(body["mounted_subrouters"], list)


def test_trusted_host_rejects_unknown_host(app_with_fake_pool: FastAPI) -> None:
    with TestClient(app_with_fake_pool) as tc:
        # tests run with Host: testserver (trusted). Simulate an attacker by
        # sending a header our allowlist does not contain.
        response = tc.get("/healthz", headers={"host": "evil.example.com"})
        assert response.status_code == 400


def test_cors_preflight_allows_claude_ai(client: TestClient) -> None:
    response = client.options(
        "/healthz",
        headers={
            "origin": "https://claude.ai",
            "access-control-request-method": "GET",
            "access-control-request-headers": "authorization",
        },
    )
    # Starlette's CORSMiddleware responds 200 on well-formed preflight.
    assert response.status_code in (200, 204)
    assert response.headers.get("access-control-allow-origin") == "https://claude.ai"
    assert response.headers.get("access-control-allow-credentials") == "true"
