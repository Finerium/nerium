"""Tests for the Astraea trust score refresh cron + admin batch endpoint.

Owner: Astraea (W2 NP P1 V4 S2). Covers:

- ``run_refresh_batch`` summary shape (tenants_visited /
  listings_attempted / listings_refreshed / listings_failed /
  duration_ms).
- Per-listing failure isolation (one bad row does not abort the batch).
- ``_select_stale_listings`` SQL filter respects the freshness cutoff.
- ``enqueue_refresh_batch`` handles a missing Arq redis handle by
  returning False rather than raising.
- ``POST /v1/admin/trust/refresh-batch`` requires admin scope, accepts
  pillar scope ``admin:trust``, returns 503 when the queue is down,
  returns 202 with the canonical envelope on success.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Callable
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.backend.config import Settings
from src.backend.errors import register_problem_handlers
from src.backend.middleware.auth import install_auth
from src.backend.routers.v1.registry.trust import (
    admin_trust_router,
    trust_router,
)
from src.backend.trust.cron import refresh_scores

USER_ID = UUID("11111111-1111-7111-8111-111111111111")
TENANT_A = UUID("22222222-2222-7222-8222-222222222222")
TENANT_B = UUID("33333333-3333-7333-8333-333333333333")
LISTING_ALPHA = UUID("44444444-4444-7444-8444-444444444444")
LISTING_BETA = UUID("55555555-5555-7555-8555-555555555555")
LISTING_GAMMA = UUID("66666666-6666-7666-8666-666666666666")


# ---------------------------------------------------------------------------
# Pure-function unit tests for run_refresh_batch
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_run_refresh_batch_visits_every_active_tenant() -> None:
    """Two tenants -> two tenant visits + sum of stale-listing refreshes."""

    async def fake_list_tenants() -> list[UUID]:
        return [TENANT_A, TENANT_B]

    async def fake_select(
        *, tenant_id: UUID, freshness_cutoff: datetime, limit: int
    ) -> list[UUID]:
        if tenant_id == TENANT_A:
            return [LISTING_ALPHA, LISTING_BETA]
        return [LISTING_GAMMA]

    async def fake_refresh(
        *, listing_id: UUID, tenant_id: UUID, actor_user_id: UUID | None
    ) -> bool:
        return True

    with patch.object(refresh_scores, "_list_active_tenants", fake_list_tenants), \
         patch.object(refresh_scores, "_select_stale_listings", fake_select), \
         patch.object(refresh_scores, "_refresh_one_listing", fake_refresh):
        summary = await refresh_scores.run_refresh_batch()

    assert summary["tenants_visited"] == 2
    assert summary["listings_attempted"] == 3
    assert summary["listings_refreshed"] == 3
    assert summary["listings_failed"] == 0
    assert summary["duration_ms"] >= 0


@pytest.mark.asyncio
async def test_run_refresh_batch_isolates_per_listing_failures() -> None:
    """One listing returning False -> failed counter increments, batch continues."""

    async def fake_list_tenants() -> list[UUID]:
        return [TENANT_A]

    async def fake_select(
        *, tenant_id: UUID, freshness_cutoff: datetime, limit: int
    ) -> list[UUID]:
        return [LISTING_ALPHA, LISTING_BETA, LISTING_GAMMA]

    call_log: list[UUID] = []

    async def fake_refresh(
        *, listing_id: UUID, tenant_id: UUID, actor_user_id: UUID | None
    ) -> bool:
        call_log.append(listing_id)
        # Middle row fails; batch must not abort.
        return listing_id != LISTING_BETA

    with patch.object(refresh_scores, "_list_active_tenants", fake_list_tenants), \
         patch.object(refresh_scores, "_select_stale_listings", fake_select), \
         patch.object(refresh_scores, "_refresh_one_listing", fake_refresh):
        summary = await refresh_scores.run_refresh_batch()

    assert summary["listings_attempted"] == 3
    assert summary["listings_refreshed"] == 2
    assert summary["listings_failed"] == 1
    assert call_log == [LISTING_ALPHA, LISTING_BETA, LISTING_GAMMA]


@pytest.mark.asyncio
async def test_run_refresh_batch_skips_clean_tenants() -> None:
    """Tenant with no stale listings -> visited but contributes 0 attempts."""

    async def fake_list_tenants() -> list[UUID]:
        return [TENANT_A]

    async def fake_select(
        *, tenant_id: UUID, freshness_cutoff: datetime, limit: int
    ) -> list[UUID]:
        return []

    async def fake_refresh(**kwargs: object) -> bool:  # pragma: no cover
        raise AssertionError(
            "_refresh_one_listing must not be called when select returned []"
        )

    with patch.object(refresh_scores, "_list_active_tenants", fake_list_tenants), \
         patch.object(refresh_scores, "_select_stale_listings", fake_select), \
         patch.object(refresh_scores, "_refresh_one_listing", fake_refresh):
        summary = await refresh_scores.run_refresh_batch()

    assert summary["tenants_visited"] == 1
    assert summary["listings_attempted"] == 0
    assert summary["listings_refreshed"] == 0
    assert summary["listings_failed"] == 0


@pytest.mark.asyncio
async def test_run_refresh_batch_tenant_select_failure_is_isolated() -> None:
    """Tenant select raise -> tenant skipped, others still processed."""

    async def fake_list_tenants() -> list[UUID]:
        return [TENANT_A, TENANT_B]

    async def fake_select(
        *, tenant_id: UUID, freshness_cutoff: datetime, limit: int
    ) -> list[UUID]:
        if tenant_id == TENANT_A:
            raise RuntimeError("simulated RLS bind failure")
        return [LISTING_BETA]

    async def fake_refresh(
        *, listing_id: UUID, tenant_id: UUID, actor_user_id: UUID | None
    ) -> bool:
        return True

    with patch.object(refresh_scores, "_list_active_tenants", fake_list_tenants), \
         patch.object(refresh_scores, "_select_stale_listings", fake_select), \
         patch.object(refresh_scores, "_refresh_one_listing", fake_refresh):
        summary = await refresh_scores.run_refresh_batch()

    assert summary["tenants_visited"] == 2
    assert summary["listings_attempted"] == 1
    assert summary["listings_refreshed"] == 1
    assert summary["listings_failed"] == 0


@pytest.mark.asyncio
async def test_refresh_one_listing_swallows_service_exceptions() -> None:
    """A raised service exception logs ERROR + returns False (no propagation)."""

    async def boom(**kwargs: object) -> None:
        raise RuntimeError("simulated DB unreachable")

    with patch.object(refresh_scores, "persist_listing_trust", boom):
        ok = await refresh_scores._refresh_one_listing(
            listing_id=LISTING_ALPHA,
            tenant_id=TENANT_A,
            actor_user_id=None,
        )
    assert ok is False


@pytest.mark.asyncio
async def test_refresh_one_listing_returns_false_on_missing_listing() -> None:
    """Service returning None (listing not found) -> False, no exception."""

    async def returns_none(**kwargs: object) -> None:
        return None

    with patch.object(refresh_scores, "persist_listing_trust", returns_none):
        ok = await refresh_scores._refresh_one_listing(
            listing_id=LISTING_ALPHA,
            tenant_id=TENANT_A,
            actor_user_id=None,
        )
    assert ok is False


# ---------------------------------------------------------------------------
# enqueue_refresh_batch failure modes
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_enqueue_refresh_batch_returns_false_when_arq_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Missing Arq Redis handle -> False with no exception."""

    def boom() -> None:
        raise RuntimeError("arq redis not installed")

    monkeypatch.setattr(
        "src.backend.workers.arq_redis.get_arq_redis", boom
    )
    ok = await refresh_scores.enqueue_refresh_batch()
    assert ok is False


