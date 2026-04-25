"""GET /v1/protocol/vendors route tests (Crius S1).

Listing endpoint is unauthenticated; the catalogue table holds no
secrets. Tests assert:
- Catalogue returns enabled subset only.
- Disabled scaffold rows (openai, google) are filtered out.
- No auth header required (the endpoint is public).
- Response shape matches :class:`VendorListEntry`.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.backend.errors import register_problem_handlers
from src.backend.routers.v1.protocol import protocol_router
from tests.backend.protocol.conftest import make_catalog_row


def _build_app() -> FastAPI:
    app = FastAPI()
    register_problem_handlers(app)
    app.include_router(protocol_router, prefix="/v1")
    return app


def test_list_vendors_returns_enabled_only(
    fake_protocol_pool: Any,
) -> None:
    """Service helper queries the catalogue + returns enabled rows."""

    enabled_rows = [
        make_catalog_row(
            vendor_slug="anthropic",
            display_name="Anthropic Claude",
        ),
        make_catalog_row(
            vendor_slug="stub",
            display_name="Stub Echo",
        ),
    ]
    fake_protocol_pool._test_conn.fetch = AsyncMock(return_value=enabled_rows)

    with TestClient(_build_app()) as client:
        resp = client.get("/v1/protocol/vendors")

    assert resp.status_code == 200
    body = resp.json()
    slugs = {entry["vendor_slug"] for entry in body}
    assert slugs == {"anthropic", "stub"}
    for entry in body:
        assert entry["enabled"] is True
        # Public surface trims config_json + secrets.
        assert "config_json" not in entry


def test_list_vendors_no_auth_required(fake_protocol_pool: Any) -> None:
    """Endpoint is publicly accessible without an Authorization header."""

    fake_protocol_pool._test_conn.fetch = AsyncMock(return_value=[])

    with TestClient(_build_app()) as client:
        resp = client.get("/v1/protocol/vendors")

    assert resp.status_code == 200
    assert resp.json() == []


def test_list_vendors_query_filters_enabled(
    fake_protocol_pool: Any,
) -> None:
    """Service issues a WHERE enabled = true SQL clause."""

    fake_protocol_pool._test_conn.fetch = AsyncMock(return_value=[])

    with TestClient(_build_app()) as client:
        client.get("/v1/protocol/vendors")

    args = fake_protocol_pool._test_conn.fetch.await_args
    assert args is not None
    sql = args.args[0]
    assert "WHERE enabled = true" in sql
    assert "ORDER BY vendor_slug" in sql
