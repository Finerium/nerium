"""End-to-end WebSocket endpoint tests.

Drives the FastAPI WebSocket through ``TestClient.websocket_connect``
with a fakeredis-backed ConnectionManager. Covers:

- Successful handshake + welcome frame.
- Ticket missing / invalid -> handshake refused.
- Subscribe / unsubscribe ack.
- Broadcast reaches connected client.
- by_resource selector routes per room.
- Resume replay using ``last_event_id`` query param.
- Ping/pong wire format.
"""

from __future__ import annotations

import json
from functools import partial

import pytest
from fastapi.testclient import TestClient

from src.backend.realtime.connection_manager import (
    ConnectionManager,
    get_connection_manager,
)
from src.backend.realtime.events import build_event


def _portal_call(client: TestClient, coro_factory, **kwargs):
    """Run an async manager method on the TestClient's anyio portal.

    ``BlockingPortal.call`` does not accept ``**kwargs`` so we wrap the
    coroutine factory in a :func:`functools.partial`.
    """

    return client.portal.call(partial(coro_factory, **kwargs))


def _read_until(ws_conn, *, op: str, max_frames: int = 8) -> dict:
    """Drain until we see a frame with the requested ``op``.

    Heartbeat pings can interleave with the frames our test cares about
    so we skip over any unrelated frames up to ``max_frames``.
    """

    for _ in range(max_frames):
        raw = ws_conn.receive_text()
        msg = json.loads(raw)
        if msg.get("op") == op:
            return msg
    raise AssertionError(f"did not see op={op!r} within {max_frames} frames")


def test_ws_handshake_emits_welcome(
    ws_client: TestClient, hs256_ticket_factory
) -> None:
    ticket = hs256_ticket_factory()
    with ws_client.websocket_connect(
        f"/v1/realtime/ws?ticket={ticket}"
    ) as ws:
        welcome = _read_until(ws, op="welcome")
        assert "connection_id" in welcome
        assert welcome["heartbeat_ms"] == 20_000
        assert "user:" in " ".join(welcome["rooms"])


def test_ws_handshake_refused_when_ticket_missing(ws_client: TestClient) -> None:
    from starlette.websockets import WebSocketDisconnect

    with pytest.raises(WebSocketDisconnect) as excinfo:
        with ws_client.websocket_connect("/v1/realtime/ws"):
            pass
    assert excinfo.value.code == 4401  # CloseCode.TICKET_INVALID


def test_ws_handshake_refused_on_bad_ticket(ws_client: TestClient) -> None:
    from starlette.websockets import WebSocketDisconnect

    with pytest.raises(WebSocketDisconnect) as excinfo:
        with ws_client.websocket_connect(
            "/v1/realtime/ws?ticket=not-a-jwt"
        ):
            pass
    assert excinfo.value.code == 4401


def test_subscribe_ack_returns_normalised_room(
    ws_client: TestClient, hs256_ticket_factory
) -> None:
    ticket = hs256_ticket_factory()
    with ws_client.websocket_connect(
        f"/v1/realtime/ws?ticket={ticket}"
    ) as ws:
        _read_until(ws, op="welcome")
        ws.send_text(
            json.dumps({"op": "subscribe", "rooms": ["builder:session:abc"]})
        )
        ack = _read_until(ws, op="subscribe_ack")
        assert ack["rooms"] == ["builder:session:abc"]


def test_broadcast_reaches_connected_client(
    ws_client: TestClient, hs256_ticket_factory
) -> None:
    ticket = hs256_ticket_factory(
        user_id="aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa",
        tenant_id="bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb",
    )
    with ws_client.websocket_connect(
        f"/v1/realtime/ws?ticket={ticket}"
    ) as ws:
        _read_until(ws, op="welcome")
        manager = get_connection_manager()
        event = build_event(event_id=7, event_type="b.c", data={"hi": True})
        # broadcast_global=False so we test local fan-out only.
        delivered = _portal_call(
            ws_client,
            manager.broadcast,
            tenant_id="bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb",
            event=event,
            broadcast_global=False,
        )
        assert delivered == 1
        frame = _read_until(ws, op="event")
        assert frame["event"]["type"] == "b.c"
        assert frame["event"]["id"] == 7


