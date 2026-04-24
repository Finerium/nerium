"""POST /oauth/token + GET /oauth/jwks.json.

Contract: ``docs/contracts/oauth_dcr.contract.md`` Section 4.3 + 4.4.

Grants: ``authorization_code`` (PKCE S256 + RFC 8707 resource binding) and
``refresh_token`` (rotation + reuse detection). Error envelope follows
RFC 6749 Section 5.2 JSON.
"""

from __future__ import annotations

import base64
import hashlib
import logging
from typing import Annotated, Any

from fastapi import APIRouter, Form, HTTPException, Request, status
from fastapi.responses import JSONResponse
from jose.exceptions import JWTError
from pydantic import HttpUrl

from src.backend.auth.client_store import get_store
from src.backend.auth.code_store import get_store as get_code_store
from src.backend.auth.jwt_signer import DEFAULT_TTL_SECONDS, get_signer
from src.backend.auth.models.client import RegisteredClient
from src.backend.auth.refresh_chain import (
    InvalidRefreshError,
    ReuseDetectedError,
    get_chain,
)

log = logging.getLogger(__name__)

ADVERTISED_MCP_RESOURCE = "https://nerium.com/mcp"


def _oauth_error(
    error: str, description: str, http_status: int = status.HTTP_400_BAD_REQUEST
) -> HTTPException:
    return HTTPException(
        status_code=http_status,
        detail={"error": error, "error_description": description},
    )


def _pkce_verify(code_verifier: str, code_challenge: str) -> bool:
    digest = hashlib.sha256(code_verifier.encode("utf-8")).digest()
    computed = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return computed == code_challenge


async def _lookup_client(client_id: str) -> RegisteredClient:
    record = await get_store().get(client_id)
    if record is None:
        raise _oauth_error("invalid_client", "unknown client_id", status.HTTP_401_UNAUTHORIZED)
    return record


def _verify_client_secret(client: RegisteredClient, presented_secret: str | None) -> None:
    if client.token_endpoint_auth_method == "none":
        if presented_secret:
            raise _oauth_error(
                "invalid_client",
                "public clients must not send client_secret",
                status.HTTP_401_UNAUTHORIZED,
            )
        return
    if not presented_secret or not client.client_secret:
        raise _oauth_error(
            "invalid_client",
            "client_secret required for confidential clients",
            status.HTTP_401_UNAUTHORIZED,
        )
    if presented_secret != client.client_secret:
        raise _oauth_error(
            "invalid_client", "client_secret mismatch", status.HTTP_401_UNAUTHORIZED
        )


router = APIRouter(prefix="/oauth", tags=["oauth"])


@router.post("/token")
async def token(
    request: Request,
    grant_type: Annotated[str, Form()],
    client_id: Annotated[str, Form()],
    code: Annotated[str | None, Form()] = None,
    redirect_uri: Annotated[str | None, Form()] = None,
    code_verifier: Annotated[str | None, Form()] = None,
    resource: Annotated[str | None, Form()] = None,
    refresh_token: Annotated[str | None, Form()] = None,
    scope: Annotated[str | None, Form()] = None,
    client_secret: Annotated[str | None, Form()] = None,
) -> JSONResponse:
    code_store = get_code_store()
    signer = get_signer()
    chain = get_chain()

    client = await _lookup_client(client_id)
    _verify_client_secret(client, client_secret)

    if grant_type == "authorization_code":
        if code is None or redirect_uri is None or code_verifier is None or resource is None:
            raise _oauth_error(
                "invalid_request",
                "code, redirect_uri, code_verifier, and resource are required",
            )
        return await _grant_authorization_code(
            client=client,
            code_value=code,
            redirect_uri=redirect_uri,
            code_verifier=code_verifier,
            resource=resource,
            code_store=code_store,
            signer=signer,
            refresh_chain=chain,
        )

    if grant_type == "refresh_token":
        if refresh_token is None or resource is None:
            raise _oauth_error(
                "invalid_request", "refresh_token and resource are required"
            )
        return await _grant_refresh_token(
            client=client,
            presented_refresh=refresh_token,
            resource=resource,
            requested_scope=scope,
            signer=signer,
            refresh_chain=chain,
        )

    raise _oauth_error("unsupported_grant_type", f"grant_type {grant_type!r} not supported")


