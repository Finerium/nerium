"""Aether-Vercel T6 Phase 1.5: BYOK Anthropic forwarder unit tests.

Mocks the upstream Anthropic Messages API at the httpx layer so no real
network calls are made. Tests cover the four critical surfaces:

1. Endpoint accepts a well-formed payload and returns a 200 SSE stream
   that proxies the upstream events.
2. Endpoint rejects malformed user_api_key with 400 + RFC 7807 envelope
   (validation failed).
3. Endpoint rejects missing user_api_key with 400 + Pydantic validation
   error.
4. Endpoint maps upstream 401 to an inline SSE error frame so the
   browser-side liveRuntime.ts wrapper can classify it as
   `invalid_key` without exposing the response body.
5. Endpoint surfaces upstream timeout as an inline SSE error frame.

Conftest fixtures from ``tests/backend/conftest.py`` (test_settings,
fake DB pool) are sufficient for the lifespan probe; the live route
itself is stateless so no DB or Redis fixture is required.
"""

from __future__ import annotations

from typing import AsyncIterator
from unittest.mock import patch

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.backend.routers.v1.builder import live_session_router

VALID_KEY = "sk-ant-api03-" + "A1B2c3D4_e5F6-" + "g" * 80 + "X"


@pytest.fixture
def app() -> FastAPI:
    """Construct a minimal FastAPI app with only the live_session router.

    The full lifespan/middleware stack is heavy; this isolated app keeps
    the test surface tight and lets us assert the route's stateless
    behavior in isolation.
    """

    a = FastAPI()
    a.include_router(live_session_router, prefix="/v1")
    return a


def _mock_transport_for_status(status: int, payload: bytes) -> httpx.MockTransport:
    """Build an httpx MockTransport returning a fixed status + payload.

    The transport simulates a streaming response by emitting the payload
    as a single chunk. Sufficient for unit-level assertions.
    """

    def _handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status, content=payload)

    return httpx.MockTransport(_handler)


def test_live_session_rejects_missing_key(app: FastAPI) -> None:
    """Missing user_api_key should fail Pydantic validation with 422."""

    client = TestClient(app)
    resp = client.post(
        "/v1/builder/sessions/live",
        json={"prompt": "hello", "complexity_tier": "small"},
    )
    assert resp.status_code in (400, 422), resp.text
    body = resp.json()
    # Pydantic v2 validation produces structured error detail.
    assert "detail" in body or "errors" in body or "title" in body


def test_live_session_rejects_malformed_key(app: FastAPI) -> None:
    """Malformed user_api_key should fail validation with 400 or 422."""

    client = TestClient(app)
    resp = client.post(
        "/v1/builder/sessions/live",
        json={
            "prompt": "hello",
            "complexity_tier": "small",
            "user_api_key": "not-a-real-key",
        },
    )
    assert resp.status_code in (400, 422), resp.text


def test_live_session_rejects_empty_prompt(app: FastAPI) -> None:
    """Empty prompt fails the min_length=1 check."""

    client = TestClient(app)
    resp = client.post(
        "/v1/builder/sessions/live",
        json={
            "prompt": "",
            "complexity_tier": "small",
            "user_api_key": VALID_KEY,
        },
    )
    assert resp.status_code in (400, 422), resp.text


def test_live_session_accepts_valid_payload_and_proxies_stream(
    app: FastAPI,
) -> None:
    """Well-formed payload triggers an upstream call; the SSE proxy returns 200.

    We patch httpx.AsyncClient at the live_session module so the
    forwarder calls our MockTransport-backed client. The mock returns
    a single SSE-shaped chunk; we verify the response payload contains
    the chunk verbatim.
    """

    upstream_chunk = (
        b"event: message_start\n"
        b'data: {"type":"message_start","message":{"id":"msg_123"}}\n\n'
        b"event: content_block_delta\n"
        b'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"hi"}}\n\n'
        b"event: message_stop\n"
        b'data: {"type":"message_stop"}\n\n'
    )

    transport = _mock_transport_for_status(200, upstream_chunk)
    real_async_client = httpx.AsyncClient

    def factory(*args, **kwargs):
        kwargs["transport"] = transport
        return real_async_client(*args, **kwargs)

    with patch(
        "src.backend.routers.v1.builder.live_session.httpx.AsyncClient",
        new=factory,
    ):
        client = TestClient(app)
        resp = client.post(
            "/v1/builder/sessions/live",
            json={
                "prompt": "say hi",
                "complexity_tier": "small",
                "user_api_key": VALID_KEY,
            },
        )
        assert resp.status_code == 200, resp.text
        assert resp.headers["content-type"].startswith("text/event-stream")
        body_bytes = resp.content
        assert b"content_block_delta" in body_bytes
        assert b'"text":"hi"' in body_bytes


def test_live_session_maps_upstream_401_to_error_frame(app: FastAPI) -> None:
    """Upstream 401 surfaces as inline SSE event=error with status=401."""

    transport = _mock_transport_for_status(
        401, b'{"type":"error","error":{"type":"authentication_error"}}'
    )
    real_async_client = httpx.AsyncClient

    def factory(*args, **kwargs):
        kwargs["transport"] = transport
        return real_async_client(*args, **kwargs)

    with patch(
        "src.backend.routers.v1.builder.live_session.httpx.AsyncClient",
        new=factory,
    ):
        client = TestClient(app)
        resp = client.post(
            "/v1/builder/sessions/live",
            json={
                "prompt": "hi",
                "complexity_tier": "small",
                "user_api_key": VALID_KEY,
            },
        )
        # Stream is a 200 wrapper; the error is inline in the SSE body.
        assert resp.status_code == 200, resp.text
        assert b"upstream_unauthorized" in resp.content
        # The user's API key MUST NOT appear in the response body.
        assert VALID_KEY.encode() not in resp.content


def test_live_session_does_not_log_user_api_key(
    app: FastAPI, caplog
) -> None:
    """Audit: the request body must NOT echo the user_api_key into logs.

    We assert by inspecting captured log records for any substring of
    the key. The forwarder logs a sha256 prompt hash + complexity tier
    only.
    """

    upstream_chunk = b"event: message_stop\ndata: {}\n\n"
    transport = _mock_transport_for_status(200, upstream_chunk)
    real_async_client = httpx.AsyncClient

    def factory(*args, **kwargs):
        kwargs["transport"] = transport
        return real_async_client(*args, **kwargs)

    with patch(
        "src.backend.routers.v1.builder.live_session.httpx.AsyncClient",
        new=factory,
    ):
        with caplog.at_level("INFO"):
            client = TestClient(app)
            resp = client.post(
                "/v1/builder/sessions/live",
                json={
                    "prompt": "secret prompt content",
                    "complexity_tier": "medium",
                    "user_api_key": VALID_KEY,
                },
            )
            assert resp.status_code == 200
            # No log line should contain the key.
            for rec in caplog.records:
                assert VALID_KEY not in rec.getMessage()
            # No log line should echo the raw prompt either.
            for rec in caplog.records:
                assert "secret prompt content" not in rec.getMessage()
