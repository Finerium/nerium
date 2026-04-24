"""Per-worker WebSocket connection registry + cross-worker fan-out.

Owner: Nike (W2 NP P3 S1).

Responsibilities
----------------
1. **Registry**: hold the active WebSocket handles indexed by
   ``(tenant_id, user_id, connection_id)``. The ``connection_id`` is a
   UUID v7 minted when the WebSocket completes its accept handshake.
2. **Subscription index**: per resource key (``builder:session:<id>``,
   ``ma:session:<id>``, etc.), maintain the set of connection ids
   subscribed so producers can address a specific stream without
   walking every tenant connection.
3. **Fan-out**: route an event to (a) a single user across all their
   devices, (b) every connection in a tenant, or (c) every connection
   subscribed to a resource key. Calls into the Redis pub/sub fan-out
   when ``broadcast_global=True`` so multi-worker deployments converge.
4. **Replay buffer**: append every fanned-out event to a Redis Stream
   ``realtime:events:<tenant_id>`` with a ``MAXLEN ~`` trim per
   contract. Reconnect resume reads from this stream.
5. **Cross-worker subscription**: at startup, subscribe a dedicated
   pubsub connection to the tenant-prefixed pattern
   ``realtime:tenant:*`` so events published from another worker land
   here and reach our local connections.

Concurrency model
-----------------
Each method holds a single :class:`asyncio.Lock` for the small critical
sections (registry mutation + index mutation). Sends to individual
WebSockets happen outside the lock so a slow consumer does not block
fan-out to others. A slow consumer detection budget (``send`` timeout)
fires :data:`CloseCode.SLOW_CONSUMER` close on the offending connection.

Memory hygiene
--------------
- ``disconnect`` clears the connection out of every index it was in
  (per-user, per-tenant, per-room) so empty sets do not accumulate.
- The pubsub listener lives in a long-lived :class:`asyncio.Task`
  cancelled at shutdown.

Tests
-----
The unit-test fixture installs a fakeredis pool so cross-worker fan-out
can be exercised without a live Redis. See
``tests/backend/realtime/test_connection_manager.py``.

Contract references
-------------------
- ``docs/contracts/realtime_bus.contract.md`` Sections 3, 4, 8.
- ``docs/contracts/redis_session.contract.md`` Section 3.2 stream key
  namespace, Section 4.2 pub/sub channel pattern.
"""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass, field
from typing import Any, Iterable, Optional
from uuid import UUID

from fastapi import WebSocket
from starlette.websockets import WebSocketState

from src.backend.realtime.events import (
    CLOSE_REASON_SLOW_CONSUMER,
    CloseCode,
    RealtimeEvent,
    WS_OP_EVENT,
    build_event,
    iter_resource_keys,
    normalise_resource_key,
)
from src.backend.utils.uuid7 import uuid7

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Constants + tunables
# ---------------------------------------------------------------------------
#
# These are deliberately module-level so tests can monkeypatch shorter
# values (e.g. SEND_TIMEOUT_S=0.1 for slow-consumer behavioural tests).

PUBSUB_CHANNEL_FMT: str = "realtime:tenant:{tenant_id}"
"""Per-tenant Redis pub/sub channel. One channel per tenant keeps the
pattern-subscribe Redis cost flat (1 channel per tenant)."""

PUBSUB_PATTERN: str = "realtime:tenant:*"
"""Pattern subscriber listens on so a single subscriber covers every
tenant emitted by another worker."""

STREAM_KEY_FMT: str = "realtime:events:{tenant_id}"
"""Per-tenant Redis Stream for reconnect replay."""

STREAM_MAXLEN_APPROX: int = 10_000
"""``XADD MAXLEN ~ 10000`` per spawn directive."""

REPLAY_MAX_EVENTS: int = 100
"""Cap on events replayed per reconnect per spawn directive."""

REPLAY_MAX_AGE_S: int = 5 * 60
"""5-minute replay window per spawn directive."""

SEND_TIMEOUT_S: float = 5.0
"""How long a single ``send_text`` may block before we treat the
consumer as slow and close it."""

DEFAULT_PER_USER_CONNECTION_CAP: int = 5
"""Per-user concurrent connection cap per contract Section 4.4."""


# ---------------------------------------------------------------------------
# Internal records
# ---------------------------------------------------------------------------


@dataclass
class _ConnectionRecord:
    """In-memory record for one connected WebSocket."""

    connection_id: str
    tenant_id: str
    user_id: str
    websocket: WebSocket
    rooms: set[str] = field(default_factory=set)


