"""CRUD + middleware tests for Tethys agent identity (W2 NP P5 S1).

Exercises the four router endpoints + the ``require_agent_jwt``
dependency through a lightweight FastAPI app that wires only what the
identity surface needs (no full Aether lifespan). DB is faked via the
:func:`fake_identity_pool` fixture.

Coverage matrix
---------------
- POST /v1/identity/agents creates a row + returns ``private_pem`` once.
- GET (list) returns owner-scoped rows.
- GET (single) 404s when the row belongs to a different owner.
- DELETE flips status + returns 204; second call returns 404.
- ``require_agent_jwt`` rejects revoked + accepts active + retiring.
- ``require_agent_jwt`` rejects unknown agent + missing bearer.
"""

from __future__ import annotations

import time
from typing import Any
from unittest.mock import AsyncMock
from uuid import UUID

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from jose import jwt as jose_jwt

from src.backend.config import Settings
from src.backend.errors import register_problem_handlers
from src.backend.middleware.auth import install_auth
from src.backend.registry.identity import (
    AgentPrincipal,
    generate_ed25519_keypair,
    issue_jwt,
    require_agent_jwt,
)
from src.backend.routers.v1.identity import identity_router
from src.backend.utils.uuid7 import uuid7
from tests.backend.registry.identity.conftest import make_identity_row

_TEST_USER_ID = "11111111-1111-7111-8111-111111111111"
_TEST_TENANT_ID = "22222222-2222-7222-8222-222222222222"


@pytest.fixture
def identity_settings() -> Settings:
    return Settings(
        env="development",
        version="0.1.0-test",
        trusted_hosts=["testserver", "localhost"],
        cors_origins=["http://testserver"],
    )


@pytest.fixture
def identity_app(identity_settings: Settings) -> FastAPI:
    """Lightweight app with auth + problem handlers + identity router.

    Avoids the full Aether middleware stack (rate limit, tenant
    binding) so the router test focuses on the identity surface.
    Tenant binding is replicated inline via a tiny dependency that
    populates ``request.state.tenant_id`` from the JWT claim.
    """

    app = FastAPI()
    register_problem_handlers(app)
    install_auth(app, settings=identity_settings)

    @app.middleware("http")
    async def _bind_tenant(request, call_next):
        # Mirror what ``TenantBindingMiddleware`` does in production
        # so the router's ``_principal_uuids`` helper sees a valid
        # tenant on every authenticated request.
        auth = getattr(request.state, "auth", None)
        if auth is not None:
            request.state.tenant_id = auth.tenant_id
        return await call_next(request)

    app.include_router(identity_router, prefix="/v1")
    return app


@pytest.fixture
def auth_headers(identity_settings: Settings) -> dict[str, str]:
    """HS256 bearer token recognised by the default Aether verifier."""

    now = int(time.time())
    token = jose_jwt.encode(
        {
            "sub": _TEST_USER_ID,
            "tenant_id": _TEST_TENANT_ID,
            "iss": "nerium-test",
            "iat": now,
            "exp": now + 600,
            "scope": "",
        },
        identity_settings.secret_key.get_secret_value(),
        algorithm="HS256",
    )
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# POST /v1/identity/agents
# ---------------------------------------------------------------------------


def test_post_register_returns_private_pem_once(
    identity_app: FastAPI,
    auth_headers: dict[str, str],
    fake_identity_pool: Any,
) -> None:
    """The POST handler returns ``private_pem`` exactly once + persists pubkey only."""

    captured: dict[str, Any] = {}

    async def _fake_fetchrow(query: str, *args: Any) -> dict[str, Any]:
        # The first argument after the SQL is the new id; downstream args
        # are the inserted column values. Capture so we can assert that
        # the private PEM is NEVER passed through to the DB layer.
        captured["query"] = query
        captured["args"] = args
        agent_id = args[0]
        owner = args[2]
        display_name = args[4]
        public_pem = args[6]
        return make_identity_row(
            agent_id=agent_id,
            tenant_id=UUID(_TEST_TENANT_ID),
            owner_user_id=owner,
            display_name=display_name,
            public_key_pem=public_pem,
            status="active",
        )

    fake_identity_pool._test_conn.fetchrow = AsyncMock(side_effect=_fake_fetchrow)

    with TestClient(identity_app) as client:
        resp = client.post(
            "/v1/identity/agents",
            json={"display_name": "Marketplace Listing Agent"},
            headers=auth_headers,
        )

    assert resp.status_code == 201
    body = resp.json()
    assert body["display_name"] == "Marketplace Listing Agent"
    assert body["status"] == "active"
    assert body["public_pem"].startswith("-----BEGIN PUBLIC KEY-----")
    assert body["private_pem"].startswith("-----BEGIN PRIVATE KEY-----")
    # Confirm the private PEM is NOT among the asyncpg arguments.
    private_pem = body["private_pem"]
    for arg in captured["args"]:
        assert arg != private_pem
        # Defensive: also ensure no inserted PEM contains the private
        # block markers (so a future refactor cannot smuggle it through).
        if isinstance(arg, str):
            assert "BEGIN PRIVATE KEY" not in arg