def test_by_resource_selector(
    ws_client: TestClient, hs256_ticket_factory
) -> None:
    ticket = hs256_ticket_factory(
        tenant_id="bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb",
    )
    with ws_client.websocket_connect(
        f"/v1/realtime/ws?ticket={ticket}"
    ) as ws:
        _read_until(ws, op="welcome")
        ws.send_text(
            json.dumps({"op": "subscribe", "rooms": ["ma:session:42"]})
        )
        _read_until(ws, op="subscribe_ack")

        manager = get_connection_manager()
        event = build_event(event_id=11, event_type="ma.delta", data={})
        delivered = _portal_call(
            ws_client,
            manager.by_resource,
            tenant_id="bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb",
            resource_key="ma:session:42",
            event=event,
            broadcast_global=False,
        )
        assert delivered == 1
        frame = _read_until(ws, op="event")
        assert frame["event"]["id"] == 11


def test_ping_pong_round_trip(
    ws_client: TestClient, hs256_ticket_factory
) -> None:
    ticket = hs256_ticket_factory()
    with ws_client.websocket_connect(
        f"/v1/realtime/ws?ticket={ticket}"
    ) as ws:
        _read_until(ws, op="welcome")
        ws.send_text(json.dumps({"op": "ping"}))
        pong = _read_until(ws, op="pong")
        assert pong["op"] == "pong"


def test_resume_via_query_string_replays_events(
    ws_client: TestClient,
    hs256_ticket_factory,
) -> None:
    """Pre-seed the per-tenant stream then connect with last_event_id."""

    tenant_id = "bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb"
    ticket = hs256_ticket_factory(tenant_id=tenant_id)

    # First connection seeds the stream with three events via broadcast.
    with ws_client.websocket_connect(
        f"/v1/realtime/ws?ticket={ticket}"
    ) as ws:
        _read_until(ws, op="welcome")
        manager = get_connection_manager()
        for eid, label in [(1, "a"), (2, "b"), (3, "c")]:
            _portal_call(
                ws_client,
                manager.broadcast,
                tenant_id=tenant_id,
                event=build_event(
                    event_id=eid, event_type="x.y", data={"k": label}
                ),
                broadcast_global=False,
            )

    # Second connection asks for events strictly greater than 1.
    with ws_client.websocket_connect(
        f"/v1/realtime/ws?ticket={ticket}&last_event_id=1"
    ) as ws2:
        _read_until(ws2, op="welcome")
        first = _read_until(ws2, op="event")
        assert first["event"]["id"] == 2
        second = _read_until(ws2, op="event")
        assert second["event"]["id"] == 3
        ack = _read_until(ws2, op="resume_ack")
        assert ack["last_event_id"] == 3


def test_resume_truncated_when_nothing_to_replay(
    ws_client: TestClient,
    hs256_ticket_factory,
) -> None:
    ticket = hs256_ticket_factory()
    with ws_client.websocket_connect(
        f"/v1/realtime/ws?ticket={ticket}&last_event_id=999"
    ) as ws:
        _read_until(ws, op="welcome")
        truncated = _read_until(ws, op="resume_truncated")
        assert truncated["last_event_id"] == 999


def test_unknown_op_responds_with_error(
    ws_client: TestClient,
    hs256_ticket_factory,
) -> None:
    ticket = hs256_ticket_factory()
    with ws_client.websocket_connect(
        f"/v1/realtime/ws?ticket={ticket}"
    ) as ws:
        _read_until(ws, op="welcome")
        ws.send_text(json.dumps({"op": "unknown"}))
        err = _read_until(ws, op="error")
        assert err["reason"] == "unknown_op"
