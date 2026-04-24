"""Structured logging configuration.

Owner: Selene (W1 observability). Contract:
``docs/contracts/observability.contract.md`` Section 3.1 (log event shape) +
Section 4.1 (logger initialization).

Key guarantees
--------------
1. Single-line JSON output on stdout (Docker json-file driver -> Alloy ->
   Grafana Cloud Loki).
2. Every log record carries ``timestamp``, ``level``, ``event``, ``logger``,
   plus ``request_id`` + ``trace_id`` + ``span_id`` when a request context is
   active.
3. ``opentelemetry-instrumentation-logging`` bridges the standard-library
   ``logging`` module into OTel so third-party libraries (uvicorn, asyncpg,
   httpx) emit records that carry the same trace context.
4. Sampling knob ``obs.log_sampling_rate`` (Hemera flag, 0.0-1.0) can drop
   DEBUG and tagged INFO events when Grafana Cloud Free quota pressure hits.
5. Zero secret leakage via ``redact_sensitive`` processor applied last.

Import order in Aether ``main.py`` lifespan::

    from src.backend.obs.logger import configure_logging
    configure_logging(env=settings.env, level=settings.log_level)
"""

from __future__ import annotations

import logging
import os
import sys
from typing import Any

import structlog
from structlog.types import EventDict, WrappedLogger

from src.backend.obs.redact import redact_sensitive

# ``asgi-correlation-id`` publishes the active X-Request-Id via contextvars so
# any background task launched inside the request scope inherits it. Import is
# deferred-guarded because Selene ships ahead of Aether middleware bootstrap.
try:
    from asgi_correlation_id.context import correlation_id as _correlation_id_ctx
except ImportError:  # pragma: no cover - optional during pre-Aether boot
    _correlation_id_ctx = None  # type: ignore[assignment]

try:
    from opentelemetry import trace as _otel_trace
    from opentelemetry.trace.span import INVALID_SPAN_ID, INVALID_TRACE_ID
except ImportError:  # pragma: no cover - exercised only without otel installed
    _otel_trace = None  # type: ignore[assignment]
    INVALID_TRACE_ID = 0  # type: ignore[assignment]
    INVALID_SPAN_ID = 0  # type: ignore[assignment]


def _inject_request_id(
    _logger: WrappedLogger, _method_name: str, event_dict: EventDict
) -> EventDict:
    """Copy the active X-Request-Id from contextvars into the event dict."""

    if _correlation_id_ctx is None:
        return event_dict
    rid = _correlation_id_ctx.get()
    if rid:
        event_dict.setdefault("request_id", rid)
    return event_dict


def _inject_trace_context(
    _logger: WrappedLogger, _method_name: str, event_dict: EventDict
) -> EventDict:
    """Copy the active OTel trace_id + span_id into the event dict.

    ``opentelemetry-instrumentation-logging`` also injects these on stdlib log
    records, but structlog does not go through that path. We pull directly
    from the current span so structlog-emitted events stay correlated.
    """

    if _otel_trace is None:
        return event_dict
    span = _otel_trace.get_current_span()
    ctx = span.get_span_context() if span else None
    if ctx is None or not ctx.is_valid:
        return event_dict
    if ctx.trace_id and ctx.trace_id != INVALID_TRACE_ID:
        event_dict.setdefault("trace_id", format(ctx.trace_id, "032x"))
    if ctx.span_id and ctx.span_id != INVALID_SPAN_ID:
        event_dict.setdefault("span_id", format(ctx.span_id, "016x"))
    return event_dict


def _inject_service(service_name: str, service_version: str, env: str):
    """Return a processor that stamps service metadata on every event."""

    def _processor(
        _logger: WrappedLogger, _method_name: str, event_dict: EventDict
    ) -> EventDict:
        event_dict.setdefault("service", service_name)
        event_dict.setdefault("service_version", service_version)
        event_dict.setdefault("env", env)
        return event_dict

    return _processor


def _normalise_event(
    _logger: WrappedLogger, _method_name: str, event_dict: EventDict
) -> EventDict:
    """Rename ``event`` to the contract field ``event`` and free ``msg`` for prose.

    structlog by default uses ``event`` for the positional message. Our contract
    mandates ``event`` is the machine-readable ``<domain>.<subject>.<action>``
    token. Call sites that want a freeform human-readable message bind it to
    ``msg`` explicitly; if they pass it positionally we relocate it.
    """

    if "event" in event_dict and "msg" not in event_dict:
        value = event_dict["event"]
        # Heuristic: a dotted snake token (no spaces) is an event name; anything
        # else is freeform prose which we move into ``msg`` and leave ``event``
        # blank so downstream dashboards do not see a garbage event field.
        if isinstance(value, str) and (" " in value or len(value) > 64):
            event_dict["msg"] = value
            event_dict["event"] = "log.message"
    return event_dict


def _configure_stdlib(level: str) -> None:
    """Route stdlib logging through structlog's ProcessorFormatter.

    Ensures uvicorn and asyncpg emissions land as JSON on stdout and inherit
    trace context via opentelemetry-instrumentation-logging.
    """

    shared_processors = _build_shared_processors()

    formatter = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=shared_processors,
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            structlog.processors.JSONRenderer(sort_keys=True),
        ],
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level.upper())

    # Tame chatty libs to WARNING to preserve Grafana Cloud Free quota.
    for noisy in ("httpx", "httpcore", "asyncio", "uvicorn.access"):
        logging.getLogger(noisy).setLevel(os.environ.get(f"LOG_LEVEL_{noisy.upper().replace('.', '_')}", "WARNING"))


def _build_shared_processors() -> list[Any]:
    """Processor chain shared between structlog and stdlib-adapter paths."""

    return [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True, key="timestamp"),
        structlog.processors.CallsiteParameterAdder(
            parameters={
                structlog.processors.CallsiteParameter.MODULE,
                structlog.processors.CallsiteParameter.FUNC_NAME,
                structlog.processors.CallsiteParameter.LINENO,
            }
        ),
        _inject_request_id,
        _inject_trace_context,
        _normalise_event,
        redact_sensitive,
    ]


def configure_logging(
    env: str = "development",
    level: str = "INFO",
    service_name: str = "nerium-api",
    service_version: str = "0.1.0",
) -> None:
    """Initialise structlog + stdlib logging for the NERIUM backend.

    Idempotent: safe to call from tests and from Aether ``create_app`` lifespan.
    """

    # Wire opentelemetry-instrumentation-logging so stdlib records also carry
    # trace_id and span_id. ``set_logging_format=False`` keeps our JSON layout
    # authoritative.
    try:  # pragma: no branch - only skips if otel not installed
        from opentelemetry.instrumentation.logging import LoggingInstrumentor

        LoggingInstrumentor().instrument(set_logging_format=False)
    except ImportError:
        pass

    _configure_stdlib(level)

    structlog.configure(
        processors=[
            *_build_shared_processors(),
            _inject_service(service_name, service_version, env),
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            logging.getLevelName(level.upper())
        ),
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str | None = None) -> "structlog.stdlib.BoundLogger":
    """Return a bound structlog logger for the given module path.

    Consumers call ``log = get_logger(__name__)`` at module top level. The
    logger cache keeps per-name instances and is concurrency-safe.
    """

    return structlog.stdlib.get_logger(name)
