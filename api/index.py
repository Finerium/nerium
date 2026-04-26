"""Vercel Serverless Functions entry point for the FastAPI backend.

Owner: Aether-Vercel (NP T6 deploy lane). Wraps :data:`src.backend.main.app`
in a Mangum ASGI-to-Lambda adapter so every Vercel invocation routes through
the FastAPI lifespan + middleware stack as a normal HTTP request.

Why Mangum
----------
Vercel's Python runtime expects a ``handler`` callable matching the
AWS Lambda signature ``(event, context)``. Mangum translates Lambda
events into ASGI scope dicts and back, so the FastAPI app does not
need a Starlette TestClient or a custom WSGI shim.

Lifespan policy
---------------
``lifespan="on"`` runs the FastAPI startup + shutdown hooks per cold
invocation. The asyncpg pool, redis client, and Hemera flag bootstrap
all initialise inside the warm container so subsequent invocations
reuse the open connections. Per V6 D2 decision: 2 to 5 second cold
start tax is accepted in exchange for honest pool semantics.

The ``VERCEL=1`` environment variable triggers the realtime + flag
invalidation listener short-circuit inside the lifespan body itself
(see :func:`src.backend.main.lifespan`); Vercel injects the variable
automatically so no manual env is required.
"""

from __future__ import annotations

import sys
from pathlib import Path

# Promote the project root onto sys.path so ``src.backend.*`` imports resolve
# when Vercel invokes ``api/index.py`` from outside the repo root.
sys.path.insert(0, str(Path(__file__).parent.parent))

from mangum import Mangum  # noqa: E402

from src.backend.main import create_app  # noqa: E402


# Aether-Vercel T6 Phase 1.7.9: the ``vercel.json`` rewrite forwards
# ``/api/:path*`` and ``/v1/:path*`` to this entry point but keeps the
# original prefix intact in the inbound URL. Strip the leading ``/api``
# segment so the FastAPI router matches its declared paths
# (``/healthz``, ``/v1/billing/plans``, etc.). Requests under the
# ``/v1/...`` rewrite already align with the FastAPI router, so they
# pass through unchanged.
class _StripApiPrefix:
    def __init__(self, asgi_app: object) -> None:
        self._app = asgi_app

    async def __call__(
        self, scope: dict, receive: object, send: object
    ) -> None:  # pragma: no cover - ASGI shim
        if scope.get("type") == "http":
            path: str = scope.get("path", "")
            if path == "/api":
                scope = {**scope, "path": "/", "raw_path": b"/"}
            elif path.startswith("/api/"):
                stripped = path[len("/api") :]
                raw = scope.get("raw_path") or path.encode("ascii")
                if raw.startswith(b"/api/"):
                    raw = raw[len(b"/api") :]
                elif raw == b"/api":
                    raw = b"/"
                scope = {**scope, "path": stripped, "raw_path": raw}
        await self._app(scope, receive, send)  # type: ignore[misc]


# Vercel's Python runtime imports the module-level ``app`` symbol and treats
# it as the ASGI application. Wrap the FastAPI instance with the prefix-strip
# middleware here so Vercel's invocation path (which does not call Mangum)
# still benefits from the path rewrite. Mangum stays available for any future
# Lambda-style invoker that prefers the AWS event signature.
_fastapi_app = create_app()
app = _StripApiPrefix(_fastapi_app)
handler = Mangum(app, lifespan="on")


__all__ = ["app", "handler"]
