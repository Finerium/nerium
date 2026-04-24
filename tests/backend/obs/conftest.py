"""Shared fixtures for observability tests."""

from __future__ import annotations

import logging

import pytest


@pytest.fixture(autouse=True)
def _reset_logging() -> None:
    """Reset the root logger handlers between tests.

    ``configure_logging`` swaps the root handler; tests that configure it
    multiple times would otherwise stack handlers and mutate global state.
    """

    yield
    root = logging.getLogger()
    root.handlers.clear()
    root.setLevel(logging.WARNING)
