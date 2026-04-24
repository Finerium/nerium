"""Nike realtime router exports.

Mounted by ``src.backend.routers.v1.mount_v1_routers`` under the ``/v1``
prefix. Currently exposes a single attribute, ``ws_router``, that
carries the WebSocket endpoint. Session 2 adds the ticket mint endpoint
+ optional generic SSE endpoint to this package.
"""

from __future__ import annotations

from src.backend.realtime.ws_server import realtime_ws_router as ws_router

__all__ = ["ws_router"]
