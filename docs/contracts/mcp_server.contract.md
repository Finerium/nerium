# MCP Server

**Contract Version:** 0.1.0
**Owner Agent(s):** Khronos (Remote MCP authority, FastMCP mount + Streamable HTTP transport)
**Consumer Agent(s):** Kratos (MCP `create_ma_session` tool dispatches into MA orchestration), Phanes (listing queries exposed as `search_marketplace` tool), Tethys (identity lookup exposed as `get_agent_identity` tool), Aether (lifespan co-owner, hosts FastMCP as ASGI sub-app), Hemera (`mcp.rate_limit_override` flag gate), Selene (OpenTelemetry trace correlation), Nemea-RV-v2 (E2E verification of `/mcp` path)
**Stability:** draft
**Last Updated:** 2026-04-24 (NP Wave 1, Pythia-v3 round 3)

## 1. Purpose

Defines the canonical MCP (Model Context Protocol) server surface hosted at `https://nerium.com/mcp`. Locks transport to Streamable HTTP per spec revision 2025-06-18, auth to OAuth 2.1 Dynamic Client Registration per `oauth_dcr.contract.md`, tool exposure to JSON Schema-validated handlers, and rate limiting to Redis token bucket per `redis_session.contract.md`. Claude.ai custom connector integration is the primary consumer. SSE transport deprecated; local MCP deferred post-hackathon per NP M2 Gate 2.

This contract governs the wire-level endpoints, the FastMCP Python mount shape, well-known metadata endpoints, and the edge-allowlist posture. Tool discovery and invocation schema live in `mcp_tool_registry.contract.md`. Auth lifecycle lives in `oauth_dcr.contract.md`.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor, Section 3 Builder model flexibility, Section 9 modular contract discipline)
- `CLAUDE.md` (root, tech stack FastAPI lock)
- `docs/phase_np/RV_NP_RESEARCH.md` (Section A.1 MCP spec, Section A.2 OAuth DCR)
- `docs/phase_np/RV_NP_AGENT_STRUCTURE.md` (Section 4.2 Khronos role)
- `docs/contracts/oauth_dcr.contract.md` (auth companion)
- `docs/contracts/mcp_tool_registry.contract.md` (tool schema companion)
- `docs/contracts/rest_api_base.contract.md` (shared middleware stack)
- `docs/contracts/redis_session.contract.md` (rate limit token bucket)

## 3. Schema Definition

### 3.1 Transport + endpoints

```python
# src/backend/mcp/server.py

from fastapi import FastAPI
from mcp.server.fastmcp import FastMCP
from mcp.server.streamable_http import create_streamable_http_app

mcp = FastMCP(
    name="nerium",
    version="0.1.0",
    description="NERIUM Infrastructure for the AI agent economy",
)

def mount_mcp(app: FastAPI) -> None:
    app.mount("/mcp", create_streamable_http_app(mcp))
```

Canonical paths exposed by the mount:

| Path | Method | Purpose |
|---|---|---|
| `/mcp` | POST | Streamable HTTP message ingress (client to server JSON-RPC envelope) |
| `/mcp` | GET | Streamable HTTP message egress (server to client SSE stream over same origin) |
| `/.well-known/oauth-protected-resource` | GET | RFC 9728 Protected Resource Metadata |
| `/.well-known/oauth-authorization-server` | GET | RFC 8414 Authorization Server Metadata |
| `/oauth/register` | POST | RFC 7591 Dynamic Client Registration (delegates to `oauth_dcr.contract.md`) |
| `/oauth/authorize` | GET | OAuth 2.1 authorization code flow entry (PKCE S256 required) |
| `/oauth/token` | POST | OAuth 2.1 token endpoint (authorization_code + refresh_token grants) |
| `/oauth/jwks.json` | GET | RSA 2048 rotating JWKS for JWT RS256 signature verification |

Transport constraints:

- Streamable HTTP only. SSE transport (spec revision 2025-03-26) is explicitly not supported.
- `content-type: application/json` on request. `content-type: text/event-stream` on server response when streaming, `application/json` on non-stream.
- Request body cap 10 MiB. Response body uncapped (streamed). Connection idle timeout 300 s matches Cloudflare free tier response cap.
- CORS: Claude.ai origin `https://claude.ai` allow-listed for `OPTIONS /mcp`. Server responds `access-control-allow-methods: GET, POST, OPTIONS`, `access-control-allow-headers: authorization, content-type, mcp-session-id, mcp-protocol-version`.

### 3.2 Well-known metadata envelope

