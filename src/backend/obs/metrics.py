"""Prometheus metrics registry + exposition.

Owner: Selene (W1 observability). Contract:
``docs/contracts/observability.contract.md`` Section 3.4 (metrics) + Section
4 (interface). Also wires the Moros hook per
``docs/contracts/budget_monitor.contract.md`` Section 5 OTel metrics list.

Strategy
--------
We expose Prometheus metrics via the ``prometheus_client`` library rather than
the OTel metrics SDK for three reasons:

1. Grafana Cloud Free tier ingests Prometheus remote_write natively via Alloy
   without extra OTLP conversion.
2. ``prometheus_client`` generates the text exposition that the ``/metrics``
   endpoint needs in two lines.
3. Cardinality control is easier to reason about with explicit label sets.

Metric catalog (contract Section 3.4 + budget_monitor Section 5):

Counters
- ``http_requests_total{method,route,status}``
- ``ma_sessions_total{model,status}``
- ``ma_session_cost_usd_total{model,tenant_id}`` (Moros hook)
- ``mcp_tool_invocation_total{tool,tenant_id,outcome}``
- ``vendor_calls_total{vendor,capability,outcome}``
- ``flag_evaluations_total{flag_name,outcome}``
- ``webhook_events_total{source,event_type,outcome}``
- ``budget_alert_threshold_total{tenant_id,pct}``
- ``budget_cap_tripped_total{scope}``

Histograms
- ``http_request_duration_ms{method,route}``
- ``db_query_duration_ms{table}``
- ``vendor_call_duration_ms{vendor}``
- ``ma_session_duration_ms{model}``

Gauges
- ``active_ws_connections{room_type}``
- ``ma_sessions_active{status}``
- ``budget_tenant_spent_usd{tenant_id,period}``
- ``budget_global_spent_usd{period}``
- ``circuit_breaker_state{vendor,capability}``

Cardinality caution: ``tenant_id`` is high cardinality. At submission we have
~10 tenants so the label is safe. Post-hackathon switch tenant_id metrics to
aggregated views only and move per-tenant dimension to logs.
"""

from __future__ import annotations

from typing import Any

try:
    from prometheus_client import (
        CONTENT_TYPE_LATEST,
        CollectorRegistry,
        Counter,
        Gauge,
        Histogram,
        generate_latest,
    )
except ImportError:  # pragma: no cover - provides stub so tests can import
    CONTENT_TYPE_LATEST = "text/plain; version=0.0.4; charset=utf-8"

    class _Stub:
        def __init__(self, *_args: Any, **_kwargs: Any) -> None:
            self._value = 0.0

        def labels(self, *_a: Any, **_kw: Any) -> "_Stub":
            return self

        def inc(self, amount: float = 1.0) -> None:
            self._value += amount

        def dec(self, amount: float = 1.0) -> None:
            self._value -= amount

        def set(self, value: float) -> None:
            self._value = value

        def observe(self, _value: float) -> None:
            pass

    Counter = Gauge = Histogram = _Stub  # type: ignore[assignment,misc]
    CollectorRegistry = _Stub  # type: ignore[assignment,misc]

    def generate_latest(_registry: Any = None) -> bytes:  # type: ignore[no-redef]
        return b"# prometheus_client not installed\n"


METRICS_CONTENT_TYPE = CONTENT_TYPE_LATEST

# Latency histogram bucket spec tuned for web requests (10 ms .. 10 s).
_HTTP_BUCKETS = (
    5, 10, 25, 50, 75, 100, 150, 200, 300, 500,
    750, 1000, 1500, 2000, 3000, 5000, 7500, 10000,
)
_DB_BUCKETS = (1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000)
_MA_BUCKETS = (100, 500, 1000, 2500, 5000, 10000, 30000, 60000, 120000, 300000)


def _default_registry() -> "CollectorRegistry":
    # Using the package default registry keeps import-time wiring simple and
    # matches what ``prometheus_client.exposition.generate_latest`` picks up by
    # default. Tests pass an isolated registry if needed.
    try:
        from prometheus_client import REGISTRY

        return REGISTRY
    except ImportError:
        return CollectorRegistry()  # type: ignore[call-arg]


_registry = _default_registry()


def _c(name: str, doc: str, labels: list[str]) -> "Counter":
    return Counter(name, doc, labels, registry=_registry)


def _g(name: str, doc: str, labels: list[str]) -> "Gauge":
    return Gauge(name, doc, labels, registry=_registry)


