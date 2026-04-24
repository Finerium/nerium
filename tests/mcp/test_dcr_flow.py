"""End-to-end OAuth 2.1 DCR flow test against the Khronos MCP surface.

Contract assertions per ``docs/contracts/oauth_dcr.contract.md`` Section 9:

- DCR happy path, public client PKCE support.
- DCR rejects custom URI scheme (RFC 8252).
- DCR accepts localhost http (dev).
- DCR rejects unknown scope.
- well-known metadata endpoints returning RFC 9728 + RFC 8414 shapes.
- Authorization Code + PKCE S256 full flow, JWT aud matches resource.
- Invalid ``code_verifier`` -> invalid_grant, code consumed.
- Single-use enforcement on authorization code.
- Refresh rotation + reuse detection + family revoke.
- Refresh cannot escalate scope beyond original grant.
- JWKS response contains valid RSA public key (kty, n, e, alg, kid, use).

Session-1 scope: tests hit the OAuth routers directly via FastAPI
TestClient + the ``oauth_app`` fixture. Full MCP Streamable HTTP mount is
Session-2 scope.
"""

from __future__ import annotations

import base64
import hashlib
import re
import secrets

import pytest

UUID_V7_REGEX = r"^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
MCP_RESOURCE = "https://nerium.com/mcp"


def _pkce_pair() -> tuple[str, str]:
    """Return (code_verifier, code_challenge) for PKCE S256."""

    verifier = secrets.token_urlsafe(64)[:96]
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return verifier, challenge