```json
// /.well-known/oauth-protected-resource
{
  "resource": "https://nerium.com/mcp",
  "authorization_servers": ["https://nerium.com"],
  "bearer_methods_supported": ["header"],
  "resource_documentation": "https://nerium.com/docs/mcp",
  "resource_signing_alg_values_supported": ["RS256"],
  "scopes_supported": ["mcp:read", "mcp:write", "mcp:admin"]
}
```

```json
// /.well-known/oauth-authorization-server
{
  "issuer": "https://nerium.com",
  "authorization_endpoint": "https://nerium.com/oauth/authorize",
  "token_endpoint": "https://nerium.com/oauth/token",
  "registration_endpoint": "https://nerium.com/oauth/register",
  "jwks_uri": "https://nerium.com/oauth/jwks.json",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "code_challenge_methods_supported": ["S256"],
  "token_endpoint_auth_methods_supported": ["none", "client_secret_post"],
  "scopes_supported": ["mcp:read", "mcp:write", "mcp:admin"]
}
```

### 3.3 MCP protocol version + session headers

- Client sends `mcp-protocol-version: 2025-06-18` on every request. Server rejects absent or unsupported version with HTTP 400 and `problem+json` per `rest_api_base.contract.md`.
- Server issues `mcp-session-id: <uuid v7>` on first successful authenticated POST. Client echoes on subsequent requests. Session state is stateless server-side except for resume cursor in Redis (`mcp:session:<id>:cursor`, TTL 15 min).

## 4. Interface / API Contract

### 4.1 FastMCP tool decorator

Tool handlers use the FastMCP `@mcp.tool()` decorator. Each tool has a Pydantic v2 input model auto-exported as JSON Schema. See `mcp_tool_registry.contract.md` for the tool registry schema and the mandatory tool list.

```python
from pydantic import BaseModel, Field

class ListProjectsInput(BaseModel):
    tenant_id: str = Field(..., description="UUID v7 of the tenant")
    limit: int = Field(default=20, ge=1, le=100)
    cursor: str | None = Field(default=None, description="Opaque pagination cursor")

@mcp.tool()
async def list_projects(input: ListProjectsInput) -> list[dict]:
    ...
```

### 4.2 Auth enforcement

Every `/mcp` request MUST carry `Authorization: Bearer <jwt>`. The JWT MUST:

- `alg: RS256` (EdDSA reserved for post-hackathon).
- `iss: https://nerium.com`
- `aud: https://nerium.com/mcp` (canonical MCP URL)
- `exp`: 1 hour from `iat`.
- `scope` claim contains one of `mcp:read`, `mcp:write`, `mcp:admin` (space-separated per RFC 8693).
- Signature verifies against one of the current JWKS keys at `/oauth/jwks.json`.

Verification failure returns HTTP 401 with `WWW-Authenticate: Bearer realm="nerium-mcp", error="invalid_token", resource_metadata="https://nerium.com/.well-known/oauth-protected-resource"`. This triggers Claude.ai's auto-discovery path per MCP spec 2025-06-18.

### 4.3 Rate limit

- Per token: 60 requests / minute default.
- Per IP: 300 requests / minute default.
- Both buckets implemented via Lua token bucket on Redis per `redis_session.contract.md` Section 4.3. Keys `rl:mcp:token:<sub>` and `rl:mcp:ip:<cidr24>`.
- Overage response: HTTP 429, `Retry-After` seconds, `RateLimit` and `RateLimit-Policy` structured headers per `rest_api_base.contract.md` Section 5.2.
- Hemera flag `mcp.rate_limit_override` (JSON `{"per_token_per_min": N, "per_ip_per_min": M}`) overrides defaults live for judge traffic burst tolerance.

### 4.4 Edge allowlist (Cloudflare WAF)

A Cloudflare WAF rule restricts `/mcp/*` ingress to Anthropic egress CIDR `160.79.104.0/21`. All other source IPs receive 403 at the edge before reaching origin. Committed as documentation in `ops/cloudflare/waf_mcp_allowlist.json`; Ghaisan applies via Cloudflare dashboard.

Fallback: Hemera flag `mcp.edge_allowlist_disabled: true` bypasses the rule for demo recording or manual testing. Flag reverts to `false` before submission per honest-claim discipline.

## 5. Event Signatures

MCP server emits observability events via Selene structlog per `observability.contract.md`. No custom event bus topics. The events below appear in structured logs only:

| Event | Fields |
|---|---|
| `mcp.request.received` | `trace_id`, `session_id`, `tool_name`, `scope`, `sub` |
| `mcp.request.completed` | `trace_id`, `duration_ms`, `status_code` |
| `mcp.request.rejected` | `trace_id`, `reason` (enum: `unauthorized`, `forbidden`, `rate_limited`, `unknown_tool`) |
| `mcp.auth.verify_failed` | `trace_id`, `reason` (enum: `expired`, `invalid_signature`, `invalid_audience`, `missing_scope`) |

