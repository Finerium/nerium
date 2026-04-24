"""HTTP-level tests for the Nike ticket endpoints.

Exercises ``POST /v1/realtime/ticket`` + ``POST /v1/realtime/ticket/revoke``
via FastAPI :class:`TestClient` so the auth middleware + problem+json
plumbing is covered end to end.

The Postgres ownership check is bypassed for session-scope resources
via monkeypatching :func:`ticket_service._default_session_ownership_check`
so these tests do not require asyncpg.
"""

from __future__ import annotations

from typing import Callable
from uuid import UUID

import pytest
from fakeredis import aioredis as fake_aioredis
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.backend.config import Settings
from src.backend.errors import register_problem_handlers
from src.backend.middleware.auth import install_auth


USER_ID = "aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa"
TENANT_ID = "bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb"
SESSION_ID = "cccccccc-cccc-7ccc-8ccc-cccccccccccc"


@pytest.fixture
def redis_client():
    """Fakeredis instance shared between the app and the tests.

    Unlike the async fixture used elsewhere, this one is sync because
    :class:`TestClient` drives the lifespan inside its own event loop
    and we want a single handle visible to both sides.
    """

    client = fake_aioredis.FakeRedis(decode_responses=True)
    yield client


@pytest.fixture
def ticket_app(
    test_settings: Settings,
    redis_client,
    monkeypatch: pytest.MonkeyPatch,
) -> FastAPI:
    """FastAPI app wired with Aether auth + Nike ticket router.

    The Redis handle is fed to the ticket endpoint by monkeypatching
    :func:`get_redis_client` (the router imports it at call time). DB
    ownership checks are stubbed to always pass.
    """

    from src.backend.routers.v1.realtime.ticket import ticket_router
    from src.backend.realtime import ticket_service as ticket_service_module
    from src.backend.routers.v1.realtime import ticket as ticket_route_module

    async def _always_ok(
        _user_id: UUID, _tenant_id: UUID, _session_id: UUID
    ) -> bool:
        return True

    monkeypatch.setattr(
        ticket_service_module,
        "_default_session_ownership_check",
        _always_ok,
    )
    monkeypatch.setattr(
        ticket_route_module, "get_redis_client", lambda: redis_client
    )

    app = FastAPI()
    register_problem_handlers(app)
    install_auth(app, settings=test_settings)
    app.include_router(ticket_router, prefix="/v1")
    return app


@pytest.fixture
def client(ticket_app: FastAPI) -> TestClient:
    with TestClient(ticket_app) as c:
        yield c


def _auth_header(factory: Callable[..., str]) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {factory(user_id=USER_ID, tenant_id=TENANT_ID)}"
    }


# ---------------------------------------------------------------------------
# POST /v1/realtime/ticket
# ---------------------------------------------------------------------------


def test_mint_endpoint_returns_ticket(
    client: TestClient,
    hs256_jwt_factory: Callable[..., str],
) -> None:
    response = client.post(
        "/v1/realtime/ticket",
        json={
            "resource": f"builder:session:{SESSION_ID}",
            "ttl_seconds": 120,
        },
        headers=_auth_header(hs256_jwt_factory),
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["ticket"]
    assert body["jti"]
    assert body["resource"] == f"ma:session:{SESSION_ID}"
    assert body["expires_in"] == 120
    assert body["expires_at"] - body["issued_at"] == 120


def test_mint_endpoint_clamps_ttl(
    client: TestClient,
    hs256_jwt_factory: Callable[..., str],
) -> None:
    # Pydantic validation rejects TTLs above MAX before we get to the
    # service; pick a value exactly at the ceiling instead.
    response = client.post(
        "/v1/realtime/ticket",
        json={
            "resource": f"user:{USER_ID}",
            "ttl_seconds": 300,
        },
        headers=_auth_header(hs256_jwt_factory),
    )
    assert response.status_code == 200, response.text
    assert response.json()["expires_in"] == 300


def test_mint_endpoint_rejects_bad_resource(
    client: TestClient,
    hs256_jwt_factory: Callable[..., str],
) -> None:
    response = client.post(
        "/v1/realtime/ticket",
        json={"resource": "not-a-valid-shape"},
        headers=_auth_header(hs256_jwt_factory),
    )
    assert response.status_code == 422
    body = response.json()
    assert "problems/" in body["type"]
    assert "resource" in str(body)


def test_mint_endpoint_without_auth_is_401(client: TestClient) -> None:
    response = client.post(
        "/v1/realtime/ticket",
        json={"resource": f"user:{USER_ID}"},
    )
    assert response.status_code == 401


def test_mint_cross_user_resource_is_403(
    client: TestClient,
    hs256_jwt_factory: Callable[..., str],
) -> None:
    other_user = "dddddddd-dddd-7ddd-8ddd-dddddddddddd"
    response = client.post(
        "/v1/realtime/ticket",
        json={"resource": f"user:{other_user}"},
        headers=_auth_header(hs256_jwt_factory),
    )
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# POST /v1/realtime/ticket/revoke
# ---------------------------------------------------------------------------


def test_revoke_endpoint_happy_path(
    client: TestClient,
    hs256_jwt_factory: Callable[..., str],
) -> None:
    mint_resp = client.post(
        "/v1/realtime/ticket",
        json={"resource": f"user:{USER_ID}"},
        headers=_auth_header(hs256_jwt_factory),
    )
    assert mint_resp.status_code == 200
    jti = mint_resp.json()["jti"]

    revoke_resp = client.post(
        "/v1/realtime/ticket/revoke",
        json={"jti": jti},
        headers=_auth_header(hs256_jwt_factory),
    )
    assert revoke_resp.status_code == 200
    assert revoke_resp.json()["revoked"] is True

    # Second revoke is idempotent (already revoked -> False).
    repeat = client.post(
        "/v1/realtime/ticket/revoke",
        json={"jti": jti},
        headers=_auth_header(hs256_jwt_factory),
    )
    assert repeat.status_code == 200
    assert repeat.json()["revoked"] is False


def test_revoke_endpoint_404_on_missing_jti(
    client: TestClient,
    hs256_jwt_factory: Callable[..., str],
) -> None:
    response = client.post(
        "/v1/realtime/ticket/revoke",
        json={"jti": "does-not-exist"},
        headers=_auth_header(hs256_jwt_factory),
    )
    assert response.status_code == 404


def test_revoke_endpoint_blocks_non_owner(
    client: TestClient,
    hs256_jwt_factory: Callable[..., str],
) -> None:
    # User A mints.
    mint_resp = client.post(
        "/v1/realtime/ticket",
        json={"resource": f"user:{USER_ID}"},
        headers=_auth_header(hs256_jwt_factory),
    )
    jti = mint_resp.json()["jti"]

    # User B tries to revoke.
    other_user = "dddddddd-dddd-7ddd-8ddd-dddddddddddd"
    headers = {
        "Authorization": (
            f"Bearer {hs256_jwt_factory(user_id=other_user, tenant_id=TENANT_ID)}"
        )
    }
    response = client.post(
        "/v1/realtime/ticket/revoke",
        json={"jti": jti},
        headers=headers,
    )
    assert response.status_code == 403
