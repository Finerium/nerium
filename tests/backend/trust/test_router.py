"""Tests for the trust score HTTP router.

Owner: Astraea (W2 NP P1 S1). Covers the three axes:

- Auth: GET requires a bearer; POST requires admin scope.
- Round-trip: cache-hit path returns the stored row; cache-miss triggers
  a compute + persist + returns the new breakdown.
- 404: missing listing / missing user.
- Response shape: fields match :class:`TrustScoreResponse`.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Callable
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

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
from src.backend.trust.score import FORMULA_VERSION

from tests.backend.trust.conftest import (
    make_listing_trust_row,
    make_user_trust_row,
)


TENANT_ID = UUID("22222222-2222-7222-8222-222222222222")
USER_ID = UUID("11111111-1111-7111-8111-111111111111")
LISTING_ID = UUID("33333333-3333-7333-8333-333333333333")


@pytest.fixture
def trust_app(test_settings: Settings) -> FastAPI:
    """FastAPI app exposing the trust + admin-trust routers."""

    app = FastAPI()
    register_problem_handlers(app)
    install_auth(app, settings=test_settings)
    app.include_router(trust_router, prefix="/v1")
    app.include_router(admin_trust_router, prefix="/v1")
    return app


# ---------------------------------------------------------------------------
# GET /v1/registry/trust/listings/{id}
# ---------------------------------------------------------------------------


def test_get_listing_trust_requires_auth(
    trust_app: FastAPI,
    fake_trust_pool,
) -> None:
    with TestClient(trust_app) as client:
        resp = client.get(f"/v1/registry/trust/listings/{LISTING_ID}")
    assert resp.status_code == 401


def test_get_listing_trust_returns_404_on_missing(
    trust_app: FastAPI,
    fake_trust_pool,
    hs256_jwt_factory: Callable[..., str],
) -> None:
    conn = fake_trust_pool._test_conn
    conn.fetchrow = AsyncMock(return_value=None)

    token = hs256_jwt_factory(
        user_id=str(USER_ID), tenant_id=str(TENANT_ID), scopes=["read:self"]
    )
    with TestClient(trust_app) as client:
        resp = client.get(
            f"/v1/registry/trust/listings/{LISTING_ID}",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 404


def test_get_listing_trust_fresh_cache_hit(
    trust_app: FastAPI,
    fake_trust_pool,
    hs256_jwt_factory: Callable[..., str],
) -> None:
    """Fresh cache returns the stored row with ``cached=True``."""

    conn = fake_trust_pool._test_conn
    recent = datetime.now(timezone.utc) - timedelta(hours=2)
    components_json = json.dumps(
        {
            "components": {"base_before_boost": 0.65},
            "boost_components": {"new_agent_boost": 0.0, "verified_boost": 0.05},
            "inputs_summary": {"R": 0.85, "v": 12},
        }
    )
    row = make_listing_trust_row(
        listing_id=LISTING_ID,
        tenant_id=TENANT_ID,
        category="content",
        trust_score_cached=0.77,
        trust_score_cached_at=recent,
        trust_score_components_cached=components_json,
        trust_score_formula_version=FORMULA_VERSION,
        trust_score_band="trusted",
        trust_score_stability="stable",
    )
    conn.fetchrow = AsyncMock(return_value=row)

    token = hs256_jwt_factory(
        user_id=str(USER_ID), tenant_id=str(TENANT_ID), scopes=["read:self"]
    )
    with TestClient(trust_app) as client:
        resp = client.get(
            f"/v1/registry/trust/listings/{LISTING_ID}",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["subject_kind"] == "listing"
    assert body["subject_id"] == str(LISTING_ID)
    assert body["score"] == pytest.approx(0.77)
    assert body["band"] == "trusted"
    assert body["stability"] == "stable"
    assert body["cached"] is True
    assert body["formula_version"] == FORMULA_VERSION
    assert body["category"] == "content"
    # Audit bag round-trips.
    assert body["components"]["base_before_boost"] == pytest.approx(0.65)
    assert body["boost_components"]["verified_boost"] == pytest.approx(0.05)
    assert body["inputs_summary"]["R"] == pytest.approx(0.85)


def test_get_listing_trust_stale_cache_triggers_refresh(
    trust_app: FastAPI,
    fake_trust_pool,
    hs256_jwt_factory: Callable[..., str],
) -> None:
    """Stale cache -> recompute + return with ``cached=False``."""

    conn = fake_trust_pool._test_conn
    stale = datetime.now(timezone.utc) - timedelta(days=3)
    row_stale = make_listing_trust_row(
        listing_id=LISTING_ID,
        tenant_id=TENANT_ID,
        category="content",
        trust_score_cached=0.5,
        trust_score_cached_at=stale,
    )
    row_gather = make_listing_trust_row(
        listing_id=LISTING_ID,
        tenant_id=TENANT_ID,
        category="content",
        trust_score_cached=0.5,
    )
    # fetchrow sequence: read_cached (listing row, stale),
    # gather_listing_inputs (listing row, identity row).
    conn.fetchrow = AsyncMock(side_effect=[row_stale, row_gather, None])

    token = hs256_jwt_factory(
        user_id=str(USER_ID), tenant_id=str(TENANT_ID), scopes=["read:self"]
    )
    with TestClient(trust_app) as client:
        resp = client.get(
            f"/v1/registry/trust/listings/{LISTING_ID}",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["cached"] is False
    assert body["formula_version"] == FORMULA_VERSION


# ---------------------------------------------------------------------------
# GET /v1/registry/trust/creators/{user_id}
# ---------------------------------------------------------------------------


def test_get_creator_trust_requires_auth(
    trust_app: FastAPI, fake_trust_pool
) -> None:
    with TestClient(trust_app) as client:
        resp = client.get(f"/v1/registry/trust/creators/{USER_ID}")
    assert resp.status_code == 401


def test_get_creator_trust_404_on_missing(
    trust_app: FastAPI,
    fake_trust_pool,
    hs256_jwt_factory: Callable[..., str],
) -> None:
    conn = fake_trust_pool._test_conn
    conn.fetchrow = AsyncMock(return_value=None)

    token = hs256_jwt_factory(
        user_id=str(USER_ID), tenant_id=str(TENANT_ID), scopes=["read:self"]
    )
    with TestClient(trust_app) as client:
        resp = client.get(
            f"/v1/registry/trust/creators/{USER_ID}",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 404


def test_get_creator_trust_fresh_cache_hit(
    trust_app: FastAPI,
    fake_trust_pool,
    hs256_jwt_factory: Callable[..., str],
) -> None:
    conn = fake_trust_pool._test_conn
    recent = datetime.now(timezone.utc) - timedelta(hours=1)
    user_row = make_user_trust_row(
        user_id=USER_ID,
        tenant_id=TENANT_ID,
        creator_trust_score_cached=0.72,
        creator_trust_score_cached_at=recent,
        creator_trust_score_band="trusted",
        creator_verified_badge=True,
        creator_trust_score_components_cached=json.dumps(
            {
                "components": {"base_before_boost": 0.72},
                "boost_components": {},
                "inputs_summary": {"listing_count": 3.0},
            }
        ),
    )
    conn.fetchrow = AsyncMock(return_value=user_row)

    token = hs256_jwt_factory(
        user_id=str(USER_ID), tenant_id=str(TENANT_ID), scopes=["read:self"]
    )
    with TestClient(trust_app) as client:
        resp = client.get(
            f"/v1/registry/trust/creators/{USER_ID}",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["subject_kind"] == "user"
    assert body["subject_id"] == str(USER_ID)
    assert body["score"] == pytest.approx(0.72)
    assert body["verified_badge"] is True
    assert body["cached"] is True


# ---------------------------------------------------------------------------
# POST /v1/admin/trust/listings/{id}/refresh (admin only)
# ---------------------------------------------------------------------------


def test_refresh_listing_trust_requires_admin(
    trust_app: FastAPI,
    fake_trust_pool,
    hs256_jwt_factory: Callable[..., str],
) -> None:
    """Non-admin scope -> 403."""

    token = hs256_jwt_factory(
        user_id=str(USER_ID), tenant_id=str(TENANT_ID), scopes=["read:self"]
    )
    with TestClient(trust_app) as client:
        resp = client.post(
            f"/v1/admin/trust/listings/{LISTING_ID}/refresh",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 403


def test_refresh_listing_trust_missing_bearer_is_unauth(
    trust_app: FastAPI, fake_trust_pool
) -> None:
    with TestClient(trust_app) as client:
        resp = client.post(
            f"/v1/admin/trust/listings/{LISTING_ID}/refresh"
        )
    assert resp.status_code == 401


def test_refresh_listing_trust_admin_success(
    trust_app: FastAPI,
    fake_trust_pool,
    hs256_jwt_factory: Callable[..., str],
) -> None:
    """Broad ``admin`` scope -> 200 with a fresh breakdown."""

    conn = fake_trust_pool._test_conn
    listing_row = make_listing_trust_row(
        listing_id=LISTING_ID,
        tenant_id=TENANT_ID,
        category="content",
        trust_score_cached=0.8,
        created_at=datetime.now(timezone.utc) - timedelta(days=20),
    )
    conn.fetchrow = AsyncMock(side_effect=[listing_row, {"status": "active"}])
    conn.execute = AsyncMock(return_value="OK")

    token = hs256_jwt_factory(
        user_id=str(USER_ID), tenant_id=str(TENANT_ID), scopes=["admin"]
    )
    with TestClient(trust_app) as client:
        resp = client.post(
            f"/v1/admin/trust/listings/{LISTING_ID}/refresh",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["subject_kind"] == "listing"
    assert body["subject_id"] == str(LISTING_ID)
    assert body["cached"] is False
    assert 0.0 <= body["score"] <= 1.0


def test_refresh_listing_trust_narrow_scope_passes(
    trust_app: FastAPI,
    fake_trust_pool,
    hs256_jwt_factory: Callable[..., str],
) -> None:
    """``admin:trust`` pillar scope is also accepted."""

    conn = fake_trust_pool._test_conn
    listing_row = make_listing_trust_row(
        listing_id=LISTING_ID,
        tenant_id=TENANT_ID,
        category="content",
        trust_score_cached=0.7,
    )
    conn.fetchrow = AsyncMock(side_effect=[listing_row, None])
    conn.execute = AsyncMock(return_value="OK")

    token = hs256_jwt_factory(
        user_id=str(USER_ID),
        tenant_id=str(TENANT_ID),
        scopes=["admin:trust"],
    )
    with TestClient(trust_app) as client:
        resp = client.post(
            f"/v1/admin/trust/listings/{LISTING_ID}/refresh",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 200


def test_refresh_listing_trust_404_on_missing(
    trust_app: FastAPI,
    fake_trust_pool,
    hs256_jwt_factory: Callable[..., str],
) -> None:
    conn = fake_trust_pool._test_conn
    conn.fetchrow = AsyncMock(return_value=None)

    token = hs256_jwt_factory(
        user_id=str(USER_ID), tenant_id=str(TENANT_ID), scopes=["admin"]
    )
    with TestClient(trust_app) as client:
        resp = client.post(
            f"/v1/admin/trust/listings/{LISTING_ID}/refresh",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# POST /v1/admin/trust/creators/{user_id}/refresh
# ---------------------------------------------------------------------------


def test_refresh_creator_trust_admin_success(
    trust_app: FastAPI,
    fake_trust_pool,
    hs256_jwt_factory: Callable[..., str],
) -> None:
    conn = fake_trust_pool._test_conn
    user_row = make_user_trust_row(user_id=USER_ID, tenant_id=TENANT_ID)
    conn.fetchrow = AsyncMock(side_effect=[user_row, None])
    conn.fetch = AsyncMock(return_value=[])
    conn.execute = AsyncMock(return_value="OK")

    token = hs256_jwt_factory(
        user_id=str(USER_ID), tenant_id=str(TENANT_ID), scopes=["admin"]
    )
    with TestClient(trust_app) as client:
        resp = client.post(
            f"/v1/admin/trust/creators/{USER_ID}/refresh",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["subject_kind"] == "user"
    assert body["subject_id"] == str(USER_ID)


def test_refresh_creator_trust_non_admin_forbidden(
    trust_app: FastAPI,
    fake_trust_pool,
    hs256_jwt_factory: Callable[..., str],
) -> None:
    token = hs256_jwt_factory(
        user_id=str(USER_ID), tenant_id=str(TENANT_ID), scopes=["read:self"]
    )
    with TestClient(trust_app) as client:
        resp = client.post(
            f"/v1/admin/trust/creators/{USER_ID}/refresh",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 403


def test_refresh_creator_trust_404_on_missing(
    trust_app: FastAPI,
    fake_trust_pool,
    hs256_jwt_factory: Callable[..., str],
) -> None:
    conn = fake_trust_pool._test_conn
    conn.fetchrow = AsyncMock(return_value=None)

    token = hs256_jwt_factory(
        user_id=str(USER_ID), tenant_id=str(TENANT_ID), scopes=["admin"]
    )
    with TestClient(trust_app) as client:
        resp = client.post(
            f"/v1/admin/trust/creators/{USER_ID}/refresh",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 404
