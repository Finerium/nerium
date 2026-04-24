# Observability

**Contract Version:** 0.1.0
**Owner Agent(s):** Selene (structured logging, OpenTelemetry, Grafana Cloud shipping, GlitchTip error tracking, X-Request-Id correlation)
**Consumer Agent(s):** ALL NP agents (shared logger + trace context). Aether hosts middleware. Eunomia admin dashboard links to Grafana. Moros reads OTel metrics for spend tracking. Nemea-RV-v2 verifies log completeness in regression.
**Stability:** draft
**Last Updated:** 2026-04-24 (NP Wave 1, Pythia-v3 round 3)

## 1. Purpose

Defines the observability stack: structured JSON logging (structlog), distributed tracing (OpenTelemetry SDK auto-instrumenting FastAPI + httpx + asyncpg + Redis + Arq), metrics (Prometheus exposition via OTel), error tracking (GlitchTip self-hosted, Sentry-compatible). Logs + traces + metrics shipped to Grafana Cloud Free (50 GB logs / 50 GB traces / 10k series metrics / 14-day retention / 3 users free) via Alloy agent. Fallback to self-host Loki + Grafana + Tempo if free tier exhausted.

Request correlation via `X-Request-Id` header + `trace_id` + `span_id` injected into every log event. Sampling 100% traces + logs at submission (low volume); post-hackathon tune down.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor)
- `CLAUDE.md` (root)
- `docs/phase_np/RV_NP_RESEARCH.md` (Sections E.29 logging, E.31 error tracking, E.32 performance)
- `docs/phase_np/RV_NP_AGENT_STRUCTURE.md` (Section 4.16 Selene)
- `docs/contracts/rest_api_base.contract.md` (middleware order + X-Request-Id)

## 3. Schema Definition

### 3.1 Log event shape

```json
{
  "timestamp": "2026-04-27T06:00:00.123Z",
  "level": "INFO",
  "logger": "src.backend.ma.dispatcher",
  "event": "ma.session.created",
  "request_id": "01926f...",
  "trace_id": "5b8aa5a2d2c872e8321cf37308d69df2",
  "span_id": "051581bf3cb55c13",
  "user_id": "01926f...",
  "tenant_id": "01926f...",
  "session_id": "01926f...",
  "model": "claude-opus-4-7",
  "budget_usd_cap": 5.0,
  "tools": ["search_marketplace"],
  "pid": 12345,
  "hostname": "nerium-api-1"
}
```

All log events are single-line JSON. `event` field is the stable machine-readable name (`<domain>.<subject>.<action>` snake); freeform message goes in `msg` if present.

### 3.2 Log levels

- `DEBUG`: verbose diagnostic (disabled in prod unless `DEBUG_MODULES=<comma_list>` env set).
- `INFO`: normal operation events (request received, session created, flag evaluated).
- `WARN`: anomaly but operation continues (retry, fallback, degraded mode).
- `ERROR`: operation failed (request 5xx, webhook signature invalid, vendor call exception).
- `CRITICAL`: platform health compromised (DB unreachable, KEK missing, budget daemon stopped).

### 3.3 OTel span conventions

Every request starts root span `<METHOD> <route_template>` (e.g., `POST /v1/ma/sessions`). Child spans per agent:

- `db.query` with `db.statement` (first 200 chars), `db.rows_affected`.
- `redis.<command>` with `redis.key_prefix`.
- `vendor.<capability>.<method>` with `vendor.name`.
- `ma.dispatch` with `ma.session_id`, `ma.model`, `ma.thinking`.
- `search.hybrid` → child `search.lexical`, `search.semantic`, `search.embedding`.
- `mcp.tool.<tool_name>` with `mcp.scope`, `mcp.tenant_id`.

Span attributes snake-cased namespaced. Sensitive values (api_key, prompt text > 80 chars) redacted.

### 3.4 Metrics

Prometheus exposition via OTel. Key metrics:

```
# Counters
http_requests_total{method,route,status}
ma_sessions_total{model,status}
vendor_calls_total{vendor,capability,outcome}
flag_evaluations_total{flag_name,outcome}
webhook_events_total{source,event_type,outcome}

# Histograms
http_request_duration_ms{method,route}
db_query_duration_ms{table}
vendor_call_duration_ms{vendor}
ma_session_duration_ms{model}

# Gauges
active_ws_connections{room_type}
ma_sessions_active{status}
budget_tenant_spent_usd{tenant_id,period}
budget_global_spent_usd{period}
circuit_breaker_state{vendor,capability}
```

Scraped by Alloy agent, pushed to Grafana Cloud Mimir. Local `/metrics` endpoint network-restricted (internal only + admin-auth per Hemera flag `metrics.auth_required`).

