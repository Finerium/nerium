"""Anthropic adapter tests (Crius S1).

Two layers:
1. ``MockTransport`` intercept tests run on every CI cycle. They
   pin the request shape (model id default, header set, body keys)
   without contacting the live API.
2. A network smoke test gated on ``ANTHROPIC_API_KEY`` and the
   ``network`` pytest marker. Skips by default so CI stays offline.
"""

from __future__ import annotations

import json
import os
from uuid import UUID

import httpx
import pytest

from src.backend.protocol.adapters.anthropic_adapter import (
    DEFAULT_MODEL,
    AnthropicAdapter,
)
from src.backend.protocol.adapters.base import VendorTask
from src.backend.registry.identity import AgentPrincipal


def _principal() -> AgentPrincipal:
    return AgentPrincipal(
        agent_id=UUID("01926f00-5555-7a55-8555-000000000002"),
        owner_user_id=UUID("01926f00-1111-7a11-8111-000000000001"),
        tenant_id=UUID("01926f00-0000-7a00-8000-000000000aaa"),
        status="active",
    )


def _build_mock_transport(
    captured: dict[str, object],
    response_body: dict[str, object] | None = None,
) -> httpx.MockTransport:
    body = response_body or {
        "id": "msg_test_001",
        "model": DEFAULT_MODEL,
        "stop_reason": "end_turn",
        "content": [{"type": "text", "text": "hello back"}],
        "usage": {"input_tokens": 5, "output_tokens": 3},
    }

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["method"] = request.method
        captured["headers"] = dict(request.headers)
        captured["json"] = json.loads(request.content.decode("utf-8"))
        return httpx.Response(200, json=body)

    return httpx.MockTransport(handler)


@pytest.mark.asyncio
async def test_adapter_sends_default_model_when_metadata_omits() -> None:
    """No metadata.model -> ``claude-opus-4-7`` lands on the wire."""

    captured: dict[str, object] = {}
    transport = _build_mock_transport(captured)
    adapter = AnthropicAdapter(api_key="sk-test", transport=transport)
    task = VendorTask(
        task_type="chat",
        payload={"input_text": "hi"},
    )

    response = await adapter.invoke(task, _principal())

    assert captured["json"]["model"] == DEFAULT_MODEL  # type: ignore[index]
    assert response.output["content"] == "hello back"
    assert response.usage == {"input_tokens": 5, "output_tokens": 3}


@pytest.mark.asyncio
async def test_adapter_honours_metadata_model_override() -> None:
    """metadata.model overrides the default model on a per-request basis."""

    captured: dict[str, object] = {}
    transport = _build_mock_transport(
        captured,
        response_body={
            "id": "msg_x",
            "model": "claude-opus-4-6",
            "content": [{"type": "text", "text": "ok"}],
            "usage": {"input_tokens": 1, "output_tokens": 1},
            "stop_reason": "end_turn",
        },
    )
    adapter = AnthropicAdapter(api_key="sk-test", transport=transport)
    task = VendorTask(
        task_type="chat",
        payload={"input_text": "hi"},
        metadata={"model": "claude-opus-4-6"},
    )

    response = await adapter.invoke(task, _principal())

    assert captured["json"]["model"] == "claude-opus-4-6"  # type: ignore[index]
    assert response.metadata["model"] == "claude-opus-4-6"


@pytest.mark.asyncio
async def test_adapter_sets_anthropic_headers() -> None:
    """x-api-key + anthropic-version headers always present."""

    captured: dict[str, object] = {}
    transport = _build_mock_transport(captured)
    adapter = AnthropicAdapter(api_key="sk-test-headers", transport=transport)
    task = VendorTask(task_type="chat", payload={"input_text": "hi"})

    await adapter.invoke(task, _principal())

    headers = captured["headers"]
    assert headers["x-api-key"] == "sk-test-headers"  # type: ignore[index]
    assert "anthropic-version" in headers  # type: ignore[operator]


@pytest.mark.asyncio
async def test_adapter_rejects_non_chat_task_type() -> None:
    """Non-chat task types fail fast in S1."""

    adapter = AnthropicAdapter(api_key="sk-test")
    task = VendorTask(task_type="embedding", payload={"input_text": "x"})
    with pytest.raises(ValueError, match="task_type"):
        await adapter.invoke(task, _principal())


@pytest.mark.asyncio
async def test_adapter_rejects_empty_payload() -> None:
    """No messages + no input_text raises before HTTP call."""

    adapter = AnthropicAdapter(api_key="sk-test")
    task = VendorTask(task_type="chat", payload={})
    with pytest.raises(ValueError, match="messages"):
        await adapter.invoke(task, _principal())


@pytest.mark.asyncio
async def test_adapter_raises_on_upstream_error() -> None:
    """5xx upstream surfaces TransientVendorError for the S2 dispatcher.

    S2 upgraded the adapter to raise typed dispatcher exceptions
    (:class:`TransientVendorError` for 5xx + 408/429,
    :class:`PermanentVendorError` for other 4xx) so the breaker +
    Tenacity policy can decide retry vs giveup uniformly. 503 is
    transient by classification.
    """

    from src.backend.protocol.exceptions import TransientVendorError

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, json={"error": "vendor down"})

    transport = httpx.MockTransport(handler)
    adapter = AnthropicAdapter(api_key="sk-test", transport=transport)
    task = VendorTask(task_type="chat", payload={"input_text": "hi"})

    with pytest.raises(TransientVendorError, match="503"):
        await adapter.invoke(task, _principal())


@pytest.mark.asyncio
async def test_adapter_4xx_raises_permanent_vendor_error() -> None:
    """400 surfaces PermanentVendorError so retry + breaker stay quiet."""

    from src.backend.protocol.exceptions import PermanentVendorError

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(400, json={"error": "bad request"})

    transport = httpx.MockTransport(handler)
    adapter = AnthropicAdapter(api_key="sk-test", transport=transport)
    task = VendorTask(task_type="chat", payload={"input_text": "hi"})

    with pytest.raises(PermanentVendorError, match="400"):
        await adapter.invoke(task, _principal())


@pytest.mark.network
@pytest.mark.asyncio
async def test_adapter_smoke_against_live_api() -> None:
    """Live Anthropic call. Skipped when ``ANTHROPIC_API_KEY`` is empty."""

    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        pytest.skip("ANTHROPIC_API_KEY not set; live smoke skipped.")

    adapter = AnthropicAdapter(api_key=api_key)
    task = VendorTask(
        task_type="chat",
        payload={"input_text": "Say hi", "max_tokens": 50},
    )
    response = await adapter.invoke(task, _principal())
    assert response.vendor_slug == "anthropic"
    assert isinstance(response.output["content"], str)
    assert len(response.output["content"]) > 0