## 6. File Path Convention

- Server mount: `src/backend/mcp/server.py`
- Tool implementations: `src/backend/mcp/tools/<tool_name>.py` (see `mcp_tool_registry.contract.md` for full list)
- Well-known route handlers: `src/backend/mcp/well_known.py`
- OAuth endpoints: `src/backend/auth/oauth_dcr.py` (owned by `oauth_dcr.contract.md`)
- JWT signer + JWKS publisher: `src/backend/auth/jwt_signer.py`
- Rate limit middleware: `src/backend/middleware/rate_limit_mcp.py`
- Edge allowlist config: `ops/cloudflare/waf_mcp_allowlist.json`
- Tests: `tests/mcp/test_streamable_http.py`, `tests/mcp/test_auth_enforcement.py`, `tests/mcp/test_rate_limit.py`

## 7. Naming Convention

- Tool names: `snake_case` verb-object (`list_projects`, `search_marketplace`, `get_agent_identity`, `create_ma_session`).
- Scope strings: `mcp:<action>` lowercase (`mcp:read`, `mcp:write`, `mcp:admin`).
- HTTP header names: `mcp-protocol-version`, `mcp-session-id` lowercase kebab.
- JWT claim names per RFC 9068 (`iss`, `aud`, `exp`, `iat`, `sub`, `scope`).
- Redis keys: `mcp:session:<id>:<field>`, `rl:mcp:token:<sub>`, `rl:mcp:ip:<cidr24>`.

## 8. Error Handling

- Missing `Authorization` header: HTTP 401, `WWW-Authenticate` includes `resource_metadata` per Section 4.2.
- Expired JWT: HTTP 401, reason `invalid_token`, Claude.ai auto-refreshes via refresh_token grant.
- Invalid `aud` claim: HTTP 401, reason `invalid_token`. Deliberate to prevent token replay across resources.
- Missing scope for tool: HTTP 403, `problem+json` with `type: urn:nerium:mcp:insufficient_scope`, `required_scope` field.
- Unknown tool name: HTTP 404 JSON-RPC error envelope, `error.code: -32601` per JSON-RPC 2.0.
- Malformed JSON-RPC envelope: HTTP 400, `error.code: -32700`.
- Rate limit exceeded: HTTP 429 with `Retry-After` + structured headers.
- Claude.ai `ofid_*` error post-token issuance: log at WARN, fall back to pre-registered client per `oauth_dcr.contract.md` Section 11 fallback path.
- FastMCP internal raise: bubble through FastAPI exception handler, log at ERROR with trace_id, return HTTP 500 problem+json without leaking stacktrace.

## 9. Testing Surface

- Streamable HTTP round trip: authenticated POST with `initialize` JSON-RPC envelope returns capabilities advertisement with tool list.
- JWT verification: expired token returns 401, wrong `aud` returns 401, missing scope returns 403.
- Session id issuance: first POST returns `mcp-session-id`, subsequent requests echo.
- Rate limit: burst 61 requests from same token in 60 s returns 429 on the 61st, `Retry-After` present.
- Well-known endpoints return valid JSON with all required RFC 9728 + RFC 8414 fields.
- CORS preflight from `https://claude.ai` returns `access-control-allow-origin: https://claude.ai`.
- Edge allowlist: simulated request from non-Anthropic IP returns 403 at origin-emulation layer (WAF rule tested via docs, Ghaisan verifies via Cloudflare dashboard).
- Hemera `mcp.rate_limit_override` flag change reflects within 10 s (Redis cache TTL).

## 10. Open Questions

- Pre-registered client fallback static `client_id` value: Khronos emails Anthropic developer support for allocation pre-submit (see `oauth_dcr.contract.md` Section 11). No schema impact on this contract.
- Post-hackathon: Streamable HTTP protocol version upgrade cadence. Spec revisions are frequent; contract bumps to v0.2.0 when upgrading to the next supported version.

## 11. Post-Hackathon Refactor Notes

- Migrate JWT signing from RS256 to EdDSA once Claude.ai supports it; RS256 required for submission-era compatibility.
- Add MCP resources (not only tools) once Claude.ai custom connector UI surfaces them.
- Local MCP (stdio transport) as secondary deployment for Tauri desktop agents without requiring Hetzner VPS reachability.
- Per-tenant scope refinement (`mcp:read:<tenant_id>`) instead of global scopes.
- Replace Cloudflare WAF allowlist with MTLS between Anthropic egress and origin once mutual-TLS support lands.
- Session resume with Last-Event-ID for long-running tool calls (current 15-min Redis cursor is sufficient for hackathon scope).
