"""Error tracking via Sentry SDK pointed at self-hosted GlitchTip.

Owner: Selene (W1 observability). Contract:
``docs/contracts/observability.contract.md`` Section 4.3 (GlitchTip
integration).

Why Sentry SDK? GlitchTip 4.2+ speaks the Sentry wire protocol, so we can use
the well-maintained ``sentry-sdk`` PyPI package with just the DSN changed to
our self-hosted ingest endpoint. This keeps us free to fall back to Sentry
Cloud Developer (free 5k events/mo) without code changes if the Hetzner CX32
can not spare the 2 GB RAM budget for the full Django + Celery + Postgres +
Redis GlitchTip stack.

Traces sample rate is pinned at 0.0 because OpenTelemetry owns the trace path;
Sentry here is an error-only channel so we do not double-bill the Tempo 50 GB
free tier and keep GlitchTip storage lean.
"""

from __future__ import annotations

import logging
import os
from typing import Any

from src.backend.obs.redact import scrub_mapping

log = logging.getLogger(__name__)


def _scrub_event(event: dict[str, Any], _hint: Any) -> dict[str, Any] | None:
    """Sentry ``before_send`` hook: apply the shared redaction policy.

    Runs on every event before ship. Returning ``None`` drops the event.
    We only drop if the event has been entirely redacted, which does not
    happen with the current policy; practical effect is just field-level scrub.
    """

    extra = event.get("extra")
    if isinstance(extra, dict):
        event["extra"] = scrub_mapping(extra)
    request = event.get("request")
    if isinstance(request, dict):
        headers = request.get("headers")
        if isinstance(headers, dict):
            request["headers"] = scrub_mapping(headers)
        data = request.get("data")
        if isinstance(data, dict):
            request["data"] = scrub_mapping(data)
    return event


def configure_error_tracking(
    dsn: str | None = None,
    environment: str = "development",
    release: str | None = None,
) -> bool:
    """Initialise the Sentry SDK against GlitchTip.

    Returns True if initialisation occurred, False if skipped (no DSN) or if
    the sentry-sdk package is not installed. Skipping is safe during local
    dev and during Selene's pre-Aether landing window.
    """

    dsn = dsn or os.environ.get("GLITCHTIP_DSN") or os.environ.get("SENTRY_DSN")
    if not dsn:
        log.info("error_tracking.skipped.no_dsn")
        return False

    try:
        import sentry_sdk
        from sentry_sdk.integrations.asyncio import AsyncioIntegration
    except ImportError:
        log.warning("error_tracking.skipped.sdk_missing")
        return False

    integrations: list[Any] = [AsyncioIntegration()]

    try:
        from sentry_sdk.integrations.fastapi import FastApiIntegration

        integrations.append(FastApiIntegration())
    except ImportError:
        pass

    try:
        from sentry_sdk.integrations.asyncpg import AsyncPGIntegration

        integrations.append(AsyncPGIntegration())
    except ImportError:
        pass

    sentry_sdk.init(
        dsn=dsn,
        environment=environment,
        release=release or os.environ.get("SERVICE_VERSION", "0.1.0"),
        traces_sample_rate=0.0,  # OTel owns tracing; keep GlitchTip error-only
        send_default_pii=False,
        attach_stacktrace=True,
        integrations=integrations,
        before_send=_scrub_event,
    )
    log.info(
        "error_tracking.configured",
        extra={"environment": environment, "release": release},
    )
    return True
