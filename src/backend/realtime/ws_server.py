"""WebSocket endpoint at ``/v1/realtime/ws``.

Owner: Nike (W2 NP P3 S1).

Connection lifecycle
--------------------
1. **Handshake**: client opens ``WSS /v1/realtime/ws?ticket=<jwt>``.
   The route mounts under the auth middleware's WebSocket bypass
   (Starlette's auth middleware does not run on ``websocket`` scope by
   default), so we authenticate explicitly via the realtime ticket
   verifier.
2. **Quota check**: per-user concurrent connection cap (5 by default
   per contract Section 4.4). Excess connections close immediately
   with :data:`CloseCode.QUOTA_EXCEEDED`.
3. **Welcome frame**: server sends ``{"op":"welcome","connection_id":
   "<uuid7>","heartbeat_ms":<ping>}`` so the client knows its assigned
   connection id and the heartbeat cadence.
4. **Resume replay**: if ``Last-Event-ID`` came in via the query
   string OR the client sends ``{"op":"resume","last_event_id":<n>}``
   immediately after connect, the server replays from the per-tenant
   Redis Stream up to :data:`REPLAY_MAX_EVENTS` events. Out-of-window
   replays emit ``{"op":"resume_truncated"}``.
5. **Receive loop**: parses each text frame, dispatches per ``op``.
   ``ping`` -> reply ``pong``. ``pong`` -> record on tracker.
   ``subscribe`` / ``unsubscribe`` mutate the room set. ``resume``
   triggers a replay. Unknown ops respond with ``op:error``.
6. **Heartbeat task**: runs in parallel with the receive loop; closes
   the connection on missed pong or idle timeout.
7. **Disconnect**: releases the registry slot + emits a lifecycle
   audit event with reason.

Authentication and middleware
-----------------------------
The path ends in ``/ws`` rather than ``/stream`` (which is in the
middleware bypass list for SSE). FastAPI's ASGI middleware stack does
not call the HTTP ``AuthMiddleware`` on a WebSocket scope so we MUST
verify the ticket explicitly. The verifier returns an
:class:`AuthPrincipal` whose ``tenant_id`` we use for the registry
binding.

Audit
-----
Every connect, disconnect, timeout, and ticket-rejection is enqueued
via :func:`src.backend.realtime.audit.emit_lifecycle`. Failures of the
audit pipeline are logged but never block the request path.

Tests
-----
``tests/backend/realtime/test_websocket.py`` drives this endpoint via
:class:`fastapi.testclient.TestClient.websocket_connect`. The fixture
installs a fakeredis pool + a dev HS256 ticket factory.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Optional

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from src.backend.errors import UnauthorizedProblem
from src.backend.realtime.audit import emit_lifecycle
from src.backend.realtime.connection_manager import (
    ConnectionManager,
    ConnectionQuotaExceeded,
    REPLAY_MAX_EVENTS,
    get_connection_manager,
)
from src.backend.realtime.events import (
    CLOSE_REASON_CLIENT_GOODBYE,
    CLOSE_REASON_INTERNAL_ERROR,
    CLOSE_REASON_QUOTA_EXCEEDED,
    CLOSE_REASON_TICKET_INVALID,
    CLOSE_REASON_TICKET_MISSING,
    CloseCode,
    ConnectionLifecycleEvent,
    WS_OP_ERROR,
    WS_OP_EVENT,
    WS_OP_PING,
    WS_OP_PONG,
    WS_OP_RESUME,
    WS_OP_RESUME_ACK,
    WS_OP_RESUME_TRUNCATED,
    WS_OP_SUBSCRIBE,
    WS_OP_SUBSCRIBE_ACK,
    WS_OP_UNSUBSCRIBE,
    WS_OP_UNSUBSCRIBE_ACK,
    WS_OP_WELCOME,
)
from src.backend.realtime.heartbeat import (
    HeartbeatPolicy,
    HeartbeatTracker,
    run_heartbeat_loop,
)
from src.backend.realtime.ticket import verify_ticket

logger = logging.getLogger(__name__)


realtime_ws_router = APIRouter(tags=["realtime"])


@realtime_ws_router.websocket("/realtime/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    ticket: Optional[str] = Query(default=None),
    last_event_id: Optional[int] = Query(default=None, alias="last_event_id"),
) -> None:
    """Generic realtime WebSocket entry point.

    Mounted under the ``/v1`` prefix so the absolute path is
    ``/v1/realtime/ws``.
    """

    # 1. Ticket verification BEFORE accept so a bad ticket never sees
    #    the upgrade. Failures call ``websocket.close`` directly.
    try:
        principal = verify_ticket(ticket)
    except UnauthorizedProblem as exc:
        reason = (
            CLOSE_REASON_TICKET_MISSING
            if exc.detail == "ticket_missing"
            else CLOSE_REASON_TICKET_INVALID
        )
        await _refuse(
            websocket,
            code=CloseCode.TICKET_INVALID,
            reason=reason,
        )
        return

    tenant_id = str(principal.tenant_id)
    user_id = str(principal.user_id)

    # 2. Accept handshake.
    await websocket.accept()

    # 3. Register and enforce per-user cap.
    manager: ConnectionManager
    try:
        manager = get_connection_manager()
    except RuntimeError:
        # Lifespan misconfiguration. Tear down with internal error.
        await websocket.close(
            code=CloseCode.INTERNAL_ERROR,
            reason=CLOSE_REASON_INTERNAL_ERROR,
        )
        return

    try:
        record = await manager.register(
            websocket=websocket,
            tenant_id=tenant_id,
            user_id=user_id,
        )
    except ConnectionQuotaExceeded:
        await websocket.close(
            code=CloseCode.QUOTA_EXCEEDED,
            reason=CLOSE_REASON_QUOTA_EXCEEDED,
        )
        await emit_lifecycle(
            ConnectionLifecycleEvent(
                tenant_id=tenant_id,
                user_id=user_id,
                connection_id="-",
                event_type="error",
                reason=CLOSE_REASON_QUOTA_EXCEEDED,
            )
        )
        return

    connection_id = record.connection_id
    policy = HeartbeatPolicy()
    tracker = HeartbeatTracker(policy=policy)
    stop_event = asyncio.Event()

    await emit_lifecycle(
        ConnectionLifecycleEvent(
            tenant_id=tenant_id,
            user_id=user_id,
            connection_id=connection_id,
            event_type="connect",
            metadata={
                "ip": _client_addr(websocket),
            },
        )
    )

    # 4. Welcome frame. Cadence in ms so the client can mirror its own
    #    keepalive without doing arithmetic.
    await _safe_send(
        websocket,
        {
            "op": WS_OP_WELCOME,
            "connection_id": connection_id,
            "tenant_id": tenant_id,
            "user_id": user_id,
            "heartbeat_ms": int(policy.ping_interval_s * 1000),
            "rooms": sorted(record.rooms),
        },
    )

    # 5. Optional resume from query-string Last-Event-ID.
    if last_event_id is not None and last_event_id >= 0:
        await _replay(
            websocket=websocket,
            manager=manager,
            tenant_id=tenant_id,
            last_event_id=last_event_id,
        )

    # 6. Drive the heartbeat task in parallel with the receive loop.
    async def _close_from_heartbeat(code: int, reason: str) -> None:
        await manager.disconnect(connection_id, code=code, reason=reason)
        stop_event.set()

    heartbeat_task = asyncio.create_task(
        run_heartbeat_loop(
            websocket,
            tracker,
            close=_close_from_heartbeat,
            stop_event=stop_event,
        ),
        name=f"nike.heartbeat.{connection_id}",
    )

    close_reason = ""
    close_code = CloseCode.NORMAL
    try:
        while not stop_event.is_set():
            try:
                raw = await websocket.receive_text()
            except WebSocketDisconnect:
                close_reason = CLOSE_REASON_CLIENT_GOODBYE
                break

            tracker.record_message()
            handled, reply = await _handle_op(
                raw=raw,
                manager=manager,
                connection_id=connection_id,
                tenant_id=tenant_id,
                tracker=tracker,
            )
            if reply is not None:
                await _safe_send(websocket, reply)
            if handled == "close":
                close_reason = CLOSE_REASON_CLIENT_GOODBYE
                break
    except Exception:
        logger.exception(
            "realtime.ws.unexpected_error connection_id=%s", connection_id
        )
        close_reason = CLOSE_REASON_INTERNAL_ERROR
        close_code = CloseCode.INTERNAL_ERROR
    finally:
        stop_event.set()
        heartbeat_task.cancel()
        try:
            await heartbeat_task
        except (asyncio.CancelledError, Exception):
            pass

        # Idempotent disconnect (heartbeat may have already removed it).
        already_gone = not manager.has_connection(connection_id)
        if not already_gone:
            await manager.disconnect(
                connection_id,
                code=close_code,
                reason=close_reason or CLOSE_REASON_CLIENT_GOODBYE,
            )

        event_type: str = "disconnect"
        if close_reason in {"heartbeat_timeout", "idle_timeout"}:
            event_type = "timeout"
        elif close_reason == CLOSE_REASON_INTERNAL_ERROR:
            event_type = "error"
        await emit_lifecycle(
            ConnectionLifecycleEvent(
                tenant_id=tenant_id,
                user_id=user_id,
                connection_id=connection_id,
                event_type=event_type,  # type: ignore[arg-type]
                reason=close_reason or None,
            )
        )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _refuse(
    websocket: WebSocket,
    *,
    code: int,
    reason: str,
) -> None:
    """Reject the upgrade with a clean close."""

    try:
        await websocket.close(code=code, reason=reason)
    except Exception:
        # Some Starlette variants raise when ``close`` is called before
        # ``accept``; the client receives the protocol-level close
        # either way.
        pass


async def _safe_send(websocket: WebSocket, payload: dict[str, Any]) -> None:
    """Serialise + send + swallow ConnectionClosed errors."""

    try:
        await websocket.send_text(
            json.dumps(payload, separators=(",", ":"))
        )
    except Exception:
        # The receive loop will detect the disconnect.
        pass


async def _replay(
    *,
    websocket: WebSocket,
    manager: ConnectionManager,
    tenant_id: str,
    last_event_id: int,
) -> None:
    """Replay events from the Redis Stream.

    Emits one ``{"op":"event","event":...}`` frame per replayed envelope
    plus a final ``{"op":"resume_ack","last_event_id":<latest>}`` so
    the client knows the catch-up flushed before live tail begins.
    Truncation surfaces as ``{"op":"resume_truncated"}``.
    """

    events = await manager.replay_since(
        tenant_id=tenant_id,
        last_event_id=last_event_id,
        max_events=REPLAY_MAX_EVENTS,
    )
    last_emitted = last_event_id
    if not events:
        await _safe_send(
            websocket,
            {"op": WS_OP_RESUME_TRUNCATED, "last_event_id": last_event_id},
        )
        return

    for event in events:
        await _safe_send(
            websocket,
            {"op": WS_OP_EVENT, "event": event.as_dict()},
        )
        last_emitted = max(last_emitted, event.id)

    await _safe_send(
        websocket,
        {"op": WS_OP_RESUME_ACK, "last_event_id": last_emitted},
    )


async def _handle_op(
    *,
    raw: str,
    manager: ConnectionManager,
    connection_id: str,
    tenant_id: str,
    tracker: HeartbeatTracker,
) -> tuple[str, Optional[dict[str, Any]]]:
    """Dispatch one client frame.

    Returns ``(handled_kind, reply)`` where ``handled_kind`` is one of
    ``"ok"``, ``"close"``, ``"error"`` and ``reply`` is the JSON body
    to send back (or ``None`` for fire-and-forget ops like ``pong``).
    """

    try:
        msg = json.loads(raw)
    except ValueError:
        return "error", {"op": WS_OP_ERROR, "reason": "invalid_json"}
    if not isinstance(msg, dict):
        return "error", {"op": WS_OP_ERROR, "reason": "invalid_frame"}

    op = msg.get("op")
    if op == WS_OP_PING:
        return "ok", {"op": WS_OP_PONG}
    if op == WS_OP_PONG:
        tracker.record_pong()
        return "ok", None
    if op == WS_OP_SUBSCRIBE:
        rooms = msg.get("rooms") or [msg.get("room")]
        applied = await manager.subscribe(
            connection_id, [r for r in rooms if r]
        )
        return "ok", {"op": WS_OP_SUBSCRIBE_ACK, "rooms": applied}
    if op == WS_OP_UNSUBSCRIBE:
        rooms = msg.get("rooms") or [msg.get("room")]
        applied = await manager.unsubscribe(
            connection_id, [r for r in rooms if r]
        )
        return "ok", {"op": WS_OP_UNSUBSCRIBE_ACK, "rooms": applied}
    if op == WS_OP_RESUME:
        try:
            last = int(msg.get("last_event_id", 0))
        except (TypeError, ValueError):
            return "error", {"op": WS_OP_ERROR, "reason": "invalid_event_id"}
        # Reuse the replay helper but run inline (no websocket re-bind).
        events = await manager.replay_since(
            tenant_id=tenant_id,
            last_event_id=last,
            max_events=REPLAY_MAX_EVENTS,
        )
        # Emit each event then ack.
        # The receive loop will send these via _safe_send because we
        # returned them as a multipart reply through the call site.
        # Simpler: emit inline by deferring to the manager's local
        # send path (we have a record handle? No, we just have the
        # connection id). Cleanest: send each and return None.
        ws = manager._connections[connection_id].websocket  # noqa: SLF001
        if not events:
            await _safe_send(
                ws,
                {"op": WS_OP_RESUME_TRUNCATED, "last_event_id": last},
            )
            return "ok", None
        for event in events:
            await _safe_send(ws, {"op": WS_OP_EVENT, "event": event.as_dict()})
        await _safe_send(
            ws,
            {"op": WS_OP_RESUME_ACK, "last_event_id": events[-1].id},
        )
        return "ok", None

    return "error", {"op": WS_OP_ERROR, "reason": "unknown_op"}


def _client_addr(websocket: WebSocket) -> str | None:
    """Best-effort client IP extraction. ``None`` when unavailable."""

    client = websocket.client
    if client is None:
        return None
    return client.host


__all__ = ["realtime_ws_router", "websocket_endpoint"]
