"""Shared fixtures for the Hemera flag service tests.

Scoped narrowly so the top-level backend conftest stays unaware of
flag-specific state. Each test that needs the invalidator clears the
subscriber list in a fixture rather than relying on module-level import
ordering.
"""

from __future__ import annotations

from typing import Iterator

import pytest


@pytest.fixture(autouse=True)
def reset_flag_invalidator_state() -> Iterator[None]:
    """Clear invalidator subscribers before + after each test.

    The rate_limit_mcp module registers a subscriber at import time; for
    unit tests we want a clean slate so subscriber-count assertions are
    deterministic.
    """

    try:
        from src.backend.flags.invalidator import clear_subscribers
    except ImportError:
        yield
        return

    clear_subscribers()
    yield
    clear_subscribers()