async def _grant_authorization_code(
    *,
    client: RegisteredClient,
    code_value: str,
    redirect_uri: str,
    code_verifier: str,
    resource: str,
    code_store,
    signer,
    refresh_chain,
) -> JSONResponse:
    record = await code_store.consume(code_value)
    if record is None:
        raise _oauth_error("invalid_grant", "authorization code expired, already used, or unknown")

    if record.client_id != client.client_id:
        raise _oauth_error("invalid_grant", "authorization code not issued to this client")

    if str(record.redirect_uri).rstrip("/") != redirect_uri.rstrip("/"):
        raise _oauth_error("invalid_grant", "redirect_uri mismatch")

    if not _pkce_verify(code_verifier, record.code_challenge):
        log.warning(
            "oauth.pkce.mismatch",
            extra={"event": "oauth.pkce.mismatch", "client_id": client.client_id},
        )
        raise _oauth_error("invalid_grant", "PKCE verification failed")

    requested_resource = HttpUrl(resource)
    recorded_resources = {str(r).rstrip("/") for r in record.resource}
    if str(requested_resource).rstrip("/") not in recorded_resources:
        raise _oauth_error(
            "invalid_target", "resource param does not match authorization request"
        )

    claims: dict[str, Any] = {
        "sub": str(record.user_id),
        "aud": str(requested_resource).rstrip("/"),
        "client_id": client.client_id,
        "scope": record.scope,
    }
    access_token = signer.sign(payload=claims, ttl_seconds=DEFAULT_TTL_SECONDS)

    refresh_plaintext, _record = await refresh_chain.issue_initial(
        client_id=client.client_id,
        user_id=record.user_id,
        scope=record.scope,
        resource=requested_resource,
    )

    log.info(
        "oauth.token.issued",
        extra={
            "event": "oauth.token.issued",
            "client_id": client.client_id,
            "user_id": str(record.user_id),
            "grant_type": "authorization_code",
            "scope": record.scope,
        },
    )

    return JSONResponse(
        content={
            "access_token": access_token,
            "token_type": "Bearer",
            "expires_in": DEFAULT_TTL_SECONDS,
            "refresh_token": refresh_plaintext,
            "scope": record.scope,
        }
    )


async def _grant_refresh_token(
    *,
    client: RegisteredClient,
    presented_refresh: str,
    resource: str,
    requested_scope: str | None,
    signer,
    refresh_chain,
) -> JSONResponse:
    try:
        new_plaintext, new_record = await refresh_chain.rotate(presented_refresh)
    except ReuseDetectedError as exc:
        log.warning(
            "oauth.refresh.reuse_rejected",
            extra={
                "event": "oauth.refresh.reuse_rejected",
                "family_id": str(exc.family_id),
                "client_id": client.client_id,
            },
        )
        raise _oauth_error("invalid_grant", "refresh family revoked due to reuse") from exc
    except InvalidRefreshError as exc:
        raise _oauth_error("invalid_grant", str(exc)) from exc

    if new_record.client_id != client.client_id:
        raise _oauth_error("invalid_grant", "refresh token not issued to this client")

    requested_resource = HttpUrl(resource)
    if str(new_record.resource).rstrip("/") != str(requested_resource).rstrip("/"):
        raise _oauth_error("invalid_target", "resource param does not match refresh binding")

    effective_scope = requested_scope or new_record.scope
    requested_set = {s for s in effective_scope.split() if s}
    original_set = {s for s in new_record.scope.split() if s}
    if not requested_set.issubset(original_set):
        raise _oauth_error("invalid_scope", "cannot escalate scope during refresh")

    claims: dict[str, Any] = {
        "sub": str(new_record.user_id),
        "aud": str(requested_resource).rstrip("/"),
        "client_id": client.client_id,
        "scope": effective_scope,
    }
    access_token = signer.sign(payload=claims, ttl_seconds=DEFAULT_TTL_SECONDS)

    log.info(
        "oauth.token.issued",
        extra={
            "event": "oauth.token.issued",
            "client_id": client.client_id,
            "user_id": str(new_record.user_id),
            "grant_type": "refresh_token",
            "scope": effective_scope,
        },
    )

    return JSONResponse(
        content={
            "access_token": access_token,
            "token_type": "Bearer",
            "expires_in": DEFAULT_TTL_SECONDS,
            "refresh_token": new_plaintext,
            "scope": effective_scope,
        }
    )


@router.get("/jwks.json")
async def jwks() -> JSONResponse:
    payload = get_signer().jwks()
    return JSONResponse(
        content=payload,
        headers={"Cache-Control": "public, max-age=300"},
    )


def verify_access_token(
    token: str,
    *,
    audience: str = ADVERTISED_MCP_RESOURCE,
    required_scope: str | None = None,
) -> dict[str, Any]:
    """Verify a bearer access token. Raises ``HTTPException`` on failure.

    Intended for import by the MCP middleware in Session 2.
    """

    try:
        claims = get_signer().verify(token, audience=audience)
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "invalid_token", "error_description": str(exc)},
            headers={
                "WWW-Authenticate": (
                    'Bearer realm="nerium-mcp", error="invalid_token", '
                    'resource_metadata="https://nerium.com/.well-known/oauth-protected-resource"'
                ),
            },
        ) from exc

    if required_scope is not None:
        token_scopes = set((claims.get("scope") or "").split())
        if required_scope not in token_scopes:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error": "insufficient_scope",
                    "error_description": f"scope {required_scope} required",
                    "required_scope": required_scope,
                },
            )

    return claims
