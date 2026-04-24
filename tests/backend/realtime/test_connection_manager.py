"""Connection manager unit tests.

Cover the registry + fan-out + replay surface without going through
the actual WebSocket. The WebSocket-driven tests live in
``test_websocket.py``.
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, field
from typing import Any

import pytest
from starlette.websockets import WebSocketState

from src.backend.realtime.connection_manager import (
    ConnectionManager,
    ConnectionQuotaExceeded,
    DEFAULT_PER_USER_CONNECTION_CAP,
    PUBSUB_CHANNEL_FMT,
    STREAM_KEY_FMT,
)
from src.backend.realtime.events import (
    CloseCode,
    build_event,
)


# ---------------------------------------------------------------------
# Minimal WebSocket double
# ---------------------------------------------------------------------


@dataclass
class _FakeClient:
    host: str = "127.0.0.1"


@dataclass
class _FakeWebSocket:
    """Stand-in supporting the surface the manager touches."""

    sent: list[str] = field(default_factory=list)
    closed: bool = False
    close_code: int | None = None
    close_reason: str | None = None
    application_state: WebSocketState = WebSocketState.CONNECTED
    client_state: WebSocketState = WebSocketState.CONNECTED
    client: _FakeClient = field(default_factory=_FakeClient)
    block_send: bool = False

    async def send_text(self, data: str) -> None:
        if self.block_send:
            await asyncio.sleep(60)
        self.sent.append(data)

    async def close(self, *, code: int = 1000, reason: str = "") -> None:
        self.closed = True
        self.close_code = code
        self.close_reason = reason
        self.application_state = WebSocketState.DISCONNECTED
        self.client_state = WebSocketState.DISCONNECTED


# ---------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------


@pytest.mark.asyncio
async def test_register_and_disconnect_clears_indexes(
    manager_no_redis: ConnectionManager,
) -> None:
    ws = _FakeWebSocket()
    record = await manager_no_redis.register(
        websocket=ws, tenant_id="t1", user_id="u1"
    )
    stats = manager_no_redis.stats()
    assert stats["connections"] == 1
    assert stats["tenants"] == 1
    assert stats["users"] == 1
    # Auto-subscribed to user + tenant rooms.
    assert "user:u1" in record.rooms
    assert "tenant:t1" in record.rooms

    await manager_no_redis.disconnect(record.connection_id)
    final = manager_no_redis.stats()
    assert final == {"connections": 0, "tenants": 0, "users": 0, "rooms": 0}
    assert ws.closed is True


@pytest.mark.asyncio
async def test_per_user_cap_enforced(
    manager_no_redis: ConnectionManager,
) -> None:
    sockets: list[_FakeWebSocket] = []
    for _ in range(DEFAULT_PER_USER_CONNECTION_CAP):
        ws = _FakeWebSocket()
        sockets.append(ws)
        await manager_no_redis.register(websocket=ws, tenant_id="t", user_id="u")

    overflow = _FakeWebSocket()
    with pytest.raises(ConnectionQuotaExceeded):
        await manager_no_redis.register(
            websocket=overflow, tenant_id="t", user_id="u"
        )


@pytest.mark.asyncio
async def test_unicast_targets_user_devices(
    manager_no_redis: ConnectionManager,
) -> None:
    ws_a = _FakeWebSocket()
    ws_b = _FakeWebSocket()
    ws_other = _FakeWebSocket()
    await manager_no_redis.register(websocket=ws_a, tenant_id="t1", user_id="u1")
    await manager_no_redis.register(websocket=ws_b, tenant_id="t1", user_id="u1")
    await manager_no_redis.register(
        websocket=ws_other, tenant_id="t1", user_id="u2"
    )

    event = build_event(event_id=1, event_type="x.y", data={"ok": True})
    delivered = await manager_no_redis.unicast(
        tenant_id="t1",
        user_id="u1",
        event=event,
        broadcast_global=False,
    )
    assert delivered == 2
    assert len(ws_a.sent) == 1
    assert len(ws_b.sent) == 1
    assert ws_other.sent == []


@pytest.mark.asyncio
async def test_broadcast_does_not_cross_tenants(
    manager_no_redis: ConnectionManager,
) -> None:
    ws_t1 = _FakeWebSocket()
    ws_t2 = _FakeWebSocket()
    await manager_no_redis.register(websocket=ws_t1, tenant_id="t1", user_id="u1")
    await manager_no_redis.register(websocket=ws_t2, tenant_id="t2", user_id="u1")

    event = build_event(event_id=1, event_type="x.y", data={})
    delivered = await manager_no_redis.broadcast(
        tenant_id="t1", event=event, broadcast_global=False
    )
    assert delivered == 1
    assert len(ws_t1.sent) == 1
    assert ws_t2.sent == []


@pytest.mark.asyncio
async def test_by_resource_routes_to_subscribers(
    manager_no_redis: ConnectionManager,
) -> None:
    ws_sub = _FakeWebSocket()
    ws_other = _FakeWebSocket()
    rec = await manager_no_redis.register(
        websocket=ws_sub, tenant_id="t1", user_id="u1"
    )
    await manager_no_redis.register(
        websocket=ws_other, tenant_id="t1", user_id="u2"
    )
    await manager_no_redis.subscribe(rec.connection_id, ["builder:session:abc"])

    event = build_event(event_id=1, event_type="builder.delta", data={"piece": 1})
    delivered = await manager_no_redis.by_resource(
        tenant_id="t1",
        resource_key="builder:session:abc",
        event=event,
        broadcast_global=False,
    )
    assert delivered == 1
    assert ws_other.sent == []
    payload = json.loads(ws_sub.sent[0])
    assert payload["op"] == "event"
    assert payload["event"]["type"] == "builder.delta"


@pytest.mark.asyncio
async def test_by_resource_does_not_leak_across_tenants(
    manager_no_redis: ConnectionManager,
) -> None:
    ws_a = _FakeWebSocket()
    ws_b = _FakeWebSocket()
    rec_a = await manager_no_redis.register(
        websocket=ws_a, tenant_id="t1", user_id="u1"
    )
    rec_b = await manager_no_redis.register(
        websocket=ws_b, tenant_id="t2", user_id="u1"
    )
    await manager_no_redis.subscribe(rec_a.connection_id, ["builder:session:x"])
    await manager_no_redis.subscribe(rec_b.connection_id, ["builder:session:x"])

    event = build_event(event_id=1, event_type="b.c", data={})
    delivered = await manager_no_redis.by_resource(
        tenant_id="t1",
        resource_key="builder:session:x",
        event=event,
        broadcast_global=False,
    )
    assert delivered == 1
    assert ws_b.sent == []


@pytest.mark.asyncio
async def test_unsubscribe_removes_from_room_index(
    manager_no_redis: ConnectionManager,
) -> None:
    ws = _FakeWebSocket()
    rec = await manager_no_redis.register(
        websocket=ws, tenant_id="t1", user_id="u1"
    )
    await manager_no_redis.subscribe(rec.connection_id, ["builder:session:abc"])
    await manager_no_redis.unsubscribe(rec.connection_id, ["builder:session:abc"])

    event = build_event(event_id=1, event_type="b.c", data={})
    delivered = await manager_no_redis.by_resource(
        tenant_id="t1",
        resource_key="builder:session:abc",
        event=event,
        broadcast_global=False,
    )
    assert delivered == 0


@pytest.mark.asyncio
async def test_disconnect_idempotent(
    manager_no_redis: ConnectionManager,
) -> None:
    ws = _FakeWebSocket()
    rec = await manager_no_redis.register(
        websocket=ws, tenant_id="t1", user_id="u1"
    )
    first = await manager_no_redis.disconnect(rec.connection_id)
    second = await manager_no_redis.disconnect(rec.connection_id)
    assert first is not None
    assert second is None


@pytest.mark.asyncio
async def test_redis_publish_and_stream_append(
    connection_manager: ConnectionManager,
    fake_redis_client,
) -> None:
    """Public broadcast path writes to both pubsub + stream."""

    ws = _FakeWebSocket()
    await connection_manager.register(
        websocket=ws, tenant_id="t1", user_id="u1"
    )

    event = build_event(event_id=10, event_type="b.c", data={"x": 1})
    delivered = await connection_manager.broadcast(
        tenant_id="t1", event=event, broadcast_global=True
    )
    assert delivered == 1

    # Stream entry exists.
    entries = await fake_redis_client.xrange(STREAM_KEY_FMT.format(tenant_id="t1"))
    assert len(entries) == 1
    payload = json.loads(entries[0][1]["event"])
    assert payload["id"] == 10
    assert payload["type"] == "b.c"


@pytest.mark.asyncio
async def test_replay_since_filters_by_event_id(
    connection_manager: ConnectionManager,
) -> None:
    ws = _FakeWebSocket()
    await connection_manager.register(
        websocket=ws, tenant_id="t1", user_id="u1"
    )
    for eid in (1, 2, 3, 4, 5):
        await connection_manager.broadcast(
            tenant_id="t1",
            event=build_event(event_id=eid, event_type="x.y", data={"i": eid}),
            broadcast_global=False,
        )

    replay = await connection_manager.replay_since(
        tenant_id="t1", last_event_id=2
    )
    ids = [e.id for e in replay]
    assert ids == [3, 4, 5]


@pytest.mark.asyncio
async def test_cross_worker_pubsub_fanout(
    fake_redis_client,
) -> None:
    """Two manager instances share a Redis; events from A reach B."""

    manager_a = ConnectionManager(redis=fake_redis_client)
    manager_b = ConnectionManager(redis=fake_redis_client)
    await manager_a.start()
    await manager_b.start()

    try:
        ws = _FakeWebSocket()
        await manager_b.register(
            websocket=ws, tenant_id="t-shared", user_id="u-shared"
        )

        event = build_event(event_id=99, event_type="cross.worker", data={})
        await manager_a.broadcast(tenant_id="t-shared", event=event)

        # Allow the pubsub task on manager_b to drain.
        for _ in range(40):
            if ws.sent:
                break
            await asyncio.sleep(0.05)

        assert ws.sent, "manager_b should have received the cross-worker event"
        payload = json.loads(ws.sent[0])
        assert payload["event"]["type"] == "cross.worker"
    finally:
        await manager_a.stop()
        await manager_b.stop()


@pytest.mark.asyncio
async def test_slow_consumer_is_disconnected(
    manager_no_redis: ConnectionManager,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A blocking send_text triggers SLOW_CONSUMER close."""

    monkeypatch.setattr(
        "src.backend.realtime.connection_manager.SEND_TIMEOUT_S",
        0.05,
    )

    fast = _FakeWebSocket()
    slow = _FakeWebSocket(block_send=True)
    rec_fast = await manager_no_redis.register(
        websocket=fast, tenant_id="t1", user_id="u1"
    )
    rec_slow = await manager_no_redis.register(
        websocket=slow, tenant_id="t1", user_id="u2"
    )

    event = build_event(event_id=1, event_type="b.c", data={})
    delivered = await manager_no_redis.broadcast(
        tenant_id="t1", event=event, broadcast_global=False
    )
    # Fast got it; slow timed out + got disconnected.
    assert delivered == 1
    assert manager_no_redis.has_connection(rec_fast.connection_id)
    assert not manager_no_redis.has_connection(rec_slow.connection_id)
    assert slow.closed is True
    assert slow.close_code == CloseCode.SLOW_CONSUMER