def test_post_requires_authentication(identity_app: FastAPI) -> None:
    with TestClient(identity_app) as client:
        resp = client.post(
            "/v1/identity/agents",
            json={"display_name": "Anon Agent"},
        )
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# GET /v1/identity/agents (list)
# ---------------------------------------------------------------------------


def test_get_list_returns_owner_scoped_rows(
    identity_app: FastAPI,
    auth_headers: dict[str, str],
    fake_identity_pool: Any,
) -> None:
    rows = [
        make_identity_row(
            tenant_id=UUID(_TEST_TENANT_ID),
            owner_user_id=UUID(_TEST_USER_ID),
            display_name="Agent One",
        ),
        make_identity_row(
            tenant_id=UUID(_TEST_TENANT_ID),
            owner_user_id=UUID(_TEST_USER_ID),
            display_name="Agent Two",
        ),
    ]
    fake_identity_pool._test_conn.fetch = AsyncMock(return_value=rows)

    with TestClient(identity_app) as client:
        resp = client.get("/v1/identity/agents", headers=auth_headers)

    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 2
    assert {entry["display_name"] for entry in body} == {"Agent One", "Agent Two"}
    # Private PEM never on read responses.
    for entry in body:
        assert "private_pem" not in entry


# ---------------------------------------------------------------------------
# GET /v1/identity/agents/{agent_id}
# ---------------------------------------------------------------------------


def test_get_single_404_for_other_owner(
    identity_app: FastAPI,
    auth_headers: dict[str, str],
    fake_identity_pool: Any,
) -> None:
    """Cross-user GET returns 404, not 403 (existence not leaked)."""

    fake_identity_pool._test_conn.fetchrow = AsyncMock(return_value=None)

    foreign_id = uuid7()
    with TestClient(identity_app) as client:
        resp = client.get(
            f"/v1/identity/agents/{foreign_id}",
            headers=auth_headers,
        )

    assert resp.status_code == 404


def test_get_single_returns_row_for_owner(
    identity_app: FastAPI,
    auth_headers: dict[str, str],
    fake_identity_pool: Any,
) -> None:
    target_id = uuid7()
    row = make_identity_row(
        agent_id=target_id,
        tenant_id=UUID(_TEST_TENANT_ID),
        owner_user_id=UUID(_TEST_USER_ID),
        display_name="Target Agent",
    )
    fake_identity_pool._test_conn.fetchrow = AsyncMock(return_value=row)

    with TestClient(identity_app) as client:
        resp = client.get(
            f"/v1/identity/agents/{target_id}",
            headers=auth_headers,
        )

    assert resp.status_code == 200
    assert resp.json()["agent_id"] == str(target_id)


# ---------------------------------------------------------------------------
# DELETE /v1/identity/agents/{agent_id}
# ---------------------------------------------------------------------------


def test_delete_revokes_identity_with_204(
    identity_app: FastAPI,
    auth_headers: dict[str, str],
    fake_identity_pool: Any,
) -> None:
    fake_identity_pool._test_conn.execute = AsyncMock(return_value="UPDATE 1")
    target_id = uuid7()

    with TestClient(identity_app) as client:
        resp = client.delete(
            f"/v1/identity/agents/{target_id}",
            headers=auth_headers,
        )

    assert resp.status_code == 204
    # Inspect the SQL passed in to confirm we set status='revoked'.
    args = fake_identity_pool._test_conn.execute.await_args
    assert args is not None
    sql = args.args[0]
    assert "status = 'revoked'" in sql
    assert "revoked_at" in sql


def test_delete_returns_404_when_already_revoked(
    identity_app: FastAPI,
    auth_headers: dict[str, str],
    fake_identity_pool: Any,
) -> None:
    fake_identity_pool._test_conn.execute = AsyncMock(return_value="UPDATE 0")
    target_id = uuid7()

    with TestClient(identity_app) as client:
        resp = client.delete(
            f"/v1/identity/agents/{target_id}",
            headers=auth_headers,
        )

    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# require_agent_jwt middleware