## 4. Interface / API Contract

### 4.1 Logger initialization

```python
# src/backend/obs/logger.py

import structlog
from opentelemetry.instrumentation.logging import LoggingInstrumentor
from asgi_correlation_id import CorrelationIdFilter

def configure_logging(env: str):
    LoggingInstrumentor().instrument(set_logging_format=False)

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.processors.CallsiteParameterAdder({
                structlog.processors.CallsiteParameter.MODULE,
                structlog.processors.CallsiteParameter.FUNC_NAME,
                structlog.processors.CallsiteParameter.LINENO,
            }),
            inject_trace_id,                              # adds trace_id + span_id from OTel context
            inject_request_id,                            # adds X-Request-Id from correlation-id context
            redact_sensitive,                             # api_key, password, prompt-over-80 chars
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

log = structlog.get_logger(__name__)
log.info("ma.session.created", session_id=str(session.id), model=session.model)
```

### 4.2 OTel provider setup

```python
# src/backend/obs/tracing.py

from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from opentelemetry.instrumentation.asyncpg import AsyncPGInstrumentor
from opentelemetry.instrumentation.redis import RedisInstrumentor

def configure_tracing(app: FastAPI, env: str):
    resource = Resource.create({
        "service.name": "nerium-api",
        "service.namespace": "nerium",
        "service.version": settings.version,
        "deployment.environment": env,
    })
    provider = TracerProvider(resource=resource)
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(
        endpoint=settings.otel_endpoint,
        headers={"authorization": f"Basic {settings.grafana_otlp_token}"},
    )))
    trace.set_tracer_provider(provider)

    FastAPIInstrumentor.instrument_app(app, excluded_urls="/healthz,/readyz,/metrics")
    HTTPXClientInstrumentor().instrument()
    AsyncPGInstrumentor().instrument()
    RedisInstrumentor().instrument()
```

### 4.3 GlitchTip integration

Sentry SDK pointed at GlitchTip:

```python
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.asyncio import AsyncioIntegration
from sentry_sdk.integrations.asyncpg import AsyncPGIntegration

sentry_sdk.init(
    dsn=settings.glitchtip_dsn,
    environment=env,
    release=settings.version,
    traces_sample_rate=0.0,                                # OTel handles traces
    integrations=[FastApiIntegration(), AsyncioIntegration(), AsyncPGIntegration()],
    before_send=scrub_pii,
)
```

GlitchTip self-hosted on same Hetzner CX32 (Docker Compose service). 4.2+ supports source map artifact bundles for frontend.

### 4.4 Redaction

```python
# src/backend/obs/redact.py

SENSITIVE_KEYS = {"api_key", "password", "secret", "token", "access_token", "refresh_token", "client_secret", "authorization"}
LARGE_TEXT_KEYS = {"prompt", "system_prompt", "body", "long_description"}

def redact_sensitive(logger, name, event_dict):
    for key in list(event_dict.keys()):
        if key.lower() in SENSITIVE_KEYS:
            event_dict[key] = "[REDACTED]"
        if key.lower() in LARGE_TEXT_KEYS and isinstance(event_dict[key], str):
            if len(event_dict[key]) > 80:
                event_dict[key] = event_dict[key][:80] + "...[truncated]"
    return event_dict
```

## 5. Event Signatures

This contract does not itself emit wire events. It defines the shape of log + trace + metric emissions from all other agents. See each agent's contract Section 5 for its emission list.

Grafana dashboards (reference `blueswen/fastapi-observability`):

- **API overview**: request rate + p50/p95/p99 latency + error rate per route.
- **MA session health**: active sessions + completion rate + avg duration per model + budget spend.
- **Vendor health**: circuit state + call latency + error rate per vendor.
- **DB health**: query p95 latency + connection pool saturation.
- **Redis health**: ops/s + latency + memory usage.
- **Realtime**: active WS connections per room + SSE stream count.
- **Billing**: webhook processing rate + ledger posting rate.
- **Budget**: per-tenant daily spend sparkline + global cap bar.

Committed JSON at `ops/grafana/dashboards/*.json`, Ghaisan imports via Grafana Cloud UI.

## 6. File Path Convention

- Logger: `src/backend/obs/logger.py`
- Tracing provider: `src/backend/obs/tracing.py`
- Metrics: `src/backend/obs/metrics.py` (Prometheus exposition)
- Redaction: `src/backend/obs/redact.py`
- Correlation middleware: `src/backend/middleware/correlation_id.py`
- Access log middleware: `src/backend/middleware/access_log.py`
- Sentry/GlitchTip init: `src/backend/obs/error_tracking.py`
- Grafana dashboards: `ops/grafana/dashboards/*.json`
- Alloy config: `ops/alloy/config.river`
- GlitchTip Docker service: `docker-compose.yml` snippet
- Tests: `tests/obs/test_log_shape.py`, `test_trace_correlation.py`, `test_redaction.py`, `test_metrics_exposure.py`