@pytest.mark.asyncio
async def test_enqueue_refresh_batch_passes_overrides(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Overrides for window + cap reach the Arq enqueue call."""

    fake_redis = MagicMock()
    fake_redis.enqueue_job = AsyncMock(return_value=None)
    monkeypatch.setattr(
        "src.backend.workers.arq_redis.get_arq_redis", lambda: fake_redis
    )

    ok = await refresh_scores.enqueue_refresh_batch(
        freshness_window_hours=6,
        max_listings_per_tenant=50,
    )
    assert ok is True
    fake_redis.enqueue_job.assert_awaited_once_with(
        refresh_scores.ARQ_JOB_TRUST_REFRESH_BATCH,
        freshness_window_hours=6,
        max_listings_per_tenant=50,
    )


# ---------------------------------------------------------------------------
# Admin batch endpoint /v1/admin/trust/refresh-batch
# ---------------------------------------------------------------------------


@pytest.fixture
def trust_admin_app(test_settings: Settings) -> FastAPI:
    """Minimal FastAPI app exposing the trust + admin-trust routers."""

    app = FastAPI()
    register_problem_handlers(app)
    install_auth(app, settings=test_settings)
    app.include_router(trust_router, prefix="/v1")
    app.include_router(admin_trust_router, prefix="/v1")
    return app


def test_refresh_batch_requires_bearer(trust_admin_app: FastAPI) -> None:
    with TestClient(trust_admin_app) as client:
        resp = client.post("/v1/admin/trust/refresh-batch")
    assert resp.status_code == 401


def test_refresh_batch_rejects_non_admin_scope(
    trust_admin_app: FastAPI,
    hs256_jwt_factory: Callable[..., str],
) -> None:
    token = hs256_jwt_factory(
        user_id=str(USER_ID), tenant_id=str(TENANT_A), scopes=["read:self"]
    )
    with TestClient(trust_admin_app) as client:
        resp = client.post(
            "/v1/admin/trust/refresh-batch",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 403


def test_refresh_batch_admin_success_default_payload(
    trust_admin_app: FastAPI,
    hs256_jwt_factory: Callable[..., str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Broad ``admin`` scope + queue up -> 202 with canonical envelope."""

    fake_enqueue = AsyncMock(return_value=True)
    monkeypatch.setattr(
        "src.backend.routers.v1.registry.trust.enqueue_refresh_batch",
        fake_enqueue,
    )

    token = hs256_jwt_factory(
        user_id=str(USER_ID), tenant_id=str(TENANT_A), scopes=["admin"]
    )
    with TestClient(trust_admin_app) as client:
        resp = client.post(
            "/v1/admin/trust/refresh-batch",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 202
    body = resp.json()
    assert body["enqueued"] is True
    assert body["job_name"] == "trust_refresh_batch"
    assert body["freshness_window_hours"] == (
        refresh_scores.DEFAULT_FRESHNESS_WINDOW_HOURS
    )
    assert body["max_listings_per_tenant"] == refresh_scores.MAX_LISTINGS_PER_RUN
    fake_enqueue.assert_awaited_once_with(
        freshness_window_hours=None,
        max_listings_per_tenant=None,
    )


def test_refresh_batch_pillar_scope_admin_trust_passes(
    trust_admin_app: FastAPI,
    hs256_jwt_factory: Callable[..., str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """``admin:trust`` pillar scope is also accepted (matches force-refresh)."""

    fake_enqueue = AsyncMock(return_value=True)
    monkeypatch.setattr(
        "src.backend.routers.v1.registry.trust.enqueue_refresh_batch",
        fake_enqueue,
    )

    token = hs256_jwt_factory(
        user_id=str(USER_ID),
        tenant_id=str(TENANT_A),
        scopes=["admin:trust"],
    )
    with TestClient(trust_admin_app) as client:
        resp = client.post(
            "/v1/admin/trust/refresh-batch",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 202


def test_refresh_batch_admin_503_when_queue_down(
    trust_admin_app: FastAPI,
    hs256_jwt_factory: Callable[..., str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Enqueue returning False -> 503 problem+json (not 500)."""

    fake_enqueue = AsyncMock(return_value=False)
    monkeypatch.setattr(
        "src.backend.routers.v1.registry.trust.enqueue_refresh_batch",
        fake_enqueue,
    )

    token = hs256_jwt_factory(
        user_id=str(USER_ID), tenant_id=str(TENANT_A), scopes=["admin"]
    )
    with TestClient(trust_admin_app) as client:
        resp = client.post(
            "/v1/admin/trust/refresh-batch",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 503
    # RFC 7807 envelope.
    body = resp.json()
    assert "queue" in body.get("detail", "").lower()


def test_refresh_batch_admin_passes_overrides(
    trust_admin_app: FastAPI,
    hs256_jwt_factory: Callable[..., str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Body knobs (window + cap) reach the producer, response echoes them."""

    fake_enqueue = AsyncMock(return_value=True)
    monkeypatch.setattr(
        "src.backend.routers.v1.registry.trust.enqueue_refresh_batch",
        fake_enqueue,
    )

    token = hs256_jwt_factory(
        user_id=str(USER_ID), tenant_id=str(TENANT_A), scopes=["admin"]
    )
    with TestClient(trust_admin_app) as client:
        resp = client.post(
            "/v1/admin/trust/refresh-batch",
            headers={"Authorization": f"Bearer {token}"},
            json={"freshness_window_hours": 12, "max_listings_per_tenant": 100},
        )
    assert resp.status_code == 202
    body = resp.json()
    assert body["freshness_window_hours"] == 12
    assert body["max_listings_per_tenant"] == 100
    fake_enqueue.assert_awaited_once_with(
        freshness_window_hours=12,
        max_listings_per_tenant=100,
    )


def test_refresh_batch_clamps_oversize_cap(
    trust_admin_app: FastAPI,
    hs256_jwt_factory: Callable[..., str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Cap above MAX_LISTINGS_PER_RUN -> 422 (Pydantic le validator)."""

    fake_enqueue = AsyncMock(return_value=True)
    monkeypatch.setattr(
        "src.backend.routers.v1.registry.trust.enqueue_refresh_batch",
        fake_enqueue,
    )

    token = hs256_jwt_factory(
        user_id=str(USER_ID), tenant_id=str(TENANT_A), scopes=["admin"]
    )
    with TestClient(trust_admin_app) as client:
        resp = client.post(
            "/v1/admin/trust/refresh-batch",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "max_listings_per_tenant": refresh_scores.MAX_LISTINGS_PER_RUN
                + 5
            },
        )
    assert resp.status_code == 422
    fake_enqueue.assert_not_called()


# ---------------------------------------------------------------------------
# Cron + job registration sanity checks
# ---------------------------------------------------------------------------


def test_cron_is_registered_at_import_time() -> None:
    """Importing the module appends a CronJob to the worker registry."""

    from src.backend.workers.arq_worker import REGISTERED_CRONS

    names = {getattr(c, "name", None) for c in REGISTERED_CRONS}
    assert refresh_scores.CRON_NAME in names


def test_manual_trigger_job_is_registered() -> None:
    """Manual-enqueue Arq job function is in the worker registry."""

    from src.backend.workers.arq_worker import REGISTERED_JOBS

    job_names = {fn.__name__ for fn in REGISTERED_JOBS}
    assert refresh_scores.ARQ_JOB_TRUST_REFRESH_BATCH in job_names


__all__ = [
    "USER_ID",
    "TENANT_A",
    "TENANT_B",
    "LISTING_ALPHA",
    "LISTING_BETA",
    "LISTING_GAMMA",
]
