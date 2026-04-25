"""Crius multi-vendor adapter package.

Public surface (S1): the abstract :class:`BaseVendorAdapter`, the
``VendorTask`` + ``VendorResponse`` Pydantic v2 envelopes, and the
:class:`AdapterRegistry` process-singleton. S2 will land envelope
encryption + circuit breaker; both ride the same registry without
breaking the import surface.

Import style
------------
::

    from src.backend.protocol import (
        BaseVendorAdapter,
        VendorTask,
        VendorResponse,
        AdapterRegistry,
        get_registry,
    )

Direct adapter classes are importable from
``src.backend.protocol.adapters.*`` for tests that need to instantiate
a specific concrete adapter without going through the registry.
"""

from __future__ import annotations

from src.backend.protocol.adapters.base import (
    BaseVendorAdapter,
    VendorResponse,
    VendorTask,
)
from src.backend.protocol.registry import AdapterRegistry, get_registry

__all__ = [
    "AdapterRegistry",
    "BaseVendorAdapter",
    "VendorResponse",
    "VendorTask",
    "get_registry",
]