# ---------------------------------------------------------------------------
# Manager
# ---------------------------------------------------------------------------


class ConnectionManager:
    """Per-worker connection registry + Redis pub/sub fan-out.

    Construct one instance per FastAPI app and install via
    :func:`set_connection_manager`. Tests construct a fresh instance
    per test; the WebSocket router accesses it via
    :func:`get_connection_manager`.
    """

    def __init__(
        self,
        *,
        redis: Any | None = None,
        per_user_cap: int = DEFAULT_PER_USER_CONNECTION_CAP,
    ) -> None:
        self._redis = redis
        self._per_user_cap = per_user_cap

        self._lock = asyncio.Lock()
        # Primary registry.
        self._connections: dict[str, _ConnectionRecord] = {}
        # Indexes for fan-out lookup.
        self._by_tenant: dict[str, set[str]] = {}
        self._by_user: dict[tuple[str, str], set[str]] = {}
        self._by_room: dict[str, set[str]] = {}

        self._pubsub_task: Optional[asyncio.Task[None]] = None
        self._pubsub: Any | None = None

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def attach_redis(self, redis: Any | None) -> None:
        """Install (or replace) the Redis client used for fan-out."""

        self._redis = redis

    async def start(self) -> None:
        """Start the cross-worker pub/sub subscriber.

        No-op when the Redis handle is missing; tests that exercise
        registry behaviour without cross-worker fan-out simply skip
        this call.
        """

        if self._redis is None:
            logger.info("realtime.cm.start.no_redis pattern=%s", PUBSUB_PATTERN)
            return
        if self._pubsub_task is not None and not self._pubsub_task.done():
            return

        self._pubsub = self._redis.pubsub()
        await self._pubsub.psubscribe(PUBSUB_PATTERN)
        self._pubsub_task = asyncio.create_task(
            self._pubsub_loop(),
            name="nike.realtime.pubsub",
        )
        logger.info("realtime.cm.start pattern=%s", PUBSUB_PATTERN)

    async def stop(self) -> None:
        """Stop the pub/sub subscriber + close all live connections."""

        if self._pubsub_task is not None:
            self._pubsub_task.cancel()
            try:
                await self._pubsub_task
            except (asyncio.CancelledError, Exception):
                pass
            self._pubsub_task = None

        if self._pubsub is not None:
            try:
                await self._pubsub.punsubscribe(PUBSUB_PATTERN)
                await self._pubsub.aclose()
            except Exception:
                logger.exception("realtime.cm.pubsub_close_failed")
            self._pubsub = None

        async with self._lock:
            ids = list(self._connections.keys())
        for conn_id in ids:
            await self.disconnect(conn_id, code=CloseCode.GOING_AWAY)

    # ------------------------------------------------------------------
    # Registration
    # ------------------------------------------------------------------

    async def register(
        self,
        *,
        websocket: WebSocket,
        tenant_id: str,
        user_id: str,
    ) -> _ConnectionRecord:
        """Add a freshly accepted WebSocket to the registry.

        Raises
        ------
        ConnectionQuotaExceeded
            When the per-user cap is already reached.
        """

        connection_id = str(uuid7())
        record = _ConnectionRecord(
            connection_id=connection_id,
            tenant_id=tenant_id,
            user_id=user_id,
            websocket=websocket,
        )
        # Auto-subscribe to per-user + per-tenant rooms so unicast +
        # broadcast targeting works without explicit subscribe ops.
        record.rooms.add(f"user:{user_id}")
        record.rooms.add(f"tenant:{tenant_id}")

        async with self._lock:
            user_key = (tenant_id, user_id)
            existing = self._by_user.get(user_key, set())
            if len(existing) >= self._per_user_cap:
                raise ConnectionQuotaExceeded(
                    user_id=user_id,
                    cap=self._per_user_cap,
                )
            self._connections[connection_id] = record
            self._by_tenant.setdefault(tenant_id, set()).add(connection_id)
            self._by_user.setdefault(user_key, set()).add(connection_id)
            for room in record.rooms:
                self._by_room.setdefault(room, set()).add(connection_id)
        return record

    async def disconnect(
        self,
        connection_id: str,
        *,
        code: int = CloseCode.NORMAL,
        reason: str = "",
    ) -> Optional[_ConnectionRecord]:
        """Remove a connection from every index and close the socket.

        Returns the popped :class:`_ConnectionRecord` so audit hooks
        can read tenant/user without a second lookup. Returns ``None``
        if the id is not registered (idempotent).
        """

        async with self._lock:
            record = self._connections.pop(connection_id, None)
            if record is None:
                return None
            self._remove_from_index(self._by_tenant, record.tenant_id, connection_id)
            self._remove_from_index(
                self._by_user,
                (record.tenant_id, record.user_id),
                connection_id,
            )
            for room in record.rooms:
                self._remove_from_index(self._by_room, room, connection_id)
            record.rooms.clear()

        ws = record.websocket
        if ws.client_state != WebSocketState.DISCONNECTED:
            try:
                await ws.close(code=code, reason=reason or "")
            except Exception:
                # Connection already torn down by the client.
                pass
        return record

    @staticmethod
    def _remove_from_index(
        index: dict[Any, set[str]],
        key: Any,
        connection_id: str,
    ) -> None:
        bucket = index.get(key)
        if bucket is None:
            return
        bucket.discard(connection_id)
        if not bucket:
            index.pop(key, None)

    # ------------------------------------------------------------------
    # Subscription operations
    # ------------------------------------------------------------------

    async def subscribe(
        self,
        connection_id: str,
        rooms: Iterable[str],
    ) -> list[str]:
        """Subscribe a connection to one or more rooms.

        Returns the list of rooms actually applied (deduped + normalised).
        Unknown connection ids are silently ignored.
        """

        keys = iter_resource_keys(rooms)
        if not keys:
            return []
        async with self._lock:
            record = self._connections.get(connection_id)
            if record is None:
                return []
            for room in keys:
                if room in record.rooms:
                    continue
                record.rooms.add(room)
                self._by_room.setdefault(room, set()).add(connection_id)
        return keys

    async def unsubscribe(
        self,
        connection_id: str,
        rooms: Iterable[str],
    ) -> list[str]:
        """Detach a connection from one or more rooms."""

        keys = iter_resource_keys(rooms)
        if not keys:
            return []
        async with self._lock:
            record = self._connections.get(connection_id)
            if record is None:
                return []
            for room in keys:
                if room not in record.rooms:
                    continue
                record.rooms.discard(room)
                self._remove_from_index(self._by_room, room, connection_id)
        return keys

    # ------------------------------------------------------------------
    # Fan-out
    # ------------------------------------------------------------------

    async def unicast(
        self,
        *,
        tenant_id: str,
        user_id: str,
        event: RealtimeEvent,
        broadcast_global: bool = True,
    ) -> int:
        """Send to every device of a single user inside a tenant.

        ``broadcast_global=True`` also publishes onto Redis so other
        workers reach the same user's connections held elsewhere.
        Returns the number of local sockets that received the frame.
        """

        async with self._lock:
            ids = list(self._by_user.get((tenant_id, user_id), set()))
            records = [self._connections[i] for i in ids if i in self._connections]
        delivered = await self._dispatch(records, event)
        if broadcast_global:
            await self._publish_global(tenant_id=tenant_id, event=event)
        await self._append_stream(tenant_id=tenant_id, event=event)
        return delivered

    async def broadcast(
        self,
        *,
        tenant_id: str,
        event: RealtimeEvent,
        broadcast_global: bool = True,
    ) -> int:
        """Send to every connection in a tenant.

        Mirrors the per-tenant pub/sub channel semantics: the event
        lands on ``realtime:tenant:<tenant_id>`` so every worker that
        holds a connection for the tenant fans out to those locals.
        """

        async with self._lock:
            ids = list(self._by_tenant.get(tenant_id, set()))
            records = [self._connections[i] for i in ids if i in self._connections]
        delivered = await self._dispatch(records, event)
        if broadcast_global:
            await self._publish_global(tenant_id=tenant_id, event=event)
        await self._append_stream(tenant_id=tenant_id, event=event)
        return delivered

    async def by_resource(
        self,
        *,
        tenant_id: str,
        resource_key: str,
        event: RealtimeEvent,
        broadcast_global: bool = True,
    ) -> int:
        """Send to every connection subscribed to ``resource_key``.

        ``resource_key`` follows the ``<scope>:<id>`` shape; selectors
        like ``builder:session:<id>`` are valid because we only check
        the first colon.
        """

        room = normalise_resource_key(resource_key)
        async with self._lock:
            ids = list(self._by_room.get(room, set()))
            records = [
                self._connections[i]
                for i in ids
                if i in self._connections
                and self._connections[i].tenant_id == tenant_id
            ]
        delivered = await self._dispatch(records, event)
        if broadcast_global:
            await self._publish_global(
                tenant_id=tenant_id,
                event=event,
                room=room,
            )
        await self._append_stream(tenant_id=tenant_id, event=event)
        return delivered

    async def _dispatch(
        self,
        records: list[_ConnectionRecord],
        event: RealtimeEvent,
    ) -> int:
        """Send the event to a precomputed list of connections.

        Slow consumers (send timeout) are closed with
        :data:`CloseCode.SLOW_CONSUMER`. The send happens outside the
        registry lock so blocking sockets do not stall fan-out.
        """

        if not records:
            return 0

        frame = json.dumps(
            {"op": WS_OP_EVENT, "event": event.as_dict()},
            separators=(",", ":"),
        )

        delivered = 0
        casualties: list[str] = []
        for rec in records:
            ws = rec.websocket
            if ws.application_state != WebSocketState.CONNECTED:
                continue
            try:
                await asyncio.wait_for(
                    ws.send_text(frame),
                    timeout=SEND_TIMEOUT_S,
                )
                delivered += 1
            except asyncio.TimeoutError:
                logger.warning(
                    "realtime.cm.slow_consumer connection_id=%s",
                    rec.connection_id,
                )
                casualties.append(rec.connection_id)
            except Exception as exc:
                logger.info(
                    "realtime.cm.send_failed connection_id=%s err=%s",
                    rec.connection_id,
                    exc,
                )
                casualties.append(rec.connection_id)

        for cid in casualties:
            await self.disconnect(
                cid,
                code=CloseCode.SLOW_CONSUMER,
                reason=CLOSE_REASON_SLOW_CONSUMER,
            )
        return delivered

    # ------------------------------------------------------------------
    # Redis fan-out + replay
    # ------------------------------------------------------------------

    async def _publish_global(
        self,
        *,
        tenant_id: str,
        event: RealtimeEvent,
        room: str | None = None,
    ) -> None:
        """Publish an event onto the per-tenant pub/sub channel."""

        if self._redis is None:
            return
        channel = PUBSUB_CHANNEL_FMT.format(tenant_id=tenant_id)
        message = json.dumps(
            {
                "tenant_id": tenant_id,
                "room": room,
                "event": event.as_dict(),
            },
            separators=(",", ":"),
        )
        try:
            await self._redis.publish(channel, message)
        except Exception:
            logger.exception(
                "realtime.cm.publish_failed channel=%s", channel
            )

    async def _append_stream(
        self,
        *,
        tenant_id: str,
        event: RealtimeEvent,
    ) -> None:
        """Append the event onto the per-tenant Redis Stream replay store.

        Uses ``XADD`` with ``MAXLEN ~ 10000`` per the spawn directive.
        Failure is logged but never raised because the live fan-out
        already happened; the replay buffer is best-effort.
        """

        if self._redis is None:
            return
        stream_key = STREAM_KEY_FMT.format(tenant_id=tenant_id)
        try:
            await self._redis.xadd(
                stream_key,
                {"event": event.to_json()},
                maxlen=STREAM_MAXLEN_APPROX,
                approximate=True,
            )
        except Exception:
            logger.exception(
                "realtime.cm.stream_append_failed stream=%s", stream_key
            )

    async def _pubsub_loop(self) -> None:
        """Forward messages from other workers to local connections.

        Runs as a long-lived task; survives Redis pub/sub timeouts via
        the ``timeout`` arg on ``get_message``. On unhandled exception
        the loop logs + sleeps a beat then continues so a single
        Redis hiccup does not silently kill cross-worker fan-out.
        """

        assert self._pubsub is not None
        while True:
            try:
                message = await self._pubsub.get_message(
                    ignore_subscribe_messages=True,
                    timeout=1.0,
                )
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("realtime.cm.pubsub_get_failed")
                await asyncio.sleep(1.0)
                continue

            if message is None:
                continue
            raw = message.get("data")
            if isinstance(raw, bytes):
                raw = raw.decode("utf-8", errors="ignore")
            if not raw:
                continue
            try:
                payload = json.loads(raw)
            except ValueError:
                logger.warning(
                    "realtime.cm.pubsub_bad_json raw=%r",
                    raw,
                )
                continue

            tenant_id = payload.get("tenant_id")
            envelope = payload.get("event")
            room = payload.get("room")
            if not tenant_id or not envelope:
                continue
            event = build_event(
                event_id=int(envelope.get("id", 0)),
                event_type=str(envelope.get("type", "")),
                data=envelope.get("data") or {},
                occurred_at=envelope.get("occurred_at"),
            )
            await self._dispatch_local(
                tenant_id=tenant_id,
                room=room,
                event=event,
            )

    async def _dispatch_local(
        self,
        *,
        tenant_id: str,
        room: str | None,
        event: RealtimeEvent,
    ) -> None:
        """Dispatch a remote-sourced event to local connections only.

        Mirror of the public broadcast/by_resource path with
        ``broadcast_global=False`` semantics + no stream re-append (the
        originating worker already wrote to the stream).
        """

        async with self._lock:
            if room:
                ids = [
                    cid
                    for cid in self._by_room.get(room, set())
                    if cid in self._connections
                    and self._connections[cid].tenant_id == tenant_id
                ]
            else:
                ids = list(self._by_tenant.get(tenant_id, set()))
            records = [self._connections[i] for i in ids if i in self._connections]
        await self._dispatch(records, event)

    # ------------------------------------------------------------------
    # Replay query (used by ws_server reconnect path)
    # ------------------------------------------------------------------

    async def replay_since(
        self,
        *,
        tenant_id: str,
        last_event_id: int,
        max_events: int = REPLAY_MAX_EVENTS,
    ) -> list[RealtimeEvent]:
        """Read events from the per-tenant Redis Stream after a checkpoint.

        Returns at most :data:`REPLAY_MAX_EVENTS` newer-than checkpoint
        envelopes. Empty list when the stream is missing or fully
        truncated past the checkpoint.

        ``last_event_id`` is the server-monotonic envelope id; we
        compare against the ``id`` field inside each stream entry's
        ``event`` payload (Redis Stream ids are timestamp-prefixed and
        not directly comparable to the envelope id).
        """

        if self._redis is None:
            return []
        stream_key = STREAM_KEY_FMT.format(tenant_id=tenant_id)
        try:
            entries = await self._redis.xrange(stream_key, count=max_events * 2)
        except Exception:
            logger.exception(
                "realtime.cm.replay_failed stream=%s", stream_key
            )
            return []

        out: list[RealtimeEvent] = []
        for _, fields in entries or []:
            blob = fields.get("event") if isinstance(fields, dict) else None
            if blob is None:
                continue
            if isinstance(blob, bytes):
                blob = blob.decode("utf-8", errors="ignore")
            try:
                envelope = json.loads(blob)
            except ValueError:
                continue
            try:
                eid = int(envelope.get("id", 0))
            except (TypeError, ValueError):
                continue
            if eid <= last_event_id:
                continue
            out.append(
                build_event(
                    event_id=eid,
                    event_type=str(envelope.get("type", "")),
                    data=envelope.get("data") or {},
                    occurred_at=envelope.get("occurred_at"),
                )
            )
            if len(out) >= max_events:
                break
        return out

    # ------------------------------------------------------------------
    # Introspection (for /readyz + tests + admin)
    # ------------------------------------------------------------------

    def stats(self) -> dict[str, int]:
        """Lightweight snapshot for diagnostics."""

        return {
            "connections": len(self._connections),
            "tenants": len(self._by_tenant),
            "users": len(self._by_user),
            "rooms": len(self._by_room),
        }

    def has_connection(self, connection_id: str) -> bool:
        return connection_id in self._connections


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