def _register_public_client(
    client, redirect_uri: str = "https://claude.ai/api/mcp/auth_callback"
) -> dict:
    payload = {
        "client_name": "Claude.ai MCP Connector",
        "redirect_uris": [redirect_uri],
        "token_endpoint_auth_method": "none",
        "grant_types": ["authorization_code", "refresh_token"],
        "response_types": ["code"],
        "scope": "mcp:read mcp:write",
        "software_id": "claude-ai",
        "software_version": "2026.04",
    }
    response = client.post("/oauth/register", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def test_dcr_happy_path(oauth_client) -> None:
    body = _register_public_client(oauth_client)
    assert re.match(UUID_V7_REGEX, body["client_id"]), body["client_id"]
    assert body["client_secret"] is None
    assert body["client_secret_expires_at"] == 0
    assert body["token_endpoint_auth_method"] == "none"
    assert "authorization_code" in body["grant_types"]
    assert "refresh_token" in body["grant_types"]
    assert body["scope"] == "mcp:read mcp:write"
    assert body["client_id_issued_at"] > 0


def test_dcr_rejects_custom_uri_scheme(oauth_client) -> None:
    payload = {
        "client_name": "Bad Client",
        "redirect_uris": ["myapp://callback"],
        "token_endpoint_auth_method": "none",
        "grant_types": ["authorization_code"],
        "response_types": ["code"],
        "scope": "mcp:read",
    }
    response = oauth_client.post("/oauth/register", json=payload)
    assert response.status_code in {400, 422}


def test_dcr_accepts_localhost_http(oauth_client) -> None:
    payload = {
        "client_name": "Dev Client",
        "redirect_uris": ["http://localhost:3100/callback"],
        "token_endpoint_auth_method": "none",
        "grant_types": ["authorization_code"],
        "response_types": ["code"],
        "scope": "mcp:read",
    }
    response = oauth_client.post("/oauth/register", json=payload)
    assert response.status_code == 201, response.text


def test_dcr_rejects_unknown_scope(oauth_client) -> None:
    payload = {
        "client_name": "Scope Test",
        "redirect_uris": ["https://claude.ai/api/mcp/auth_callback"],
        "token_endpoint_auth_method": "none",
        "grant_types": ["authorization_code"],
        "response_types": ["code"],
        "scope": "mcp:read admin:all",
    }
    response = oauth_client.post("/oauth/register", json=payload)
    assert response.status_code == 400
    detail = response.json()["detail"]
    assert detail["error"] == "invalid_scope"


def test_well_known_protected_resource(oauth_client) -> None:
    response = oauth_client.get("/.well-known/oauth-protected-resource")
    assert response.status_code == 200
    body = response.json()
    assert body["resource"] == MCP_RESOURCE
    assert "https://nerium.com" in body["authorization_servers"]
    assert "RS256" in body["resource_signing_alg_values_supported"]
    assert set(body["scopes_supported"]) == {"mcp:read", "mcp:write", "mcp:admin"}


def test_well_known_authorization_server(oauth_client) -> None:
    response = oauth_client.get("/.well-known/oauth-authorization-server")
    assert response.status_code == 200
    body = response.json()
    assert body["issuer"] == "https://nerium.com"
    assert body["registration_endpoint"] == "https://nerium.com/oauth/register"
    assert body["token_endpoint"] == "https://nerium.com/oauth/token"
    assert body["authorization_endpoint"] == "https://nerium.com/oauth/authorize"
    assert body["jwks_uri"] == "https://nerium.com/oauth/jwks.json"
    assert body["code_challenge_methods_supported"] == ["S256"]
    assert "authorization_code" in body["grant_types_supported"]
    assert "refresh_token" in body["grant_types_supported"]


def test_authorize_redirects_without_auth(oauth_client) -> None:
    reg = _register_public_client(oauth_client)
    _, challenge = _pkce_pair()
    params = {
        "response_type": "code",
        "client_id": reg["client_id"],
        "redirect_uri": "https://claude.ai/api/mcp/auth_callback",
        "scope": "mcp:read",
        "state": "xyz-state",
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "resource": MCP_RESOURCE,
    }
    response = oauth_client.get("/oauth/authorize", params=params)
    assert response.status_code == 302
    location = response.headers.get("location", "")
    assert location.startswith("/login?"), location


def test_authorize_rejects_plain_pkce(oauth_client) -> None:
    reg = _register_public_client(oauth_client)
    _, challenge = _pkce_pair()
    params = {
        "response_type": "code",
        "client_id": reg["client_id"],
        "redirect_uri": "https://claude.ai/api/mcp/auth_callback",
        "scope": "mcp:read",
        "state": "x",
        "code_challenge": challenge,
        "code_challenge_method": "plain",
        "resource": MCP_RESOURCE,
    }
    response = oauth_client.get("/oauth/authorize", params=params)
    assert response.status_code == 400
    assert response.json()["detail"]["error"] == "invalid_request"


def test_authorize_rejects_resource_mismatch(oauth_client) -> None:
    reg = _register_public_client(oauth_client)
    _, challenge = _pkce_pair()
    params = {
        "response_type": "code",
        "client_id": reg["client_id"],
        "redirect_uri": "https://claude.ai/api/mcp/auth_callback",
        "scope": "mcp:read",
        "state": "x",
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "resource": "https://example.com/mcp",
    }
    response = oauth_client.get("/oauth/authorize", params=params)
    assert response.status_code == 400
    assert response.json()["detail"]["error"] == "invalid_target"


def test_authorize_rejects_unknown_client(oauth_client) -> None:
    _, challenge = _pkce_pair()
    params = {
        "response_type": "code",
        "client_id": "00000000-0000-7000-8000-000000000000",
        "redirect_uri": "https://claude.ai/api/mcp/auth_callback",
        "scope": "mcp:read",
        "state": "x",
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "resource": MCP_RESOURCE,
    }
    response = oauth_client.get("/oauth/authorize", params=params)
    assert response.status_code == 401
    assert response.json()["detail"]["error"] == "invalid_client"


def test_authorize_rejects_mismatched_redirect_uri(oauth_client) -> None:
    reg = _register_public_client(oauth_client)
    _, challenge = _pkce_pair()
    params = {
        "response_type": "code",
        "client_id": reg["client_id"],
        "redirect_uri": "https://claude.ai/wrong/callback",
        "scope": "mcp:read",
        "state": "x",
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "resource": MCP_RESOURCE,
    }
    response = oauth_client.get("/oauth/authorize", params=params)
    assert response.status_code == 400
    assert response.json()["detail"]["error"] == "invalid_redirect_uri"


@pytest.mark.usefixtures("enable_test_auth_header")
def test_full_authorization_code_flow(oauth_client) -> None:
    reg = _register_public_client(oauth_client)
    verifier, challenge = _pkce_pair()

    auth_params = {
        "response_type": "code",
        "client_id": reg["client_id"],
        "redirect_uri": "https://claude.ai/api/mcp/auth_callback",
        "scope": "mcp:read",
        "state": "xyz-state",
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "resource": MCP_RESOURCE,
    }
    authorize_response = oauth_client.get(
        "/oauth/authorize",
        params=auth_params,
        headers={"X-NERIUM-User-Id": "01926f00-0000-7000-8000-000000000001"},
    )
    assert authorize_response.status_code == 302, authorize_response.text

    location = authorize_response.headers.get("location", "")
    assert "code=" in location
    assert "state=xyz-state" in location

    from urllib.parse import parse_qs, urlparse

    parsed = urlparse(location)
    qs = parse_qs(parsed.query)
    code_value = qs["code"][0]

    token_response = oauth_client.post(
        "/oauth/token",
        data={
            "grant_type": "authorization_code",
            "code": code_value,
            "redirect_uri": "https://claude.ai/api/mcp/auth_callback",
            "client_id": reg["client_id"],
            "code_verifier": verifier,
            "resource": MCP_RESOURCE,
        },
    )
    assert token_response.status_code == 200, token_response.text
    token_body = token_response.json()
    assert token_body["token_type"] == "Bearer"
    assert token_body["expires_in"] == 3600
    assert token_body["scope"] == "mcp:read"
    assert "refresh_token" in token_body
    access_token = token_body["access_token"]
    assert access_token.count(".") == 2

    jwks_response = oauth_client.get("/oauth/jwks.json")
    assert jwks_response.status_code == 200
    jwks = jwks_response.json()
    assert len(jwks["keys"]) >= 1
    assert jwks["keys"][0]["kty"] == "RSA"
    assert jwks["keys"][0]["alg"] == "RS256"

    from src.backend.auth.jwt_signer import get_signer

    claims = get_signer().verify(access_token, audience=MCP_RESOURCE)
    assert claims["sub"] == "01926f00-0000-7000-8000-000000000001"
    assert claims["aud"] == MCP_RESOURCE
    assert claims["client_id"] == reg["client_id"]
    assert claims["scope"] == "mcp:read"


@pytest.mark.usefixtures("enable_test_auth_header")
def test_token_exchange_rejects_bad_pkce(oauth_client) -> None:
    reg = _register_public_client(oauth_client)
    _, challenge = _pkce_pair()

    auth_response = oauth_client.get(
        "/oauth/authorize",
        params={
            "response_type": "code",
            "client_id": reg["client_id"],
            "redirect_uri": "https://claude.ai/api/mcp/auth_callback",
            "scope": "mcp:read",
            "state": "x",
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "resource": MCP_RESOURCE,
        },
        headers={"X-NERIUM-User-Id": "01926f00-0000-7000-8000-000000000001"},
    )
    assert auth_response.status_code == 302

    from urllib.parse import parse_qs, urlparse

    qs = parse_qs(urlparse(auth_response.headers["location"]).query)
    code_value = qs["code"][0]

    bogus_verifier = secrets.token_urlsafe(64)[:96]
    token_response = oauth_client.post(
        "/oauth/token",
        data={
            "grant_type": "authorization_code",
            "code": code_value,
            "redirect_uri": "https://claude.ai/api/mcp/auth_callback",
            "client_id": reg["client_id"],
            "code_verifier": bogus_verifier,
            "resource": MCP_RESOURCE,
        },
    )
    assert token_response.status_code == 400
    assert token_response.json()["detail"]["error"] == "invalid_grant"


@pytest.mark.usefixtures("enable_test_auth_header")
def test_token_exchange_single_use_enforced(oauth_client) -> None:
    reg = _register_public_client(oauth_client)
    verifier, challenge = _pkce_pair()

    auth_response = oauth_client.get(
        "/oauth/authorize",
        params={
            "response_type": "code",
            "client_id": reg["client_id"],
            "redirect_uri": "https://claude.ai/api/mcp/auth_callback",
            "scope": "mcp:read",
            "state": "x",
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "resource": MCP_RESOURCE,
        },
        headers={"X-NERIUM-User-Id": "01926f00-0000-7000-8000-000000000001"},
    )
    from urllib.parse import parse_qs, urlparse

    qs = parse_qs(urlparse(auth_response.headers["location"]).query)
    code_value = qs["code"][0]

    first = oauth_client.post(
        "/oauth/token",
        data={
            "grant_type": "authorization_code",
            "code": code_value,
            "redirect_uri": "https://claude.ai/api/mcp/auth_callback",
            "client_id": reg["client_id"],
            "code_verifier": verifier,
            "resource": MCP_RESOURCE,
        },
    )
    assert first.status_code == 200

    second = oauth_client.post(
        "/oauth/token",
        data={
            "grant_type": "authorization_code",
            "code": code_value,
            "redirect_uri": "https://claude.ai/api/mcp/auth_callback",
            "client_id": reg["client_id"],
            "code_verifier": verifier,
            "resource": MCP_RESOURCE,
        },
    )
    assert second.status_code == 400
    assert second.json()["detail"]["error"] == "invalid_grant"


@pytest.mark.usefixtures("enable_test_auth_header")
def test_refresh_rotation_and_reuse_detection(oauth_client) -> None:
    reg = _register_public_client(oauth_client)
    verifier, challenge = _pkce_pair()

    auth_response = oauth_client.get(
        "/oauth/authorize",
        params={
            "response_type": "code",
            "client_id": reg["client_id"],
            "redirect_uri": "https://claude.ai/api/mcp/auth_callback",
            "scope": "mcp:read mcp:write",
            "state": "x",
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "resource": MCP_RESOURCE,
        },
        headers={"X-NERIUM-User-Id": "01926f00-0000-7000-8000-000000000001"},
    )
    from urllib.parse import parse_qs, urlparse

    qs = parse_qs(urlparse(auth_response.headers["location"]).query)
    code_value = qs["code"][0]

    first = oauth_client.post(
        "/oauth/token",
        data={
            "grant_type": "authorization_code",
            "code": code_value,
            "redirect_uri": "https://claude.ai/api/mcp/auth_callback",
            "client_id": reg["client_id"],
            "code_verifier": verifier,
            "resource": MCP_RESOURCE,
        },
    )
    assert first.status_code == 200
    initial_refresh = first.json()["refresh_token"]

    rotate = oauth_client.post(
        "/oauth/token",
        data={
            "grant_type": "refresh_token",
            "refresh_token": initial_refresh,
            "client_id": reg["client_id"],
            "resource": MCP_RESOURCE,
        },
    )
    assert rotate.status_code == 200, rotate.text
    second_refresh = rotate.json()["refresh_token"]
    assert second_refresh != initial_refresh

    replay = oauth_client.post(
        "/oauth/token",
        data={
            "grant_type": "refresh_token",
            "refresh_token": initial_refresh,
            "client_id": reg["client_id"],
            "resource": MCP_RESOURCE,
        },
    )
    assert replay.status_code == 400
    assert replay.json()["detail"]["error"] == "invalid_grant"

    post_revoke = oauth_client.post(
        "/oauth/token",
        data={
            "grant_type": "refresh_token",
            "refresh_token": second_refresh,
            "client_id": reg["client_id"],
            "resource": MCP_RESOURCE,
        },
    )
    assert post_revoke.status_code == 400
    assert post_revoke.json()["detail"]["error"] == "invalid_grant"


@pytest.mark.usefixtures("enable_test_auth_header")
def test_refresh_cannot_escalate_scope(oauth_client) -> None:
    reg = _register_public_client(oauth_client)
    verifier, challenge = _pkce_pair()

    auth_response = oauth_client.get(
        "/oauth/authorize",
        params={
            "response_type": "code",
            "client_id": reg["client_id"],
            "redirect_uri": "https://claude.ai/api/mcp/auth_callback",
            "scope": "mcp:read",
            "state": "x",
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "resource": MCP_RESOURCE,
        },
        headers={"X-NERIUM-User-Id": "01926f00-0000-7000-8000-000000000001"},
    )
    from urllib.parse import parse_qs, urlparse

    qs = parse_qs(urlparse(auth_response.headers["location"]).query)
    code_value = qs["code"][0]

    token_resp = oauth_client.post(
        "/oauth/token",
        data={
            "grant_type": "authorization_code",
            "code": code_value,
            "redirect_uri": "https://claude.ai/api/mcp/auth_callback",
            "client_id": reg["client_id"],
            "code_verifier": verifier,
            "resource": MCP_RESOURCE,
        },
    )
    refresh_token_value = token_resp.json()["refresh_token"]

    narrower = oauth_client.post(
        "/oauth/token",
        data={
            "grant_type": "refresh_token",
            "refresh_token": refresh_token_value,
            "client_id": reg["client_id"],
            "resource": MCP_RESOURCE,
            "scope": "mcp:read",
        },
    )
    assert narrower.status_code == 200
    new_refresh = narrower.json()["refresh_token"]

    escalated = oauth_client.post(
        "/oauth/token",
        data={
            "grant_type": "refresh_token",
            "refresh_token": new_refresh,
            "client_id": reg["client_id"],
            "resource": MCP_RESOURCE,
            "scope": "mcp:admin",
        },
    )
    assert escalated.status_code == 400
    assert escalated.json()["detail"]["error"] == "invalid_scope"


def test_jwks_contains_rsa_public_key(oauth_client) -> None:
    response = oauth_client.get("/oauth/jwks.json")
    assert response.status_code == 200
    body = response.json()
    assert body["keys"], body
    first = body["keys"][0]
    assert first["kty"] == "RSA"
    assert first["alg"] == "RS256"
    assert first["use"] == "sig"
    assert "n" in first and "e" in first
    padding = "=" * (-len(first["n"]) % 4)
    n_bytes = base64.urlsafe_b64decode(first["n"] + padding)
    assert 255 <= len(n_bytes) <= 257
