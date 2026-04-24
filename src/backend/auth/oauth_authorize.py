"""GET /oauth/authorize (OAuth 2.1 authorization code + PKCE S256 + RFC 8707).

Contract: ``docs/contracts/oauth_dcr.contract.md`` Section 4.2.

Flow
----
1. Validate query parameters (response_type=code, S256, resource match,
   scope subset, redirect_uri exact match).
2. Resolve the client via ``client_id``; unknown -> 401 invalid_client.
3. Authenticate the user. For hackathon scope, sources in order:
   - ``X-NERIUM-User-Id`` header when env ``KHRONOS_ALLOW_TEST_AUTH_HEADER``
     is truthy.
   - ``request.state.user_id`` set by Aether ``AuthMiddleware``.
4. Mint a 43-char URL-safe authorization code with 60 second TTL, persist
   to the ``CodeStore``, redirect to
   ``redirect_uri?code=<>&state=<echoed>``.

The ``state`` parameter is echoed verbatim per RFC 6749 Section 4.1.2 and
also bound to an ``__Host-oauth_state`` cookie for CSRF validation at the
token exchange step.
"""

from __future__ import annotations

import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated
from urllib.parse import quote, urlencode
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Request, status
from fastapi.responses import RedirectResponse
from pydantic import HttpUrl

from src.backend.auth.client_store import get_store
from src.backend.auth.code_store import get_store as get_code_store
from src.backend.auth.models.client import RegisteredClient
from src.backend.auth.models.code import AuthorizationCode

log = logging.getLogger(__name__)

ADVERTISED_MCP_RESOURCE = "https://nerium.com/mcp"
AUTH_CODE_TTL_SECONDS = 60
AUTH_CODE_NBYTES = 32


def _mint_auth_code() -> str:
    return secrets.token_urlsafe(AUTH_CODE_NBYTES)


def _resolve_user_from_request(request: Request) -> UUID | None:
    if os.environ.get("KHRONOS_ALLOW_TEST_AUTH_HEADER", "").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }:
        header_val = request.headers.get("x-nerium-user-id")
        if header_val:
            try:
                return UUID(header_val)
            except ValueError:
                return None

    state_user_id = getattr(request.state, "user_id", None) if hasattr(request, "state") else None
    if state_user_id is None:
        return None
    if isinstance(state_user_id, UUID):
        return state_user_id
    try:
        return UUID(str(state_user_id))
    except ValueError:
        return None


async def _lookup_client(client_id: str) -> RegisteredClient:
    record = await get_store().get(client_id)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error": "invalid_client",
                "error_description": "unknown client_id",
            },
        )
    return record


router = APIRouter(prefix="/oauth", tags=["oauth"])


@router.get("/authorize")
async def authorize(
    request: Request,
    client_id: Annotated[str, Query(min_length=1, max_length=128)],
    redirect_uri: Annotated[str, Query(min_length=1, max_length=2048)],
    response_type: Annotated[str, Query(min_length=1)],
    code_challenge: Annotated[str, Query(min_length=43, max_length=128)],
    code_challenge_method: Annotated[str, Query()],
    resource: Annotated[str, Query(min_length=1, max_length=2048)],
    state: Annotated[str | None, Query(max_length=512)] = None,
    scope: Annotated[str | None, Query(max_length=512)] = None,
):
    chosen_code_store = get_code_store()

    if response_type != "code":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "unsupported_response_type",
                "error_description": "only response_type=code is supported",
            },
        )

    if code_challenge_method != "S256":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "invalid_request",
                "error_description": "code_challenge_method must be S256",
            },
        )

    if resource != ADVERTISED_MCP_RESOURCE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "invalid_target",
                "error_description": (
                    f"resource must equal {ADVERTISED_MCP_RESOURCE}; got {resource}"
                ),
            },
        )

    client = await _lookup_client(client_id)
    registered_uris = {str(uri) for uri in client.redirect_uris}
    normalised = {u.rstrip("/") for u in registered_uris}
    if redirect_uri not in registered_uris and redirect_uri.rstrip("/") not in normalised:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "invalid_redirect_uri",
                "error_description": "redirect_uri does not match any registered URI",
            },
        )

    requested_scope = scope or client.scope
    requested_set = {s for s in requested_scope.split() if s}
    client_set = set(client.scopes())
    unknown = requested_set - client_set
    if unknown:
        params: dict[str, str] = {
            "error": "invalid_scope",
            "error_description": f"scope not permitted for client: {sorted(unknown)}",
        }
        if state is not None:
            params["state"] = state
        sep = "&" if "?" in redirect_uri else "?"
        return RedirectResponse(
            url=f"{redirect_uri}{sep}{urlencode(params)}",
            status_code=status.HTTP_302_FOUND,
        )

    user_id = _resolve_user_from_request(request)
    if user_id is None:
        original = str(request.url)
        next_qs = urlencode({"next": original})
        log.info(
            "oauth.authorize.unauthenticated_redirect",
            extra={
                "event": "oauth.authorize.unauthenticated_redirect",
                "client_id": client_id,
            },
        )
        return RedirectResponse(url=f"/login?{next_qs}", status_code=status.HTTP_302_FOUND)

    now = datetime.now(timezone.utc)
    code_value = _mint_auth_code()
    auth_code = AuthorizationCode(
        code=code_value,
        client_id=client_id,
        user_id=user_id,
        redirect_uri=HttpUrl(redirect_uri),
        scope=requested_scope,
        code_challenge=code_challenge,
        code_challenge_method="S256",
        resource=[HttpUrl(resource)],
        expires_at=now + timedelta(seconds=AUTH_CODE_TTL_SECONDS),
        used=False,
        created_at=now,
    )
    await chosen_code_store.put(auth_code)

    log.info(
        "oauth.authorize.consented",
        extra={
            "event": "oauth.authorize.consented",
            "client_id": client_id,
            "user_id": str(user_id),
            "scope": requested_scope,
            "resource": resource,
        },
    )

    params = {"code": code_value}
    if state is not None:
        params["state"] = state
    sep = "&" if "?" in redirect_uri else "?"
    final_redirect = f"{redirect_uri}{sep}{urlencode(params, quote_via=quote)}"

    response = RedirectResponse(url=final_redirect, status_code=status.HTTP_302_FOUND)
    if state is not None:
        response.set_cookie(
            key="__Host-oauth_state",
            value=state,
            secure=True,
            httponly=True,
            samesite="lax",
            path="/",
            max_age=AUTH_CODE_TTL_SECONDS,
        )
    return response
