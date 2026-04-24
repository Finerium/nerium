# Managed Agent Session Lifecycle

**Contract Version:** 0.1.0
**Owner Agent(s):** Kratos (session CRUD + state machine owner, per `agent_orchestration_runtime.contract.md`)
**Consumer Agent(s):** Khronos (MCP `create_ma_session` + `get_ma_session` tools dispatch here), Nike (SSE stream endpoint + WS broadcast), Moros (budget caps + post-session cost reconciliation), Plutus (Arq-queued ledger write per session), Eunomia (admin impersonation + session audit view), Boreas (chat UIScene consumes streams), Frontend Builder UI, Selene (OTel trace + structlog per session), Nemea-RV-v2 (E2E session flow regression)
**Stability:** draft
**Last Updated:** 2026-04-24 (NP Wave 1, Pythia-v3 round 3)

## 1. Purpose

Defines the HTTP + SSE wire surface for Managed Agent sessions: create, stream, cancel, get detail, list. Session status machine + internal dispatch logic live in `agent_orchestration_runtime.contract.md`. Database schema for `ma_session`, `ma_event`, `ma_step` tables is owned here (they are session-lifecycle artifacts) with multi-tenant conventions per `postgres_multi_tenant.contract.md`.

Endpoints follow `rest_api_base.contract.md` conventions. Stream endpoint follows `realtime_bus.contract.md`.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor, Section 2 Builder recursive automation)
- `CLAUDE.md` (root)
- `docs/phase_np/RV_NP_RESEARCH.md` (Section B.11-B.15)
- `docs/phase_np/RV_NP_AGENT_STRUCTURE.md` (Section 4.6 Kratos, 4.7 Nike)
- `docs/contracts/agent_orchestration_runtime.contract.md` (state machine internal)
- `docs/contracts/rest_api_base.contract.md` (problem+json, pagination, idempotency)
- `docs/contracts/realtime_bus.contract.md` (SSE endpoint template + resume)
- `docs/contracts/budget_monitor.contract.md` (pre-call cap check)
- `docs/contracts/feature_flag.contract.md` (`builder.live` gate)
- `docs/contracts/postgres_multi_tenant.contract.md` (RLS + tenant binding)

## 3. Schema Definition

### 3.1 Database tables

```sql
CREATE TABLE ma_session (
  id                 uuid PRIMARY KEY,
  tenant_id          uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  user_id            uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  mode               text NOT NULL CHECK (mode IN ('web', 'tauri', 'mcp')),
  model              text NOT NULL,
  status             ma_session_status NOT NULL DEFAULT 'queued',
  system_prompt      text,
  prompt             text NOT NULL,
  prompt_preview     text GENERATED ALWAYS AS (substring(prompt from 1 for 200)) STORED,
  max_tokens         int NOT NULL DEFAULT 8192,
  budget_usd_cap     numeric(10, 4) NOT NULL DEFAULT 5.0,
  thinking           boolean NOT NULL DEFAULT false,
  tools              jsonb NOT NULL DEFAULT '[]'::jsonb,
  input_tokens       int NOT NULL DEFAULT 0,
  output_tokens      int NOT NULL DEFAULT 0,
  cache_read_tokens  int NOT NULL DEFAULT 0,
  cache_write_tokens int NOT NULL DEFAULT 0,
  cost_usd           numeric(10, 4) NOT NULL DEFAULT 0.0,
  anthropic_message_id text,
  stop_reason        text,
  error              jsonb,
  idempotency_key    text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  started_at         timestamptz,
  ended_at           timestamptz,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);
CREATE INDEX idx_ma_session_tenant_created ON ma_session(tenant_id, created_at DESC);
CREATE INDEX idx_ma_session_user_status ON ma_session(user_id, status);

ALTER TABLE ma_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE ma_session FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ma_session
  USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE TABLE ma_event (
  id           bigserial PRIMARY KEY,
  session_id   uuid NOT NULL REFERENCES ma_session(id) ON DELETE CASCADE,
  seq          int NOT NULL,
  event_type   text NOT NULL,
  payload      jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, seq)
);
CREATE INDEX idx_ma_event_session_seq ON ma_event(session_id, seq);

CREATE TABLE ma_step (
  id           uuid PRIMARY KEY,
  session_id   uuid NOT NULL REFERENCES ma_session(id) ON DELETE CASCADE,
  name         text NOT NULL,
  depends_on   uuid[] NOT NULL DEFAULT '{}',
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed','skipped')),
  result       jsonb,
  error        jsonb,
  attempts     int NOT NULL DEFAULT 0,
  started_at   timestamptz,
  ended_at     timestamptz
);
CREATE INDEX idx_ma_step_session ON ma_step(session_id, status);
```

