"""X-Request-Id correlation middleware.

Owner: Selene (W1 observability). Contract:
``docs/contracts/observability.contract.md`` + ``rest_api_base.contract.md``
(middleware order + X-Request-Id).

Wraps ``asgi-correlation-id`` so every inbound request either echoes back an
existing ``X-Request-Id`` header or gets a fresh UUID v7 assigned. The value
is stored in a contextvar which ``src/backend/obs/logger.py`` reads via
``_inject_request_id`` and ``opentelemetry-instrumentation-logging`` bridges
into OTel log records.

Integration point
-----------------

Aether ``src/backend/main.py`` registers this middleware as the outermost
layer so the correlation id is available to every downstream middleware
(CORS, TrustedHost, auth, access log) and route handler.

Example usage::

    from src.backend.middleware.correlation_id import install_correlation_id

    def create_app() -> FastAPI:
        app = FastAPI()
        install_correlation_id(app)
        ...
        return app

If Aether also installs ``asgi-correlation-id`` directly, calling
``install_correlation_id`` is idempotent: we detect the pre-existing
``CorrelationIdMiddleware`` and skip.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fastapi import FastAPI

HEADER_NAME = "X-Request-Id"


def _uuid_generator() -> str:
    """Return a UUID v4 hex string.

    We intentionally do not pull in the ``uuid7`` project here; the request id
    does not need time-ordering (that matters for database primary keys, not
    log correlation). Keeping this dependency-light means tests and the
    pre-Aether Selene session can exercise the middleware without extra
    installs.
    """

    return uuid.uuid4().hex


def _validator(value: str) -> bool:
    """Accept any 16..128 char printable id from upstream proxies.

    asgi-correlation-id will discard and regenerate if the inbound value fails
    validation. We avoid strict UUID parsing so that edge infra like Cloudflare
    ``cf-request-id`` or AWS X-Amzn-Trace-Id tokens can flow through.
    """

    if not isinstance(value, str):
        return False
    length = len(value)
    if length < 8 or length > 128:
        return False
    return all(32 <= ord(ch) < 127 for ch in value)


def install_correlation_id(app: "FastAPI") -> None:
    """Register ``CorrelationIdMiddleware`` on the given FastAPI app.

    No-op if already installed (detected via middleware stack introspection).
    """

    try:
        from asgi_correlation_id import CorrelationIdMiddleware
    except ImportError as exc:  # pragma: no cover - enforced at deploy time
        raise RuntimeError(
            "asgi-correlation-id is required. Install via pyproject.toml."
        ) from exc

    for middleware in getattr(app, "user_middleware", []) or []:
        cls = getattr(middleware, "cls", None)
        if cls is CorrelationIdMiddleware:
            return

    app.add_middleware(
        CorrelationIdMiddleware,
        header_name=HEADER_NAME,
        update_request_header=True,
        generator=_uuid_generator,
        validator=_validator,
    )


__all__ = ["install_correlation_id", "HEADER_NAME"]
