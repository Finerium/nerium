"""Concrete adapter package for Crius multi-vendor dispatcher.

Each module exports one concrete subclass of :class:`BaseVendorAdapter`.
S1 ships:

- ``anthropic_adapter.AnthropicAdapter``  Anthropic Messages API (chat)
- ``stub_adapter.StubAdapter``            deterministic offline echo
- ``openai_adapter.OpenAIAdapter``        scaffold (NotImplementedError)
- ``google_adapter.GoogleAdapter``        scaffold (NotImplementedError)

The registry imports each concrete class lazily so a missing transitive
dependency in one adapter does not crash the whole subsystem.
"""

from __future__ import annotations

from src.backend.protocol.adapters.anthropic_adapter import AnthropicAdapter
from src.backend.protocol.adapters.base import (
    BaseVendorAdapter,
    VendorResponse,
    VendorTask,
)
from src.backend.protocol.adapters.google_adapter import GoogleAdapter
from src.backend.protocol.adapters.openai_adapter import OpenAIAdapter
from src.backend.protocol.adapters.stub_adapter import StubAdapter

__all__ = [
    "AnthropicAdapter",
    "BaseVendorAdapter",
    "GoogleAdapter",
    "OpenAIAdapter",
    "StubAdapter",
    "VendorResponse",
    "VendorTask",
]
