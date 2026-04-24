"""OpenTelemetry tracing configuration.

Owner: Selene (W1 observability). Contract:
``docs/contracts/observability.contract.md`` Section 4.2 (OTel provider setup).

Design
------
- TracerProvider is a process-global singleton, initialised once in Aether
  ``create_app`` lifespan and torn down in shutdown.
- Resource attributes follow OpenTelemetry semantic conventions for service.
- OTLP HTTP exporter to Grafana Cloud Tempo (``OTEL_EXPORTER_OTLP_ENDPOINT``).
  HTTP chosen over gRPC for Alloy compatibility and simpler firewall story.
- Sampling defaults to AlwaysOn at submission (low volume). Production tune
  via ``OTEL_TRACES_SAMPLER=parentbased_traceidratio`` +
  ``OTEL_TRACES_SAMPLER_ARG=0.1`` once Grafana Cloud Free quota pressure hits.
- Auto-instrumentation: FastAPI, httpx, asyncpg, Redis, Arq, SQLAlchemy.
  Arq lives behind a guarded import because some versions lack an officially
  maintained instrumentation package; when absent we fall back to manual
  context propagation inside the Arq worker.

Excluded URLs from FastAPI auto-instrumentation: ``/healthz``, ``/readyz``,
``/metrics``. These are scraped by Alloy or Kubernetes liveness probes and
emit hundreds of spans/sec which would burn Tempo quota.
"""

from __future__ import annotations

import logging
import os
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from fastapi import FastAPI

log = logging.getLogger(__name__)

_DEFAULT_EXCLUDED_URLS = "healthz,readyz,metrics"
_tracer_provider_configured = False


def _resource(env: str, service_name: str, service_version: str) -> "Any":
    from opentelemetry.sdk.resources import Resource

    return Resource.create(
        {
            "service.name": service_name,
            "service.namespace": "nerium",
            "service.version": service_version,
            "deployment.environment": env,
        }
    )


def _make_exporter() -> "Any | None":
    """Build the OTLP HTTP exporter pointed at Grafana Cloud Tempo.

    Environment variables (standard OTel spec):
    - ``OTEL_EXPORTER_OTLP_ENDPOINT``: e.g. ``https://otlp-gateway-prod-eu-west-2.grafana.net/otlp``
    - ``OTEL_EXPORTER_OTLP_HEADERS``: e.g. ``authorization=Basic <base64>``

    If the endpoint is unset we return ``None`` so the provider runs with the
    local in-memory processor only (useful for dev + tests).
    """

    endpoint = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT")
    if not endpoint:
        return None

    try:
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import (
            OTLPSpanExporter,
        )
    except ImportError:
        log.warning(
            "otel.exporter.missing",
            extra={"event": "otel.exporter.missing", "endpoint": endpoint},
        )
        return None

    headers_raw = os.environ.get("OTEL_EXPORTER_OTLP_HEADERS", "")
    headers = _parse_headers(headers_raw)
    return OTLPSpanExporter(endpoint=endpoint.rstrip("/") + "/v1/traces", headers=headers)


def _parse_headers(raw: str) -> dict[str, str]:
    """Parse OTel OTLP headers env format: ``k1=v1,k2=v2``."""

    headers: dict[str, str] = {}
    for part in raw.split(","):
        part = part.strip()
        if not part or "=" not in part:
            continue
        key, _, value = part.partition("=")
        headers[key.strip()] = value.strip()
    return headers


def configure_tracing(
    app: "FastAPI | None" = None,
    env: str = "development",
    service_name: str = "nerium-api",
    service_version: str = "0.1.0",
    excluded_urls: str | None = None,
    enable_auto_instrument: bool = True,
) -> "Any":
    """Install the global TracerProvider + auto-instrument known libraries.

    Returns the configured ``TracerProvider`` for tests that need to attach
    in-memory span processors.
    """

    global _tracer_provider_configured

    from opentelemetry import trace
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor

    provider = TracerProvider(resource=_resource(env, service_name, service_version))

    exporter = _make_exporter()
    if exporter is not None:
        provider.add_span_processor(BatchSpanProcessor(exporter))

    # Setting provider is idempotent-ish: OTel warns if called twice. Guard.
    if not _tracer_provider_configured:
        trace.set_tracer_provider(provider)
        _tracer_provider_configured = True

    if enable_auto_instrument:
        _auto_instrument(app, excluded_urls or _DEFAULT_EXCLUDED_URLS)

    return provider


def _auto_instrument(app: "FastAPI | None", excluded_urls: str) -> None:
    """Attach OTel auto-instrumentors. Each import is guarded so partial
    dependency sets (for example during Selene session before Aether installs
    asyncpg) degrade gracefully."""

    if app is not None:
        try:
            from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

            FastAPIInstrumentor.instrument_app(app, excluded_urls=excluded_urls)
        except ImportError:
            log.warning("otel.instrument.fastapi.missing")

    try:
        from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor

        HTTPXClientInstrumentor().instrument()
    except ImportError:
        log.warning("otel.instrument.httpx.missing")

    try:
        from opentelemetry.instrumentation.asyncpg import AsyncPGInstrumentor

        AsyncPGInstrumentor().instrument()
    except ImportError:
        log.warning("otel.instrument.asyncpg.missing")

    try:
        from opentelemetry.instrumentation.redis import RedisInstrumentor

        RedisInstrumentor().instrument()
    except ImportError:
        log.warning("otel.instrument.redis.missing")

    try:
        # Arq does not ship an official OTel instrumentation package as of
        # April 2026. We attempt ``opentelemetry-instrumentation-arq`` if
        # someone vendored it; otherwise manual propagation lives in the Arq
        # worker factory (Aether session 2).
        from opentelemetry.instrumentation.arq import ArqInstrumentor  # type: ignore

        ArqInstrumentor().instrument()
    except ImportError:
        log.debug("otel.instrument.arq.absent")

    try:
        from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor

        SQLAlchemyInstrumentor().instrument(enable_commenter=True)
    except ImportError:
        log.debug("otel.instrument.sqlalchemy.absent")


def get_tracer(name: str = "nerium") -> "Any":
    """Return a tracer for explicit span creation.

    Example::

        tracer = get_tracer(__name__)
        with tracer.start_as_current_span("ma.dispatch") as span:
            span.set_attribute("ma.session_id", str(session.id))
    """

    from opentelemetry import trace

    return trace.get_tracer(name)


def shutdown_tracing() -> None:
    """Flush pending spans and shut the provider down. Call in lifespan teardown."""

    from opentelemetry import trace

    provider = trace.get_tracer_provider()
    shutdown = getattr(provider, "shutdown", None)
    if callable(shutdown):
        shutdown()
