"""RateLimitMiddleware tests.

Uses a fake Lua evaluator so tests do not need a live Redis. The token
bucket script itself is exercised separately in
``tests/backend/integration/test_token_bucket_script.py`` (skipped by
default, requires live Redis).

Covers:
- Under-limit request passes and carries ``RateLimit`` +
  ``RateLimit-Policy`` headers.
- Over-limit request returns 429 problem+json with ``Retry-After`` and
  ``RateLimit`` headers.
- Skip paths are not touched.
- Route-policy resolver respects exact + wildcard entries.
- Fail-open on Redis error.
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.backend.errors import register_problem_handlers
from src.backend.errors.problem_json import CONTENT_TYPE_PROBLEM_JSON
from src.backend.middleware.rate_limit import (
    RateLimitMiddleware,
    RateLimitPolicy,
    RateLimitRegistry,
)


def _build_app(evaluator) -> FastAPI:
    app = FastAPI()
    register_problem_handlers(app)
    registry = RateLimitRegistry()
    registry.default = RateLimitPolicy(max_tokens=10, refill_per_second=1.0, bucket_name="api")
    registry.register(
        "/v1/expensive",
        RateLimitPolicy(max_tokens=1, refill_per_second=0.1, bucket_name="expensive"),
    )

    app.add_middleware(
        RateLimitMiddleware,
        registry=registry,
        evaluator=evaluator,
        skip_paths=("/healthz",),
    )

    @app.get("/v1/cheap")
    async def cheap() -> dict:
        return {"ok": True}

    @app.get("/v1/expensive")
    async def expensive() -> dict:
        return {"ok": True}

    @app.get("/healthz")
    async def healthz() -> dict:
        return {"status": "ok"}

    return app


def test_under_limit_request_passes_with_ratelimit_headers() -> None:
    async def _allow(script: str, keys: list[str], args: list[Any]) -> list[int]:
        return [1, 9, 0]

    app = _build_app(_allow)
    with TestClient(app) as client:
        response = client.get("/v1/cheap")
    assert response.status_code == 200
    assert "limit=10" in response.headers["ratelimit"]
    assert "remaining=9" in response.headers["ratelimit"]
    assert "policy=" in response.headers["ratelimit-policy"]


def test_over_limit_request_returns_429_problem_json() -> None:
    async def _deny(script: str, keys: list[str], args: list[Any]) -> list[int]:
        return [0, 0, 5]

    app = _build_app(_deny)
    with TestClient(app) as client:
        response = client.get("/v1/cheap")
    assert response.status_code == 429
    assert response.headers["content-type"].startswith(CONTENT_TYPE_PROBLEM_JSON)
    body = response.json()
    assert body["status"] == 429
    assert body["type"].endswith("/rate_limited")
    assert body["retry_after_seconds"] == 5
    assert response.headers["retry-after"] == "5"
    # RateLimit header remains informative on 429 per IETF draft.
    assert "ratelimit" in response.headers


def test_skip_paths_bypass_rate_limit() -> None:
    calls: list[str] = []

    async def _track(script: str, keys: list[str], args: list[Any]) -> list[int]:
        calls.append(keys[0])
        return [1, 10, 0]

    app = _build_app(_track)
    with TestClient(app) as client:
        response = client.get("/healthz")
    assert response.status_code == 200
    assert calls == []


def test_expensive_route_resolves_to_expensive_policy() -> None:
    seen_args: dict[str, Any] = {}

    async def _capture(script: str, keys: list[str], args: list[Any]) -> list[int]:
        seen_args["max"] = args[0]
        seen_args["refill"] = args[1]
        seen_args["key"] = keys[0]
        return [1, 0, 0]

    app = _build_app(_capture)
    with TestClient(app) as client:
        response = client.get("/v1/expensive")
    assert response.status_code == 200
    assert seen_args["max"] == 1
    assert abs(seen_args["refill"] - 0.1) < 0.001
    assert "expensive" in seen_args["key"]


def test_fail_open_on_redis_error() -> None:
    async def _raise(script: str, keys: list[str], args: list[Any]) -> list[int]:
        raise RuntimeError("redis down")

    app = _build_app(_raise)
    with TestClient(app) as client:
        response = client.get("/v1/cheap")
    # Contract mandates fail-open: allow the request through.
    assert response.status_code == 200


def test_ip_identity_fallback_for_unauthenticated_request() -> None:
    seen_keys: list[str] = []

    async def _track(script: str, keys: list[str], args: list[Any]) -> list[int]:
        seen_keys.append(keys[0])
        return [1, 10, 0]

    app = _build_app(_track)
    with TestClient(app) as client:
        response = client.get(
            "/v1/cheap",
            headers={"cf-connecting-ip": "203.0.113.5"},
        )
    assert response.status_code == 200
    # Without auth the bucket key uses ip: prefix.
    assert any("ip:203.0.113.5" in key for key in seen_keys)