# ---------------------------------------------------------------------------


def _build_protected_app(identity_settings: Settings) -> FastAPI:
    """App with one route guarded by ``require_agent_jwt``."""

    app = FastAPI()
    register_problem_handlers(app)

    @app.middleware("http")
    async def _bind_tenant(request, call_next):
        # require_agent_jwt reads request.state.tenant_id; install one
        # unconditionally for these tests since the app does not run
        # the Aether tenant binding middleware.
        request.state.tenant_id = _TEST_TENANT_ID
        return await call_next(request)

    @app.get("/agent-only")
    async def _route(principal: AgentPrincipal = Depends(require_agent_jwt)) -> dict:
        return {
            "agent_id": str(principal.agent_id),
            "status": principal.status,
        }

    return app


def test_middleware_accepts_active_identity(
    identity_settings: Settings,
    fake_identity_pool: Any,
) -> None:
    """Active-status identity verifies a freshly issued EdDSA JWT."""

    public_pem, private_pem = generate_ed25519_keypair()
    agent_id = uuid7()
    fake_identity_pool._test_conn.fetchrow = AsyncMock(
        return_value={
            "public_key_pem": public_pem,
            "status": "active",
            "owner_user_id": UUID(_TEST_USER_ID),
        }
    )

    token = issue_jwt(
        agent_id=str(agent_id),
        claims={"scope": "agent:tool_use"},
        ttl_sec=120,
        private_pem=private_pem,
    )

    app = _build_protected_app(identity_settings)
    with TestClient(app) as client:
        resp = client.get(
            "/agent-only",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["agent_id"] == str(agent_id)
    assert body["status"] == "active"


def test_middleware_accepts_retiring_identity(
    identity_settings: Settings,
    fake_identity_pool: Any,
) -> None:
    """Retiring-status identity is accepted during the 14-day grace window."""

    public_pem, private_pem = generate_ed25519_keypair()
    agent_id = uuid7()
    fake_identity_pool._test_conn.fetchrow = AsyncMock(
        return_value={
            "public_key_pem": public_pem,
            "status": "retiring",
            "owner_user_id": UUID(_TEST_USER_ID),
        }
    )

    token = issue_jwt(
        agent_id=str(agent_id),
        claims={},
        ttl_sec=60,
        private_pem=private_pem,
    )

    app = _build_protected_app(identity_settings)
    with TestClient(app) as client:
        resp = client.get(
            "/agent-only",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 200
    assert resp.json()["status"] == "retiring"


def test_middleware_rejects_revoked_identity(
    identity_settings: Settings,
    fake_identity_pool: Any,
) -> None:
    """Revoked identities yield 401, regardless of valid signature."""

    public_pem, private_pem = generate_ed25519_keypair()
    agent_id = uuid7()
    fake_identity_pool._test_conn.fetchrow = AsyncMock(
        return_value={
            "public_key_pem": public_pem,
            "status": "revoked",
            "owner_user_id": UUID(_TEST_USER_ID),
        }
    )

    token = issue_jwt(
        agent_id=str(agent_id),
        claims={},
        ttl_sec=60,
        private_pem=private_pem,
    )

    app = _build_protected_app(identity_settings)
    with TestClient(app) as client:
        resp = client.get(
            "/agent-only",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 401
    assert "revoked" in resp.json()["detail"].lower()


def test_middleware_rejects_unknown_identity(
    identity_settings: Settings,
    fake_identity_pool: Any,
) -> None:
    """When the agent_id is not in the DB the middleware refuses."""

    _, private_pem = generate_ed25519_keypair()
    agent_id = uuid7()
    fake_identity_pool._test_conn.fetchrow = AsyncMock(return_value=None)

    token = issue_jwt(
        agent_id=str(agent_id),
        claims={},
        ttl_sec=60,
        private_pem=private_pem,
    )

    app = _build_protected_app(identity_settings)
    with TestClient(app) as client:
        resp = client.get(
            "/agent-only",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 401
    assert "unknown" in resp.json()["detail"].lower()


def test_middleware_rejects_missing_bearer(identity_settings: Settings) -> None:
    app = _build_protected_app(identity_settings)
    with TestClient(app) as client:
        resp = client.get("/agent-only")
    assert resp.status_code == 401
