"""Stateless BYOK Anthropic Messages API forwarder.

Owner: Aether-Vercel T6 Phase 1.5.

Purpose
-------
Public endpoint ``POST /v1/builder/sessions/live`` that receives a
user-supplied Anthropic API key and forwards a single
``POST /v1/messages`` call to ``https://api.anthropic.com``. The
upstream SSE stream is proxied back to the browser as a same-shape
``text/event-stream`` response. The endpoint is intentionally stateless
and skips the Heracles Managed Agent executor entirely (V6 prior
decision Path B): a pure Messages API forward keeps the surface tiny,
auditable, and zero-state on NERIUM's side.

Hard contract
-------------
- ZERO usage of any NERIUM-side ``ANTHROPIC_API_KEY`` env var. The
  user's key is the ONLY credential that hits Anthropic.
- The user key is NEVER logged, NEVER persisted to DB, NEVER stored
  in Redis. It lives in the request body, gets forwarded as a header
  on a single httpx call, and falls out of memory at end of request.
- Server-side timeout 25 seconds (frontend frames 30 seconds with a
  5 second buffer). Anthropic SSE upstream is closed cleanly on
  client disconnect or timeout.
- Format validation: ``user_api_key`` must match the Anthropic key
  shape (``sk-ant-api03-`` prefix + 93+ char base64url tail). Missing
  or malformed key returns RFC 7807 problem+json 400.
- Logging: only endpoint hit + complexity tier + timestamp + a derived
  prompt hash (NOT the raw prompt or key).

Auth posture
------------
- The endpoint is in ``DEFAULT_PUBLIC_PATHS`` (registered in
  ``src/backend/middleware/auth.py``). Anonymous browser visitors can
  hit it; the user's voluntary Anthropic key is the only credential.
- Rate limiting rides the existing per-IP ``install_rate_limit``.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
import time
from typing import Any, AsyncIterator, Literal

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator

from src.backend.errors.problem_json import ProblemException

__all__ = ["live_session_router"]

logger = logging.getLogger(__name__)

ANTHROPIC_KEY_REGEX = re.compile(r"^sk-ant-api03-[A-Za-z0-9_\-]{93,}$")
"""Strict key shape (matches the frontend regex one-to-one)."""

ANTHROPIC_BASE_URL = "https://api.anthropic.com"
ANTHROPIC_VERSION = "2023-06-01"

SERVER_TIMEOUT_SECONDS = 25.0
"""Server-side hard timeout. Frontend frames 30 seconds; the 5 second
buffer makes the abort always observable from the browser side."""

DEFAULT_MODEL = "claude-haiku-4-5"
"""Default model for the BYOK live demo. Haiku keeps the per-call
billing on the user's account small while still demonstrating the
real Builder runtime invocation pattern. The user's actual prompt
shapes the request; the choice of Haiku here is a defensive default."""

DEFAULT_MAX_TOKENS = 1024
"""Cap output tokens so a runaway prompt cannot drain the user's
Anthropic balance. The user's account is the one paying, so we lean
conservative."""


class LiveSessionRequest(BaseModel):
    """Inbound payload for ``POST /v1/builder/sessions/live``."""

    prompt: str = Field(
        ...,
        min_length=1,
        max_length=8192,
        description="User-supplied build prompt. Free text.",
    )
    complexity_tier: Literal["small", "medium", "large"] = Field(
        ...,
        description="Sekuri tier classification. Used for log breadcrumbs only.",
    )
    user_api_key: str = Field(
        ...,
        description=(
            "User's Anthropic API key. Forwarded as x-api-key on the upstream "
            "Messages API call. NEVER logged, NEVER persisted."
        ),
    )

    @field_validator("user_api_key")
    @classmethod
    def _validate_key_shape(cls, value: str) -> str:
        if not ANTHROPIC_KEY_REGEX.match(value):
            raise ValueError(
                "user_api_key does not match the Anthropic key shape "
                "(expected sk-ant-api03-... format)."
            )
        return value


live_session_router = APIRouter(prefix="/builder", tags=["builder"])


def _hash_prompt(prompt: str) -> str:
    """Hash the prompt for log breadcrumbs.

    The raw prompt is private to the user. We log a SHA-256 prefix so
    operators can correlate retries on the same prompt without storing
    the prompt itself.
    """

    return hashlib.sha256(prompt.encode("utf-8")).hexdigest()[:12]


@live_session_router.post(
    "/sessions/live",
    summary="BYOK Anthropic Messages forwarder",
    response_class=StreamingResponse,
)
async def post_live_session(
    payload: LiveSessionRequest,
    request: Request,
) -> StreamingResponse:
    """Forward a single Messages API call to Anthropic and proxy SSE back.

    Returns a ``text/event-stream`` response carrying the upstream
    Anthropic event stream verbatim. On any upstream error the response
    surfaces as RFC 7807 problem+json with the appropriate status code.
    """

    if not payload.user_api_key.startswith("sk-ant-api03-"):
        # Belt-and-suspenders: the field_validator already enforces this.
        raise ProblemException(
            status=400,
            slug="validation_failed",
            title="Invalid Anthropic API key shape",
            detail="user_api_key must begin with sk-ant-api03-.",
        )

    prompt_hash = _hash_prompt(payload.prompt)
    logger.info(
        "builder.live_session.invoke tier=%s prompt_hash=%s ts=%s",
        payload.complexity_tier,
        prompt_hash,
        int(time.time()),
    )

    body = {
        "model": DEFAULT_MODEL,
        "max_tokens": DEFAULT_MAX_TOKENS,
        "stream": True,
        "messages": [{"role": "user", "content": payload.prompt}],
    }

    headers = {
        "x-api-key": payload.user_api_key,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
        "accept": "text/event-stream",
    }

    # The user_api_key local variable falls out of scope at end of
    # request. We do NOT bind it to any global, do NOT log it, do NOT
    # echo the request body in any log line.

    async def _proxy_stream() -> AsyncIterator[bytes]:
        timeout_cfg = httpx.Timeout(
            connect=10.0,
            read=SERVER_TIMEOUT_SECONDS,
            write=10.0,
            pool=10.0,
        )
        try:
            async with httpx.AsyncClient(
                base_url=ANTHROPIC_BASE_URL,
                timeout=timeout_cfg,
            ) as client:
                async with client.stream(
                    "POST",
                    "/v1/messages",
                    json=body,
                    headers=headers,
                ) as resp:
                    if resp.status_code == 401:
                        # Surface as RFC 7807 inline frame; the client
                        # treats 401/403 as invalid_key result.
                        msg = (
                            "event: error\n"
                            'data: {"type":"upstream_unauthorized","status":401}\n\n'
                        )
                        yield msg.encode("utf-8")
                        return
                    if resp.status_code == 429:
                        msg = (
                            "event: error\n"
                            'data: {"type":"upstream_rate_limited","status":429}\n\n'
                        )
                        yield msg.encode("utf-8")
                        return
                    if resp.status_code >= 400:
                        # Read the upstream body for structured surface
                        # without exposing the request key.
                        body_text = (
                            await resp.aread()
                        ).decode("utf-8", errors="replace")[:512]
                        msg = (
                            "event: error\n"
                            f"data: {json.dumps({'type': 'upstream_error', 'status': resp.status_code, 'detail': body_text})}\n\n"
                        )
                        yield msg.encode("utf-8")
                        return

                    async for chunk in resp.aiter_raw():
                        if await request.is_disconnected():
                            return
                        if chunk:
                            yield chunk
        except httpx.TimeoutException:
            msg = (
                "event: error\n"
                'data: {"type":"upstream_timeout","status":504}\n\n'
            )
            yield msg.encode("utf-8")
        except httpx.RequestError as exc:
            # Coarse network error. Body must NOT leak the key value;
            # `exc` is httpx-side and does not contain the header.
            logger.warning(
                "builder.live_session.upstream_transport_error err_class=%s",
                type(exc).__name__,
            )
            msg = (
                "event: error\n"
                'data: {"type":"upstream_transport_error","status":502}\n\n'
            )
            yield msg.encode("utf-8")

    return StreamingResponse(
        _proxy_stream(),
        media_type="text/event-stream",
        headers={
            "cache-control": "no-cache, no-transform",
            "x-accel-buffering": "no",
        },
    )
