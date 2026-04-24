"""HTTP-level tests for the marketplace listing router.

Owner: Phanes (W2 NP P1 S1). Mounts ``listing_router`` on a minimal
FastAPI instance, installs a stub auth middleware that populates
``request.state.auth``, and exercises each endpoint via TestClient.

DB access is mocked through :fixture:`fake_listing_pool`; Hemera flags
via :fixture:`flag_patch`.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Callable
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from src.backend.errors import register_problem_handlers
from src.backend.middleware.auth import AuthPrincipal
from src.backend.routers.v1.marketplace import listing_router

from tests.backend.marketplace.conftest import make_listing_row


USER_ID = UUID("11111111-1111-7111-8111-111111111111")
TENANT_ID = UUID("22222222-2222-7222-8222-222222222222")


@pytest.fixture
def marketplace_app() -> Callable[[AuthPrincipal | None], FastAPI]:
    """Return a factory that builds a FastAPI app with a pinned principal.

    The factory lets each test choose an auth state (authenticated user
    vs anonymous) without recreating the fixture stack.
    """

    def _build(principal: AuthPrincipal | None) -> FastAPI:
        app = FastAPI()
        register_problem_handlers(app)

        @app.middleware("http")
        async def _install_auth(request: Request, call_next):
            if principal is not None:
                request.state.auth = principal
            response = await call_next(request)
            return response

        app.include_router(listing_router, prefix="/v1")
        return app

    return _build


@pytest.fixture
def default_principal() -> AuthPrincipal:
    return AuthPrincipal(
        user_id=str(USER_ID),
        tenant_id=str(TENANT_ID),
    )


def test_create_listing_requires_hemera_live_flag(
    fake_listing_pool,
    flag_patch,
    marketplace_app,
    default_principal: AuthPrincipal,
) -> None:
    flag_patch({"marketplace.live": False})
    app = marketplace_app(default_principal)
    with TestClient(app) as client:
        resp = client.post(
            "/v1/marketplace/listings",
            json={
                "category": "content",
                "subtype": "prompt",
                "title": "Denied",
                "short_description": "short",
                "long_description": "long",
                "category_metadata": {"content_format": "markdown"},
            },
        )
    assert resp.status_code == 403
    body = resp.json()
    assert body["status"] == 403
    assert body["type"].endswith("/forbidden")


def test_create_listing_happy_path_returns_201(
    fake_listing_pool,
    flag_patch,
    marketplace_app,
    default_principal: AuthPrincipal,
) -> None:
    flag_patch({"marketplace.live": True})
    conn = fake_listing_pool._test_conn

    row = make_listing_row(
        tenant_id=TENANT_ID,
        creator_user_id=USER_ID,
        title="My Prompt",
        slug="my-prompt",
        long_description="rich long description",
    )
    # select_by_slug: None (slug free) -> insert returns row.
    conn.fetchrow = AsyncMock(side_effect=[None, row])

    app = marketplace_app(default_principal)
    with TestClient(app) as client:
        resp = client.post(
            "/v1/marketplace/listings",
            json={
                "category": "content",
                "subtype": "prompt",
                "title": "My Prompt",
                "short_description": "s",
                "long_description": "rich long description",
                "category_metadata": {"content_format": "markdown"},
            },
        )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["slug"] == "my-prompt"
    assert body["status"] == "draft"
    assert body["category"] == "content"
    assert body["subtype"] == "prompt"


def test_create_listing_cross_category_subtype_is_422(
    fake_listing_pool,
    flag_patch,
    marketplace_app,
    default_principal: AuthPrincipal,
) -> None:
    flag_patch({"marketplace.live": True})
    app = marketplace_app(default_principal)
    with TestClient(app) as client:
        resp = client.post(
            "/v1/marketplace/listings",
            json={
                "category": "core_agent",
                "subtype": "sprite_pack",  # cross-category
                "title": "Bad Mix",
                "short_description": "s",
                "long_description": "long",
                "category_metadata": {},
            },
        )
    assert resp.status_code == 422
    body = resp.json()
    assert body["type"].endswith("/unprocessable_entity")


def test_get_listing_not_found_returns_404(
    fake_listing_pool,
    marketplace_app,
    default_principal: AuthPrincipal,
) -> None:
    fake_listing_pool._test_conn.fetchrow = AsyncMock(return_value=None)
    app = marketplace_app(default_principal)
    with TestClient(app) as client:
        resp = client.get(f"/v1/marketplace/listings/{uuid4()}")
    assert resp.status_code == 404
    body = resp.json()
    assert body["type"].endswith("/not_found")


def test_get_listing_cross_tenant_surfaces_as_404(
    fake_listing_pool,
    marketplace_app,
    default_principal: AuthPrincipal,
) -> None:
    """RLS policy filters the row so the asyncpg fetchrow returns None.

    We simulate that with fetchrow returning None for a query the
    service issues under tenant_scoped. The router must surface 404,
    not 403, to avoid leaking existence across tenants.
    """

    fake_listing_pool._test_conn.fetchrow = AsyncMock(return_value=None)
    app = marketplace_app(default_principal)
    with TestClient(app) as client:
        resp = client.get(f"/v1/marketplace/listings/{uuid4()}")
    assert resp.status_code == 404


def test_list_listings_returns_cursor_page_envelope(
    fake_listing_pool,
    marketplace_app,
    default_principal: AuthPrincipal,
) -> None:
    """GET /v1/marketplace/listings returns the CursorPage envelope."""

    rows = [
        make_listing_row(
            title=f"Listing {i}",
            slug=f"listing-{i}",
            status="published",
            created_at=datetime.now(timezone.utc),
        )
        for i in range(3)
    ]
    fake_listing_pool._test_conn.fetch = AsyncMock(return_value=rows)
    app = marketplace_app(default_principal)
    with TestClient(app) as client:
        resp = client.get("/v1/marketplace/listings?limit=10")
    assert resp.status_code == 200
    body = resp.json()
    assert set(body.keys()) == {"items", "next_cursor", "has_more"}
    assert len(body["items"]) == 3
    assert body["has_more"] is False
    assert body["next_cursor"] is None


def test_list_listings_has_more_when_page_full(
    fake_listing_pool,
    marketplace_app,
    default_principal: AuthPrincipal,
) -> None:
    """When the query returns limit+1 rows, has_more is True + cursor set."""

    rows = [
        make_listing_row(
            title=f"Listing {i}",
            slug=f"listing-{i}",
            status="published",
            created_at=datetime(2026, 4, 25 - (i % 25), tzinfo=timezone.utc),
        )
        for i in range(11)  # limit=10, one extra row flips has_more
    ]
    fake_listing_pool._test_conn.fetch = AsyncMock(return_value=rows)
    app = marketplace_app(default_principal)
    with TestClient(app) as client:
        resp = client.get("/v1/marketplace/listings?limit=10")
    assert resp.status_code == 200
    body = resp.json()
    assert body["has_more"] is True
    assert body["next_cursor"] is not None
    assert len(body["items"]) == 10


def test_patch_listing_owner_only_returns_403(
    fake_listing_pool,
    flag_patch,
    marketplace_app,
    default_principal: AuthPrincipal,
) -> None:
    flag_patch({"marketplace.live": True})
    other_owner = UUID("99999999-9999-7999-8999-999999999999")
    row = make_listing_row(creator_user_id=other_owner)
    fake_listing_pool._test_conn.fetchrow = AsyncMock(return_value=row)
    app = marketplace_app(default_principal)
    with TestClient(app) as client:
        resp = client.patch(
            f"/v1/marketplace/listings/{row['id']}",
            json={"title": "hack"},
        )
    assert resp.status_code == 403


def test_delete_listing_soft_deletes_and_returns_204(
    fake_listing_pool,
    flag_patch,
    marketplace_app,
    default_principal: AuthPrincipal,
) -> None:
    flag_patch({"marketplace.live": True})
    lid = uuid4()
    row = make_listing_row(
        listing_id=lid, creator_user_id=USER_ID, archived_at=None
    )
    archived = {**row, "archived_at": datetime.now(timezone.utc), "status": "archived"}
    fake_listing_pool._test_conn.fetchrow = AsyncMock(side_effect=[row, archived])
    app = marketplace_app(default_principal)
    with TestClient(app) as client:
        resp = client.delete(f"/v1/marketplace/listings/{lid}")
    assert resp.status_code == 204
    assert resp.content == b""


def test_publish_listing_requires_long_description(
    fake_listing_pool,
    flag_patch,
    marketplace_app,
    default_principal: AuthPrincipal,
) -> None:
    flag_patch({"marketplace.live": True})
    lid = uuid4()
    row = make_listing_row(
        listing_id=lid,
        creator_user_id=USER_ID,
        long_description=None,
    )
    fake_listing_pool._test_conn.fetchrow = AsyncMock(return_value=row)
    app = marketplace_app(default_principal)
    with TestClient(app) as client:
        resp = client.post(f"/v1/marketplace/listings/{lid}/publish")
    assert resp.status_code == 422
    body = resp.json()
    codes = {e["code"] for e in body.get("errors", [])}
    assert "description_required_for_public" in codes


def test_publish_listing_happy_path_returns_published_detail(
    fake_listing_pool,
    flag_patch,
    marketplace_app,
    default_principal: AuthPrincipal,
) -> None:
    flag_patch({"marketplace.live": True})
    lid = uuid4()
    pre = make_listing_row(
        listing_id=lid,
        creator_user_id=USER_ID,
        status="draft",
        long_description="ready to go",
        category_metadata={"content_format": "markdown"},
    )
    post = {
        **pre,
        "status": "published",
        "published_at": datetime.now(timezone.utc),
        "version_history": [
            {"version": "0.1.0", "status_before": "draft", "title": pre["title"]}
        ],
    }
    fake_listing_pool._test_conn.fetchrow = AsyncMock(side_effect=[pre, post])
    app = marketplace_app(default_principal)
    with TestClient(app) as client:
        resp = client.post(f"/v1/marketplace/listings/{lid}/publish")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "published"
    assert len(body["version_history"]) == 1
    assert body["version_history"][0]["version"] == "0.1.0"


def test_unauthenticated_request_returns_401(
    fake_listing_pool,
    marketplace_app,
) -> None:
    """When the stub middleware does NOT populate request.state.auth,

    the router's ``_require_auth`` helper raises 401.
    """

    app = marketplace_app(None)
    with TestClient(app) as client:
        resp = client.get("/v1/marketplace/listings")
    assert resp.status_code == 401
