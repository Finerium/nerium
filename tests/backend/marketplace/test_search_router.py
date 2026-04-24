"""HTTP-level tests for ``/v1/marketplace/search`` + autocomplete.

Owner: Hyperion (W2 NP P1 S1).
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from src.backend.errors import register_problem_handlers
from src.backend.marketplace import embedding
from src.backend.middleware.auth import AuthPrincipal
from src.backend.routers.v1.marketplace import search_router

USER_ID = UUID("11111111-1111-7111-8111-111111111111")
TENANT_ID = UUID("22222222-2222-7222-8222-222222222222")


@pytest.fixture
def search_app() -> Callable[[AuthPrincipal | None], FastAPI]:
    def _build(principal: AuthPrincipal | None) -> FastAPI:
        app = FastAPI()
        register_problem_handlers(app)

        @app.middleware("http")
        async def _install_auth(request: Request, call_next):
            if principal is not None:
                request.state.auth = principal
            response = await call_next(request)
            return response

        app.include_router(search_router, prefix="/v1")
        return app

    return _build


@pytest.fixture
def default_principal() -> AuthPrincipal:
    return AuthPrincipal(user_id=str(USER_ID), tenant_id=str(TENANT_ID))


@pytest.fixture
def deterministic_embedder() -> None:
    stub = embedding.DeterministicPseudoEmbedder()
    embedding.set_embedder(stub)
    yield stub
    embedding.set_embedder(None)


def _mk_row(*, title: str, listing_id: UUID | None = None) -> dict[str, Any]:
    now = datetime.now(UTC)
    return {
        "id": listing_id or uuid4(),
        "tenant_id": TENANT_ID,
        "creator_user_id": USER_ID,
        "category": "core_agent",
        "subtype": "agent",
        "slug": title.lower().replace(" ", "-"),
        "title": title,
        "description": title,
        "short_description": "short",
        "long_description": "long",
        "capability_tags": [],
        "license": "MIT",
        "pricing": {},
        "pricing_model": "free",
        "pricing_details": {},
        "category_metadata": {},
        "asset_refs": [],
        "thumbnail_r2_key": None,
        "trust_score_cached": None,
        "revenue_split_override": None,
        "status": "published",
        "version": "0.1.0",
        "version_history": [],
        "metadata": {},
        "published_at": now,
        "archived_at": None,
        "created_at": now,
        "updated_at": now,
    }


def test_search_empty_query_returns_422(
    fake_listing_pool, search_app, default_principal, deterministic_embedder
) -> None:
    app = search_app(default_principal)
    with TestClient(app) as client:
        resp = client.get("/v1/marketplace/search?q=")
    assert resp.status_code == 422


def test_search_missing_query_returns_422(
    fake_listing_pool, search_app, default_principal, deterministic_embedder
) -> None:
    app = search_app(default_principal)
    with TestClient(app) as client:
        resp = client.get("/v1/marketplace/search")
    assert resp.status_code == 422


def test_search_happy_path_returns_fused_envelope(
    fake_listing_pool, search_app, default_principal, deterministic_embedder
) -> None:
    row = _mk_row(title="Dragon Agent")
    lexical = [{"id": row["id"], "lrank": 0.9}]
    semantic = []
    fake_listing_pool._test_conn.fetch = AsyncMock(
        side_effect=[lexical, semantic, [row]]
    )
    app = search_app(default_principal)
    with TestClient(app) as client:
        resp = client.get("/v1/marketplace/search?q=dragon&limit=5")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["query_embedding_source"] == "deterministic"
    assert body["embedding_is_fallback"] is False
    assert len(body["items"]) == 1
    assert body["items"][0]["title"] == "Dragon Agent"
    assert body["total_candidate_count"] == 1
    assert body["has_more"] is False


def test_search_filter_passthrough_to_service(
    fake_listing_pool, search_app, default_principal, deterministic_embedder
) -> None:
    fake_listing_pool._test_conn.fetch = AsyncMock(return_value=[])
    app = search_app(default_principal)
    with TestClient(app) as client:
        resp = client.get(
            "/v1/marketplace/search"
            "?q=ai&category=core_agent&subtype=agent"
            "&license=MIT&pricing_model=free"
            "&price_min=0&price_max=50&sort=recent"
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["items"] == []


def test_search_invalid_sort_returns_422(
    fake_listing_pool, search_app, default_principal, deterministic_embedder
) -> None:
    app = search_app(default_principal)
    with TestClient(app) as client:
        resp = client.get("/v1/marketplace/search?q=x&sort=wat")
    assert resp.status_code == 422


def test_search_limit_overflow_returns_422(
    fake_listing_pool, search_app, default_principal, deterministic_embedder
) -> None:
    app = search_app(default_principal)
    with TestClient(app) as client:
        resp = client.get("/v1/marketplace/search?q=x&limit=999")
    assert resp.status_code == 422


def test_autocomplete_returns_suggestions(
    fake_listing_pool, search_app, default_principal
) -> None:
    fake_listing_pool._test_conn.fetch = AsyncMock(
        return_value=[
            {"title": "Dragon Quest Agent", "sim": 0.9},
            {"title": "Dragon Hunter", "sim": 0.7},
        ]
    )
    app = search_app(default_principal)
    with TestClient(app) as client:
        resp = client.get("/v1/marketplace/search/autocomplete?q=drag")
    assert resp.status_code == 200
    body = resp.json()
    assert body["suggestions"] == ["Dragon Quest Agent", "Dragon Hunter"]


def test_autocomplete_empty_prefix_returns_422(
    fake_listing_pool, search_app, default_principal
) -> None:
    app = search_app(default_principal)
    with TestClient(app) as client:
        resp = client.get("/v1/marketplace/search/autocomplete?q=")
    assert resp.status_code == 422


def test_search_authenticated_route_is_public(
    fake_listing_pool, search_app, deterministic_embedder
) -> None:
    """Public marketplace search must work even when no auth principal is set.

    Contract Section 10 open question 3 locks global public-listing search.
    """

    fake_listing_pool._test_conn.fetch = AsyncMock(return_value=[])
    app = search_app(None)
    with TestClient(app) as client:
        resp = client.get("/v1/marketplace/search?q=anything")
    assert resp.status_code == 200
