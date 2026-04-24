# REST API Base

**Contract Version:** 0.1.0
**Owner Agent(s):** Aether (FastAPI backbone authority, middleware stack, error envelope, pagination, OpenAPI 3.1)
**Consumer Agent(s):** ALL NP active agents writing HTTP endpoints (Khronos, Phanes, Hyperion, Kratos, Nike, Plutus, Iapetus, Tethys, Crius, Astraea, Chione, Pheme, Hemera, Eunomia, Moros, Marshall). Selene consumes `X-Request-Id` correlation. Nemea-RV-v2 consumes problem+json + cursor pagination shape in E2E assertions.
**Stability:** draft
**Last Updated:** 2026-04-24 (NP Wave 1, Pythia-v3 round 3)

## 1. Purpose

Defines the canonical shape of every NERIUM REST endpoint. Standardizes URL versioning, middleware ordering, error envelope (RFC 7807 problem+json), cursor pagination, filter params, rate limit headers, UUID v7 identifiers, CORS policy, and OpenAPI 3.1 spec exposure. All router modules authored by per-pillar agents MUST conform. Divergence is a Harmonia-v3 contract violation flag.

FastAPI is locked per `CLAUDE.md` tech stack. No Flask, no Django REST Framework, no standalone Starlette routers outside the Aether-provided app factory. Pydantic v2 only; no Marshmallow, no dataclasses-json.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor)
- `CLAUDE.md` (root)
- `docs/phase_np/RV_NP_RESEARCH.md` (Section A.5 FastAPI, A.10 REST design, D.26 security headers)
- `docs/phase_np/RV_NP_AGENT_STRUCTURE.md` (Section 4.3 Aether)
- `docs/contracts/postgres_multi_tenant.contract.md` (RLS + `app.tenant_id` session var)
- `docs/contracts/redis_session.contract.md` (rate limit token bucket)
- `docs/contracts/observability.contract.md` (X-Request-Id correlation, OTel trace export)

## 3. Schema Definition

### 3.1 URL versioning

- All mutable + stateful endpoints under `/v1/*`. Example: `/v1/marketplace/listings`, `/v1/billing/checkout`, `/v1/ma/sessions`.
- Well-known OAuth + MCP endpoints outside `/v1/` per their respective specs: `/.well-known/*`, `/mcp/*`, `/oauth/*`.
- Health + internal: `/healthz` (liveness), `/readyz` (readiness, checks pg + redis connectivity), `/metrics` (Prometheus exposition, network-restricted).
- Admin: `/admin/*` mounted by SQLAdmin per `feature_flag.contract.md` + Eunomia scope; outside `/v1/` by SQLAdmin convention.

### 3.2 Error envelope (RFC 7807 problem+json)

```json
{
  "type": "https://nerium.com/problems/<slug>",
  "title": "Short human-readable title",
  "status": 400,
  "detail": "Longer human-readable explanation of this occurrence",
  "instance": "/v1/marketplace/listings/01926f..",
  "request_id": "01926f..",
  "errors": [
    { "field": "pricing.amount", "code": "must_be_positive", "message": "amount must be > 0" }
  ]
}
```

`content-type: application/problem+json` on response. `type` slugs registered under `https://nerium.com/problems/` (page may 404 at submission, must not 500).

Slug registry (initial):

- `validation_failed` (400)
- `unauthorized` (401)
- `forbidden` (403)
- `not_found` (404)
- `conflict` (409)
- `unprocessable_entity` (422)
- `rate_limited` (429)
- `budget_capped` (429, subtype of rate_limited semantically)
- `builder_not_enabled` (403, Hemera gate)
- `tenant_isolation_violation` (403)
- `internal_error` (500)
- `service_unavailable` (503)

### 3.3 Pagination (cursor-based)

```python
class CursorPayload(BaseModel):
    c: str                                                # created_at ISO-8601
    i: str                                                # UUID v7 as tiebreaker

# URL-safe base64(JSON(CursorPayload)) = opaque cursor string
```

Response envelope:

```json
{
  "items": [...],
  "next_cursor": "eyJjIjoiMjAyNi0wNC0yN...",
  "has_more": true
}
```

Query params: `?limit=20&cursor=<opaque>`. `limit` bounded per endpoint (default 20, max typically 100). No offset pagination. Cursor opacity means clients MUST NOT decode or synthesize; round-trip only.

### 3.4 Filter + sort params

