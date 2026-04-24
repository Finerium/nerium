"""Prometheus metrics exposition tests.

Covers:
- ``render_metrics`` returns non-empty bytes with expected counter families.
- ``record_ma_session_cost`` increments the Moros-facing counter.
- ``record_http_request`` emits both counter + histogram observations.
- An actual FastAPI ``/metrics`` route returns 200 with the Prometheus text
  content type per ``docs/contracts/observability.contract.md`` Section 9.
"""

from __future__ import annotations

import pytest

prom = pytest.importorskip("prometheus_client")

from src.backend.obs.metrics import (  # noqa: E402
    METRICS_CONTENT_TYPE,
    ma_session_cost_usd_total,
    record_http_request,
    record_ma_session_cost,
    render_metrics,
)


def test_metric_catalog_present() -> None:
    payload = render_metrics().decode("utf-8")
    for name in (
        "http_requests_total",
        "http_request_duration_ms",
        "ma_sessions_total",
        "ma_session_cost_usd_total",
        "mcp_tool_invocation_total",
        "vendor_calls_total",
        "budget_tenant_spent_usd",
    ):
        assert name in payload, f"metric {name} missing from /metrics exposition"


def test_record_ma_session_cost_increments_counter() -> None:
    before = ma_session_cost_usd_total.labels(model="claude-opus-4-7", tenant_id="t1")._value.get()
    record_ma_session_cost(model="claude-opus-4-7", tenant_id="t1", cost_usd=0.1234)
    after = ma_session_cost_usd_total.labels(model="claude-opus-4-7", tenant_id="t1")._value.get()
    assert after == pytest.approx(before + 0.1234, abs=1e-6)


def test_record_ma_session_cost_ignores_non_positive() -> None:
    before = ma_session_cost_usd_total.labels(model="claude-opus-4-7", tenant_id="t2")._value.get()
    record_ma_session_cost(model="claude-opus-4-7", tenant_id="t2", cost_usd=0.0)
    record_ma_session_cost(model="claude-opus-4-7", tenant_id="t2", cost_usd=-5.0)
    after = ma_session_cost_usd_total.labels(model="claude-opus-4-7", tenant_id="t2")._value.get()
    assert after == before


def test_record_http_request_updates_histogram_and_counter() -> None:
    record_http_request(method="GET", route="/v1/health", status=200, duration_ms=42.5)
    payload = render_metrics().decode("utf-8")
    assert 'http_requests_total{method="GET",route="/v1/health",status="200"}' in payload
    assert "http_request_duration_ms_bucket" in payload


def test_metrics_endpoint_served_by_fastapi() -> None:
    fastapi = pytest.importorskip("fastapi")
    pytest.importorskip("httpx")
    from fastapi import FastAPI, Response
    from fastapi.testclient import TestClient

    app = FastAPI()

    @app.get("/metrics", include_in_schema=False)
    def metrics_endpoint() -> Response:
        return Response(render_metrics(), media_type=METRICS_CONTENT_TYPE)

    with TestClient(app) as client:
        resp = client.get("/metrics")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/plain")
    assert b"http_requests_total" in resp.content
