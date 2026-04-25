"""OpenAI adapter scaffold.

Owner: Crius (W2 NP P5 Session 1).

S1 ships this class as a registry-visible placeholder so the
``GET /v1/protocol/vendors`` catalogue can list ``openai`` even though
no live invocation is supported. The catalogue row is seeded with
``enabled=false``; the registry refuses to dispatch to disabled rows
so this class's :meth:`invoke` should never run in production.

S2 / post-hackathon scope
-------------------------
Real OpenAI Chat + Embeddings + Image Gen + TTS land here once:
- The S2 envelope-encryption key vault is online so ``OPENAI_API_KEY``
  can be stored per-tenant rather than env-only.
- The pybreaker circuit breaker is wired so a flapping OpenAI does
  not stall the dispatcher.
- The Hemera flag ``vendor.openai.disabled`` gating is verified end-
  to-end (already implemented at the dispatcher in S1; reactivation
  just flips ``vendor_adapter_catalog.enabled`` + ensures the kill
  switch flag is False).

Anti-pattern 7 reminder
-----------------------
Reasoning-layer dispatch (Kratos MA inner loop, Apollo Advisor) MUST
stay Anthropic-only per ``CLAUDE.md``. Crius's user-visible slot
exception covers chat/embedding/image_gen/tts catalogue routing only,
and even then default fallback flag ``vendor.chat.fallback_allowed``
is False per the Hemera seed.
"""

from __future__ import annotations

import os

from src.backend.protocol.adapters.base import (
    BaseVendorAdapter,
    VendorResponse,
    VendorTask,
)
from src.backend.registry.identity import AgentPrincipal

__all__ = ["OpenAIAdapter"]


class OpenAIAdapter(BaseVendorAdapter):
    """Scaffold class. Raises on every invocation in S1."""

    vendor_slug: str = "openai"

    def __init__(self) -> None:
        # Module-level env gate per pack prompt: if the key is absent
        # at construction we mark the adapter disabled. The registry
        # already gates on the catalogue ``enabled`` flag plus the
        # Hemera kill switch, so this attribute is surfaced for tests
        # and observability rather than as a primary gate.
        self.enabled: bool = bool(os.getenv("OPENAI_API_KEY"))

    async def invoke(
        self,
        task: VendorTask,
        agent: AgentPrincipal,
    ) -> VendorResponse:
        """Always raises NotImplementedError in S1."""

        raise NotImplementedError(
            "vendor disabled in P5 S1; OpenAI adapter ships in a future "
            "wave once envelope encryption + circuit breaker land."
        )
