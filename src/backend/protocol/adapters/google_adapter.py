"""Google (Gemini) adapter scaffold.

Owner: Crius (W2 NP P5 Session 1).

Symmetric to :class:`OpenAIAdapter`: registry-visible scaffold that
raises NotImplementedError on every invocation in S1. The catalogue
row seeds ``enabled=false`` so the dispatcher already refuses to
route to it; this class exists so ``GET /v1/protocol/vendors`` can
list the vendor as a known-but-disabled option.

S2 / post-hackathon scope mirrors the OpenAI scaffold: real
GenerativeLanguage API integration once envelope encryption + circuit
breaker land + the Hemera vendor.google.disabled gate is exercised.
"""

from __future__ import annotations

import os

from src.backend.protocol.adapters.base import (
    BaseVendorAdapter,
    VendorResponse,
    VendorTask,
)
from src.backend.registry.identity import AgentPrincipal

__all__ = ["GoogleAdapter"]


class GoogleAdapter(BaseVendorAdapter):
    """Scaffold class. Raises on every invocation in S1."""

    vendor_slug: str = "google"

    def __init__(self) -> None:
        self.enabled: bool = bool(os.getenv("GOOGLE_API_KEY"))

    async def invoke(
        self,
        task: VendorTask,
        agent: AgentPrincipal,
    ) -> VendorResponse:
        """Always raises NotImplementedError in S1."""

        raise NotImplementedError(
            "vendor disabled in P5 S1; Google Gemini adapter ships in a "
            "future wave once envelope encryption + circuit breaker land."
        )
