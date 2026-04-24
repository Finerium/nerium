# OAuth Dynamic Client Registration

**Contract Version:** 0.1.0
**Owner Agent(s):** Khronos (OAuth DCR authority, authorization server implementation)
**Consumer Agent(s):** Claude.ai custom connector (external RFC 7591 client), Aether (hosts OAuth routes via FastAPI sub-router), Tethys (EdDSA JWT pattern reuse reference), Hemera (`oauth.dcr_enabled` + fallback flags), Selene (OTel trace correlation on auth flow), Nemea-RV-v2 (E2E auth flow regression)
**Stability:** draft
**Last Updated:** 2026-04-24 (NP Wave 1, Pythia-v3 round 3)

## 1. Purpose

Defines the OAuth 2.1 authorization server surface hosted by NERIUM, covering Dynamic Client Registration (RFC 7591), Authorization Code with PKCE S256 (RFC 7636), Resource Indicators (RFC 8707), Protected Resource Metadata (RFC 9728), and Authorization Server Metadata (RFC 8414). Primary client is Claude.ai registered as a public client with `token_endpoint_auth_method: none`. This contract partners with `mcp_server.contract.md` for MCP-specific resource indicator usage and with the internal session cookie system (out of scope here).

Self-host path: Logto container on the same Hetzner CX32 box. Fallback path: FastAPI self-implemented OAuth endpoints. The contract is identical to either implementation because downstream consumers only see the wire-level contract.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor)
- `CLAUDE.md` (root)
- `docs/phase_np/RV_NP_RESEARCH.md` (Section A.2 OAuth DCR deep dive, Section D.26 security headers)
- `docs/phase_np/RV_NP_AGENT_STRUCTURE.md` (Section 4.2 Khronos)
- `docs/contracts/mcp_server.contract.md` (resource indicator usage)
- `docs/contracts/rest_api_base.contract.md` (problem+json error envelope, middleware stack)
- `docs/contracts/feature_flag.contract.md` (Hemera override gates)

## 3. Schema Definition

### 3.1 Registered client record

```python
# src/backend/auth/models/client.py

from pydantic import BaseModel, Field, HttpUrl
from datetime import datetime
from typing import Literal
from uuid import UUID

class RegisteredClient(BaseModel):
    client_id: str                                        # UUID v7 string
    client_secret: str | None = None                      # present only for confidential clients
    client_secret_expires_at: int = 0                     # 0 = never, per RFC 7591
    client_id_issued_at: int                              # Unix seconds
    redirect_uris: list[HttpUrl]                          # MUST be https except localhost for dev
    token_endpoint_auth_method: Literal["none", "client_secret_post"] = "none"
    grant_types: list[Literal["authorization_code", "refresh_token"]] = ["authorization_code", "refresh_token"]
    response_types: list[Literal["code"]] = ["code"]
    scope: str = "mcp:read"
    client_name: str
    client_uri: HttpUrl | None = None
    logo_uri: HttpUrl | None = None
    tos_uri: HttpUrl | None = None
    policy_uri: HttpUrl | None = None
    software_id: str | None = None
    software_version: str | None = None
    metadata: dict = Field(default_factory=dict)          # free-form for audit
    created_at: datetime
    last_used_at: datetime | None = None
```

### 3.2 Authorization code record

```python
class AuthorizationCode(BaseModel):
    code: str                                             # random 43-char URL-safe
    client_id: str
    user_id: UUID
    redirect_uri: HttpUrl
    scope: str
    code_challenge: str                                   # PKCE S256 base64url(sha256(verifier))
    code_challenge_method: Literal["S256"] = "S256"
    resource: list[HttpUrl] = Field(default_factory=list) # RFC 8707
    expires_at: datetime                                  # 60 s TTL
    used: bool = False                                    # single-use, flipped on exchange
    created_at: datetime
```

### 3.3 Token records

```python
class AccessToken(BaseModel):
    jti: str                                              # JWT ID, UUID v7
    client_id: str
    user_id: UUID
    scope: str
    resource: HttpUrl                                     # aud claim
    expires_at: datetime                                  # 1 h
    revoked: bool = False

class RefreshToken(BaseModel):
    token: str                                            # opaque, 64-char URL-safe, stored hashed
    token_hash: str                                       # sha256 hex
    family_id: UUID                                       # shared across rotation chain
    client_id: str
    user_id: UUID
    scope: str
    resource: HttpUrl
    expires_at: datetime                                  # 30 d
    rotated_from: str | None = None                       # previous token_hash in chain
    revoked_family: bool = False                          # reuse detection kills family
    created_at: datetime
```

## 4. Interface / API Contract

### 4.1 POST `/oauth/register`

Request:

