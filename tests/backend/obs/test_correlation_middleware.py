"""Correlation middleware tests.

Verifies ``install_correlation_id`` assigns X-Request-Id on response, honours
an inbound header, and is idempotent if called twice.
"""

from __future__ import annotations

import pytest

pytest.importorskip("fastapi")
pytest.importorskip("asgi_correlation_id")
pytest.importorskip("httpx")

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from src.backend.middleware.correlation_id import (  # noqa: E402
    HEADER_NAME,
    install_correlation_id,
)


def _build_app() -> FastAPI:
    app = FastAPI()
    install_correlation_id(app)
    install_correlation_id(app)  # idempotent

    @app.get("/ping")
    def ping() -> dict[str, str]:
        return {"ok": "true"}

    return app


def test_request_id_assigned_when_absent() -> None:
    with TestClient(_build_app()) as client:
        resp = client.get("/ping")
    assert resp.status_code == 200
    assert HEADER_NAME in resp.headers
    assert len(resp.headers[HEADER_NAME]) >= 16


def test_request_id_echoed_when_present() -> None:
    inbound = "abcdef0123456789abcdef0123456789"
    with TestClient(_build_app()) as client:
        resp = client.get("/ping", headers={HEADER_NAME: inbound})
    assert resp.headers[HEADER_NAME] == inbound


def test_invalid_request_id_regenerated() -> None:
    # Too short: validator rejects, middleware assigns a fresh id.
    with TestClient(_build_app()) as client:
        resp = client.get("/ping", headers={HEADER_NAME: "x"})
    assert resp.headers[HEADER_NAME] != "x"
    assert len(resp.headers[HEADER_NAME]) >= 16
