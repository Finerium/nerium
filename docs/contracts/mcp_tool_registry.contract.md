# MCP Tool Registry

**Contract Version:** 0.1.0
**Owner Agent(s):** Khronos (tool registry authority, tool function implementations)
**Consumer Agent(s):** Claude.ai custom connector (tool caller), Kratos (`create_ma_session` tool body dispatches into MA orchestration), Phanes (`list_marketplace` + `search_marketplace` tool bodies query listing catalog), Tethys (`get_agent_identity` body), Hyperion (search backend behind `search_marketplace`), Aether (Pydantic validation on tool inputs), Selene (per-tool trace emission), Moros (tool-level cost accounting), Nemea-RV-v2 (E2E tool invocation verification)
**Stability:** draft
**Last Updated:** 2026-04-24 (NP Wave 1, Pythia-v3 round 3)

## 1. Purpose

Defines the canonical registry of tools exposed by NERIUM's MCP server at `https://nerium.com/mcp`, their input schemas (Pydantic v2 auto-derived JSON Schema), output shapes, required OAuth scopes, rate limit tiers, and MA session cost accounting hooks. The registry is the single source of truth that the FastMCP `@mcp.tool()` decorators must reflect exactly. Tool discovery at MCP initialize time returns the registry. Adding a tool without amending this contract is a hard stop.

Tool invocation mechanics (transport, auth, rate limit) live in `mcp_server.contract.md`. This contract governs the tool surface itself.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor)
- `CLAUDE.md` (root)
- `docs/phase_np/RV_NP_RESEARCH.md` (Section A.1 MCP, Section B.11-B.15 Kratos runtime)
- `docs/contracts/mcp_server.contract.md` (transport + auth)
- `docs/contracts/oauth_dcr.contract.md` (scope derivation)
- `docs/contracts/ma_session_lifecycle.contract.md` (create_ma_session dispatches here)
- `docs/contracts/marketplace_listing.contract.md` (listing shape for tool outputs)
- `docs/contracts/marketplace_search.contract.md` (search ranking shape)
- `docs/contracts/agent_identity.contract.md` (identity shape for tool output)

## 3. Schema Definition

### 3.1 Tool registry envelope

```python
# src/backend/mcp/registry.py

from pydantic import BaseModel, Field
from typing import Any, Literal

class ToolSpec(BaseModel):
    name: str                                             # snake_case verb_object
    title: str                                            # human-readable
    description: str                                      # <= 500 chars, Claude-facing
    input_schema: dict[str, Any]                          # JSON Schema draft 2020-12
    output_schema: dict[str, Any]                         # JSON Schema
    required_scope: Literal["mcp:read", "mcp:write", "mcp:admin"]
    rate_tier: Literal["cheap", "normal", "expensive"]   # maps to per-tool bucket
    cost_hint_usd: float = 0.0                            # static estimate for client display
    annotations: dict[str, Any] = Field(default_factory=dict)
```

### 3.2 Required tools (initial set)

All seven MUST be exposed at submission. Per-tool detail below (Section 4).

| Tool | Scope | Rate tier | Cost hint |
|---|---|---|---|
| `list_projects` | `mcp:read` | cheap | 0.0 |
| `list_agents` | `mcp:read` | cheap | 0.0 |
| `search_marketplace` | `mcp:read` | normal | 0.0 |
| `get_agent_identity` | `mcp:read` | cheap | 0.0 |
| `get_trust_score` | `mcp:read` | cheap | 0.0 |
| `create_ma_session` | `mcp:write` | expensive | 0.50 |
| `get_ma_session` | `mcp:read` | cheap | 0.0 |

## 4. Interface / API Contract

### 4.1 `list_projects`

```python
class ListProjectsInput(BaseModel):
    limit: int = Field(default=20, ge=1, le=100)
    cursor: str | None = None
    status: Literal["active", "archived", "all"] = "active"

class ProjectSummary(BaseModel):
    id: str                                               # UUID v7
    name: str
    created_at: str
    updated_at: str
    ma_session_count: int
    status: Literal["active", "archived"]

class ListProjectsOutput(BaseModel):
    items: list[ProjectSummary]
    next_cursor: str | None = None
```

Tenant scope: the `sub` claim on the JWT resolves to a `user_id`; projects returned are those where `tenant_id = user.tenant_id` enforced via Postgres RLS.

### 4.2 `list_agents`

```python
class ListAgentsInput(BaseModel):
    owner: Literal["me", "public", "all"] = "me"
    limit: int = Field(default=20, ge=1, le=100)
    cursor: str | None = None

class AgentSummary(BaseModel):
    identity_id: str
    handle: str
    display_name: str
    capability_tags: list[str]
    trust_score: float                                    # 0.0 to 1.0
    version: str
    created_at: str

class ListAgentsOutput(BaseModel):
    items: list[AgentSummary]
    next_cursor: str | None = None
```