- Flat query param names: `?status=active&category=core_agent&license=MIT`.
- Repeated param for OR: `?license=MIT&license=APACHE_2`. No bracket notation, no JSON in query.
- Sort: `?sort=<field>` or `?sort=-<field>` for descending. Only indexed columns allowed; unknown field returns 400.

### 3.5 UUID v7 identifiers

- All primary keys are UUID v7 (time-ordered, bigint-compatible sort, 128 bits). Library: `uuid-utils` or `uuid7` pypi.
- UUIDs serialized as canonical hyphenated string (`01926f12-3456-7abc-89de-f0123456789a`).
- URL path placeholders: `/v1/listings/{listing_id}` where `{listing_id}` matches UUID v7 regex.
- Foreign keys: `<entity>_id` naming (`tenant_id`, `user_id`, `listing_id`).

### 3.6 Rate limit headers

Per IETF draft `RateLimit` + `RateLimit-Policy` structured headers:

```
RateLimit: limit=60, remaining=59, reset=30
RateLimit-Policy: 60;w=60;policy="ip"
```

Both MUST appear on 200, 429. `Retry-After: <seconds>` on 429 per RFC 9110.

## 4. Interface / API Contract

### 4.1 Middleware ordering (outermost to innermost)

```python
# src/backend/main.py (Aether)

app = FastAPI(lifespan=lifespan, ...)

# 1. CORS (outermost, pre-auth)
app.add_middleware(CORSMiddleware, ...)

# 2. Trusted host (blocks Host header attacks)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["nerium.com", "*.nerium.com"])

# 3. Request-ID correlation
app.add_middleware(CorrelationIdMiddleware, header_name="X-Request-Id")

# 4. Access log (structlog)
app.add_middleware(AccessLogMiddleware)

# 5. Rate limit (Redis token bucket, per-route policy)
app.add_middleware(RateLimitMiddleware)

# 6. Authentication (session cookie + OAuth bearer)
app.add_middleware(AuthMiddleware)

# 7. Tenant binding (SET LOCAL app.tenant_id on asyncpg connection)
app.add_middleware(TenantBindingMiddleware)
```

Order is LOCKED. Inserting middleware between layers requires contract amendment.

### 4.2 CORS policy

- Credentialed requests allowed: `access-control-allow-credentials: true`.
- Exact-origin allowlist (no wildcard): `https://nerium.com`, `https://claude.ai`, `http://localhost:3100` (dev only, via Hemera flag `cors.allow_localhost`).
- Expose headers: `X-Request-Id`, `RateLimit`, `RateLimit-Policy`, `Retry-After`.
- Max age 3600 s on preflight cache.

### 4.3 Response content-type

- `application/json` for success.
- `application/problem+json` for errors.
- `text/event-stream` for SSE endpoints (per `realtime_bus.contract.md`).
- `application/octet-stream` for signed binary downloads (per `file_storage.contract.md`).

### 4.4 OpenAPI 3.1 spec

- Auto-generated by FastAPI at `/openapi.json`.
- Servers list: `https://nerium.com`, `http://localhost:3100` (dev toggle).
- `info.version` follows semantic versioning pinned to the repo tag.
- `components.securitySchemes` includes `bearerAuth` (JWT) + `cookieAuth` (NERIUM session cookie).
- Redoc at `/docs`, Swagger at `/docs-swagger` (Hemera flag `docs.public` default `true` pre-GA).

### 4.5 Idempotency

- Write endpoints accepting `Idempotency-Key` header (UUID v4 or v7 recommended) cache the response for 24 h keyed `idempotency:<key>:<user_id>`.
- Replay returns HTTP 200 with original body + `Idempotency-Replayed: true` header.
- Concurrent duplicate returns HTTP 409 `idempotency_in_progress`.
- Endpoints explicitly supporting: POST `/v1/billing/checkout`, POST `/v1/ma/sessions`, POST `/v1/marketplace/listings`, POST `/v1/commerce/purchases`.

## 5. Event Signatures

Access log emitted per request via Selene structlog:

| Event | Fields |
|---|---|
| `http.request.received` | `request_id`, `method`, `path`, `query_params`, `user_id`, `client_ip`, `user_agent` |
| `http.request.completed` | `request_id`, `status_code`, `duration_ms`, `response_size_bytes` |
| `http.request.errored` | `request_id`, `exception_type`, `exception_message` (redacted) |

OTel span name `<METHOD> <route_template>`.

## 6. File Path Convention