def _h(name: str, doc: str, labels: list[str], buckets: tuple[int, ...]) -> "Histogram":
    return Histogram(name, doc, labels, buckets=buckets, registry=_registry)


# ---------------------------------------------------------------------------
# Catalog
# ---------------------------------------------------------------------------

http_requests_total = _c(
    "http_requests_total",
    "HTTP requests received by method, route template, and status code.",
    ["method", "route", "status"],
)

http_request_duration_ms = _h(
    "http_request_duration_ms",
    "HTTP request duration in milliseconds.",
    ["method", "route"],
    _HTTP_BUCKETS,
)

db_query_duration_ms = _h(
    "db_query_duration_ms",
    "Database query duration in milliseconds.",
    ["table"],
    _DB_BUCKETS,
)

ma_sessions_total = _c(
    "ma_sessions_total",
    "Managed Agent sessions created by model and terminal status.",
    ["model", "status"],
)

ma_session_duration_ms = _h(
    "ma_session_duration_ms",
    "Managed Agent session duration in milliseconds.",
    ["model"],
    _MA_BUCKETS,
)

ma_session_cost_usd_total = _c(
    "ma_session_cost_usd_total",
    "Cumulative USD cost of Managed Agent sessions by model and tenant.",
    ["model", "tenant_id"],
)

ma_sessions_active = _g(
    "ma_sessions_active",
    "Number of Managed Agent sessions currently in a non-terminal state.",
    ["status"],
)

mcp_tool_invocation_total = _c(
    "mcp_tool_invocation_total",
    "MCP tool invocations by tool name, tenant, and outcome.",
    ["tool", "tenant_id", "outcome"],
)

vendor_calls_total = _c(
    "vendor_calls_total",
    "Vendor API calls by vendor, capability, and outcome.",
    ["vendor", "capability", "outcome"],
)

vendor_call_duration_ms = _h(
    "vendor_call_duration_ms",
    "Vendor API call duration in milliseconds.",
    ["vendor"],
    _HTTP_BUCKETS,
)

flag_evaluations_total = _c(
    "flag_evaluations_total",
    "Feature flag evaluations by flag name and outcome.",
    ["flag_name", "outcome"],
)

webhook_events_total = _c(
    "webhook_events_total",
    "Webhook events received by source, type, and outcome.",
    ["source", "event_type", "outcome"],
)

active_ws_connections = _g(
    "active_ws_connections",
    "Active WebSocket connections by room type.",
    ["room_type"],
)

circuit_breaker_state = _g(
    "circuit_breaker_state",
    "Circuit breaker state (0 closed, 1 half-open, 2 open).",
    ["vendor", "capability"],
)

budget_tenant_spent_usd = _g(
    "budget_tenant_spent_usd",
    "Per-tenant spend in USD for the given period.",
    ["tenant_id", "period"],
)

budget_global_spent_usd = _g(
    "budget_global_spent_usd",
    "Platform-wide spend in USD for the given period.",
    ["period"],
)

budget_alert_threshold_total = _c(
    "budget_alert_threshold_total",
    "Count of budget threshold alerts raised.",
    ["tenant_id", "pct"],
)

budget_cap_tripped_total = _c(
    "budget_cap_tripped_total",
    "Count of budget caps tripped.",
    ["scope"],
)


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------


def get_registry() -> "CollectorRegistry":
    """Return the shared Prometheus collector registry."""

    return _registry


def render_metrics() -> bytes:
    """Generate Prometheus text exposition for the ``/metrics`` route.

    Usage in Aether ``main.py``::

        @app.get("/metrics", include_in_schema=False)
        async def metrics_endpoint() -> Response:
            return Response(render_metrics(), media_type=METRICS_CONTENT_TYPE)
    """

    return generate_latest(_registry)


def record_ma_session_cost(model: str, tenant_id: str, cost_usd: float) -> None:
    """Moros budget daemon hook (budget_monitor.contract.md Section 4.2).

    Called by ``src/backend/budget/local_accountant.record_session_cost`` on
    post-stream-close. Increments the cumulative counter so Grafana dashboards
    and the admin panel can query spend by tenant + model.
    """

    if cost_usd <= 0:
        return
    ma_session_cost_usd_total.labels(model=model, tenant_id=tenant_id).inc(cost_usd)


def record_http_request(method: str, route: str, status: int, duration_ms: float) -> None:
    """Access log middleware hook for uniform latency + count emission."""

    http_requests_total.labels(method=method, route=route, status=str(status)).inc()
    http_request_duration_ms.labels(method=method, route=route).observe(duration_ms)
