"""POST /v1/protocol/invoke route tests (Crius S1).

Exercises the full dispatch path: Tethys agent JWT auth ->
:func:`require_agent_jwt` -> :func:`dispatch` -> stub adapter.
Failure modes covered: missing JWT, unknown vendor, Hemera kill
switch, kill switch flag absent (treated as not-disabled).
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.backend.errors import register_problem_handlers
from src.backend.protocol.registry import (
    AdapterRegistry,
    reset_registry_for_tests,
)
from src.backend.protocol.adapters.stub_adapter import StubAdapter
from src.backend.registry.identity import (
    generate_ed25519_keypair,
    issue_jwt,
)
from src.backend.routers.v1.protocol import protocol_router
from src.backend.utils.uuid7 import uuid7
from tests.backend.protocol.conftest import make_identity_pem_row


_TEST_TENANT_ID = "22222222-2222-7222-8222-222222222222"


def _build_app() -> FastAPI:
    """Lightweight app: problem handlers + protocol router + tenant binding."""

    app = FastAPI()
    register_problem_handlers(app)

    @app.middleware("http")
    async def _bind_tenant(request, call_next):
        request.state.tenant_id = _TEST_TENANT_ID
        return await call_next(request)

    app.include_router(protocol_router, prefix="/v1")
    return app


def _install_stub_only_registry(monkeypatch: pytest.MonkeyPatch) -> None:
    """Replace the dispatcher registry singleton with a stub-only roster."""

    reset_registry_for_tests()
    registry = AdapterRegistry(adapters=[StubAdapter()])
    monkeypatch.setattr(
        "src.backend.protocol.dispatcher.get_registry", lambda: registry
    )


def _mint_agent_token(public_pem: str, private_pem: str) -> tuple[str, UUID]:
    agent_id = uuid7()
    token = issue_jwt(
        agent_id=str(agent_id),
        claims={"scope": "agent:test"},
        ttl_sec=120,
        private_pem=private_pem,
    )
    return token, agent_id


@pytest.mark.asyncio
async def test_invoke_dispatches_to_stub(
    fake_protocol_pool: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Authenticated invoke returns a stub VendorResponse."""

    _install_stub_only_registry(monkeypatch)

    public_pem, private_pem = generate_ed25519_keypair()
    fake_protocol_pool._test_conn.fetchrow = AsyncMock(
        return_value=make_identity_pem_row(public_pem=public_pem),
    )

    # Hemera kill switch: ``vendor.stub.disabled`` returns False.
    async def _fake_get_flag(name: str, **_kwargs: Any) -> Any:
        return False

    monkeypatch.setattr(
        "src.backend.protocol.dispatcher.get_flag", _fake_get_flag
    )

    token, _ = _mint_agent_token(public_pem, private_pem)
    payload = {"messages": [{"role": "user", "content": "ping"}]}

    with TestClient(_build_app()) as client:
        resp = client.post(
            "/v1/protocol/invoke",
            json={
                "vendor_slug": "stub",
                "task_type": "chat",
                "payload": payload,
            },
            headers={"Authorization": f"Bearer {token}"},
        )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["vendor_slug"] == "stub"
    assert body["task_type"] == "chat"
    assert body["output"]["echo"] == payload


