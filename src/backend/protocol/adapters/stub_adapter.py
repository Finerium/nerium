"""Deterministic offline-safe stub adapter.

Owner: Crius (W2 NP P5 Session 1).

Used by:
- pytest unit tests (no network, no API key)
- demo fallback when ``ANTHROPIC_API_KEY`` is empty in dev environments
- contract round-trip checks (input echoes back unchanged so the wire
  shape is observable end-to-end)

The stub never raises; it always returns a valid :class:`VendorResponse`
populated from the inbound :class:`VendorTask`. This means a stub-only
catalogue still proves the dispatch path works in isolation from
network availability.
"""

from __future__ import annotations

from typing import Any

from src.backend.protocol.adapters.base import (
    BaseVendorAdapter,
    VendorResponse,
    VendorTask,
)
from src.backend.registry.identity import AgentPrincipal

__all__ = ["StubAdapter"]


class StubAdapter(BaseVendorAdapter):
    """Echoes the inbound payload + reports a fixed usage shape.

    Output shape::

        {
            "echo": <task.payload>,
            "task_type": <task.task_type>
        }

    Usage shape::

        {
            "input_tokens": <len(json(payload))>,
            "output_tokens": 0,
            "total_tokens": <len(json(payload))>
        }

    Token counts are byte-length approximations rather than real BPE
    tokenisation. The stub is meant to be obviously non-billable; any
    cost accounting that flags ``vendor_slug == 'stub'`` MUST treat
    the usage values as decorative only.
    """

    vendor_slug: str = "stub"

    async def invoke(
        self,
        task: VendorTask,
        agent: AgentPrincipal,
    ) -> VendorResponse:
        """Return a deterministic echo of the inbound task."""

        # Byte-length is a stable approximation that does not require
        # an external tokenizer. Tests that snapshot usage values get
        # a deterministic number for the same payload.
        approx_tokens = _approx_token_count(task.payload)

        output: dict[str, Any] = {
            "echo": task.payload,
            "task_type": task.task_type,
        }

        usage: dict[str, Any] = {
            "input_tokens": approx_tokens,
            "output_tokens": 0,
            "total_tokens": approx_tokens,
        }

        metadata: dict[str, Any] = {
            "agent_id": str(agent.agent_id),
            "tenant_id": str(agent.tenant_id),
            "deterministic": True,
        }

        return VendorResponse(
            vendor_slug=self.vendor_slug,
            task_type=task.task_type,
            output=output,
            usage=usage,
            metadata=metadata,
        )


def _approx_token_count(payload: dict[str, Any]) -> int:
    """Return a stable byte-length approximation of the payload size."""

    # ``str`` is enough for the stub. Real tokenisers (Anthropic /
    # OpenAI) ship in the production adapters; this is intentionally
    # cheap so unit tests run in microseconds.
    return len(str(payload))
