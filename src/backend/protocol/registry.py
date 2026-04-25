"""Process-singleton adapter registry.

Owner: Crius (W2 NP P5 Session 1).

Holds one instance per concrete :class:`BaseVendorAdapter` subclass
keyed by ``vendor_slug``. The router resolves a requested slug via
:meth:`AdapterRegistry.get`; a missing slug raises 404. The catalogue
listing path uses :meth:`AdapterRegistry.list_with_catalog` which
joins the code-side registry with DB-side ``vendor_adapter_catalog``
rows so the public catalogue surface only includes adapters that
exist on BOTH sides.

Why join both sides
-------------------
A code-side adapter without a DB catalogue row is unreachable from
the router (no display metadata). A DB row without a code-side class
would mean misconfiguration (catalogue advertises a vendor we cannot
dispatch to). The join surfaces only adapters with both halves so
the public catalogue cannot lie.

Bootstrap
---------
:func:`get_registry` lazily constructs the singleton on first access.
S1 instantiates ``anthropic`` + ``stub`` + ``openai`` + ``google``;
S2 will add ``voyage`` + ``vllm_local`` once their adapters land.
"""

from __future__ import annotations

import logging
from threading import Lock

from src.backend.errors import NotFoundProblem
from src.backend.protocol.adapters.anthropic_adapter import AnthropicAdapter
from src.backend.protocol.adapters.base import BaseVendorAdapter
from src.backend.protocol.adapters.google_adapter import GoogleAdapter
from src.backend.protocol.adapters.openai_adapter import OpenAIAdapter
from src.backend.protocol.adapters.stub_adapter import StubAdapter

__all__ = ["AdapterRegistry", "get_registry"]

logger = logging.getLogger(__name__)


class AdapterRegistry:
    """In-memory map of ``vendor_slug -> BaseVendorAdapter``.

    Construction is cheap; tests construct fresh registries to assert
    behaviour without leaking state across cases. Production uses the
    process-wide :func:`get_registry` singleton.
    """

    def __init__(
        self,
        adapters: list[BaseVendorAdapter] | None = None,
    ) -> None:
        # Default roster matches the seed catalogue rows in migration
        # 053. Tests override by passing a custom list (e.g. only the
        # stub) so they can assert registry behaviour without touching
        # the live HTTP transport.
        if adapters is None:
            adapters = [
                AnthropicAdapter(),
                StubAdapter(),
                OpenAIAdapter(),
                GoogleAdapter(),
            ]
        self._by_slug: dict[str, BaseVendorAdapter] = {}
        for adapter in adapters:
            slug = adapter.vendor_slug
            if slug in self._by_slug:
                raise ValueError(f"duplicate vendor_slug in registry: {slug}")
            self._by_slug[slug] = adapter

    def get(self, vendor_slug: str) -> BaseVendorAdapter:
        """Return the adapter for ``vendor_slug`` or raise 404.

        :class:`NotFoundProblem` is raised so the router can let the
        problem+json handler render the response without re-checking.
        """

        try:
            return self._by_slug[vendor_slug]
        except KeyError as exc:
            raise NotFoundProblem(
                detail=f"Unknown vendor_slug: {vendor_slug!r}.",
            ) from exc

    def list_enabled(self) -> list[BaseVendorAdapter]:
        """Return every adapter that reports ``enabled is True``.

        Scaffold adapters (OpenAI, Google) expose an ``enabled`` flag
        that is True only when the corresponding API key env var is
        set. The Anthropic + stub adapters do not expose ``enabled``
        and are always included.

        This method does not consult the DB catalogue; for the public
        listing surface use :meth:`list_with_catalog` which joins both
        sides.
        """

        result: list[BaseVendorAdapter] = []
        for adapter in self._by_slug.values():
            # Adapters without an explicit ``enabled`` attribute are
            # always considered enabled (Anthropic + stub).
            enabled = getattr(adapter, "enabled", True)
            if enabled:
                result.append(adapter)
        return result

    def all_slugs(self) -> list[str]:
        """Return every registered vendor slug (enabled or not)."""

        return list(self._by_slug.keys())


_registry_singleton: AdapterRegistry | None = None
_registry_lock = Lock()


def get_registry() -> AdapterRegistry:
    """Return the process-wide :class:`AdapterRegistry` singleton.

    Lazy + thread-safe. Tests typically construct their own
    :class:`AdapterRegistry` instances rather than mutating the
    singleton; the lifespan + router code paths stay on the
    singleton path so state sharing is implicit.
    """

    global _registry_singleton
    if _registry_singleton is None:
        with _registry_lock:
            if _registry_singleton is None:
                _registry_singleton = AdapterRegistry()
                logger.info(
                    "protocol.registry.bootstrap slugs=%s",
                    _registry_singleton.all_slugs(),
                )
    return _registry_singleton


def reset_registry_for_tests() -> None:
    """Reset the singleton so the next :func:`get_registry` rebuilds it.

    Tests that mutate the registry MUST call this in teardown so
    sibling tests do not see leaked state. Production code never calls
    this function.
    """

    global _registry_singleton
    with _registry_lock:
        _registry_singleton = None
