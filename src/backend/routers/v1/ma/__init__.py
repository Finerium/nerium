"""MA (Managed Agent) session HTTP surface.

Owner: Kratos (W2 S1).

Exports ``sessions_router`` which is mounted under ``/v1/ma/sessions``
by the ``mount_v1_routers`` helper. The router covers CRUD for the
Builder runtime session lifecycle per
``docs/contracts/ma_session_lifecycle.contract.md``.

Sub-routers added in later sessions:

- S2 adds the inner Claude SDK dispatcher (not an HTTP surface).
- S3 adds the SSE stream endpoint + resume via ``Last-Event-ID``.
"""

from src.backend.routers.v1.ma.sessions import sessions_router

__all__ = ["sessions_router"]