```json
{
  "client_name": "Claude.ai MCP Connector",
  "redirect_uris": ["https://claude.ai/api/mcp/auth_callback"],
  "token_endpoint_auth_method": "none",
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "scope": "mcp:read mcp:write",
  "software_id": "claude-ai",
  "software_version": "2026.04"
}
```

Response 201:

```json
{
  "client_id": "01926f...-uuid-v7",
  "client_id_issued_at": 1714060800,
  "client_secret": null,
  "client_secret_expires_at": 0,
  "redirect_uris": ["https://claude.ai/api/mcp/auth_callback"],
  "token_endpoint_auth_method": "none",
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "scope": "mcp:read mcp:write"
}
```

Registration constraints:

- Redirect URI MUST be `https://` except `http://localhost` or `http://127.0.0.1:<port>` for dev. Custom URI schemes (e.g., `claude-ai://`) are rejected at registration per RFC 8252 loopback IP preference.
- `token_endpoint_auth_method: none` required for public clients; `client_secret_post` accepted for confidential clients (Tauri Mode B hybrid if ever needed).
- Scope string MUST be a subset of the MCP server's advertised `scopes_supported`.
- DCR is gated by Hemera flag `oauth.dcr_enabled` (default `true`). When `false`, endpoint returns HTTP 503 and Khronos falls back to pre-registered static client path (Section 11).
- Rate limit: 10 registrations per IP per hour via Redis token bucket.

### 4.2 GET `/oauth/authorize`

Query parameters per RFC 6749 + RFC 7636 + RFC 8707:

```
?response_type=code
&client_id=<uuid>
&redirect_uri=<exact-match-of-registered>
&scope=mcp:read%20mcp:write
&state=<opaque>
&code_challenge=<base64url-sha256-verifier>
&code_challenge_method=S256
&resource=https%3A%2F%2Fnerium.com%2Fmcp
```

Server authenticates user via NERIUM session cookie. If unauthenticated, redirects to `/login?next=<url>`. On consent acceptance:

```
HTTP 302 Location: <redirect_uri>?code=<43-char>&state=<echoed>
```

Constraints:

- `code_challenge_method` MUST be `S256` (plain rejected).
- `resource` MUST match exactly one `resource` value advertised in `/.well-known/oauth-protected-resource`.
- `redirect_uri` MUST exactly match one registered URI. No suffix match, no subdomain match.
- `state` echoed verbatim in redirect. Stored server-side under `__Host-oauth_state` cookie (SameSite=Lax, Secure, HttpOnly) for CSRF binding.
- Authorization code TTL 60 s, single-use.

### 4.3 POST `/oauth/token`

Grant `authorization_code`:

```
grant_type=authorization_code
&code=<code>
&redirect_uri=<exact-match>
&client_id=<uuid>
&code_verifier=<43-to-128-char>
&resource=https%3A%2F%2Fnerium.com%2Fmcp
```

Response 200:

```json
{
  "access_token": "<jwt>",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "<64-char-opaque>",
  "scope": "mcp:read mcp:write"
}
```

Grant `refresh_token`:

```
grant_type=refresh_token
&refresh_token=<opaque>
&client_id=<uuid>
&scope=mcp:read
&resource=https%3A%2F%2Fnerium.com%2Fmcp
```

Server MUST rotate refresh token on every use (new opaque value, new `token_hash`, prior `rotated_from` chain link updated). Reuse of an already-rotated refresh token revokes the entire `family_id` chain (reuse detection per OAuth 2.1 BCP).

### 4.4 Access token JWT shape

```json
{
  "iss": "https://nerium.com",
  "sub": "<user_uuid>",
  "aud": "https://nerium.com/mcp",
  "client_id": "<client_uuid>",
  "scope": "mcp:read mcp:write",
  "exp": 1714064400,
  "iat": 1714060800,
  "jti": "01926f..."
}
```

Signed RS256 with a rotating RSA 2048 keypair. JWKS published at `/oauth/jwks.json` with `kid` field. Key rotation window 30 days, grace 7 days (both keys accepted during grace).

## 5. Event Signatures

Structured log events via Selene:

| Event | Fields |
|---|---|
| `oauth.dcr.registered` | `client_id`, `client_name`, `redirect_uris[0]`, `ip` |
| `oauth.authorize.consented` | `client_id`, `user_id`, `scope`, `resource` |
| `oauth.token.issued` | `client_id`, `user_id`, `grant_type`, `scope` |
| `oauth.refresh.rotated` | `family_id`, `client_id`, `rotation_seq` |
| `oauth.refresh.reuse_detected` | `family_id`, `client_id`, `revoked_tokens_count` |
| `oauth.verify.failed` | `reason` (enum: `expired`, `invalid_signature`, `invalid_audience`, `revoked`, `scope_mismatch`) |