- App factory: `src/backend/main.py`
- Settings (pydantic-settings): `src/backend/config.py`
- Middleware: `src/backend/middleware/<name>.py`
- Router mount index: `src/backend/routers/__init__.py`
- Per-pillar routers: `src/backend/routers/v1/<pillar>/<resource>.py`
- Pydantic models: `src/backend/models/<pillar>/<resource>.py`
- Error envelope: `src/backend/errors/problem_json.py`
- Pagination helper: `src/backend/pagination/cursor.py`
- UUID v7 util: `src/backend/utils/uuid7.py`
- Idempotency store: `src/backend/middleware/idempotency.py`
- Tests: `tests/base/test_problem_json.py`, `test_cursor_pagination.py`, `test_cors.py`, `test_idempotency.py`, `test_middleware_order.py`

## 7. Naming Convention

- Route paths: kebab-case plural nouns for collections (`/v1/marketplace/listings`), singular for singleton (`/v1/me`). UUID placeholders lowercase.
- Query params: `snake_case` (`created_after`, `sort_by`).
- Request + response JSON fields: `snake_case`.
- Header names: `X-Request-Id`, `RateLimit`, `Retry-After`, `Idempotency-Key`, `Idempotency-Replayed`.
- Problem type slugs: `snake_case`.
- Pydantic model names: `PascalCase` with `Request` / `Response` / `Input` / `Output` suffix as appropriate.

## 8. Error Handling

- Pydantic validation failure: HTTP 422 `unprocessable_entity`, `errors[]` array with `field`, `code`, `message`. HTTP 400 reserved for malformed envelope.
- FastAPI raises `HTTPException`: converted to problem+json via global exception handler.
- Unhandled exception: HTTP 500 `internal_error`, `detail: "An unexpected error occurred"`, stacktrace NEVER bleeds to response (logged to Selene + GlitchTip via Sentry SDK).
- `HTTPException` with custom status/slug: mapped via `ProblemException(slug, status, detail, errors)` helper in `problem_json.py`.
- Request body > 10 MiB: HTTP 413 `payload_too_large`, reject at ASGI layer.
- Request timeout > 300 s: HTTP 504 `gateway_timeout`, emitted by Caddy for non-streaming routes; streaming endpoints bypass timeout via Caddy `flush_interval -1`.

## 9. Testing Surface

- Middleware order smoke: request flows through CORS → TrustedHost → CorrelationId → AccessLog → RateLimit → Auth → TenantBinding.
- CORS preflight from `https://claude.ai`: returns `access-control-allow-origin: https://claude.ai` + credentials true.
- Unknown host: TrustedHost middleware rejects with 400.
- X-Request-Id: generated if missing, echoed on response, propagated in log event fields.
- Rate limit burst: 61st request in 60 s returns 429 + `Retry-After` + `RateLimit` headers.
- Problem+json shape: triggered via validation failure on `POST /v1/marketplace/listings` with missing field, response shape conforms Section 3.2.
- Cursor round trip: page 1 returns `next_cursor`, page 2 request echoes cursor, returns next page, `has_more: false` on last.
- Filter OR semantics: `?license=MIT&license=APACHE_2` returns union.
- Sort descending: `?sort=-created_at` orders newest first.
- Idempotency replay: POST with same key within 24 h returns cached response + `Idempotency-Replayed: true`.
- UUID v7 format in all primary-key response fields.
- OpenAPI 3.1 spec at `/openapi.json` validates against official JSON Schema.

## 10. Open Questions

- Problem type slug registry URL hosting: serve at `/problems/<slug>` as simple Markdown pages, or dedicated docs site? Recommend ship Markdown stubs at submission so `type:` URLs resolve.
- Idempotency key TTL 24 h vs 7 d: 24 h recommended to bound Redis memory; extend if customer support flags missed retries.

## 11. Post-Hackathon Refactor Notes

- Add GraphQL endpoint at `/graphql` using Strawberry if Marketplace search gets complex federation.
- Add response caching via `ETag` + `If-None-Match` for idempotent GET endpoints.
- Versioning strategy: `/v2/` when breaking change, `/v1/` continues served for deprecation window of 90 days.
- Request body streaming for large imports (bulk listing import from creator).
- Add `Accept-Language` negotiation + i18n for error messages (currently English only per `CLAUDE.md`).
- Consider promoting problem+json types to the hub model with machine-readable error catalog at `/problems/index.json`.
