"""Shared pytest fixtures for Khronos MCP + OAuth tests.

Owner: Khronos. Picked up by pytest across ``tests/mcp/`` and ``tests/auth/``
because this file sits at their common ancestor. ``tests/backend/`` has its
own ``conftest.py`` scoped to Aether's FastAPI core tests.

Key fixtures
------------
- ``reset_khronos_state``: autouse per-function reset of OAuth stores + JWT
  signer + DCR rate limit so tests cannot leak state into each other. Wraps
  the imports in try/except so the reset is a no-op when the Khronos modules
  are not yet installed (backend-only test profile).
- ``oauth_app``: minimal FastAPI app with Khronos' ``oauth_router`` +
  well-known router mounted. Does NOT depend on Aether's main app factory.
- ``oauth_client``: synchronous ``fastapi.testclient.TestClient`` bound to
  ``oauth_app``.
"""

from __future__ import annotations

import os
from collections.abc import Iterator

import pytest


@pytest.fixture(autouse=True)
def reset_khronos_state() -> Iterator[None]:
    """Wipe OAuth stores, JWT signer, refresh chain, and DCR rate limit."""

    try:
        from src.backend.auth.client_store import reset_store_for_tests as _reset_clients
        from src.backend.auth.code_store import reset_store_for_tests as _reset_codes
        from src.backend.auth.jwt_signer import reset_signer_for_tests as _reset_signer
        from src.backend.auth.oauth_dcr import reset_rate_limit_for_tests as _reset_rl
        from src.backend.auth.refresh_chain import reset_chain_for_tests as _reset_chain
    except ImportError:
        yield
        return

    _reset_clients()
    _reset_codes()
    _reset_signer()
    _reset_rl()
    _reset_chain()
    yield
    _reset_clients()
    _reset_codes()
    _reset_signer()
    _reset_rl()
    _reset_chain()


@pytest.fixture
def enable_test_auth_header() -> Iterator[None]:
    """Enable ``X-NERIUM-User-Id`` test auth header for one test."""

    previous = os.environ.get("KHRONOS_ALLOW_TEST_AUTH_HEADER")
    os.environ["KHRONOS_ALLOW_TEST_AUTH_HEADER"] = "1"
    try:
        yield
    finally:
        if previous is None:
            os.environ.pop("KHRONOS_ALLOW_TEST_AUTH_HEADER", None)
        else:
            os.environ["KHRONOS_ALLOW_TEST_AUTH_HEADER"] = previous


@pytest.fixture
def oauth_app():
    """Minimal FastAPI app with Khronos OAuth + well-known routes."""

    from fastapi import FastAPI

    from src.backend.auth.router import oauth_router
    from src.backend.mcp.well_known import refresh_metadata_cache
    from src.backend.mcp.well_known import router as well_known_router

    app = FastAPI(title="nerium-test", version="0.1.0")
    app.include_router(oauth_router)
    app.include_router(well_known_router)

    refresh_metadata_cache()
    return app


@pytest.fixture
def oauth_client(oauth_app):
    """Synchronous TestClient bound to ``oauth_app``."""

    from fastapi.testclient import TestClient

    return TestClient(oauth_app, follow_redirects=False)
