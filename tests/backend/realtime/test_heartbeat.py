"""Heartbeat tracker + loop tests."""

from __future__ import annotations

import asyncio
import json

import pytest
from starlette.websockets import WebSocketState

from src.backend.realtime.events import (
    CLOSE_REASON_HEARTBEAT_TIMEOUT,
    CLOSE_REASON_IDLE_TIMEOUT,
    CloseCode,
    WS_OP_PING,
)
from src.backend.realtime.heartbeat import (
    HeartbeatPolicy,
    HeartbeatTracker,
    run_heartbeat_loop,
)


class _FakeWS:
    def __init__(self) -> None:
        self.sent: list[str] = []
        self.application_state = WebSocketState.CONNECTED

    async def send_text(self, data: str) -> None:
        self.sent.append(data)


@pytest.mark.asyncio
async def test_ping_fires_at_interval() -> None:
    policy = HeartbeatPolicy(
        ping_interval_s=0.05, pong_grace_s=10.0, idle_timeout_s=10.0
    )
    tracker = HeartbeatTracker(policy=policy)
    ws = _FakeWS()
    closes: list[tuple[int, str]] = []

    async def close(code: int, reason: str) -> None:
        closes.append((code, reason))
        ws.application_state = WebSocketState.DISCONNECTED

    stop = asyncio.Event()
    task = asyncio.create_task(
        run_heartbeat_loop(
            ws, tracker, close=close, sleep_resolution_s=0.01, stop_event=stop
        )
    )
    await asyncio.sleep(0.2)
    # Simulate client pong so heartbeat does not trip.
    tracker.record_pong()
    stop.set()
    await task

    assert any(json.loads(m).get("op") == WS_OP_PING for m in ws.sent)


@pytest.mark.asyncio
async def test_missed_pong_closes_with_heartbeat_timeout() -> None:
    policy = HeartbeatPolicy(
        ping_interval_s=0.05, pong_grace_s=0.05, idle_timeout_s=10.0
    )
    tracker = HeartbeatTracker(policy=policy)
    ws = _FakeWS()
    closes: list[tuple[int, str]] = []

    async def close(code: int, reason: str) -> None:
        closes.append((code, reason))
        ws.application_state = WebSocketState.DISCONNECTED

    reason = await run_heartbeat_loop(
        ws, tracker, close=close, sleep_resolution_s=0.01
    )
    assert reason == CLOSE_REASON_HEARTBEAT_TIMEOUT
    assert closes and closes[0][1] == CLOSE_REASON_HEARTBEAT_TIMEOUT
    assert closes[0][0] == CloseCode.GOING_AWAY


@pytest.mark.asyncio
async def test_idle_timeout_closes_with_normal_code() -> None:
    policy = HeartbeatPolicy(
        ping_interval_s=10.0, pong_grace_s=10.0, idle_timeout_s=0.05
    )
    tracker = HeartbeatTracker(policy=policy)
    ws = _FakeWS()
    closes: list[tuple[int, str]] = []

    async def close(code: int, reason: str) -> None:
        closes.append((code, reason))
        ws.application_state = WebSocketState.DISCONNECTED

    reason = await run_heartbeat_loop(
        ws, tracker, close=close, sleep_resolution_s=0.01
    )
    assert reason == CLOSE_REASON_IDLE_TIMEOUT
    assert closes[0][0] == CloseCode.NORMAL


@pytest.mark.asyncio
async def test_record_message_resets_idle() -> None:
    policy = HeartbeatPolicy(
        ping_interval_s=10.0, pong_grace_s=10.0, idle_timeout_s=0.1
    )
    tracker = HeartbeatTracker(policy=policy)
    ws = _FakeWS()
    closes: list[tuple[int, str]] = []

    async def close(code: int, reason: str) -> None:
        closes.append((code, reason))
        ws.application_state = WebSocketState.DISCONNECTED

    stop = asyncio.Event()
    task = asyncio.create_task(
        run_heartbeat_loop(
            ws, tracker, close=close, sleep_resolution_s=0.01, stop_event=stop
        )
    )
    # Bump activity twice within the 100 ms window so idle never trips.
    for _ in range(5):
        await asyncio.sleep(0.04)
        tracker.record_message()
    stop.set()
    await task
    assert not closes  # still alive when we stopped voluntarily
