"""Access log middleware: structured JSON per request.

Owner: Selene (W1 observability). Contract:
``docs/contracts/observability.contract.md`` Section 9 (access log records
``http.request.received`` + ``http.request.completed`` with ``duration_ms``).

Sits inside ``CorrelationIdMiddleware`` so every emission already carries the
``request_id`` contextvar, and inside the OTel FastAPI instrumentation so the
``trace_id`` + ``span_id`` are bound to the current span.
"""

from __future__ import annotations

import time
from typing import TYPE_CHECKING, Awaitable, Callable

from src.backend.obs.logger import get_logger
from src.backend.obs.metrics import record_http_request

if TYPE_CHECKING:
    from fastapi import FastAPI, Request, Response

log = get_logger(__name__)


def _route_template(request: "Request") -> str:
    """Return the route template (``/v1/ma/sessions/{id}``) when available.

    FastAPI stores the matched route on ``request.scope['route']``. If matching
    has not run yet (for example: 404 on unknown path) we fall back to the raw
    path so the metric label set remains bounded.
    """

    route = request.scope.get("route")
    if route is not None and getattr(route, "path", None):
        return route.path
    return request.url.path


async def access_log_middleware(
    request: "Request", call_next: Callable[["Request"], Awaitable["Response"]]
) -> "Response":
    """ASGI middleware: emit structured start + end events + metrics."""

    start = time.perf_counter()
    method = request.method
    path = request.url.path

    # Do not emit received event for noisy probe endpoints.
    probe = path in ("/healthz", "/readyz", "/metrics")
    if not probe:
        log.info(
            "http.request.received",
            http_method=method,
            http_path=path,
            client_host=request.client.host if request.client else None,
        )

    status = 500
    try:
        response = await call_next(request)
        status = response.status_code
        return response
    except Exception:
        status = 500
        raise
    finally:
        duration_ms = (time.perf_counter() - start) * 1000.0
        route = _route_template(request)
        record_http_request(method=method, route=route, status=status, duration_ms=duration_ms)
        if not probe:
            log.info(
                "http.request.completed",
                http_method=method,
                http_path=path,
                http_route=route,
                status_code=status,
                duration_ms=round(duration_ms, 3),
            )


def install_access_log(app: "FastAPI") -> None:
    """Register the access log middleware on the FastAPI app."""

    app.middleware("http")(access_log_middleware)


__all__ = ["install_access_log", "access_log_middleware"]
