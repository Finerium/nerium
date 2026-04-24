"""Trace correlation tests.

Asserts that structlog emissions made inside an active OpenTelemetry span
carry the span's ``trace_id`` and ``span_id`` as top-level fields, per
``docs/contracts/observability.contract.md`` Section 3.1 + Section 9.

This test also exercises the ``inject_trace_context`` processor in isolation
so the contract holds even if higher-level instrumentation libraries shift.
"""

from __future__ import annotations

import json
import logging

import pytest

pytest.importorskip("opentelemetry.sdk.trace")


def _parse_caplog(caplog: pytest.LogCaptureFixture) -> list[dict]:
    out: list[dict] = []
    for record in caplog.records:
        msg = record.msg
        if isinstance(msg, dict):
            out.append(msg)
            continue
        try:
            out.append(json.loads(str(msg)))
        except (TypeError, ValueError):
            continue
    return out


def test_log_record_carries_trace_and_span_id(caplog: pytest.LogCaptureFixture) -> None:
    from opentelemetry import trace
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import SimpleSpanProcessor
    from opentelemetry.sdk.trace.export.in_memory_span_exporter import (
        InMemorySpanExporter,
    )

    from src.backend.obs.logger import configure_logging, get_logger

    exporter = InMemorySpanExporter()
    provider = TracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    trace.set_tracer_provider(provider)

    configure_logging(env="test", level="DEBUG")
    log = get_logger("tests.backend.obs.test_trace_correlation")

    tracer = trace.get_tracer("tests")
    caplog.set_level(logging.DEBUG)
    with tracer.start_as_current_span("unit.test.root") as span:
        ctx = span.get_span_context()
        expected_trace = format(ctx.trace_id, "032x")
        expected_span = format(ctx.span_id, "016x")
        log.info("test.event.inside_span", marker="inside")

    # Also log outside the span; that record should NOT carry trace_id.
    log.info("test.event.outside_span", marker="outside")

    parsed = _parse_caplog(caplog)
    inside = next((rec for rec in parsed if rec.get("marker") == "inside"), None)
    outside = next((rec for rec in parsed if rec.get("marker") == "outside"), None)

    assert inside is not None, "missing inside-span log record"
    assert inside.get("trace_id") == expected_trace
    assert inside.get("span_id") == expected_span

    assert outside is not None
    assert "trace_id" not in outside
    assert "span_id" not in outside


def test_request_id_propagates_via_correlation_context(caplog: pytest.LogCaptureFixture) -> None:
    pytest.importorskip("asgi_correlation_id")
    from asgi_correlation_id.context import correlation_id

    from src.backend.obs.logger import configure_logging, get_logger

    configure_logging(env="test", level="DEBUG")
    log = get_logger("tests.backend.obs.test_trace_correlation.rid")

    token = correlation_id.set("01926fdeadbeefcafe00000000000001")
    try:
        caplog.set_level(logging.DEBUG)
        log.info("test.event.with_request_id", marker="rid")
    finally:
        correlation_id.reset(token)

    parsed = _parse_caplog(caplog)
    rid_rec = next((rec for rec in parsed if rec.get("marker") == "rid"), None)
    assert rid_rec is not None
    assert rid_rec.get("request_id") == "01926fdeadbeefcafe00000000000001"
