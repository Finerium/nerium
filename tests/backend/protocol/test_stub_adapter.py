"""Stub adapter unit tests (Crius S1).

The stub is the smallest possible :class:`BaseVendorAdapter` and is
the deterministic substrate for every other Crius integration test.
These tests pin the public shape contract: ``output.echo`` carries
the inbound payload verbatim, ``usage`` reports a non-negative byte-
length token approximation, and ``vendor_slug`` matches the catalogue
constant.
"""

from __future__ import annotations

from uuid import UUID

import pytest

from src.backend.protocol.adapters.base import VendorTask
from src.backend.protocol.adapters.stub_adapter import StubAdapter
from src.backend.registry.identity import AgentPrincipal


def _make_principal() -> AgentPrincipal:
    return AgentPrincipal(
        agent_id=UUID("01926f00-5555-7a55-8555-000000000001"),
        owner_user_id=UUID("01926f00-1111-7a11-8111-000000000001"),
        tenant_id=UUID("01926f00-0000-7a00-8000-000000000aaa"),
        status="active",
        claims={"scope": "agent:test"},
    )


@pytest.mark.asyncio
async def test_stub_returns_echo_envelope() -> None:
    """Stub mirrors the inbound payload under ``output.echo``."""

    adapter = StubAdapter()
    task = VendorTask(
        task_type="chat",
        payload={"messages": [{"role": "user", "content": "hi"}]},
        metadata={"trace_id": "abc"},
    )

    response = await adapter.invoke(task, _make_principal())

    assert response.vendor_slug == "stub"
    assert response.task_type == "chat"
    assert response.output["echo"] == task.payload
    assert response.output["task_type"] == "chat"


@pytest.mark.asyncio
async def test_stub_reports_non_negative_usage() -> None:
    """Usage shape carries the three integer keys the cost meter expects."""

    adapter = StubAdapter()
    task = VendorTask(task_type="chat", payload={"text": "x" * 32})
    response = await adapter.invoke(task, _make_principal())

    assert response.usage is not None
    assert response.usage["input_tokens"] >= 0
    assert response.usage["output_tokens"] == 0
    assert response.usage["total_tokens"] == response.usage["input_tokens"]


@pytest.mark.asyncio
async def test_stub_metadata_carries_agent_attribution() -> None:
    """Metadata encodes agent + tenant for downstream observability."""

    principal = _make_principal()
    adapter = StubAdapter()
    task = VendorTask(task_type="embedding", payload={"text": "value"})

    response = await adapter.invoke(task, principal)

    assert response.metadata["agent_id"] == str(principal.agent_id)
    assert response.metadata["tenant_id"] == str(principal.tenant_id)
    assert response.metadata["deterministic"] is True


@pytest.mark.asyncio
async def test_stub_is_offline_safe() -> None:
    """Stub never raises on minimum payloads."""

    adapter = StubAdapter()
    task = VendorTask(task_type="chat", payload={})
    response = await adapter.invoke(task, _make_principal())
    assert response.output["echo"] == {}
