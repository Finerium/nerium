"""Nike realtime infrastructure (W2 NP P3 Session 1).

Owner: Nike (W2 generic realtime). Sibling to Kratos' MA-scoped realtime
surface in :mod:`src.backend.ma.sse_stream` + :mod:`src.backend.ma.event_bus`.
Kratos owns the MA-specific producer + SSE endpoint; Nike owns the generic
WebSocket transport + per-tenant fan-out + reconnection ticket flow.

Module map (Session 1)
----------------------
- :mod:`src.backend.realtime.events` realtime envelope types + close codes.
- :mod:`src.backend.realtime.connection_manager` per-tenant connection
  registry, room subscription index, Redis pub/sub fan-out across workers,
  Redis Stream replay store for reconnect resume.
- :mod:`src.backend.realtime.heartbeat` per-connection ping/pong + idle
  watchdog timers.
- :mod:`src.backend.realtime.ticket` short-lived JWT ticket primitive
  (S1 stub, S2 wires the mint endpoint + JTI replay-protection store).
- :mod:`src.backend.realtime.audit` Arq enqueue helper for connect/
  disconnect/timeout/error lifecycle events. Worker persists to the
  ``realtime_connection_audit`` table created in migration 045.
- :mod:`src.backend.realtime.ws_server` ``/v1/realtime/ws`` FastAPI
  WebSocket endpoint + router export.

Module map (Session 2 forthcoming)
----------------------------------
- ``src.backend.realtime.sse_server`` generic SSE wrapper.
- ``src.backend.realtime.resume`` shared resume helper Kratos may migrate to.
- ``src.backend.realtime.ticket`` extended with ``POST /v1/realtime/ticket``
  mint endpoint, JTI replay-protection set, EdDSA key rotation hook.

Coordination with Kratos seam
-----------------------------
Kratos has shipped :mod:`src.backend.ma.ticket_verifier` as a process-wide
verifier installer. Nike's S2 ticket mint flow installs its real verifier
through ``ma.ticket_verifier.set_ticket_verifier`` so Kratos' MA SSE
endpoint inherits the upgrade automatically. S1 keeps the seam untouched.

Contract references
-------------------
- ``docs/contracts/realtime_bus.contract.md`` Sections 3 + 4 + 8 + 9.
- ``docs/contracts/redis_session.contract.md`` Section 3.2 stream key.
- ``docs/contracts/observability.contract.md`` Section 9 lifecycle events.
"""

from __future__ import annotations

__all__: list[str] = []