class ConnectionQuotaExceeded(Exception):
    """Raised when a user already holds the maximum concurrent connections."""

    def __init__(self, *, user_id: str, cap: int) -> None:
        super().__init__(f"user {user_id} reached connection cap {cap}")
        self.user_id = user_id
        self.cap = cap


# ---------------------------------------------------------------------------
# Process-wide accessor
# ---------------------------------------------------------------------------


_manager: ConnectionManager | None = None


def set_connection_manager(manager: ConnectionManager | None) -> None:
    """Install the process-wide manager. ``None`` clears for tests."""

    global _manager
    _manager = manager


def get_connection_manager() -> ConnectionManager:
    """Return the installed manager or raise :class:`RuntimeError`."""

    if _manager is None:
        raise RuntimeError(
            "Realtime ConnectionManager not initialised. Ensure the "
            "FastAPI lifespan invoked install_realtime() before any "
            "WebSocket request."
        )
    return _manager


__all__ = [
    "ConnectionManager",
    "ConnectionQuotaExceeded",
    "DEFAULT_PER_USER_CONNECTION_CAP",
    "PUBSUB_CHANNEL_FMT",
    "PUBSUB_PATTERN",
    "REPLAY_MAX_AGE_S",
    "REPLAY_MAX_EVENTS",
    "SEND_TIMEOUT_S",
    "STREAM_KEY_FMT",
    "STREAM_MAXLEN_APPROX",
    "get_connection_manager",
    "set_connection_manager",
]