## 7. Naming Convention

- Event names: `<domain>.<subject>.<action>` snake lowercase (`ma.session.created`, `http.request.completed`).
- Logger hierarchy: module path (`src.backend.ma.dispatcher`).
- Span names: HTTP `<METHOD> <route_template>`, DB `db.query`, Redis `redis.<command>`, vendor `vendor.<capability>.<method>`, MA `ma.<phase>`.
- Span attribute keys: snake lowercase, namespaced (`ma.session_id`, `db.statement`, `vendor.name`).
- Prometheus metric names: `<domain>_<subject>_<unit>{labels}` per Prometheus convention.
- Environment strings: `development`, `staging`, `production`.

## 8. Error Handling

- OTel exporter unreachable (Grafana Cloud outage): BatchSpanProcessor buffers in-memory up to 2048 spans then drops with WARN log. Local stdout JSON logs still emitted.
- GlitchTip outage: Sentry SDK queues + retries; after backoff exhausted drops. Logs `error_tracking.queue_dropped`.
- Alloy agent stopped: logs + metrics buffer at source (structlog to stdout captured by Docker json-file driver; OTel via in-memory buffer); resume on Alloy restart.
- Log volume exceeds Grafana Cloud free tier: sampling middleware drops DEBUG + tag-filtered INFO emissions per Hemera flag `obs.log_sampling_rate` (0.0 to 1.0, default 1.0).
- Redaction regex miss (unknown field name contains secret): defense via test fixture audit; if leak detected, rotate the leaked credential + patch redact list.
- Trace context propagation broken across asyncio task spawn: use `with tracer.start_as_current_span(...)` context manager; tests verify trace_id inheritance.
- Prometheus scrape slowness (`/metrics` > 1 s): reduce metric cardinality (drop high-cardinality labels like `user_id`).

## 9. Testing Surface

- Log shape: every emission has `timestamp`, `level`, `event`, `logger`, `request_id`, `trace_id` fields.
- Trace correlation: span start + child span + log emission all share trace_id.
- Redaction: log with `api_key="sk-abc123"` renders `api_key="[REDACTED]"`.
- Redaction of large text: `prompt="..." * 100` truncated to 80 chars + `[truncated]`.
- Access log middleware: records `http.request.received` + `http.request.completed` per request with duration_ms.
- FastAPI auto-instrumentation excludes `/healthz`, `/readyz`, `/metrics`.
- Asyncpg span emitted on query with `db.statement` attribute.
- Redis command span emitted with `redis.key_prefix`.
- Sentry integration captures unhandled exception with full stacktrace + request_id context.
- Metrics endpoint exposition: `/metrics` returns Prometheus format with expected counters + histograms.
- Sampling: `obs.log_sampling_rate=0.1` drops 90% of DEBUG logs.
- Cross-service trace: HTTP client call from Kratos → Anthropic API emits trace span linking parent.

## 10. Open Questions

- Grafana Cloud free tier sustainability post-launch: monitor usage; switch to self-host Loki + Tempo if projected > 50 GB/mo.
- Frontend observability (Next.js): `@vercel/otel` browser SDK vs Sentry browser SDK. Recommend Sentry browser for frontend error + perf, OTel only for backend.
- Log retention: 14 d Grafana Cloud default sufficient. Extend to 30 d post-hackathon if compliance needs.
- PII redaction beyond current regex list: integrate with `scrubadub` library post-hackathon.

## 11. Post-Hackathon Refactor Notes

- Self-host Loki + Tempo + Mimir + Grafana on Hetzner (single-box or separate box) when Grafana Cloud free tier exhausted.
- Per-tenant log isolation (`tenant_id` as label) with Grafana data source permission per org.
- Log-based alerting (Grafana Loki alerts on error spike).
- Distributed tracing across Kratos subagent hops (W3C Trace Context propagation via Anthropic tool_use chain).
- Real-user monitoring (RUM) in frontend.
- Profiling via Pyroscope (continuous Python profiling).
- Log anonymization pipeline for export to external analytics.
- SLO dashboard (request availability + latency per pillar) with error budget burn-down.
- OpenTelemetry Collector between app + Grafana Cloud for transformation + sampling + routing.
- AI-powered log anomaly detection (Grafana ML / Loki patterns).