## 6. File Path Convention

- OAuth routers: `src/backend/auth/oauth_dcr.py` (register), `src/backend/auth/oauth_authorize.py`, `src/backend/auth/oauth_token.py`
- Well-known handlers: `src/backend/mcp/well_known.py` (shared with `mcp_server.contract.md`)
- JWT signer + JWKS publisher: `src/backend/auth/jwt_signer.py`
- Client store: `src/backend/auth/client_store.py` (Postgres-backed)
- Refresh token chain: `src/backend/auth/refresh_chain.py`
- Migrations: `src/backend/db/migrations/XXX_oauth_client.py`, `XXX_oauth_code.py`, `XXX_oauth_token.py`
- Tests: `tests/auth/test_dcr_flow.py`, `test_pkce_enforcement.py`, `test_refresh_rotation.py`, `test_reuse_detection.py`

## 7. Naming Convention

- All endpoint paths lowercase with hyphen separation in `/.well-known/` (`oauth-protected-resource`), slash separation for `/oauth/*` routes.
- Grant type strings per RFC 6749 lowercase snake.
- Scope strings per `mcp_server.contract.md` Section 7.
- Redis keys: `oauth:code:<code>`, `oauth:refresh:<hash>`, `oauth:family:<uuid>`.
- JWT claim names per RFC 9068.

## 8. Error Handling

RFC 6749 + RFC 7591 error responses (JSON):

- `invalid_request` 400: missing required parameter.
- `invalid_client` 401: unknown `client_id` or redirect URI mismatch.
- `invalid_grant` 400: expired code, already-used code, bad `code_verifier`, unknown refresh token.
- `unauthorized_client` 400: client not permitted the requested grant type.
- `unsupported_grant_type` 400.
- `invalid_scope` 400: requested scope not subset of advertised.
- `invalid_redirect_uri` 400 at registration: scheme not https/localhost or custom URI scheme rejected.
- `invalid_client_metadata` 400 at registration.
- Reuse detection: HTTP 400 `invalid_grant`, side effect revokes family.
- PKCE verification failure: HTTP 400 `invalid_grant`, reason `pkce_mismatch` in log only (not in response to prevent enumeration).
- Resource indicator mismatch at `/authorize` or `/token`: HTTP 400 `invalid_target` per RFC 8707.

## 9. Testing Surface

- DCR happy path: register a public client with PKCE support, receive `client_id` with `issued_at` and `expires_at: 0`.
- DCR rejects custom URI scheme: request with `redirect_uris: ["myapp://cb"]` returns 400 `invalid_redirect_uri`.
- Authorization code with PKCE S256: full 3-leg flow completes, token bound to correct `aud`.
- Invalid `code_verifier` at token exchange: 400 `invalid_grant`, code consumed (single-use preserved).
- Refresh rotation: exchange, receive new refresh, old refresh now invalid (reuse triggers family revoke).
- Reuse detection: submit already-rotated refresh, entire family revoked, subsequent legitimate refresh rejected.
- Resource indicator mismatch: authorize with `resource=https://example.com/mcp` when only `https://nerium.com/mcp` advertised: 400 `invalid_target`.
- Scope subset enforcement: request `mcp:read admin:all` where `admin:all` not in advertised: 400 `invalid_scope`.
- Hemera `oauth.dcr_enabled: false` toggles: DCR endpoint returns 503, but authorize + token continue working for pre-registered clients.
- JWKS rotation: verify token signed by current key, rotate, token still verifies during 7-day grace, fails after.

## 10. Open Questions

- Logto self-host vs FastAPI self-implement: decision deferred to Khronos session 1 scaffold. Contract shape identical either way.
- Post-hackathon: add `device_code` grant for CLI agents without browser.
- Post-hackathon: add `client_credentials` grant for server-to-server MCP aggregation.

## 11. Post-Hackathon Refactor Notes

- Migrate JWT alg to EdDSA (Ed25519) once Claude.ai client supports it; pattern aligns with `agent_identity.contract.md` Ed25519 primitives.
- Add Client ID Metadata Documents (CIMD) per MCP spec 2025-11-25 as preferred alternative to DCR once Claude.ai adopts.
- Implement pre-registered client static fallback: email Anthropic developer support for a fixed `client_id` tied to `claude-ai` issuer to bypass DCR when `ofid_*` reliability errors strike. Store allocated ID in Hemera flag `oauth.fallback_client_id` (string). Khronos implementation reads flag, bypasses DCR path when set and DCR fails.
- Add rate limit per `client_id` (not only per IP) to prevent single tenant exhausting MCP budget.
- Add audit export endpoint `GET /v1/auth/audit` for tenant-scoped introspection.
- PKCE `plain` method will never be enabled (security regression).
