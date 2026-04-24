"""SSE stream endpoint for MA sessions.

Owner: Kratos (W2 S2).

Serves ``GET /v1/ma/sessions/{id}/stream`` per
``ma_session_lifecycle.contract.md`` Section 4.2 +
``realtime_bus.contract.md`` Section 4.2.

Authentication paths
--------------------
Two paths to resolve an :class:`AuthPrincipal` on this endpoint:

1. ``Authorization: Bearer <jwt>`` header, verified via the same
   default HS256 verifier the Aether AuthMiddleware uses (server-side
   + Tauri + MCP).
2. ``?ticket=<jwt>`` query param, verified via the Nike-owned
   realtime ticket verifier installed through
   :mod:`src.backend.ma.ticket_verifier`.

The Aether ``AuthMiddleware`` runs FIRST on the request; the ticket
path applies when the middleware has passed through without populating
``request.state.auth`` (which happens when the caller is a browser
using ``EventSource`` that cannot set ``Authorization``). To support
that, the SSE route is mounted as a **public** path in the auth
middleware's skip list (caller populates ``request.state.auth``
manually from the ticket after our local verification).

Event flow
----------
1. Verify the session exists + belongs to the caller's tenant.
2. Emit a ``retry: 3000`` comment so the browser reconnection cadence
   stays under 3 s.
3. If ``Last-Event-ID`` is set, replay persisted events strictly
   greater than that id from Postgres (:func:`select_events_since`).
   Missing-window emits HTTP 410 per the contract before the stream
   opens.
4. Subscribe to the Redis Pub/Sub channel
   ``ma:event:<session_id>`` for live events, interleaving heartbeat
   ``: ping\\n\\n`` every 15 s per Section 4.2.
5. Close on ``nerium.ma.done`` (terminal session wire event) OR on
   client disconnect.

Heartbeat + cancellation
------------------------
The handler uses :func:`asyncio.wait_for` with the heartbeat interval
so slow event gaps still emit keepalives. Cancel detection is via
``await request.is_disconnected()`` inside the loop; the MA session
cancel endpoint is orthogonal (it flips the Redis cancel flag; the
dispatcher terminates independently).

Contract references
-------------------
- ``docs/contracts/ma_session_lifecycle.contract.md`` Section 4.2.
- ``docs/contracts/realtime_bus.contract.md`` Section 4.2 + 4.3.
- ``docs/contracts/agent_orchestration_runtime.contract.md`` Section 4.2
  normalize_and_publish emit path.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any, AsyncIterator, Optional
from uuid import UUID

from fastapi import Header, Query, Request
from fastapi.responses import StreamingResponse

from src.backend.config import get_settings
from src.backend.db.pool import get_pool
from src.backend.db.tenant import tenant_scoped
from src.backend.errors import NotFoundProblem, ProblemException, UnauthorizedProblem
from src.backend.errors.problem_json import CONTENT_TYPE_PROBLEM_JSON
from src.backend.ma.event_bus import (
    PUBSUB_CHANNEL_FMT,
    row_to_envelope,
    select_events_since,
)
from src.backend.ma.queries import select_session_by_id
from src.backend.ma.state_machine import MASessionStatus, is_terminal
from src.backend.ma.ticket_verifier import (
    verify_bearer,
    verify_ticket,
    verify_ticket_async,
)
from src.backend.middleware.auth import AuthPrincipal
from src.backend.redis_client import get_redis_client

logger = logging.getLogger(__name__)

HEARTBEAT_INTERVAL_S: float = 15.0
"""Per contract Section 4.2: ``: ping\\n\\n`` every 15 s."""

REPLAY_BATCH_LIMIT: int = 500
"""Max ``ma_event`` rows returned per replay DB hit."""

SSE_DONE_EVENT_TYPE: str = "nerium.ma.done"
"""Wire event type that closes the stream normally."""

SSE_ERRORED_EVENT_TYPE: str = "nerium.ma.errored"
"""Wire event type emitted on terminal-state failure."""

SSE_RETRY_MS: int = 3000
"""Browser reconnection backoff hint (SSE ``retry:`` field, 3 s)."""


async def resolve_sse_principal(
    request: Request,
    ticket: Optional[str],
) -> AuthPrincipal:
    """Return an :class:`AuthPrincipal` or raise.

    Preference order:

    1. ``request.state.auth`` already populated by the Aether
       middleware (bearer header path).
    2. ``Authorization: Bearer <jwt>`` raw header (middleware was
       skipped because the route is on the public path list).
    3. ``?ticket=<jwt>`` query param (browser SSE).
    """

    principal = getattr(request.state, "auth", None)
    if isinstance(principal, AuthPrincipal):
        return principal

    authorization = request.headers.get("authorization", "")
    if authorization:
        scheme, _, token = authorization.partition(" ")
        if scheme.lower() == "bearer" and token:
            return verify_bearer(token, get_settings())

    if ticket:
        return await verify_ticket_async(ticket)

    raise UnauthorizedProblem(
        detail=(
            "SSE stream requires either a Bearer token (server-to-server) "
            "or a realtime ticket query-param (browser)."
        )
    )


def _format_sse_event(envelope: dict[str, Any]) -> str:
    """Render one realtime-bus envelope as an SSE frame.

    The ``id:`` header carries the bigserial from ``ma_event`` so
    clients send it back on ``Last-Event-ID`` during reconnect.
    ``event:`` carries the wire type; the ``data:`` field is a single
    JSON-encoded line (no embedded newlines per SSE spec).
    """

    event_id = envelope["id"]
    event_type = envelope["type"]
    data = json.dumps(envelope, separators=(",", ":"))
    return f"id: {event_id}\nevent: {event_type}\ndata: {data}\n\n"


def _format_heartbeat() -> str:
    return ": ping\n\n"


def _format_retry() -> str:
    return f"retry: {SSE_RETRY_MS}\n\n"


async def _collect_replay(
    session_id: UUID,
    tenant_id: UUID,
    after_event_id: int,
) -> AsyncIterator[dict[str, Any]]:
    """Yield persisted envelopes strictly greater than ``after_event_id``.

    Iterates Postgres pages so a client reconnecting after a long
    disconnect does not OOM the backend. Tenant-bound connection
    means RLS enforces isolation on the underlying SELECT.
    """

    last_id = int(after_event_id)
    pool = get_pool()
    while True:
        async with tenant_scoped(pool, tenant_id) as conn:
            rows = await select_events_since(
                conn,
                session_id=session_id,
                after_event_id=last_id,
                limit=REPLAY_BATCH_LIMIT,
            )
        if not rows:
            return
        for row in rows:
            last_id = int(row["id"])
            yield row_to_envelope(row)
        if len(rows) < REPLAY_BATCH_LIMIT:
            return


async def _live_tail(
    session_id: UUID,
    request: Request,
) -> AsyncIterator[dict[str, Any]]:
    """Yield envelopes published to the per-session Pub/Sub channel.

    Listens on ``ma:event:<session_id>``. Terminates when the client
    disconnects OR when we observe ``nerium.ma.done`` +
    ``nerium.ma.errored`` + ``nerium.ma.cancelled``.
    """

    redis = get_redis_client()
    pubsub = redis.pubsub()
    channel = PUBSUB_CHANNEL_FMT.format(session_id=str(session_id))
    try:
        await pubsub.subscribe(channel)
        while True:
            if await request.is_disconnected():
                logger.info(
                    "ma.sse.client_disconnected session_id=%s", session_id
                )
                return

            message = await _next_message(pubsub, timeout=HEARTBEAT_INTERVAL_S)
            if message is None:
                # Timed out; caller yields a heartbeat.
                yield {"__kind__": "heartbeat"}
                continue

            raw = message.get("data")
            if isinstance(raw, bytes):
                raw = raw.decode("utf-8", errors="ignore")
            if not raw:
                continue
            try:
                envelope = json.loads(raw)
            except ValueError:
                logger.warning(
                    "ma.sse.pubsub_bad_json session_id=%s raw=%r",
                    session_id,
                    raw,
                )
                continue
            yield envelope
            event_type = envelope.get("type", "")
            if event_type in {
                SSE_DONE_EVENT_TYPE,
                SSE_ERRORED_EVENT_TYPE,
                "nerium.ma.cancelled",
            }:
                return
    finally:
        try:
            await pubsub.unsubscribe(channel)
            await pubsub.aclose()
        except Exception:
            logger.exception(
                "ma.sse.pubsub_teardown_failed session_id=%s", session_id
            )


async def _next_message(pubsub: Any, *, timeout: float) -> Any:
    """Fetch the next pub/sub message or ``None`` on timeout.

    Redis async client's ``get_message`` supports ``timeout`` in
    seconds; ``ignore_subscribe_messages=True`` drops the
    confirmation frames so we only yield real payloads.
    """

    return await pubsub.get_message(
        ignore_subscribe_messages=True,
        timeout=timeout,
    )


async def sse_event_generator(
    request: Request,
    session_id: UUID,
    tenant_id: UUID,
    after_event_id: int,
) -> AsyncIterator[str]:
    """Compose replay + live-tail with heartbeats.

    Yields pre-formatted SSE frames (one ``event: ...\\ndata: ...\\n\\n``
    block per frame, or ``: ping\\n\\n`` for heartbeats) so the caller
    can pass the iterator straight into :class:`StreamingResponse`.
    """

    yield _format_retry()

    last_emitted_ts = datetime.now(timezone.utc)

    async for envelope in _collect_replay(
        session_id=session_id,
        tenant_id=tenant_id,
        after_event_id=after_event_id,
    ):
        yield _format_sse_event(envelope)
        last_emitted_ts = datetime.now(timezone.utc)

    # Heartbeat bridge: if the replay finished but the session is
    # already terminal we will not see more live events. Probe once
    # and close cleanly.
    pool = get_pool()
    async with tenant_scoped(pool, tenant_id) as conn:
        row = await select_session_by_id(conn, session_id=session_id)
    if row is None:
        return
    if is_terminal(MASessionStatus(row["status"])):
        # Clients that reconnect after terminal state expect HTTP 410;
        # we reached here because the route-level check allowed the
        # open because at least one replay event existed, but now the
        # stream has nothing more to emit. Close quietly.
        return

    async for envelope in _live_tail(session_id=session_id, request=request):
        if envelope.get("__kind__") == "heartbeat":
            yield _format_heartbeat()
            last_emitted_ts = datetime.now(timezone.utc)
            continue
        yield _format_sse_event(envelope)
        last_emitted_ts = datetime.now(timezone.utc)


async def sse_stream_handler(
    request: Request,
    session_id: UUID,
    last_event_id: Optional[str],
    ticket: Optional[str],
) -> StreamingResponse:
    """High-level orchestration for the SSE endpoint.

    Called by the router wrapper in
    :mod:`src.backend.routers.v1.ma.sessions`. Returns a
    :class:`StreamingResponse` bound to the composed event generator.
    """

    principal = await resolve_sse_principal(request, ticket=ticket)
    tenant_id = UUID(principal.tenant_id)

    pool = get_pool()
    async with tenant_scoped(pool, tenant_id) as conn:
        row = await select_session_by_id(conn, session_id=session_id)
    if row is None:
        raise NotFoundProblem(detail="ma session not found")

    # Already-terminal sessions with NO retained replay window get 410.
    current = MASessionStatus(row["status"])
    after_event_id = _parse_last_event_id(last_event_id)

    if is_terminal(current) and after_event_id == 0:
        # Client never saw a replay id AND session is terminal; let
        # them do a normal GET instead of tailing a dead stream.
        raise ProblemException(
            detail=(
                "Session already reached a terminal state. "
                "Use GET /v1/ma/sessions/{id} instead of the stream."
            ),
            slug="stream_gone",
            title="Stream closed",
            status=410,
        )

    generator = sse_event_generator(
        request=request,
        session_id=session_id,
        tenant_id=tenant_id,
        after_event_id=after_event_id,
    )
    headers = {
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
        "Connection": "keep-alive",
    }
    return StreamingResponse(
        generator,
        media_type="text/event-stream",
        headers=headers,
    )


def _parse_last_event_id(raw: Optional[str]) -> int:
    """Parse the SSE ``Last-Event-ID`` header to an int.

    Malformed values raise :class:`ProblemException` with slug
    ``invalid_event_id`` so clients see a 400 they can react to,
    rather than silently replaying the whole buffer.
    """

    if raw is None or raw == "":
        return 0
    try:
        parsed = int(raw)
    except ValueError:
        raise ProblemException(
            detail=f"Last-Event-ID must be an integer; got {raw!r}.",
            slug="invalid_event_id",
            title="Invalid Last-Event-ID",
            status=400,
        )
    if parsed < 0:
        raise ProblemException(
            detail="Last-Event-ID must be non-negative.",
            slug="invalid_event_id",
            title="Invalid Last-Event-ID",
            status=400,
        )
    return parsed


__all__ = [
    "HEARTBEAT_INTERVAL_S",
    "REPLAY_BATCH_LIMIT",
    "SSE_DONE_EVENT_TYPE",
    "SSE_ERRORED_EVENT_TYPE",
    "SSE_RETRY_MS",
    "resolve_sse_principal",
    "sse_event_generator",
    "sse_stream_handler",
]
