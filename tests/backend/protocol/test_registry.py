"""Adapter registry unit tests (Crius S1)."""

from __future__ import annotations

import pytest

from src.backend.errors import NotFoundProblem
from src.backend.protocol.adapters.anthropic_adapter import AnthropicAdapter
from src.backend.protocol.adapters.google_adapter import GoogleAdapter
from src.backend.protocol.adapters.openai_adapter import OpenAIAdapter
from src.backend.protocol.adapters.stub_adapter import StubAdapter
from src.backend.protocol.registry import (
    AdapterRegistry,
    get_registry,
    reset_registry_for_tests,
)


def test_default_registry_carries_seed_slugs() -> None:
    """The default roster matches the catalogue seed slugs."""

    reset_registry_for_tests()
    registry = get_registry()
    assert set(registry.all_slugs()) == {
        "anthropic",
        "stub",
        "openai",
        "google",
    }


def test_registry_get_known_slug_returns_instance() -> None:
    registry = AdapterRegistry()
    adapter = registry.get("stub")
    assert isinstance(adapter, StubAdapter)


def test_registry_get_unknown_slug_raises_404() -> None:
    """Unknown slug surfaces NotFoundProblem so the router renders 404."""

    registry = AdapterRegistry()
    with pytest.raises(NotFoundProblem) as excinfo:
        registry.get("imaginary")
    assert "imaginary" in str(excinfo.value.detail)
    assert excinfo.value.status == 404


def test_registry_rejects_duplicate_slugs() -> None:
    with pytest.raises(ValueError, match="duplicate vendor_slug"):
        AdapterRegistry(adapters=[StubAdapter(), StubAdapter()])


def test_list_enabled_excludes_scaffolds_without_api_keys(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Scaffold adapters with empty API-key env vars are filtered out."""

    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)

    registry = AdapterRegistry(
        adapters=[
            AnthropicAdapter(),
            StubAdapter(),
            OpenAIAdapter(),
            GoogleAdapter(),
        ]
    )
    enabled = {adapter.vendor_slug for adapter in registry.list_enabled()}
    assert enabled == {"anthropic", "stub"}


def test_list_enabled_includes_scaffold_when_api_key_present(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Setting the API key env flips the scaffold's ``enabled`` to True."""

    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-fixture")
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)

    registry = AdapterRegistry(
        adapters=[
            StubAdapter(),
            OpenAIAdapter(),
            GoogleAdapter(),
        ]
    )
    enabled = {adapter.vendor_slug for adapter in registry.list_enabled()}
    assert "openai" in enabled
    assert "google" not in enabled


def test_custom_adapter_roster_overrides_defaults() -> None:
    registry = AdapterRegistry(adapters=[StubAdapter()])
    assert registry.all_slugs() == ["stub"]
    with pytest.raises(NotFoundProblem):
        registry.get("anthropic")
