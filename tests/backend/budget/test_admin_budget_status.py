"""Tests for ``GET /v1/admin/budget/status``.

Owner: Moros (W2 NP P3 S1).

Covers:

- Happy path: Redis fully populated -> endpoint returns the full shape.
- Fresh deploy: no ``chronos:last_poll`` hash -> zeros + ``last_poll_at``
  is None (no 500).
- Degraded: ``chronos:last_error`` present -> surfaced on the response.
- Auth: missing bearer returns 401; wrong-scope returns 403; admin scope
  passes.
- Redis outage: 503 problem+json.
"""

from __future__ import annotations

from typing import Callable, Iterator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.backend.budget.redis_keys import (
    CONSECUTIVE_FAILURES,
    GLOBAL_AUTO_DISABLED_FLAG,
    GLOBAL_CAP_FLAG,
    LAST_ERROR,
    LAST_POLL_HASH,
    LAST_RECONCILE_TS,
)
from src.backend.config import Settings
from src.backend.errors import register_problem_handlers
from src.backend.middleware.auth import install_auth
from src.backend.routers.v1.admin.budget import router as budget_router


@pytest.fixture
def budget_admin_app(test_settings: Settings) -> FastAPI:
    """Minimal app exposing only the budget status route + AuthMiddleware.

    No tenant-binding (admin endpoints live in the cross-tenant surface)
    + no rate limit (we are asserting on the handler directly).
    """

    app = FastAPI()
    register_problem_handlers(app)
    install_auth(app, settings=test_settings)
    app.include_router(budget_router, prefix="/v1")
    return app


def _bind_fake_redis(monkeypatch, fake_redis) -> None:
    """Install the conftest ``FakeRedis`` as the process-wide client."""

    monkeypatch.setattr(
        "src.backend.routers.v1.admin.budget.get_redis_client",
        lambda: fake_redis,
    )


def _seed_populated(fake_redis) -> None:
    """Write a realistic post-poll snapshot into the fake Redis."""

    fake_redis.hashes[LAST_POLL_HASH] = {
        "cycle_id": "cycle-123",
        "mtd_usd": "42.50",
        "daily_usd": "7.25",
        "buckets_seen": "24",
        "poll_duration_ms": "412",
        "ts": "2026-04-24T12:00:00Z",
        "decision_kind": "none",
        "decision_pct": "7.2500",
    }
    fake_redis.strings[LAST_RECONCILE_TS] = "2026-04-24T12:00:00Z"
    fake_redis.strings[CONSECUTIVE_FAILURES] = "0"


def test_budget_status_requires_auth(budget_admin_app: FastAPI) -> None:
    """Missing bearer -> 401 problem+json."""

    with TestClient(budget_admin_app) as client:
        resp = client.get("/v1/admin/budget/status")
    assert resp.status_code == 401


def test_budget_status_wrong_scope_forbidden(
    budget_admin_app: FastAPI, hs256_jwt_factory: Callable[..., str]
) -> None:
    """Non-admin scope -> 403."""

    token = hs256_jwt_factory(scopes=["read:self"])
    with TestClient(budget_admin_app) as client:
        resp = client.get(
            "/v1/admin/budget/status",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 403


def test_budget_status_admin_scope_passes(
    budget_admin_app: FastAPI,
    hs256_jwt_factory: Callable[..., str],
    monkeypatch,
    fake_redis,
) -> None:
    """Broad ``admin`` scope returns the full shape with populated state."""

    _bind_fake_redis(monkeypatch, fake_redis)
    _seed_populated(fake_redis)

    token = hs256_jwt_factory(scopes=["admin"])
    with TestClient(budget_admin_app) as client:
        resp = client.get(
            "/v1/admin/budget/status",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["mtd_usd"] == pytest.approx(42.50)
    assert body["daily_usd"] == pytest.approx(7.25)
    assert body["cycle_id"] == "cycle-123"
    assert body["ma_capped"] is False
    assert body["auto_disabled"] is False
    assert body["last_poll_at"] == "2026-04-24T12:00:00Z"
    assert body["consecutive_failures"] == 0
    assert body["poll_interval_seconds"] > 0
    # next_poll_at = last_poll_at + interval.
    assert body["next_poll_at"] is not None


def test_budget_status_narrow_scope_passes(
    budget_admin_app: FastAPI,
    hs256_jwt_factory: Callable[..., str],
    monkeypatch,
    fake_redis,
) -> None:
    """``admin:budget`` pillar scope is also accepted."""

    _bind_fake_redis(monkeypatch, fake_redis)
    _seed_populated(fake_redis)

    token = hs256_jwt_factory(scopes=["admin:budget"])
    with TestClient(budget_admin_app) as client:
        resp = client.get(
            "/v1/admin/budget/status",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 200


def test_budget_status_fresh_deploy_no_poll_yet(
    budget_admin_app: FastAPI,
    hs256_jwt_factory: Callable[..., str],
    monkeypatch,
    fake_redis,
) -> None:
    """No Redis state (never polled) -> 200 with zeros + last_poll_at=None."""

    _bind_fake_redis(monkeypatch, fake_redis)

    token = hs256_jwt_factory(scopes=["admin"])
    with TestClient(budget_admin_app) as client:
        resp = client.get(
            "/v1/admin/budget/status",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["mtd_usd"] == 0.0
    assert body["daily_usd"] == 0.0
    assert body["last_poll_at"] is None
    assert body["next_poll_at"] is None
    assert body["consecutive_failures"] == 0
    assert body["cycle_id"] is None
    assert body["ma_capped"] is False


def test_budget_status_degraded_surfaces_last_error(
    budget_admin_app: FastAPI,
    hs256_jwt_factory: Callable[..., str],
    monkeypatch,
    fake_redis,
) -> None:
    """``chronos:last_error`` + failure counter surface on the response."""

    _bind_fake_redis(monkeypatch, fake_redis)
    fake_redis.strings[LAST_ERROR] = "HTTPStatusError: 429 rate_limited"
    fake_redis.strings[CONSECUTIVE_FAILURES] = "3"
    fake_redis.strings[GLOBAL_CAP_FLAG] = "1"
    fake_redis.strings[GLOBAL_AUTO_DISABLED_FLAG] = "1"

    token = hs256_jwt_factory(scopes=["admin"])
    with TestClient(budget_admin_app) as client:
        resp = client.get(
            "/v1/admin/budget/status",
            headers={"Authorization": f"Bearer {token}"},
        )
    body = resp.json()
    assert resp.status_code == 200
    assert body["last_error"] == "HTTPStatusError: 429 rate_limited"
    assert body["consecutive_failures"] == 3
    assert body["ma_capped"] is True
    assert body["auto_disabled"] is True


def test_budget_status_redis_outage_returns_503(
    budget_admin_app: FastAPI,
    hs256_jwt_factory: Callable[..., str],
    monkeypatch,
    fake_redis,
) -> None:
    """Redis read error -> 503 problem+json."""

    _bind_fake_redis(monkeypatch, fake_redis)

    async def _boom(*args, **kwargs):
        raise RuntimeError("redis dead")

    fake_redis.hgetall = _boom  # type: ignore[attr-defined]

    token = hs256_jwt_factory(scopes=["admin"])
    with TestClient(budget_admin_app) as client:
        resp = client.get(
            "/v1/admin/budget/status",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 503