### 4.3 `search_marketplace`

```python
class SearchMarketplaceInput(BaseModel):
    query: str = Field(..., min_length=1, max_length=200)
    category: Literal[
        "core_agent", "content", "infrastructure", "assets",
        "services", "premium", "data", "all"
    ] = "all"
    license: list[str] | None = None                      # subset of license enum per marketplace_listing.contract.md
    pricing_model: list[str] | None = None
    sort: Literal["relevance", "trust", "newest", "price_asc", "price_desc"] = "relevance"
    limit: int = Field(default=10, ge=1, le=50)
    cursor: str | None = None

class ListingHit(BaseModel):
    listing_id: str
    slug: str
    title: str
    short_description: str
    category: str
    subtype: str
    license: str
    pricing_model: str
    price_hint: dict | None                               # shape varies by pricing_model
    trust_score: float
    rrf_score: float                                      # Reciprocal Rank Fusion score
    thumbnail_url: str | None

class SearchMarketplaceOutput(BaseModel):
    items: list[ListingHit]
    total_hits: int
    next_cursor: str | None = None
    query_echo: str                                       # normalized query after tokenization
```

Backing implementation: `marketplace_search.contract.md` Section 4 hybrid RRF merge of Postgres FTS + pgvector cosine.

### 4.4 `get_agent_identity`

```python
class GetAgentIdentityInput(BaseModel):
    identity_id: str | None = None
    handle: str | None = None                             # either identity_id or handle required

class AgentIdentityOutput(BaseModel):
    identity_id: str
    handle: str
    display_name: str
    kind: Literal["creator", "agent", "platform", "system"]
    vendor_origin: str
    public_key: str                                       # base64url Ed25519 pubkey (32 bytes)
    public_key_fingerprint: str                           # sha256:base64url first 16 bytes
    key_status: Literal["active", "retiring", "revoked"]
    retires_at: str | None
    version: str
    capability_tags: list[str]
    trust_score_pointer: str
    created_at: str
```

### 4.5 `get_trust_score`

```python
class GetTrustScoreInput(BaseModel):
    identity_id: str

class TrustScoreOutput(BaseModel):
    identity_id: str
    score: float                                          # 0.0 to 1.0
    band: Literal["unverified", "emerging", "established", "trusted", "elite"]
    computed_at: str
    stability: Literal["provisional", "stable"]
    category_scores: dict[str, float]                     # per-category breakdown
    inputs_summary: dict[str, float]                      # sanitized inputs for display
```

### 4.6 `create_ma_session`

```python
class CreateMaSessionInput(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=20000)
    model: Literal["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5"] = "claude-opus-4-7"
    max_tokens: int = Field(default=8192, ge=256, le=32768)
    budget_usd_cap: float = Field(default=5.0, ge=0.01, le=100.0)
    tools: list[str] = Field(default_factory=list)        # allowed tool names (subset of registry)
    system_prompt: str | None = None
    thinking: bool = False                                # extended thinking toggle

class CreateMaSessionOutput(BaseModel):
    session_id: str
    status: Literal["queued", "running"]
    stream_url: str                                       # SSE endpoint for streaming
    cancel_url: str
    created_at: str
```

Gating:

- Hemera flag `builder.live` MUST be `true` for the user (whitelist override per `feature_flag.contract.md`). Otherwise returns HTTP 403 `builder_not_enabled` per `ma_session_lifecycle.contract.md` Section 8.
- Moros `chronos:ma_capped` Redis flag MUST be `0`. Otherwise returns HTTP 429 `budget_capped`.
- `budget_usd_cap` cannot exceed tenant daily remaining budget (per `budget_monitor.contract.md`).
- Scope `mcp:write` required.

### 4.7 `get_ma_session`

```python
class GetMaSessionInput(BaseModel):
    session_id: str

class MaSessionDetail(BaseModel):
    session_id: str
    status: Literal["queued", "running", "streaming", "completed", "cancelled", "failed", "budget_capped"]
    model: str
    prompt_preview: str                                   # first 200 chars
    started_at: str | None
    ended_at: str | None
    input_tokens: int
    output_tokens: int
    cache_read_tokens: int
    cache_write_tokens: int
    cost_usd: float
    stop_reason: str | None
    error: dict | None
```

Tenant scope: RLS on `ma_session.user_id` and tenant JWT claim.

## 5. Event Signatures

Structured log + OTel trace per tool invocation:

| Event | Fields |
|---|---|
| `mcp.tool.invoked` | `trace_id`, `tool_name`, `scope`, `sub`, `input_size_bytes`, `rate_tier` |
| `mcp.tool.completed` | `trace_id`, `tool_name`, `duration_ms`, `output_size_bytes`, `cost_usd` |
| `mcp.tool.errored` | `trace_id`, `tool_name`, `error_type`, `error_message` (redacted) |

Each MA session creation also emits `ma.session.created` per `ma_session_lifecycle.contract.md` Section 5.

## 6. File Path Convention

- Registry module: `src/backend/mcp/registry.py` (owns `ToolSpec`, `REGISTERED_TOOLS` list)
- Tool handlers: `src/backend/mcp/tools/<tool_name>.py`, one module per tool
- Pydantic input models: co-located in each tool module as `<ToolName>Input`
- Pydantic output models: co-located as `<ToolName>Output`
- Tests: `tests/mcp/tools/test_<tool_name>.py`
- JSON schema dumps (optional, for client discovery caching): `src/backend/mcp/schemas/<tool_name>.json`

## 7. Naming Convention

- Tool names: `snake_case`, verb-object (`list_projects`, `search_marketplace`, `create_ma_session`).
- Pydantic models: `PascalCase` with `Input` / `Output` suffix.
- Category + subtype enum values: `snake_case` lowercase (see `marketplace_listing.contract.md` Section 3).
- Trust bands: single-word lowercase.
- Status enum values: `snake_case` lowercase.
- JSON Schema `$id`: `https://nerium.com/schemas/mcp/<tool_name>/input` or `.../output`.

## 8. Error Handling

JSON-RPC 2.0 error codes wrapped over HTTP 200 envelope per MCP spec:

- `-32700` Parse error: malformed JSON body.
- `-32600` Invalid request: envelope missing `method` or `params`.
- `-32601` Method not found: unknown tool name.
- `-32602` Invalid params: input fails Pydantic validation (detail echoes field path).
- `-32603` Internal error: tool handler raised uncaught exception.
- `-32001` (server-defined) Scope insufficient: HTTP response code 403 at transport, JSON-RPC error embedded.
- `-32002` (server-defined) Rate limit exceeded: HTTP 429 at transport, JSON-RPC error with `Retry-After`.
- `-32003` (server-defined) Budget capped: HTTP 429 at transport, error includes `budget_reset_at`.
- `-32004` (server-defined) Builder not enabled (Hemera whitelist): HTTP 403.

Error body redaction: tool input snippets echoed in error messages MUST NOT include prompt content beyond first 80 chars (PII leak prevention).

## 9. Testing Surface

- Registry completeness: `initialize` JSON-RPC envelope returns all 7 tool specs with non-empty `input_schema` + `output_schema`.
- Each tool input schema validates known-good payload: fixtures in `tests/mcp/fixtures/`.
- Each tool input schema rejects known-bad payload: boundary tests per Pydantic field constraints.
- Scope enforcement: call `create_ma_session` with `mcp:read`-only token returns HTTP 403.
- Rate tier enforcement: burst `expensive` tier tool exceeds per-minute quota returns 429 ahead of `cheap` tier threshold.
- Tenant isolation: `list_projects` called with JWT sub A returns 0 items for tenant B data; Postgres RLS verified via test fixture.
- `create_ma_session` gated by Hemera `builder.live: false` returns 403 `builder_not_enabled`.
- `create_ma_session` gated by Moros `chronos:ma_capped: 1` returns 429 `budget_capped`.
- JSON-RPC error code alignment: invalid tool name returns `-32601`, validation failure returns `-32602`.
- OTel trace emitted per tool call with `mcp.tool_name` attribute present.

## 10. Open Questions

- Tool versioning strategy: when `list_projects` gains new output field, do we introduce `list_projects_v2` or bump the MCP server version? Recommend MCP server version bump + tool stays stable (post-hackathon decision).
- Cost hint display: MCP client UI surfaces `cost_hint_usd` pre-call consent. Confirm Claude.ai displays it in the connector UI (behavior observed in dev builds, verify at submission).
- `tools` allowlist inside `create_ma_session`: should this default to full registry or empty? Default to empty for principle of least privilege; caller must opt-in per tool.

## 11. Post-Hackathon Refactor Notes

- Add tool categories for Claude.ai UI grouping (Builder / Marketplace / Registry / Admin).
- Add per-tool prompt caching hints (Anthropic prompt cache TTL) for high-frequency tool calls.
- Add `list_resources` + `read_resource` tool set when MCP resource primitives become widely supported in Claude.ai.
- Add tool result streaming for large responses (`search_marketplace` with 100+ hits) via MCP server-side events.
- Per-tool SLA dashboard in Eunomia admin reading OTel trace aggregates via Grafana Cloud.
- Tool call allowlist per tenant: enterprise tenants may restrict which tools their agents may invoke.
