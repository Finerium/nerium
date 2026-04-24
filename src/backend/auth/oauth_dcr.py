"""POST /oauth/register (RFC 7591 Dynamic Client Registration).

Contract: ``docs/contracts/oauth_dcr.contract.md`` Section 4.1.

Hemera flag ``oauth.dcr_enabled`` gates the endpoint via env shim
``HEMERA_FLAG_OAUTH_DCR_ENABLED`` until the flag service lands. Rate limit
is an in-memory sliding window (10 registrations / IP / hour); Aether swaps
for Redis token bucket once the pool is live.
"""

from __future__ import annotations

import logging
import os
import secrets
import threading
import time
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator

from src.backend.auth._uuid import uuid7_str
from src.backend.auth.client_store import get_store
from src.backend.auth.models.client import RegisteredClient

log = logging.getLogger(__name__)


async def _flag_enabled(flag_name: str, default: bool) -> bool:
    """Shim reader for Hemera flag service. Swap to ``flags.service`` when available."""

    raw = os.environ.get(f"HEMERA_FLAG_{flag_name.upper().replace('.', '_')}")
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


class _SlidingWindowLimit:
    def __init__(self, capacity: int, window_seconds: int) -> None:
        self.capacity = capacity
        self.window_seconds = window_seconds
        self._events: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def consume(self, key: str) -> bool:
        now = time.time()
        with self._lock:
            events = self._events.get(key, [])
            events = [t for t in events if now - t < self.window_seconds]
            if len(events) >= self.capacity:
                self._events[key] = events
                return False
            events.append(now)
            self._events[key] = events
            return True


_dcr_limit = _SlidingWindowLimit(capacity=10, window_seconds=3600)


class ClientRegistrationRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    client_name: str = Field(..., min_length=1, max_length=200)
    redirect_uris: list[HttpUrl] = Field(..., min_length=1, max_length=16)
    token_endpoint_auth_method: Literal["none", "client_secret_post"] = "none"
    grant_types: list[Literal["authorization_code", "refresh_token"]] = Field(
        default_factory=lambda: ["authorization_code", "refresh_token"]
    )
    response_types: list[Literal["code"]] = Field(default_factory=lambda: ["code"])
    scope: str = "mcp:read"

    client_uri: HttpUrl | None = None
    logo_uri: HttpUrl | None = None
    tos_uri: HttpUrl | None = None
    policy_uri: HttpUrl | None = None

    software_id: str | None = Field(default=None, max_length=200)
    software_version: str | None = Field(default=None, max_length=50)

    @field_validator("redirect_uris")
    @classmethod
    def _redirect_uris_must_be_https_or_localhost(cls, v: list[HttpUrl]) -> list[HttpUrl]:
        for uri in v:
            scheme = uri.scheme.lower()
            host = (uri.host or "").lower()
            if scheme == "https":
                continue
            if scheme == "http" and host in {"localhost", "127.0.0.1", "::1"}:
                continue
            raise ValueError(
                "redirect_uris must use https, except localhost/loopback for dev"
            )
        return v


class ClientRegistrationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    client_id: str
    client_id_issued_at: int
    client_secret: str | None = None
    client_secret_expires_at: int = 0
    redirect_uris: list[HttpUrl]
    token_endpoint_auth_method: Literal["none", "client_secret_post"]
    grant_types: list[str]
    response_types: list[str]
    scope: str


_SUPPORTED_SCOPES: set[str] = {"mcp:read", "mcp:write", "mcp:admin"}


def _validate_scope_subset(requested: str) -> None:
    requested_set = {s for s in requested.split() if s}
    unknown = requested_set - _SUPPORTED_SCOPES
    if unknown:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "invalid_scope",
                "error_description": f"unknown scopes: {sorted(unknown)}",
            },
        )


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client is None:
        return "unknown"
    return request.client.host


router = APIRouter(prefix="/oauth", tags=["oauth"])


@router.post(
    "/register",
    response_model=ClientRegistrationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register_client(
    body: ClientRegistrationRequest,
    request: Request,
) -> ClientRegistrationResponse:
    dcr_enabled = await _flag_enabled("oauth.dcr_enabled", default=True)
    if not dcr_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "error": "temporarily_unavailable",
                "error_description": "Dynamic Client Registration is disabled",
            },
        )

    client_ip = _client_ip(request)
    if not _dcr_limit.consume(client_ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "error": "slow_down",
                "error_description": "Too many registrations from this IP. Retry in 1 hour.",
            },
            headers={"Retry-After": "3600"},
        )

    _validate_scope_subset(body.scope)

    if body.token_endpoint_auth_method == "client_secret_post":
        client_secret: str | None = secrets.token_urlsafe(48)
    else:
        client_secret = None

    now = datetime.now(timezone.utc)
    now_unix = int(now.timestamp())
    client_id = uuid7_str()

    record = RegisteredClient(
        client_id=client_id,
        client_secret=client_secret,
        client_secret_expires_at=0,
        client_id_issued_at=now_unix,
        redirect_uris=body.redirect_uris,
        token_endpoint_auth_method=body.token_endpoint_auth_method,
        grant_types=body.grant_types,
        response_types=body.response_types,
        scope=body.scope,
        client_name=body.client_name,
        client_uri=body.client_uri,
        logo_uri=body.logo_uri,
        tos_uri=body.tos_uri,
        policy_uri=body.policy_uri,
        software_id=body.software_id,
        software_version=body.software_version,
        created_at=now,
    )

    try:
        await get_store().insert(record)
    except ValueError as exc:
        log.warning(
            "oauth.dcr.insert_conflict",
            extra={"event": "oauth.dcr.insert_conflict", "reason": str(exc)},
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "invalid_client_metadata",
                "error_description": "client registration conflict, retry",
            },
        ) from exc

    log.info(
        "oauth.dcr.registered",
        extra={
            "event": "oauth.dcr.registered",
            "client_id": client_id,
            "client_name": body.client_name,
            "redirect_uri": str(body.redirect_uris[0]),
            "auth_method": body.token_endpoint_auth_method,
            "ip": client_ip,
        },
    )

    return ClientRegistrationResponse(
        client_id=client_id,
        client_id_issued_at=now_unix,
        client_secret=client_secret,
        client_secret_expires_at=0,
        redirect_uris=body.redirect_uris,
        token_endpoint_auth_method=body.token_endpoint_auth_method,
        grant_types=list(body.grant_types),
        response_types=list(body.response_types),
        scope=body.scope,
    )


def reset_rate_limit_for_tests() -> None:
    global _dcr_limit
    _dcr_limit = _SlidingWindowLimit(capacity=10, window_seconds=3600)
