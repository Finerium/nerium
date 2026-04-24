"""Nike realtime router exports.

Mounted by ``src.backend.routers.v1.mount_v1_routers`` under the ``/v1``
prefix. Exposes:

- ``ws_router``: ``WSS /v1/realtime/ws`` WebSocket surface (S1).
- ``ticket_router``: ``POST /v1/realtime/ticket`` + ``/ticket/revoke``
  HTTP endpoints that mint + revoke short-lived realtime tickets (S2).
"""

from __future__ import annotations

from src.backend.realtime.ws_server import realtime_ws_router as ws_router
from src.backend.routers.v1.realtime.ticket import ticket_router

__all__ = ["ticket_router", "ws_router"]