`ma_event` + `ma_step` RLS scoped through FK cascade; add direct RLS policies mirroring parent table for defense-in-depth.

### 3.2 Pydantic request + response models

```python
class CreateMaSessionRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=20000)
    model: Literal["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5"] = "claude-opus-4-7"
    max_tokens: int = Field(default=8192, ge=256, le=32768)
    budget_usd_cap: float = Field(default=5.0, ge=0.01, le=100.0)
    thinking: bool = False
    tools: list[str] = Field(default_factory=list)
    system_prompt: str | None = Field(default=None, max_length=10000)
    mode: Literal["web", "tauri", "mcp"] = "web"

class CreateMaSessionResponse(BaseModel):
    session_id: str
    status: Literal["queued", "running"]
    stream_url: str
    cancel_url: str
    created_at: str

class MaSessionDetailResponse(BaseModel):
    session_id: str
    tenant_id: str
    user_id: str
    mode: str
    model: str
    status: str
    prompt_preview: str
    max_tokens: int
    budget_usd_cap: float
    thinking: bool
    tools: list[str]
    input_tokens: int
    output_tokens: int
    cache_read_tokens: int
    cache_write_tokens: int
    cost_usd: float
    stop_reason: str | None
    error: dict | None
    created_at: str
    started_at: str | None
    ended_at: str | None
```

## 4. Interface / API Contract

### 4.1 POST `/v1/ma/sessions`

Creates a new session. Gates per `agent_orchestration_runtime.contract.md` Section 4.4.

- Auth: Bearer JWT or session cookie.
- Scope: `mcp:write` for MCP-originating, `builder:write` for web + Tauri session cookies.
- Idempotency: optional `Idempotency-Key` header per `rest_api_base.contract.md` Section 4.5.
- Body: `CreateMaSessionRequest`.
- Response 201: `CreateMaSessionResponse` with `stream_url: /v1/ma/sessions/<id>/stream` + `cancel_url: /v1/ma/sessions/<id>/cancel`.
- Dispatcher enqueues session to Arq `ma_dispatch` queue; status transitions `queued → running` within 100 ms typical.

### 4.2 GET `/v1/ma/sessions/{id}/stream`

SSE endpoint per `realtime_bus.contract.md` Section 4.2. Client receives `nerium.ma.*` events per `agent_orchestration_runtime.contract.md` Section 3.2. Supports `Last-Event-ID` resume from `ma_event.seq`.

Response MIME `text/event-stream`. Heartbeat `: ping\n\n` every 15 s. Final event `nerium.ma.done` closes stream.

Per-session concurrent SSE connection cap: 3 (e.g., user opens multiple tabs).

### 4.3 POST `/v1/ma/sessions/{id}/cancel`

Sets `ma:cancel:<session_id> = 1` in Redis. Dispatcher detects on next event boundary and finalizes with `cancelled`. Returns HTTP 202 `accepted`.

If session already in terminal state (`completed|failed|cancelled|budget_capped`): HTTP 200 with current status, idempotent.

### 4.4 GET `/v1/ma/sessions/{id}`

Returns `MaSessionDetailResponse`. Tenant-scoped by RLS. Admin (via SQLAdmin impersonation) may read cross-tenant.

### 4.5 GET `/v1/ma/sessions`

Paginated list (cursor pagination per `rest_api_base.contract.md` Section 3.3).

Query params: `?status=running|streaming|completed|failed|cancelled|budget_capped|all` (default `all`), `?mode=web|tauri|mcp|all`, `?sort=-created_at` (default).

### 4.6 GET `/v1/ma/sessions/{id}/events`

Raw event log for debug / audit. Returns paginated list of `ma_event` rows. Admin only + tenant-scoped.

### 4.7 DELETE `/v1/ma/sessions/{id}`

Soft-deletes a session (sets tombstone, removes from default list). Event rows retained 30 days. Hard purge via nightly cron.

## 5. Event Signatures

Stream event types per `agent_orchestration_runtime.contract.md` Section 3.2 table. Full list:

`nerium.ma.queued`, `nerium.ma.started`, `nerium.ma.delta`, `nerium.ma.tool_call`, `nerium.ma.thinking`, `nerium.ma.usage`, `nerium.ma.done`, `nerium.ma.cancelled`, `nerium.ma.errored`.

Structured log events (Selene):

| Event | Fields |
|---|---|
| `ma.session.created` | `session_id`, `tenant_id`, `user_id`, `mode`, `model`, `budget_usd_cap`, `tools` |
| `ma.session.completed` | `session_id`, `duration_ms`, `input_tokens`, `output_tokens`, `cost_usd` |
| `ma.session.cancelled` | `session_id`, `requested_by`, `stage` |
| `ma.session.failed` | `session_id`, `error_kind`, `attempt_count` |
| `ma.session.budget_capped` | `session_id`, `cap_usd`, `spent_usd` |

