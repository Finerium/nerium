"""Per-connection ping/pong heartbeat and idle watchdog.

Owner: Nike (W2 NP P3 S1).

Two timers per WebSocket
------------------------
1. **Ping cadence** every :data:`HeartbeatPolicy.ping_interval_s` (20s
   default). On expiry, send ``{"op":"ping"}`` and arm the
   ``pong_deadline`` for ``ping_interval_s + pong_grace_s``. If the
   client does not call :meth:`HeartbeatTracker.record_pong` within
   the grace window, close with :data:`CloseCode.GOING_AWAY` reason
   ``heartbeat_timeout``.
2. **Idle watchdog**: any client-initiated message resets the idle
   clock; if no message arrives for ``idle_timeout_s`` (60s default)
   the connection closes with :data:`CloseCode.NORMAL` reason
   ``idle_timeout``.

Tunables are exposed as plain ints so tests can shorten the windows
without monkeypatching module globals; the WebSocket server constructs
its policy from settings (or test overrides) and hands the policy to
:func:`run_heartbeat_loop`.

Implementation note
-------------------
The loop cooperates with the receive loop in :mod:`ws_server` via a
shared :class:`HeartbeatTracker`. The receive loop calls
:meth:`HeartbeatTracker.record_pong` on each pong and
:meth:`HeartbeatTracker.record_message` on every other message. The
heartbeat task is the only place that decides to close the socket on
timeout.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from typing import Awaitable, Callable, Optional

from fastapi import WebSocket
from starlette.websockets import WebSocketState

from src.backend.realtime.events import (
    CLOSE_REASON_HEARTBEAT_TIMEOUT,
    CLOSE_REASON_IDLE_TIMEOUT,
    CloseCode,
    WS_OP_PING,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class HeartbeatPolicy:
    """Heartbeat tunables. Constructed once per connection."""

    ping_interval_s: float = 20.0
    pong_grace_s: float = 10.0
    idle_timeout_s: float = 60.0


@dataclass
class HeartbeatTracker:
    """Mutable state shared between the receive loop + heartbeat task."""

    policy: HeartbeatPolicy
    last_message_at: float = field(default_factory=time.monotonic)
    last_pong_at: float = field(default_factory=time.monotonic)
    last_ping_sent_at: float = 0.0

    def record_message(self) -> None:
        now = time.monotonic()
        self.last_message_at = now

    def record_pong(self) -> None:
        now = time.monotonic()
        self.last_pong_at = now
        self.last_message_at = now

    def mark_ping_sent(self) -> None:
        self.last_ping_sent_at = time.monotonic()

    def heartbeat_overdue(self) -> bool:
        """Pong missed beyond the grace window."""

        if self.last_ping_sent_at == 0.0:
            return False
        deadline = self.last_ping_sent_at + (
            self.policy.ping_interval_s + self.policy.pong_grace_s
        )
        return time.monotonic() > deadline and self.last_pong_at < self.last_ping_sent_at

    def idle_overdue(self) -> bool:
        """No client-initiated message inside the idle window."""

        return (
            time.monotonic() - self.last_message_at
        ) > self.policy.idle_timeout_s


# Type alias for the close-callback the loop invokes.
CloseCallback = Callable[[int, str], Awaitable[None]]


async def run_heartbeat_loop(
    websocket: WebSocket,
    tracker: HeartbeatTracker,
    *,
    close: CloseCallback,
    sleep_resolution_s: float = 0.5,
    stop_event: Optional[asyncio.Event] = None,
) -> str:
    """Drive the ping/pong + idle timers until the socket closes.

    Returns the reason string for the close (``""`` if the loop exits
    because the application disconnected the WebSocket via another
    code path).
    """

    policy = tracker.policy
    while True:
        if stop_event is not None and stop_event.is_set():
            return ""
        if websocket.application_state != WebSocketState.CONNECTED:
            return ""

        # Fire ping if it is time. We only ever have ONE outstanding
        # ping in flight: we re-arm a fresh ping after the client either
        # pongs (last_pong_at advances past last_ping_sent_at) or after
        # the heartbeat deadline trips. Without this guard, every loop
        # iteration would refresh ``last_ping_sent_at`` and the
        # heartbeat-overdue check could never fire.
        now = time.monotonic()
        ping_outstanding = (
            tracker.last_ping_sent_at > 0
            and tracker.last_pong_at < tracker.last_ping_sent_at
        )
        elapsed_since_ping = (
            now - tracker.last_ping_sent_at
            if tracker.last_ping_sent_at > 0
            else policy.ping_interval_s
        )
        if not ping_outstanding and elapsed_since_ping >= policy.ping_interval_s:
            try:
                await websocket.send_text(json.dumps({"op": WS_OP_PING}))
            except Exception:
                # Socket already torn down; let the receive loop notice.
                return ""
            tracker.mark_ping_sent()

        # Check timeouts.
        if tracker.heartbeat_overdue():
            await close(
                CloseCode.GOING_AWAY,
                CLOSE_REASON_HEARTBEAT_TIMEOUT,
            )
            return CLOSE_REASON_HEARTBEAT_TIMEOUT
        if tracker.idle_overdue():
            await close(CloseCode.NORMAL, CLOSE_REASON_IDLE_TIMEOUT)
            return CLOSE_REASON_IDLE_TIMEOUT

        try:
            await asyncio.sleep(sleep_resolution_s)
        except asyncio.CancelledError:
            return ""


__all__ = [
    "CloseCallback",
    "HeartbeatPolicy",
    "HeartbeatTracker",
    "run_heartbeat_loop",
]