@pytest.mark.asyncio
async def test_invoke_without_jwt_returns_401() -> None:
    """Missing bearer token yields 401 problem+json."""

    with TestClient(_build_app()) as client:
        resp = client.post(
            "/v1/protocol/invoke",
            json={
                "vendor_slug": "stub",
                "task_type": "chat",
                "payload": {},
            },
        )

    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_invoke_unknown_vendor_returns_404(
    fake_protocol_pool: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Unknown ``vendor_slug`` surfaces NotFoundProblem 404."""

    _install_stub_only_registry(monkeypatch)

    public_pem, private_pem = generate_ed25519_keypair()
    fake_protocol_pool._test_conn.fetchrow = AsyncMock(
        return_value=make_identity_pem_row(public_pem=public_pem),
    )

    async def _fake_get_flag(name: str, **_kwargs: Any) -> Any:
        return False

    monkeypatch.setattr(
        "src.backend.protocol.dispatcher.get_flag", _fake_get_flag
    )

    token, _ = _mint_agent_token(public_pem, private_pem)

    with TestClient(_build_app()) as client:
        resp = client.post(
            "/v1/protocol/invoke",
            json={
                "vendor_slug": "imaginary_vendor",
                "task_type": "chat",
                "payload": {},
            },
            headers={"Authorization": f"Bearer {token}"},
        )

    assert resp.status_code == 404
    assert "imaginary_vendor" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_invoke_kill_switch_returns_503(
    fake_protocol_pool: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Hemera ``vendor.stub.disabled = true`` short-circuits with 503."""

    _install_stub_only_registry(monkeypatch)

    public_pem, private_pem = generate_ed25519_keypair()
    fake_protocol_pool._test_conn.fetchrow = AsyncMock(
        return_value=make_identity_pem_row(public_pem=public_pem),
    )

    flag_calls: list[str] = []

    async def _fake_get_flag(name: str, **_kwargs: Any) -> Any:
        flag_calls.append(name)
        return name == "vendor.stub.disabled"

    monkeypatch.setattr(
        "src.backend.protocol.dispatcher.get_flag", _fake_get_flag
    )

    token, _ = _mint_agent_token(public_pem, private_pem)

    with TestClient(_build_app()) as client:
        resp = client.post(
            "/v1/protocol/invoke",
            json={
                "vendor_slug": "stub",
                "task_type": "chat",
                "payload": {"text": "x"},
            },
            headers={"Authorization": f"Bearer {token}"},
        )

    assert resp.status_code == 503
    assert "vendor.stub.disabled" in resp.json()["detail"]
    # Kill switch checked BEFORE invoke; flag read happened.
    assert "vendor.stub.disabled" in flag_calls


@pytest.mark.asyncio
async def test_invoke_treats_missing_flag_as_not_disabled(
    fake_protocol_pool: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """``get_flag`` returning None (unregistered) does NOT block dispatch."""

    _install_stub_only_registry(monkeypatch)

    public_pem, private_pem = generate_ed25519_keypair()
    fake_protocol_pool._test_conn.fetchrow = AsyncMock(
        return_value=make_identity_pem_row(public_pem=public_pem),
    )

    async def _fake_get_flag(name: str, **_kwargs: Any) -> Any:
        return None  # unregistered flag

    monkeypatch.setattr(
        "src.backend.protocol.dispatcher.get_flag", _fake_get_flag
    )

    token, _ = _mint_agent_token(public_pem, private_pem)

    with TestClient(_build_app()) as client:
        resp = client.post(
            "/v1/protocol/invoke",
            json={
                "vendor_slug": "stub",
                "task_type": "chat",
                "payload": {"x": 1},
            },
            headers={"Authorization": f"Bearer {token}"},
        )

    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_invoke_rejects_revoked_agent(
    fake_protocol_pool: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Revoked identity token yields 401 even with a valid signature."""

    _install_stub_only_registry(monkeypatch)

    public_pem, private_pem = generate_ed25519_keypair()
    fake_protocol_pool._test_conn.fetchrow = AsyncMock(
        return_value=make_identity_pem_row(
            public_pem=public_pem, status="revoked"
        ),
    )

    async def _fake_get_flag(name: str, **_kwargs: Any) -> Any:
        return False

    monkeypatch.setattr(
        "src.backend.protocol.dispatcher.get_flag", _fake_get_flag
    )

    token, _ = _mint_agent_token(public_pem, private_pem)

    with TestClient(_build_app()) as client:
        resp = client.post(
            "/v1/protocol/invoke",
            json={
                "vendor_slug": "stub",
                "task_type": "chat",
                "payload": {},
            },
            headers={"Authorization": f"Bearer {token}"},
        )

    assert resp.status_code == 401
    assert "revoked" in resp.json()["detail"].lower()