## 6. File Path Convention

- Router: `src/backend/routers/v1/ma/sessions.py`
- Stream handler: `src/backend/routers/v1/ma/stream.py`
- Cancel handler: `src/backend/routers/v1/ma/cancel.py`
- List + detail: `src/backend/routers/v1/ma/crud.py`
- Pydantic models: `src/backend/models/ma/session.py`, `event.py`, `step.py`
- Migrations: `src/backend/db/migrations/XXX_ma_session.py`, `XXX_ma_event.py`, `XXX_ma_step.py`
- Seed data: `src/backend/db/seed/demo_ma_sessions.sql`
- Tests: `tests/ma/test_create_session.py`, `test_stream_resume.py`, `test_cancel_race.py`, `test_list_filter.py`, `test_idempotency.py`

## 7. Naming Convention

- Table + column: `snake_case` per `postgres_multi_tenant.contract.md`.
- Session status enum values: `snake_case` lowercase.
- HTTP endpoint paths: `/v1/ma/sessions/{id}/{verb}`.
- Wire event types: `nerium.ma.<subtype>`.
- Pydantic models: `<Action>MaSessionRequest/Response` PascalCase.

## 8. Error Handling

- Pydantic validation failure: HTTP 422 `unprocessable_entity`.
- `builder.live` flag false for user: HTTP 403 `builder_not_enabled`.
- Global budget cap tripped: HTTP 429 `budget_capped` with `Retry-After: 86400` pointing to 00:00 UTC reset.
- Per-tenant budget insufficient: HTTP 429 `budget_capped` with `remaining_usd_today` in problem+json detail.
- Concurrent session cap exceeded: HTTP 429 `too_many_active_sessions`.
- Idempotency key collision (same key, different body): HTTP 422 `idempotency_body_mismatch`.
- Get session not found: HTTP 404 `not_found`. Tenant isolation: cross-tenant id appears not found.
- Cancel after terminal state: HTTP 200 idempotent with current status.
- Stream `Last-Event-ID` beyond any stored event: HTTP 400 `invalid_event_id`.
- Stream connection after session `completed`: HTTP 410 `gone` with `session_status: completed` hint.
- Claude SDK version mismatch: HTTP 500 `internal_error` (infra issue, not user error).

## 9. Testing Surface

- Happy path: POST returns 201 with stream_url, SSE connects, receives `queued` → `started` → N deltas → `done`.
- Cancel mid-stream: POST cancel, SSE receives `cancelled` within 2 s, session `cancelled`.
- Resume: disconnect mid-stream at event 10, reconnect with `Last-Event-ID: 10`, receive events 11+.
- Idempotency: POST twice with same key + body returns same `session_id`; different body returns 422.
- Whitelist gate: non-whitelisted user POST returns 403 `builder_not_enabled`.
- Budget cap: set `chronos:ma_capped=1`, POST returns 429 `budget_capped`.
- Tenant isolation: user A POST session, user B GET returns 404.
- Concurrent limit: open 3 sessions, POST 4th returns 429 `too_many_active_sessions`.
- List filter: create sessions with mixed statuses, `GET ?status=completed` returns only completed.
- Event log: admin GET events returns chronological event list with matching count.
- Thinking toggle: `thinking: true` session emits `nerium.ma.thinking` events in stream.
- Soft delete: DELETE session, list no longer includes it, GET by id returns 404, admin view still shows tombstone.
- RLS enforcement: direct Postgres query without tenant binding returns 0 rows.

## 10. Open Questions

- Budget cap default USD 5.0 per session: confirm vs USD 10.0? Recommend 5.0 (judges can create multiple if needed).
- Session TTL: completed sessions retained forever (billing + audit). Cancelled + failed retained 30 days then purged. Confirm retention policy.
- MCP-originated session billing: charged to MCP client's tenant (the `tenant_id` from ticket) or to platform? Charged to client tenant.

## 11. Post-Hackathon Refactor Notes

- Session checkpointing: persist partial `content_block` accumulator per turn for resume after pod restart.
- Async cancellation with Anthropic API cancel endpoint once stable in SDK.
- Batch API integration: `POST /v1/ma/batches` for bulk prompt submissions at reduced cost.
- Session templates: predefined system prompt + tool allowlist as a `ma_session_template` table.
- Multi-turn sessions: allow follow-up `POST /v1/ma/sessions/{id}/turns` instead of spawning new session per turn.
- Session forking: copy an existing session as starting state for an alternate exploration.
- Export session as replayable fixture for QA + demo regression.
