"""Bootstrap snapshot / sync accessor tests.

The bootstrap dict lives as a module-level ``_BOOTSTRAP_DEFAULTS`` in
:mod:`src.backend.flags.service`. Tests mutate it via the public
accessors (:func:`get_bootstrap_default`, :func:`bootstrap_snapshot`).
"""

from __future__ import annotations

from typing import Iterator

import pytest

from src.backend.flags import service


@pytest.fixture
def clean_bootstrap() -> Iterator[None]:
    saved = dict(service._BOOTSTRAP_DEFAULTS)
    service._BOOTSTRAP_DEFAULTS.clear()
    try:
        yield
    finally:
        service._BOOTSTRAP_DEFAULTS.clear()
        service._BOOTSTRAP_DEFAULTS.update(saved)


def test_missing_flag_returns_none(clean_bootstrap) -> None:
    assert service.get_bootstrap_default("missing.flag") is None
    assert service.get_bootstrap_kind("missing.flag") is None


def test_snapshot_reflects_mutation(clean_bootstrap) -> None:
    service._BOOTSTRAP_DEFAULTS["demo.flag"] = {
        "kind": "boolean",
        "default_value": True,
        "tags": ["demo"],
    }
    snap = service.bootstrap_snapshot()
    assert snap == {"demo.flag": True}


def test_snapshot_is_shallow_copy(clean_bootstrap) -> None:
    service._BOOTSTRAP_DEFAULTS["demo.flag"] = {
        "kind": "boolean",
        "default_value": True,
        "tags": ["demo"],
    }
    snap = service.bootstrap_snapshot()
    snap["demo.flag"] = False
    # Underlying dict unchanged.
    assert service.get_bootstrap_default("demo.flag") is True


def test_sync_accessors_return_expected_kind(clean_bootstrap) -> None:
    service._BOOTSTRAP_DEFAULTS["mcp.rate_limit_override"] = {
        "kind": "object",
        "default_value": None,
        "tags": ["demo"],
    }
    assert service.get_bootstrap_kind("mcp.rate_limit_override") == "object"
    assert service.get_bootstrap_default("mcp.rate_limit_override") is None
