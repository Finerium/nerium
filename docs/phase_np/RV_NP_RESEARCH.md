# NERIUM NP M1 Research Document

## 0. Document meta

- **Author**: Metis-v3 (M1 NP research lead)
- **Date**: April 24, 2026
- **Phase**: NP (Near-Production-grade, Jalur A full backend)
- **Handoff target**: M2 agent structure design
- **Status**: M1 complete, decision-ready for M2
- **Submission**: Monday April 27 2026, 07:00 WIB (target 06:00 WIB)
- **Constraint discipline**: No em dash, no emoji, English only, no budget or time estimate fabrication per V4 directive, honest-claim discipline per Kalypso W3.

---

## 0.1 Pre-action filesystem audit

Files read:

- `CLAUDE.md` root
- `NarasiGhaisan.md` v1.1 (23 sections, voice anchor)
- `RV_PLAN.md` (272 lines, V4 master)
- `RV_AgentPromptOpening.md` (Wave 1 spawn compendium)
- `RV_FileManifest.md`
- `MANAGED_AGENTS_RESEARCH.md` (P0 era)
- `NERIUM_AGENT_STRUCTURE.md` (P0 era)
- `claude_design_landing.html` (Kalypso W3 port, palette --ink oklch(0.14 0.012 250), --phos oklch(0.88 0.15 140), --bone oklch(0.95 0.01 85), VT323 + Space Grotesk + JetBrains Mono, CRT scanfield + vignette)
- `harmonia_rv_state_integration.md` (8 contracts: game_state FAIL, quest_schema FAIL, dialogue_schema PASS-WITH-DRIFT, item_schema FAIL, game_asset_registry FAIL, game_event_bus PASS-WITH-DRIFT, zustand_bridge PARTIAL-FAIL, asset_ledger PASS-WITH-DRIFT; critical: duplicate divergent useQuestStore + useDialogueStore singletons in src/state/stores.ts)
- `nemea_rv_regression_report.md` (NEEDS_FIX, 5 blockers B1-B5, 14/23 E2E failed)
- `nemea_rv_a11y_report.md` (Lighthouse perf 49 landing + 38 /play, a11y 100/100, READY on a11y axis)
- `nemea_final_qa.md`
- `agent_flow_diagram.html` (P0), `RV_agent_flow_diagram.html` (M3)
- Screenshots (2 RV era + 2 NP-trigger + 11 visual_inspiration)
- Oak-Woods repo analyzed via GitHub (chongdashu/phaserjs-oakwoods)
- Metis-v2 prior outputs

Files NOT read: none critical missing.

---

## 1. Executive summary

NERIUM NP is a five-pillar production-grade submission. The bridge-first plan (Epimetheus Wave 0) resolves RV regression before any NP waves begin, unlocking a clean base. Wave 1 then ships infrastructure (Khronos MCP, Aether FastAPI core, Hemera feature flags, Pheme mail, Chione R2 storage, Selene logging). Wave 2 extends with Builder runtime (Kratos + Nike orchestrator), Stripe + Banking (Plutus + Iapetus + Marshall), Marketplace (Hyperion search + Phanes listings), Registry + Protocol (Tethys + Crius + Astraea trust), and admin (Eunomia). Wave 3 is critical visual revamp (Helios-v2) and full in-game UX pivot (Boreas chat + Moros budget daemon). Wave 4 is legal + final QA.

Three load-bearing decisions:

1. **Remote MCP primary** on `https://nerium.com/mcp` with Python FastMCP mounted into FastAPI. OAuth DCR via self-hosted Logto (or self-implement) with PKCE, RFC 8707 resource indicators, and RFC 9728 Protected Resource Metadata. Local MCP defer post-hackathon. Tauri Mode B uses system browser + deep link redirect.

2. **Stripe test mode Senin pitch**, live post-Stripe Atlas Global (10-14 days realistic). Indonesia remains invite-only on Stripe. Midtrans secondary rail for IDR local methods. Plutus stubs both in test mode.

3. **Game pivot to Minecraft chat-style full in-game UX**. React HUD on `/play` deprecated. Phaser `UIScene` runs in parallel with world scenes; DOMElement chat input preserves IME. Focus arbitration via `focusin`/`focusout` + `scene.input.keyboard.enabled`. Visual upgrade targets Sea of Stars / Crosscode / Stardew tier with 3-layer depth, y-sort by sprite y, 20 to 40 props per scene, ambient NPC wander, point-light lantern effects via Phaser Lights2D or overlay gradient.

---

## 2. RV bridge scope: Epimetheus resolution plan

Epimetheus runs Wave 0, parallel with Wave 1 infra. Target: 23/23 E2E green post-bridge. Scope:

- **B1**: Invoke `useQuestStore.getState().autostartFromCatalog()` on mount of `/play` root container, after scene boot, so `lumio_onboarding` with `autostart: true` promotes into `activeQuests`.
- **B2**: Call `registerDialogues([apollo_intro])` with `parseDialogue(apollo_intro.json)` at same mount site before any DialogueOverlay spawn. Load via static import so bundler embeds the JSON.
- **B3**: Rewrite `gameBridge.questEffectBus` listener from single-case `play_cinematic` switch to full 8-branch switch handling `award_item`, `add_currency`, `push_toast`, `open_dialogue`, `add_trust`, `emit_event`, `stream_apollo_response`, `play_cinematic`. Each branch routes to the correct canonical store method.
- **B4**: Add case in `BusBridge` for `game.dialogue.node_entered` that calls `questStore.fireTrigger('dialogue_node_reached', { nodeId, dialogueId })`. This unblocks quest steps 1, 3, 8 that stall waiting for dialogue node trigger.
- **B5 Option (a) BUILD FULL**: Author `caravan_vendor` NPC in `ApolloVillageScene` (spawn at `caravan_arrival_zone` object layer), create `caravan_arrival_zone` zone trigger in Tiled map, author `data/dialogues/caravan_vendor_greet.json` dialogue tree with 3 choice branches.
- **Harmonia duplicate store consolidation**: Replace the inline `create<QuestStore>` and `create<DialogueStore>` in `src/state/stores.ts` with re-export shims pointing at `src/stores/questStore.ts` and `src/stores/dialogueStore.ts`. Mirror the exact pattern of the existing audio re-export. Verify zustand bridge subscribes canonical stores post-consolidation.

Verification: run Nemea-RV-v2 (targeted Oak-Woods playwright-testing skill read) immediately after Epimetheus lands, expect 23/23 green.

---

## 3. Part A: Infrastructure + Deploy

### A.1 MCP protocol + Claude.ai custom connector

MCP spec evolved: 2025-03-26 introduced OAuth 2.1; 2025-06-18 mandated RFC 9728 Protected Resource Metadata + RFC 8707 Resource Indicators + Streamable HTTP transport (SSE deprecated); 2025-11-25 added Client ID Metadata Documents (CIMD) as preferred alternative to DCR. Claude.ai requires reachability from Anthropic egress `160.79.104.0/21`, Streamable HTTP transport, `/.well-known/oauth-protected-resource` metadata. See [spec.modelcontextprotocol.io](https://modelcontextprotocol.io/specification/draft/basic/authorization), [Anthropic connector auth](https://claude.com/docs/connectors/building/authentication), [Descope auth deep-dive](https://www.descope.com/blog/post/mcp-auth-spec).

Known April 2026 reliability caveat: `ofid_*` errors after token issuance affect third-party connectors regardless of registration mode. Fallback: pre-registered `oauth_anthropic_creds` flow.

| Dimension | Node TS SDK | Python SDK (FastMCP) |
|---|---|---|
| FastAPI integration | Separate process + reverse proxy | Mount as ASGI sub-app |
| OAuth plumbing | `workers-oauth-provider` mature | Bring-your-own or FastMCP helpers |
| Streamable HTTP 2025-06-18 | Yes | Yes |
| Tool declaration | Zod schemas | Pydantic v2, auto JSON schema |
| Solo-dev cognitive load | Two runtimes | Single Python runtime |

**Decision**: Python FastMCP mounted into FastAPI. Exposes `/mcp` (Streamable HTTP), `/.well-known/oauth-protected-resource`, `/.well-known/oauth-authorization-server`, `/oauth/register`, `/oauth/authorize`, `/oauth/token`, `/oauth/jwks.json`. JWT RS256 with rotating JWKS, `aud` = canonical MCP URL, `iss` = `https://nerium.com`, 1h access token, refresh rotation. Rate limit per token + per IP via Redis token bucket.

```python
from fastapi import FastAPI
from mcp.server.fastmcp import FastMCP
from mcp.server.streamable_http import create_streamable_http_app

mcp = FastMCP("nerium")

@mcp.tool()
async def list_projects(tenant_id: str) -> list[dict]:
    return await db.fetch_projects(tenant_id)

app = FastAPI()
app.mount("/mcp", create_streamable_http_app(mcp))
```

### A.2 OAuth 2.0 DCR (RFC 7591)

Claude.ai is public client (PKCE S256, `token_endpoint_auth_method: none`, redirect `https://claude.ai/api/mcp/auth_callback`). MCP spec mandates PKCE S256, `resource` param in `/authorize` and `/token`, short-lived access tokens + refresh rotation, WWW-Authenticate with `resource_metadata=` on 401.

Supabase OAuth 2.1 Server (beta April 2026) supports DCR via flag `allow_dynamic_registration = true`. Known bug: rejects non-http(s) redirect schemes (blocks Cursor, not Claude.ai). Logto self-host alternative: MIT-licensed, single container, supports DCR, PKCE, ships MCP docs.

| Option | Cost | DCR | PKCE | Self-host | Effort |
|---|---|---|---|---|---|
| Supabase Auth | Free beta | Yes | Yes | Yes | Lowest |
| Auth0 | Free 7k MAU | Yes | Yes | No | Medium |
| Clerk | Free 10k MAU | Yes (MCP flow) | Yes | No | Low |
| Logto self-host | Free OSS | Yes | Yes | Yes | Medium |
| WorkOS AuthKit | Paid, free dev | Yes | Yes | No | Low |
| FastAPI self-implement | Free | Build | Build | Yes | Highest |

**Decision**: Self-host Logto on same Hetzner box, or self-implement in FastAPI if Logto proves heavy. Scopes `mcp:read`, `mcp:write`, `mcp:admin`. Refresh rotation with reuse detection (compromised family, revoke all).

### A.3 Tauri v2 production build pipeline

Tauri v2 (tauri.app) produces native WebView binaries (WebView2, WKWebView, WebKitGTK). Signing: macOS Developer ID + notarytool ($99/yr), Windows Authenticode or Azure Key Vault, Linux optional GPG. Built-in updater uses signed JSON manifest + Ed25519 signature. `tauri-plugin-deep-link` for custom schemes. `tauri-plugin-oauth` localhost server for providers rejecting custom schemes.

**Decision for April 27 hackathon**: Skip paid signing. Ad-hoc macOS (Control-click Open workaround), unsigned Windows with SmartScreen notes, unsigned AppImage + deb. Use `tauri-plugin-deep-link` with scheme `nerium://` and `https://nerium.com/auth/success` bounce page. OAuth redirect target stays on `https://nerium.com`, deep link back via `nerium://auth/callback`. Do NOT use Tauri WebView as OAuth redirect (Google/Apple refuse custom schemes inside WebView). Bundle size expect: Windows NSIS 5-15 MB, macOS app 10-25 MB, Linux AppImage 60-90 MB (WebKitGTK baseline).

### A.4 Hetzner Cloud VPS + Docker Compose + Caddy

Hetzner April 2026: CX32 (4 vCPU / 8 GB / 80 GB / 20 TB traffic) ~EUR 6.80, FSN1 EU region. Caddy v2 automatic HTTPS, 6-line Caddyfile. Cloudflare proxied DNS (orange cloud) for DDoS + origin IP hiding; 100s response cap, 100 MB request cap (SSE + MCP streamable works).

**Decision**: CX32 FSN1 single-box, Caddy v2 reverse proxy, Cloudflare proxied DNS, one free Rate Limiting rule on `/api/*`, rolling redeploy via `docker compose up -d --no-deps api`, daily `pg_dump` + weekly Hetzner snapshot, backups to Cloudflare R2 via rclone. Allowlist Claude egress `160.79.104.0/21` at Cloudflare WAF for `/mcp/*`.

```yaml
# docker-compose.yml skeleton
services:
  caddy: { image: caddy:2-alpine, ports: ["80:80","443:443","443:443/udp"] }
  api:   { image: ghcr.io/nerium/api:${TAG:-latest}, env_file: .env }
  postgres: { image: postgres:16-alpine, volumes: [pgdata:/var/lib/postgresql/data] }
  redis: { image: redis:7-alpine, command: ["redis-server","--appendonly","yes","--appendfsync","everysec"] }
```

```
# Caddyfile
nerium.com {
    encode zstd gzip
    @mcp path /mcp /mcp/*
    reverse_proxy @mcp api:8000 { flush_interval -1 }
    reverse_proxy api:8000
    header Strict-Transport-Security "max-age=31536000; includeSubDomains"
}
```

### A.5 FastAPI production patterns

**Decision**: asyncpg raw + Pydantic v2 + lifespan + pydantic-settings + URL versioning `/v1/` + RFC 7807 problem+json errors + UUID v7 ids. Middleware order CORS outermost, then TrustedHost, then request-id, then access log, then auth.

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.pg = await asyncpg.create_pool(dsn=settings.pg_dsn, min_size=2, max_size=20)
    app.state.redis = redis.from_url(settings.redis_url, decode_responses=True)
    yield
    await app.state.pg.close(); await app.state.redis.aclose()
```

### A.6 Postgres multi-tenant

Three patterns (silo, schema-per-tenant, shared + tenant_id + RLS). Industry consensus for NERIUM scale: **shared schema + tenant_id + RLS as defense-in-depth**. PlanetScale recommends app-layer filter + RLS safety net. pgbouncer transaction mode incompatible with asyncpg prepared statements unless `statement_cache_size=0`.

**Decision**: Self-host Postgres 16 on Hetzner CX32, shared schema + `tenant_id` column + RLS policies using `current_setting('app.tenant_id', true)`. Skip pgbouncer v1. Alembic async migrations. WAL archive to R2 for PITR.

```sql
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON projects
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
```

### A.7 Redis

Upstash April 2026 free tier: 500k commands/mo, 256 MB. Self-host on Hetzner co-located (sub-ms latency, no network hop). AOF `appendfsync everysec` + daily RDB, Redis 7 ACL scoping per service.

**Decision**: Self-host Redis 7 on same Hetzner box, bind to internal Docker network. Lua token bucket script portable across Upstash if ever migrated. ACL split: `app` (api:*, sess:*, rl:*), `worker` (jobs:*, arq:*), `mcp` (read-only except rl:*).

### A.8 Background job queue

**Decision**: Arq (asyncio-native, Redis-backed, retries + DLQ, idempotency via SETNX on `Idempotency-Key` header). Celery overkill. Dramatiq sync-first. BullMQ adds Node runtime.

### A.9 WebSocket server

**Decision**: FastAPI native WebSocket + ConnectionManager + Redis pub/sub fanout. Auth via short-lived (60s) JWT ticket as query param (browser cannot set Authorization header on WS). Heartbeat 25s, reconnect exponential backoff (1s, 2s, 4s, max 30s), on reconnect client sends last-seen event id for Redis Stream replay.

### A.10 REST API design

OpenAPI 3.1, URL versioning `/v1/`, cursor pagination (opaque base64 JSON `{c: created_at, i: id}`), flat filter params, IETF draft `RateLimit` / `RateLimit-Policy` structured headers, RFC 7807 problem+json errors, UUID v7 ids. CORS credentialed: exact origins `https://nerium.com`, `https://claude.ai`, expose `X-Request-Id`, `RateLimit`, `Retry-After`.

---

## 4. Part B: Builder Runtime

### B.11 Agent orchestration runtime

**Decision**: Hybrid. Claude Agent SDK (`claude_agent_sdk.query` / `ClaudeSDKClient`, Opus 4.7 requires v0.2.111+) for inner agent loop (tool-calling, tool_use -> tool_result auto-handle). Custom Python state machine (asyncio + Postgres `ma_step` table with `status` enum) for outer DAG, cancellation, resume. Skip Temporal/Restate (2-day infra detour). Re-dispatch `pending` status rows on crash recovery.

### B.12 Managed Agent session lifecycle

States: `queued -> running -> streaming -> completed | cancelled | failed | budget_capped`.

Endpoints: `POST /v1/ma/sessions`, `GET /v1/ma/sessions/{id}/stream` (SSE), `POST /v1/ma/sessions/{id}/cancel`, `GET /v1/ma/sessions/{id}`.

Hemera whitelist gate pre-call. Chronos/Moros budget daemon: hybrid local accounting (record after each stream close via `message_delta.usage`) + 5-min reconciliation against Anthropic Admin Usage API `/v1/organizations/usage_report/messages`. Redis key `chronos:ma_capped=1` flips on overspend; both create_session and stream loop short-circuit.

Schema:

```sql
CREATE TABLE ma_session (
  id uuid PRIMARY KEY, user_id uuid NOT NULL,
  mode text CHECK (mode IN ('web','tauri')),
  model text NOT NULL, status text NOT NULL,
  system_prompt text, tools jsonb DEFAULT '[]',
  max_tokens int DEFAULT 8192, budget_usd_cap numeric(10,4),
  input_tokens int DEFAULT 0, output_tokens int DEFAULT 0,
  cache_read_tok int DEFAULT 0, cache_write_tok int DEFAULT 0,
  cost_usd numeric(10,4) DEFAULT 0,
  anthropic_message_id text, stop_reason text, error jsonb,
  created_at timestamptz DEFAULT now(),
  started_at timestamptz, ended_at timestamptz
);
CREATE TABLE ma_event (
  id bigserial PRIMARY KEY, session_id uuid REFERENCES ma_session(id) ON DELETE CASCADE,
  seq int NOT NULL, event_type text NOT NULL, payload jsonb NOT NULL,
  created_at timestamptz DEFAULT now(), UNIQUE (session_id, seq)
);
CREATE TABLE ma_step (
  id uuid PRIMARY KEY, session_id uuid REFERENCES ma_session(id) ON DELETE CASCADE,
  name text, depends_on uuid[] DEFAULT '{}',
  status text DEFAULT 'pending', result jsonb, attempts int DEFAULT 0
);
```

### B.13 Streaming token-level to client

**Decision**: SSE (Anthropic's upstream is SSE; Kratos becomes transparent proxy + re-wrapping pass). Resume via `Last-Event-ID` mapped to `ma_event.seq`. Browser `fetch-event-source` for POST SSE; Tauri `reqwest` streaming body.

Anthropic stream events: `message_start`, `content_block_start` (type: `text` | `tool_use` | `thinking` | `server_tool_use`), `content_block_delta` (text_delta, input_json_delta for tool args, thinking_delta, signature_delta), `content_block_stop`, `message_delta` (stop_reason, cumulative usage.output_tokens), `message_stop`, interleaved `ping`. Streaming required when `max_tokens > 21333` (extended thinking). Tool args stream as partial JSON in `input_json_delta`; aggregate until `content_block_stop` before parsing.

Wire format: `nerium.delta`, `nerium.tool_call`, `nerium.thinking`, `nerium.usage`, `nerium.done`, `nerium.cancelled`. Heartbeat every 15s `: ping\n\n`.

### B.14 Context passing between agents

**Decision**: Postgres `jsonb` canonical (`ma_step.result`). Redis Stream per session (`ma:{sid}:bus`) for handoff event bus. S3/R2 blob only if artifact > 256 KB. Every artifact carries manifest `{uri, sha256, bytes, mime, schema}`; verify before next Claude call. Pass thinking blocks unchanged with `signature` field on multi-turn (server decrypts for reasoning continuity).

### B.15 Anthropic Messages API tool use + routing

Parallel tool_use blocks all get returned together in next user message. `tool_choice` options: `auto` (default), `any`, `{type:"tool", name:...}`, `none`. Only `auto`/`none` compatible with extended thinking.

Model routing April 2026:

| Model | Input/Output $/MTok | Context | Route to |
|---|---|---|---|
| Claude Opus 4.7 | 5 / 25 | 1M | Hard agent runs, planning, demo moneyshot |
| Claude Opus 4.6 | 5 / 25 | 1M | Fallback if 4.7 rate-limited |
| Claude Sonnet 4.6 | 3 / 15 | 1M | Tool calls, RAG, cheap Kratos subagents |
| Claude Haiku 4.5 | 1 / 5 | 200K | Classification, extraction, short summaries |

```python
def pick_model(task):
    if task.kind in ("plan","synthesize","hard_code","agent_headline"): return "claude-opus-4-7"
    if task.kind in ("tool_call","rag_answer","code_edit","compose"): return "claude-sonnet-4-6"
    return "claude-haiku-4-5"
```

---

## 5. Part C: Stripe + Banking + Marketplace

### C.16 Stripe Indonesia April 2026

Indonesia is invite-only, preview status. Stripe Atlas Global recommended for Ghaisan: USD 500 one-time, Delaware C-corp + EIN + 83(b) + registered agent + USD 2500 Stripe credits. Timeline realistic 10-14 days end-to-end. **Do NOT assume live payments by Monday pitch.** Use test mode `sk_test_*`, `pk_test_*`.

Stripe Connect types: Standard, Express, Custom. **Decision**: Express for Iapetus (Stripe-hosted onboarding with NERIUM branding, platform controls payouts, broad country availability, fastest DX).

Indonesian tax: PPh 26 withholding 20% on non-resident entities (treaty may reduce to 10% for royalties), PPN 11% effective (statutory 12%). Foreign digital platforms with turnover > IDR 600M/yr must register as VAT collector. **Decision**: Route revenue via Delaware C-corp + Stripe US acquirer, avoid PPN registration until revenue threshold met.

### C.17 Midtrans Indonesia backup

Midtrans covers BCA, Mandiri, BNI VA, GoPay, OVO, DANA, ShopeePay, QRIS. Snap hosted UI fastest to integrate. Subscription support limited (card + GoPay only). Webhook SHA512 signature verify `sha512(order_id + status_code + gross_amount + server_key)`.

**Decision**: Dual-rail. Stripe primary (global USD + subscriptions). Midtrans secondary activated for IDR checkout. Plutus stubs both in test mode for M1 pitch. No subscription logic on Midtrans.

### C.18 Marketplace listing search

**Decision**: Postgres FTS (tsvector + GIN + pg_trgm) + pgvector hybrid (BM25 via ts_rank_cd + vector via cosine, Reciprocal Rank Fusion k=60). Zero extra infra. Embedding model: Voyage `voyage-3.5` (1024-dim, Anthropic-owned) for primary, OpenAI `text-embedding-3-small` (1536-dim) as cheaper fallback. Config `'simple'` (not `'english'`) for bilingual ID+EN.

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;
-- hybrid search with RRF: see C.21 listing schema
```

### C.19 Double-entry bookkeeping

Principles: sum to zero per transaction per currency, append-only entries, idempotency key per external write, amounts in BIGINT smallest currency unit (cents, IDR rupiah), never FLOAT.

```sql
CREATE TYPE account_type AS ENUM ('asset','liability','equity','revenue','expense');
CREATE TABLE ledger_account (
  id BIGSERIAL PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  type account_type NOT NULL, currency CHAR(3) NOT NULL,
  parent_id BIGINT REFERENCES ledger_account(id),
  is_system BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE ledger_transaction (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT UNIQUE NOT NULL,
  reference_type TEXT, reference_id TEXT, description TEXT,
  posted_at TIMESTAMPTZ DEFAULT now(), metadata JSONB DEFAULT '{}'
);
CREATE TABLE ledger_entry (
  id BIGSERIAL PRIMARY KEY,
  transaction_id UUID REFERENCES ledger_transaction(id),
  account_id BIGINT REFERENCES ledger_account(id),
  direction CHAR(1) CHECK (direction IN ('D','C')),
  amount BIGINT CHECK (amount > 0), currency CHAR(3) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
REVOKE UPDATE, DELETE ON ledger_entry FROM PUBLIC;
```

Reconciliation: nightly cron compares ledger `SUM(assets:stripe_balance_usd)` vs `Stripe.balance.retrieve()`. Consume `charge.succeeded`, `charge.refunded`, `payout.paid`, `application_fee.created`, `transfer.created` webhooks; Stripe event id = `idempotency_key`.

Invoice PDF: **WeasyPrint + Jinja2** (HTML+CSS, faster dev than ReportLab, lighter than headless Chromium).

### C.20 Email transactional

**Decision**: **Resend + React Email**. Free tier 3k/mo, 100/day, React Email native. DKIM + SPF + DMARC on `mail.nerium.com` subdomain. Warm new domain slowly (< 50/day week 1). DMARC start `p=none` then quarantine after 2 weeks. Mailtrap for dev inbox.

### C.21 Marketplace 7-category listing schema

Seven categories: Core Agent, Content, Infrastructure, Assets, Services, Premium, Data. Subtype enum covers `agent`, `skill`, `prompt`, `quest_template`, `dialogue_tree`, `context_pack`, `mcp_config`, `connector`, `workflow`, `eval_suite`, `voice_profile`, `visual_theme`, `sprite_pack`, `sound_pack`, `custom_build_service`, `consulting_hour`, `verified_certification`, `priority_listing`, `custom_domain_agent`, `dataset`, `analytics_dashboard`. Pricing: `free`, `one_time`, `subscription_monthly`, `subscription_yearly`, `usage_based`, `tiered`. License: `MIT`, `CC0`, `CC_BY_4`, `CC_BY_SA_4`, `CC_BY_NC_4`, `APACHE_2`, `CUSTOM_COMMERCIAL`, `PROPRIETARY`. Integrity check constraint: subtype_matches_category + pricing_consistent.

---

## 6. Part D: Registry + Protocol + Security

### D.22 Trust score algorithm

**Decision**: Bayesian smoothed mean for marketplace sort, Wilson lower bound for binary signals (helpful, spam flags). Formula:

```
bayesian = (v / (v + m)) * R + (m / (v + m)) * C    # m=15, C=3.5 seeded nightly
wilson   = ((pos + 1.9208) / (pos + neg) - 1.96 * SQRT((pos*neg)/(pos+neg) + 0.9604) / (pos+neg)) / (1 + 3.8416/(pos+neg))
```

Precompute `agent_trust_score` column via pg_cron nightly. New-agent boost: `score + 0.2 * exp(-age_days/3)` first 7 days.

### D.23 Agent identity cryptographic verification

**Decision**: Ed25519 via PyNaCl (libsodium). Raw detached signatures on artifacts (deterministic, 64-byte sig, 32-byte pubkey, side-channel resistant, no nonce-reuse failure mode). JWT EdDSA only for short-lived bearer tokens (< 5 min). Key rotation with 14-day grace: old key flipped `retiring`, verifier accepts either during grace, cron flips to `revoked` at `retires_at`.

### D.24 Multi-vendor adapter pattern

**Decision**: Per-record AES-256-GCM DEK, wrapped by KEK in Hetzner systemd env file (chmod 600). Avoid cloud KMS cost. Circuit breaker via `pybreaker` (fail_max=5, reset_timeout=30, success_threshold=2) + Tenacity retry with exponential jitter (initial 0.5s, max 8s, jitter 0.25). Ordered fallback OpenAI -> Anthropic -> local vLLM with per-vendor Hemera flag to disable fallback if user-visible divergence.

### D.25 Rate limit pattern

**Decision**: Lua token bucket on Redis (portable, atomic, single round trip) + one Cloudflare Rate Limiting rule on `/api/*` as origin shield (100 req / 10s per IP). `redis-cell` GCRA only if module loadable.

### D.26 Security headers + CSP

CSRF: SameSite=Lax + Secure + HttpOnly session cookies, OAuth `state` in `__Host-oauth_state` cookie. HSTS 2-year + preload (submit after 48h clean). CSP nonce-based strict-dynamic, per-route tightening.

`/play` CSP:
```
default-src 'self';
script-src 'self' 'nonce-{N}' 'strict-dynamic' https://js.stripe.com https://*.js.stripe.com;
style-src 'self' 'nonce-{N}';
img-src 'self' data: blob: https://cdn.nerium.com;
connect-src 'self' https://api.nerium.com https://api.stripe.com wss://rt.nerium.com;
worker-src 'self' blob:; frame-src https://js.stripe.com https://hooks.stripe.com;
object-src 'none'; base-uri 'self'; frame-ancestors 'none'; upgrade-insecure-requests;
```

Phaser WebGL needs `worker-src 'self' blob:` and `img-src data: blob:`. Stripe Elements needs `js.stripe.com` script-src and `*.js.stripe.com`/`hooks.stripe.com` frame-src.

### D.27 CAPTCHA

**Decision**: Cloudflare Turnstile Managed mode (invisible, WCAG 2.1 AA compliant, unlimited free, privacy-preserving). Placement: signup, password reset, unauth marketplace publish. NOT on login (use progressive delay + rate limit), NOT on every form.

---

## 7. Part E: Storage + Observability + Admin

### E.28 File storage

**Decision**: **Cloudflare R2**. 10 GB free, 1M Class A + 10M Class B ops free/mo, zero egress. Presigned POST upload cap 25 MB, ClamAV sidecar for virus scan on Hetzner. Images served direct from R2 via Cloudflare CDN (free egress), defer transforms to post-MVP.

### E.29 Structured logging

**Decision**: `structlog` JSON output in prod + `opentelemetry-instrumentation-logging` for trace correlation (inject `trace_id`, `span_id`) + `asgi-correlation-id` for `X-Request-ID`. Ship to **Grafana Cloud Free** via Alloy agent or direct Loki push (10k series metrics, 50 GB logs, 50 GB traces, 14-day retention, 3 users free). Self-host Loki + Grafana on Hetzner only if traffic > 50 GB/mo.

### E.30 Analytics

**Decision**: **PostHog Cloud Free tier** (1M events, 5k replays, 1M flag requests, 100k errors, 1.5k surveys/mo). EU cloud region. Default anonymous mode (`opt_out_capturing_by_default=True`), identify on consent. One less Hetzner service. Migrate self-host if exceed 1M events.

### E.31 Error tracking

**Decision**: **GlitchTip self-hosted** on Hetzner (unlimited, Sentry SDK wire-protocol compatible, 4 services Django + Celery + Postgres + Redis, 2 GB RAM). 4.2+ supports source map artifact bundles. Fall back to Sentry Cloud Developer free (5k errors, 30-day retention) if self-host ops pain pre-submit. Traces sample rate 0.0 to preserve quota; use OpenTelemetry for perf instead.

### E.32 Performance monitoring

**Decision**: OpenTelemetry SDKs everywhere: `opentelemetry-instrumentation-fastapi` + `-httpx` + `-sqlalchemy` + `-redis` backend; `@vercel/otel` frontend Next.js. OTLP to Grafana Cloud Free (Tempo traces, Mimir metrics, Loki logs). Reference dashboard at `github.com/blueswen/fastapi-observability`. k6 load test committed at `loadtest/api.js` (500 VUh/mo free via Grafana Cloud k6).

### E.33 Admin panel

**Decision**: **SQLAdmin** (aminalaee/sqladmin). 15-min path to working CRUD over SQLAlchemy models. Custom ModerationQueueView for approve/reject. Auth backend reuses main session cookie + `is_superuser`.

### E.34 Feature flag service Hemera

**Decision**: Custom Postgres-backed per spec. Schema:

```sql
CREATE TABLE hemera_flag (
  flag_name text PRIMARY KEY, default_value jsonb NOT NULL,
  description text, created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES users(id)
);
CREATE TABLE hemera_override (
  id bigserial PRIMARY KEY, user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  flag_name text REFERENCES hemera_flag(flag_name) ON DELETE CASCADE,
  value jsonb NOT NULL, expires_at timestamptz,
  created_by uuid, created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, flag_name)
);
CREATE TABLE hemera_audit (
  id bigserial PRIMARY KEY, actor_id uuid, flag_name text, user_id uuid,
  action text, old_value jsonb, new_value jsonb,
  at timestamptz DEFAULT now()
);
```

Trigger on override insert/update/delete writes to audit with `current_setting('hemera.actor_id')`. Redis cache 10s TTL. APScheduler TTL sweep nightly. Whitelist gate flag `builder.live` default false; judges + Ghaisan + demo user get permanent overrides.

---

## 8. Part F: Legal + GDPR + Notification

### F.35 GDPR compliance

Endpoints: `POST /v1/me/export` (async via queue, returns JSON + ZIP to R2 with 7-day signed URL), `DELETE /v1/me` (30-day soft-delete via `deleted_at` + `purge_at = now() + 30 days`, nightly purge cascades via FK). Financial records exempt: keep in `billing_archive` for 7 years, PII scrubbed. Consent table with (user_id, purpose, granted, policy_ver, source, at) append history. Purposes: `analytics`, `marketing_email`, `session_replay`.

DPO exemption note: solo dev, no large-scale systematic monitoring, no special-category processing, Art. 37 not triggered. Privacy contact `privacy@nerium.com` published.

### F.36 ToS + Privacy Policy

**Decision**: Termly free generator for MVP draft, edit for NERIUM specifics, commit to `docs/legal/`. Lawyer review pre-pitch (EUR 500-1k flat-fee SaaS privacy review typical). OSS LICENSE (MIT) separate from ToS; ToS governs service, LICENSE governs code. Audit AGPL deps via `pip-licenses` + `license-checker`; refuse AGPL unless copyleft accepted. PostHog MIT fine; Plausible AGPL avoided.

### F.37 Cookie consent banner

**Decision**: **Klaro self-hosted** (BSD-3, 57 KB, rewrites `<script type="text/plain" data-name="...">` to real scripts post-consent). Three services: `posthog` (analytics consent), `sentry` (debatable, ask to be safe), `stripe` (necessary on /play only). Strictly-necessary cookies not exposed as toggle. Preference in `nerium_consent` first-party cookie (12 months, SameSite=Lax) + localStorage + `consent` table mirror on login.

### F.38 In-app notification

**Decision**: `notification` table as source of truth. **sonner** toast for in-app realtime. WebSocket fanout via Redis pub/sub `notify:{user_id}`. Web Push VAPID for browser offline (pywebpush backend). Tauri native via `@tauri-apps/plugin-notification`. Hourly digest cron for unread > 24h.

---

## 9. Part G: Game Visual Revamp + Input Arbitration [CRITICAL DEEP SECTION]

### G.39 Aesthetic deconstruction of reference titles

Synthesis across Sea of Stars, Crosscode, Stardew Valley, Moonlighter, Hyper Light Drifter, To The Moon. Sources: [Mega Visions art of Sea of Stars](https://www.megavisions.net/the-art-of-sea-of-stars-a-sea-of-pixels/), [ResetEra SoS pixel art thread](https://www.resetera.com/threads/its-frankly-insane-how-good-sea-of-stars-pixel-art-is.1048128/), [Radical Fish CrossCode devlog](https://www.radicalfishgames.com/?p=4480), [Gamasutra IGF Hyper Light Drifter](https://www.gamedeveloper.com/design/road-to-the-igf-heart-machine-s-i-hyper-light-drifter-i-), [Hookshot Charge Beam Revive HLD pixel impressionism](https://hookshotchargebeamrevive.com/2018/09/10/hyper-light-drifters-pixel-impressionism/), [SLYNYRD Pixelblog 43 top-down tiles](https://www.slynyrd.com/blog/2023/3/26/pixelblog-43-top-down-tiles-part-2).

Key aesthetic levers:

**Sea of Stars (Sabotage 2023)**: Custom render pipeline with full dynamic lighting (day-night cycle on demand), real-time reflections on water/glass, hand-drawn keyframe animations (no skeletal tweening), high-res pixel art designed for modern displays not CRT. Character party has subtle glow aiding dark scene navigation. Camera is blend top-down-2D + isometric, natural to navigate. Palette uses saturated colorful tones, avoids "HD-2D piss filter" of Square Enix titles.

**Crosscode (Radical Fish 2018)**: Inspired by Chrono Trigger + Terranigma + Seiken Densetsu 3. Key feature is zheight (non-tile exact placement, sprites can be placed at configurable x/y/z not snapped to tile grid, player walks under roofs). Heavy depth in backgrounds, animations on props (not just static flats). 16-bit outlined sprite style.

**Stardew Valley (ConcernedApe 2016)**: Comfy readable tile grid, seasonal variants, warm saturated palette, simple silhouettes high-contrast against grass/stone backgrounds.

**Moonlighter (Digital Sun 2018)**: Multi-building composition per village tile, each building sprite unique (not copy-pasted), tree variety, character sprite style consistent with building style.

**Hyper Light Drifter (Heart Machine 2016)**: Resolution 480x270 constraint. "Pixel impressionism": big sections of flat color + small detail etched on top. Split complementary palette (red + light blue + dark blue drifter coldness). Neon saturated pinks/purples/cyans. Silhouette-first. Key frames at action apex, player's brain fills gaps. GameMaker Studio.

**To The Moon (Freebird 2011)**: RPG Maker foundation elevated via overlapping tall sprites for depth (swing, bridge, trees break the flat tile plane).

**NERIUM design rules table for Helios-v2**:

| Rule | Specification |
|---|---|
| Resolution | Fixed 480x270 internal, scale to window via Phaser `Scale.RESIZE` + `CENTER_BOTH` |
| Palette | 32-48 colors per scene, saturated not muted, per-world palette (Apollo warm desert sand + terracotta + deep blue sky; Cyberpunk neon pink + cyan + purple + black; Caravan dust tan + green foliage; Steampunk brass + maroon + cream) |
| Layer stack | 5 layers: `sky_gradient` (depth -100), `parallax_bg` (depth -50), `ground_tiles` (depth -10), `world_tiles` (depth 0 collision), `above_tiles` (depth 100 roof/canopy overhang). Dynamic entities y-sort via `setDepth(sprite.y)` |
| Prop density | 20-40 props per 10x10 tile area (320x320 px), placed with rotation + minor scale variation + color tint jitter via `setTint()` |
| Foliage | Foreground tree canopy layer at depth 100 (player walks under), mid-layer tree trunks at depth = sprite.y, background silhouette trees at depth -40 with 50% alpha |
| Lighting | Phaser Lights2D system: single ambient light per scene + 2-3 point lights per lantern/torch. Day-night overlay via full-screen gradient rectangle at depth 9000 with `setBlendMode(Phaser.BlendModes.MULTIPLY)`, alpha tweened over 5-min game cycle |
| Ambient FX | Per-scene particle emitter: Apollo = dust motes swirling, Caravan = leaves drifting, Cyberpunk = rain + neon smog, Steampunk = steam puffs + gear sparks. 30-60 particles active, low alpha, slow drift |
| Character animation | 4-direction sheet, 4 frames walk + 4 frames idle-breathing per direction, 8-10 fps walk, 4 fps idle, secondary motion (cape sway on turn) via small 2-frame flourish when direction changes |
| NPC variety | 5-10 populated + 2-3 stub per scene, 4-5 variant sprite pool per world (villager/merchant/child/guard/elder in Apollo; synth-vendor/cyborg-guard/street-rat/salaryman in Cyberpunk) |
| Tile design | Per Slynyrd Pixelblog 43: base repeat texture + edge/corner variants, 10-20% tile variants to break repetition visibility, layered grass tile over dirt tile via alpha |
| Silhouette-first | Every prop must read as unambiguous silhouette at 480x270 zoom; test by viewing at 100% alpha black on white background |

### G.40 Oak-Woods repo deep analysis + top-down JRPG adaptation

Oak-Woods repo (github.com/chongdashu/phaserjs-oakwoods, MIT, 45 stars, 23 forks as of April 2026): Phaser 3 + TypeScript + Vite platformer scene (parallax bg, infinite ground, movement/jump/attack). Controls Arrow + X. Art from brullov/oak-woods itch.io (not in repo). Repo structure:

```
.claude/skills/
  phaser-gamedev/SKILL.md
  playwright-testing/SKILL.md
.codex/skills/  (mirror of .claude/skills/)
docs/
plans/bubbly-roaming-scone.md
prompts/
  01-create-assets-json.txt
  02-plan-implementation.txt
public/assets/oakwoods/
  assets.json  (manifest, committed)
  oak_woods_tileset.png
  background/background_layer_1.png, _2.png, _3.png
  character/char_blue.png
  decorations/fence_1.png, fence_2.png, grass_1.png, grass_2.png, grass_3.png,
              lamp.png, rock_1.png, rock_2.png, rock_3.png, shop.png, shop_anim.png, sign.png
src/
CLAUDE.md, README.md, index.html, package.json, tsconfig.json
```

Languages: TypeScript 62.5%, Python 33.9% (likely scripts), HTML 3.6%.

Phaser-gamedev skill key rules (from LobeHub mirror):

- "Read spritesheets-nineslice.md FIRST. Spritesheet loading is fragile. A few pixels off causes silent corruption."
- "Measure EACH spritesheet independently. Run cycle needs wider frames than idle. Attack needs extra width for weapon swing."
- Check for `spacing: N` in loader config when frames have gaps.
- Verify `imageWidth = (frameWidth * cols) + (spacing * (cols - 1))`.
- Scene architecture: scenes/ BootScene (asset loading) + GameScene (main loop). Lifecycle: `init(data) -> preload() -> create(data) -> update(time, delta)`.
- Use `delta / 1000` for frame-rate independence: `player.x += speed * (delta / 1000)` CORRECT vs `player.x += speed` WRONG.
- References (not fully enumerated but spec calls): spritesheets-nineslice (56x56 character + nine-slice UI), tilemaps (Tiled integration, one-way platform, extruded prevent seam bleed), arcade-physics (dynamic/static body, useTree quadtree default), performance (object pooling, camera culling auto, texture atlas reduce draw calls).

Playwright-testing skill key rules:

- `window.__TEST__` pattern for primitive state exposure (Phaser scene writes `window.__TEST__ = { playerX: ..., scene: 'GameScene' }` every update).
- `Phaser.Math.RandomDataGenerator` seeded RNG for deterministic test runs.
- Flake-reduction readiness signal: wait for `window.__TEST__.ready === true` before asserting.
- playwright-mcp-cheatsheet for test harness patterns.

Config pattern (from skill examples):

```typescript
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 800, height: 600,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: { default: 'arcade', arcade: { gravity: { y: 300 }, debug: false } },
  scene: [BootScene, MenuScene, GameScene]
};
```

**Adaptation table Oak-Woods platformer -> NERIUM top-down JRPG**:

| Oak-Woods pattern | Platformer original use | NERIUM top-down adaptation |
|---|---|---|
| Arcade physics `gravity: { y: 300 }` | Jump arcs, falling | `gravity: { x: 0, y: 0 }` (no falling, 4-way free movement) |
| `setOrigin(0.5, 1)` on character | Ground anchor at sprite feet for jump landing detection | KEEP, critical for y-sort depth (`setDepth(sprite.y)` references foot position) |
| `parallax_background` 3 layers | Horizontal scroll parallax | Drop for interior scenes, keep as distant mountain/skyline layer with `setScrollFactor(0.2, 0)` for exterior scenes |
| One-way platform tiles | Jump-through platforms | Drop entirely |
| Tiled tilemap layer stack | Background + World + Foreground | KEEP, extend to Ground + World (collides) + Above (roof/canopy overhang) |
| Camera `startFollow(player)` + `setBounds(0, 0, map.widthInPixels, map.heightInPixels)` | Horizontal + limited vertical | KEEP, full 2D bounds on tilemap |
| Player 2-direction flipX | Facing left/right | 4-direction sheet (4 rows down/left/right/up x 4-8 cols frames); right row can mirror left row via `flipX` to halve sheet work |
| Walk animation `walk-left`, `walk-right` | Horizontal only | `walk-down`, `walk-left`, `walk-right`, `walk-up` + matching idle per direction |
| Jump animation | Vertical motion | Drop. Replace with interact 1-3 frame animation triggered on E key |
| Attack animation horizontal X key | Left/right sword swing | Optional: directional attack per facing, or drop for ambient NPC-focused scenes |
| Arcade physics collider ground tile | Floor platform | Collide on `worldLayer` where `collides: true` tile property set in Tiled |
| Decoration placement (lamp, rock, fence, grass, sign, shop) via `this.add.sprite()` at fixed x,y | Static prop decoration | KEEP exact pattern, y-sort via `setDepth(sprite.y)` per decoration in `update()` |
| `shop_anim.png` 2-frame idle animation on shop sprite | Ambient store sign flicker | KEEP, apply to Apollo Village Hephaestus forge (Agent Workshop NPC sprite with 4-frame hammer swing anim) |
| `assets.json` manifest | Asset inventory for BootScene loader | KEEP pattern, author NERIUM `assets.json` with Kenney + OpenGameArt CC0 refs (multi-vendor asset gen dormant per RV.6) |
| BootScene pattern | Load all atlases + JSON + audio before GameScene start | KEEP, extend to load 4 scene atlases + dialogue JSON registry + NPC dialogue pool JSON |
| `window.__TEST__` primitive exposure | Playwright test hook | ADOPT for Nemea-RV-v2 E2E hook. Expose `window.__NERIUM__ = { scene, playerX, playerY, chatMode, activeQuests, ... }` in every scene update |
| `Phaser.Math.RandomDataGenerator` seeded | Deterministic platformer RNG | ADOPT for NPC wander destinations in E2E tests (seed via test env var) |

---

### G.41 Phaser 3 top-down multi-scene architecture

Scene lifecycle: `init(data) -> preload() -> create(data) -> update(time, delta)` + events `SHUTDOWN`, `WAKE`, `SLEEP`, `PAUSE`, `RESUME`, `DESTROY`. Data handoff via `this.scene.start('SceneKey', data)` passed to both `init` and `create`. Zustand `useGameStore` is authoritative state source (works outside React via `getState()`/`setState()`), Phaser `registry` fallback for Phaser-local ephemera. [phaser docs scenes](https://docs.phaser.io/phaser/concepts/scenes), [Ourcade cross-scene](https://blog.ourcade.co/posts/2020/phaser3-how-to-communicate-between-scenes/).

Four scenes: `BootScene`, `ApolloVillageScene`, `CaravanRoadScene`, `CyberpunkShanghaiScene`, `SteampunkStubScene`, plus parallel `UIScene` (`this.scene.launch('UIScene')` from BootScene, persists across world transitions).

```typescript
export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'nerium-phaser-root',
  backgroundColor: '#0d0b12',
  pixelArt: true,
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
  dom: { createContainer: true },
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 }, debug: false } },
  scene: [BootScene, ApolloVillageScene, CaravanRoadScene, CyberpunkShanghaiScene, SteampunkStubScene, UIScene]
};
```

Depth strategy: fixed bands (GROUND=-10, WORLD=0, ABOVE=100, UI=10000) + dynamic y-sort on moving sprites (`setDepth(sprite.y)` in update). Ambient NPC group NOT added to inter-NPC collider (pass through each other), only collides with `worldLayer`.

Scene shutdown persists player state to Zustand:

```typescript
this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
  useGameStore.getState().setPlayer({
    x: this.player.x, y: this.player.y,
    facing: this.player.facing, currentScene: 'ApolloVillageScene'
  });
});
```

### G.42 Character animation state machine top-down

Sprite sheet: 4 rows (down/left/right/up) x 8 cols (4 walk frames + 4 idle breathing frames), + interact row at frame 32-34. Right row can mirror left via `setFlipX(true)` if art is symmetric ([Browser Games Hub sprite reuse](https://browsergameshub.com/reuse-phaser3-anims-for-spritesheets/)).

Three meta states: `idle`, `walk`, `interact`. `anims.play(key, true)` idempotent. `anims.chain([...])` queues interact -> idle-{facing}. Velocity vector quantized to 4 cardinals via `atan2`. Frame rate 9 fps walk, 4 fps idle, 10 fps interact.

```typescript
update(_dt: number) {
  if (!this.scene.input.keyboard?.enabled) {
    this.setVelocity(0, 0);
    this.anims.play(`hero-idle-${this.facing}`, true);
    return;
  }
  const v = new Phaser.Math.Vector2(0, 0);
  if (this.wasd.left.isDown)  v.x -= 1;
  if (this.wasd.right.isDown) v.x += 1;
  if (this.wasd.up.isDown)    v.y -= 1;
  if (this.wasd.down.isDown)  v.y += 1;
  if (v.lengthSq() > 0) {
    v.normalize().scale(this.speed);
    this.setVelocity(v.x, v.y);
    this.facing = this.vectorToDir(v.x, v.y);
    this.anims.play(`hero-walk-${this.facing}`, true);
  } else {
    this.setVelocity(0, 0);
    this.anims.play(`hero-idle-${this.facing}`, true);
  }
  if (Phaser.Input.Keyboard.JustDown(this.interactKey)) {
    this.anims.chain([{ key: 'hero-interact' }, { key: `hero-idle-${this.facing}` }]);
    this.scene.events.emit('player:interact', this);
  }
}
```

### G.43 Minecraft chat-style input in Phaser

**Decision**: `Phaser.GameObjects.DOMElement` for chat input. Rationale: preserves IME composition critical for Indonesian + Chinese + Japanese users. Alternative BitmapText canvas-only input cannot compose Pinyin/Kana/tone marks. DOMElement requires `dom: { createContainer: true }` in game config.

Focus arbitration state machine:

```
              T (press, no IME active)
     +-------------------------+
     |                         v
 [movement] <--- Esc ---    [chat]
     |                         ^
     |  NPC interact (E)       | Enter (send)
     v                         |
 [dialogue] -- 1/2/3/4 ------->+
     |                         |
     +------- tree end --------+
```

| Mode | WASD | DOMElement | 1-4 | Esc | T |
|---|---|---|---|---|---|
| movement | active | blurred, pointer-events none | ignored | n/a | opens chat |
| chat | disabled | focused | text | closes | text |
| dialogue | disabled | hidden | choice | closes | ignored |

Implementation: `scene.input.keyboard.enabled = false` when entering chat/dialogue. IME guard: listen to `compositionstart`/`compositionend` on the input element, do NOT process Enter while `dataset.composing === '1'`. Command parser: `/clear`, `/help`, `/save`, `/model <opus-4.7|sonnet-4.6>`, `/debug`. History recall: ArrowUp/Down, Ctrl+L clears, persist to sessionStorage (last 100 entries). Typewriter effect: accumulate Anthropic SSE tokens into buffer, `Phaser.Time.TimerEvent` at configured cps (default 60) drains char-by-char into DOM text node, `scrollTop = scrollHeight` auto-scroll.

`UIScene` DOMElement HTML:
```html
<div id="nerium-chat" class="nerium-chat nerium-chat--hidden">
  <div id="nerium-chat-history" class="nerium-chat__history" role="log"></div>
  <div class="nerium-chat__bar">
    <span class="nerium-chat__prompt">&gt;</span>
    <input id="nerium-chat-input" type="text" maxlength="512"
           autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" lang="auto" />
  </div>
</div>
```

### G.44 Phaser + React HUD input focus arbitration

Route policy: `/play` pure Phaser, zero React HUD. Non-/play routes full React HUD. Modal overlays on /play pause world scene + toggle Phaser keyboard off.

Global focus detector via `focusin`/`focusout` (bubbling DOM events, unlike non-bubbling `focus`/`blur`). Rule: if `document.activeElement` is text-entry (`input[type=text|search|email|url|tel|password|number]`, `textarea`, `[contenteditable]`, or inside `[data-nerium-capture="true"]`), React owns keyboard; else Phaser owns.

```typescript
export function useFocusArbitration(getGame: () => Phaser.Game | null) {
  useEffect(() => {
    const evaluate = () => {
      const game = getGame(); if (!game) return;
      const reactOwns = isTextEntry(document.activeElement);
      game.scene.scenes.forEach((s) => {
        if (!s.input?.keyboard || s.scene.key === 'UIScene') return;
        const chatMode = useGameStore.getState().chatMode;
        s.input.keyboard.enabled = !reactOwns && chatMode === 'movement';
      });
    };
    const onIn = () => evaluate();
    const onOut = () => queueMicrotask(evaluate);
    document.addEventListener('focusin', onIn);
    document.addEventListener('focusout', onOut);
    document.addEventListener('visibilitychange', evaluate);
    window.addEventListener('blur', evaluate);
    evaluate();
    return () => {
      document.removeEventListener('focusin', onIn);
      document.removeEventListener('focusout', onOut);
      document.removeEventListener('visibilitychange', evaluate);
      window.removeEventListener('blur', evaluate);
    };
  }, [getGame]);
}
```

`UIScene` exempt from world-scene gating (its DOM input took focus; otherwise we'd recursively disable the owning scene's chat handlers).

### G.45 Ambient NPC wander implementation

FSM per NPC: `idle (wait 2-8s random) -> pick destination within 128 px -> walk -> arrive (<4 px) -> idle`. Speed 48 px/s. NPCs added to `add.group` but NOT to inter-NPC collider (pass through each other). NPCs DO collide with `worldLayer`.

Variants per scene:
- Apollo Village: villager, merchant, child, guard, elder (8 populated + 3 stub)
- Caravan Road: traveler, caravan-driver, wandering-minstrel (6 + 2)
- Cyberpunk Shanghai: synth-vendor, cyborg-guard, street-rat, salaryman (9 + 3)
- Steampunk Stub: gearwright placeholder (2 + 1)

Interactive flavor NPCs 1-3 per scene open dialogue tree (Nyx `DialogueStore` reuse). Non-interactive NPCs emit random flavor line from pool of 10-15 per variant on E key proximity interact.

Dialogue pool JSON structure per `apollo_village.villager.flavor`:
```json
["Hot one today.",
 "Did you see the new caravan?",
 "Agent forge down by the east gate.",
 "Apollo's blessing on you, traveler.",
 "Elder Brann is looking for help again.",
 "My son wants to be an agentsmith.",
 "Have you tried the baker's honey loaf?",
 "That Hephaestus workshop glow, unsettling and beautiful."]
```

---

## 10. Part H: Landing + Pitch Optic

### H.46 Cerebral Valley Opus 4.6 winner (Feb 2026) deep dive

"Built with Opus 4.6" virtual hackathon, Feb 10-16 2026, 13,000 applicants, 500 accepted. Prize 100k USD Anthropic API credits + demo slot at Claude Code's 1st Birthday Party SF Feb 21. Judges: Boris Cherny, Cat Wu, Thariq Shihpar, Lydia Hallie, Ado Kukic, Jason Bigman.

**Winner**: Mike Brown, California lawyer, shipped permit-processing app in six days for his friend's backyard-cottage business escaping multi-month permit rejections ([Kotrotsos Medium retrospective](https://kotrotsos.medium.com/anthropic-hackathon-results-b13f8466296e)).

Other highlighted projects: Brussels cardiologist patient follow-up tool; Ugandan road technician infrastructure assessment; AgentShield red-team/blue-team/auditor loop for Claude Code config vulnerabilities ([affaan-m/everything-claude-code](https://github.com/affaan-m/everything-claude-code)).

Pattern: **narrow, domain-specific tools for real workflows the builder personally understood**. Not demos, not "agent porn." Judge criteria: creative application with clear purpose, functional prototypes over extensive docs, technical innovation + implementation quality + potential impact.

"Production-grade" meant: (1) works end-to-end for real user day one, (2) clear problem statement non-tech person grasps in 10s, (3) implementation quality visible in 2-3 min demo, (4) load-bearing use of Opus, not cosmetic.

**NERIUM positioning angles for pitch**:
1. Five pillars, one submission, each with endpoint + schema + end-user surface (not demo-ware).
2. Live whitelist gate via Hemera is a feature, not a bug. Judges, Ghaisan, demo account drive live Opus 4.7; everyone else sees recorded golden path. Matches real production API product release patterns.
3. Chronos/Moros budget daemon = grown-up ops. Admin Usage API integration + automatic cap proves NERIUM runs past Monday, not just to win.
4. Opus 4.7 as headline engine, Sonnet 4.6 for cheap hops. Load-bearing use: planning + synthesis + registry cross-ref.
5. Ship one working flow with depth. User types prompt, Opus 4.7 plans, dispatches 3 parallel Sonnet subagents through Registry, streams synthesis back in realtime, leaves Banking ledger entry. That is the 3-min story.

### H.47 OpenAI Workspace Agents (April 22, 2026) differentiation

OpenAI shipped "Workspace agents in ChatGPT" April 22 2026 ([openai.com/index/introducing-workspace-agents-in-chatgpt/](https://openai.com/index/introducing-workspace-agents-in-chatgpt/)). Research preview for Business/Enterprise/Edu/Teachers. Codex-powered cloud runtime, always-on (runs when user offline), shared within workspace, positioned as evolution/replacement of custom GPTs. Connected apps Google Drive, Calendar, Slack, SharePoint, custom MCP servers. Free until May 6 2026, then credit-based.

| Dimension | OpenAI Workspace Agents | NERIUM |
|---|---|---|
| Primary user | Enterprise team in ChatGPT | Independent builder, marketplace publisher, end-user |
| Runtime host | OpenAI cloud only | Kratos + Mode A web + Mode B Tauri native |
| Model | GPT-5.x / Codex | Claude Opus 4.7 + Sonnet 4.6 Anthropic-first |
| Distribution | Intra-workspace | Open marketplace + Registry + Protocol |
| Monetization | None announced | Banking pillar, creator payouts day 1 |
| Asset identity | Opaque inside ChatGPT | Registry first-class identity/discovery |
| Cost governance | Credit post May 6, admin-level | Chronos per-session + per-tenant |
| Offline/local | No | Mode B Tauri same API contract |
| Replaces | Custom GPTs | N/A (no incumbent) |

**Framing**: *OpenAI Workspace Agents is an AI-coworker-in-a-box for one enterprise. NERIUM is the underlying economy every agent ecosystem needs, regardless of model or runtime.* Analogs: Unity Asset Store + Unreal Marketplace, Hugging Face Hub, Stripe + npm + GitHub.

**Pitch verbatim line**: "OpenAI Workspace Agents is the iPhone. NERIUM is the App Store, Apple Pay, and the developer ID, for every agent runtime, starting with Claude Opus 4.7."

---

## 11. Part I: /ultrareview Timing Plan

### Topic 48

**Run #1** post Epimetheus Wave 0 complete + Helios-v2 visual revamp Sessions 2-4 complete (~2/3 NP progress). Scope: branch-vs-main diff only. Expected findings: scene boundary leaks (decoration depth sort misses), state leak across cross-scene transitions (Zustand hydrate misses a new field), quest trigger race on fireTrigger dispatching before store subscription settles. Dispatch fixes inline or create follow-up tickets.

**Run #2** pre-submit Senin dini hari post Kalypso W4 (landing polish done). Scope: full branch vs main. Expected findings: security (CSRF tokens missing on one endpoint, rate limit header off on /v1/auth/*), multi-tenant state bug (forgot `SET LOCAL app.tenant_id` on one worker path), error handling gap (FastAPI raw exception bleeds stacktrace not problem+json on path X).

**Reserve Run #3** SF trip contingency: if Ghaisan on flight Senin dini hari, Kratos executes Run #3 as a post-commit CI hook that posts diff-review to Slack channel, Ghaisan approves from phone.

---

## 12. Cross-cutting decisions surfaced for M2

1. **Single Hetzner CX32 box** runs everything (FastAPI, Postgres, Redis, GlitchTip, ClamAV, Caddy). Promote to CX42/CX52 only if load tests red.
2. **Python-only backend** (FastAPI + FastMCP + asyncpg + Arq + structlog). Single runtime, single dep graph. Node only in Next.js frontend.
3. **Grafana Cloud Free + PostHog Cloud Free + Resend Free + Cloudflare R2 Free** stack keeps recurring cost at EUR 6.80/mo for Hetzner only.
4. **Logto self-host for OAuth** (not Supabase) to avoid vendor lock-in; falls back to self-implement FastAPI if Logto heavy.
5. **Stripe test mode Senin**, live post-Atlas. Midtrans secondary IDR rail. Plutus stubs both.
6. **Hemera is critical-path database** (not Unleash, not PostHog flags). Feature flag UI lives in Eunomia admin panel.
7. **Phaser UIScene parallel with world scenes**, persists across transitions. Zustand `useGameStore` is authoritative source across React + Phaser.
8. **Oak-Woods skill transplants mandatory** to `.claude/skills/phaser-gamedev/` and `.claude/skills/playwright-testing/`. Talos-v2 owns skill port NP scope.
9. **Landing 3-CTA** with Play in Browser primary phosphor-green + --ink dark text (WCAG fix from Marshall), Marketplace ghost secondary NEW, View Source MIT ghost.
10. **Ed25519 identity across Registry + Protocol**, not JWT. JWT only for short-lived bearer.

---

## 13. Recommended skill transplants

Mandatory Oak-Woods ports to `nerium/.claude/skills/`:

1. **phaser-gamedev/SKILL.md**: spritesheets-nineslice measure-before-code protocol, tilemap Tiled integration + extruded tiles + seam bleed prevention, arcade-physics dynamic/static body + useTree quadtree default, performance object pooling + camera culling auto + texture atlas reduce draw calls. **Adaptation note** for Talos-v2: replace "platformer" examples with "top-down JRPG" examples, drop one-way platform reference, gravity (0, 0), setOrigin (0.5, 1) retained for y-sort.

2. **playwright-testing/SKILL.md**: `window.__NERIUM__` primitive state exposure (ported from `window.__TEST__`), `Phaser.Math.RandomDataGenerator` seeded RNG, flake-reduction readiness signal `window.__NERIUM__.ready === true`, playwright-mcp-cheatsheet.

Additional skills Talos-v2 should consider authoring fresh (not in Oak-Woods):

3. **anthropic-streaming/SKILL.md**: Messages API SSE event model, tool_use partial JSON aggregation, thinking signature round-trip, usage accounting.
4. **phaser-react-hybrid/SKILL.md**: focus arbitration, scene-to-Zustand bridge, DOMElement IME guard.
5. **fastapi-mcp/SKILL.md**: FastMCP mount, RFC 9728 metadata, OAuth DCR endpoint, resource indicators.

---

## 14. Open questions for Ghaisan

1. **Hemera flag storage**: custom Postgres (M1 recommendation) vs PostHog flags (already free tier available)? Custom gives full audit control per spec, PostHog adds zero ops. Recommend custom but confirm.

2. **Stripe Atlas filing**: file now to start the 10-14 day clock, or defer post-pitch? Recommend file now even if pitch uses test mode; reduces live-mode runway post-submit.

3. **Midtrans sandbox**: activate now for local IDR pilot, or defer? Midtrans sandbox does not require KYC so activation is low cost. Recommend activate in M2.

4. **License choice per Marketplace subtype**: `CC_BY_NC_4` enforceability for datasets from non-Berne residents unclear. Legal review before M3 publish flow goes live.

5. **Verified certification issuance workflow** (category Premium): who signs, how revoked, how displayed? Not yet defined.

6. **Workspace Agents pitch positioning**: confirm "App Store vs iPhone" framing lands. Alternatives tested: "Hugging Face for agents" (weaker, too technical), "npm for agents" (too developer-centric). Recommend App Store framing with Unity Asset Store as secondary analog.

7. **Budget cap default**: USD 50/day for demo account OK, or higher for judge concurrency? If 5 judges + Ghaisan + 3 demo = 9 live sessions, 50/day may hit mid-demo. Recommend 100/day for submission week.

8. **Steampunk stub scene**: 1 placeholder building + 1 gearwright NPC + 1 flavor dialogue, or fuller? Recommend minimal stub with "coming soon" sign to honor honest-claim discipline.

9. **Skills co-location**: ship `.claude/skills/` + `.codex/skills/` (Oak-Woods pattern both) or only `.claude/`? Recommend both for future Codex CLI dev velocity.

10. **OAuth fallback path**: if Claude.ai `ofid_*` error strikes during pitch, fall back to pre-registered `oauth_anthropic_creds` with Anthropic-emailed creds? Requires emailing Anthropic now with fallback client_id request. Recommend request by Friday.

---

## 15. Handoff notes to M2

### Agent roster shape (20 max hard cap)

Pre-locked: **Khronos** (Remote MCP), **Marshall** (pricing/treasurer + landing CTA contrast bonus). Historical reuse: **Helios-v2** (visual revamp P0 reuse), **Epimetheus** (NEW bridge, Wave 0). Historical reuse from RV: **Talos-v2** (skills transplant NP scope extension), **Nemea-RV-v2** (E2E regression re-verify post Epimetheus).

NP fresh candidates (audit against banned lists; all cleared):

| Agent | Pillar | Scope (M2 finalizes) |
|---|---|---|
| Khronos | Infra | Remote MCP server, OAuth DCR, JWT, rate limit, Claude.ai custom connector |
| Aether | Infra | FastAPI core, Postgres schemas, Redis, lifespan, middleware, problem+json |
| Pheme | Infra | Resend + React Email templates, transactional mail, DKIM/SPF/DMARC setup |
| Chione | Infra | Cloudflare R2 file storage, presigned uploads, ClamAV sidecar |
| Selene | Infra | Structured logging structlog + OTel + Grafana Cloud Free, trace correlation |
| Hemera | Infra | Feature flag service, Postgres schema + override TTL sweep + audit trigger + Redis cache |
| Kratos | Builder | Agent orchestration Claude Agent SDK + custom DAG state machine, max effort tier |
| Nike | Builder | MA session lifecycle API + SSE streaming + cancel + pub/sub fanout |
| Plutus | Banking | Stripe test mode, subscription CRUD, Checkout Session, transaction ledger, Mode B deep link |
| Iapetus | Banking | Stripe Connect Express, Marketplace purchase flow, creator dashboard, payouts |
| Hyperion | Marketplace | FTS + pgvector hybrid search, RRF scoring, embedding via Voyage |
| Phanes | Marketplace | 7-category listing schema, sub-schema jsonb validation, licensing, pricing CRUD |
| Tethys | Registry | Agent identity Ed25519 signing, public key pinning, rotation with grace |
| Crius | Protocol | Multi-vendor adapter AES-256-GCM envelope, pybreaker + Tenacity, fallback chain |
| Astraea | Registry | Trust score Bayesian + Wilson, pg_cron nightly refresh, new-agent boost |
| Moros | Ops | Chronos budget monitor daemon, Admin Usage API poll + local accounting hybrid, Redis cap flag |
| Boreas | Game | Minecraft chat UIScene, DOMElement + IME guard, command parser, typewriter streaming |
| Helios-v2 | Game | Visual revamp to SoS/Crosscode tier, 5-layer depth, y-sort, ambient FX, per-world palettes, max effort |
| Eunomia | Admin | SQLAdmin panel, user management, moderation queue, Hemera flag UI |
| Epimetheus | Bridge | RV regression fix Wave 0 (B1-B5 + Harmonia duplicate store) |

Total: 20 agents (cap hit). Talos-v2 + Nemea-RV-v2 are reuse-execute roles, not new spawns.

### Wave dependency graph

**Wave 0** (parallel with Wave 1 start): Epimetheus bridge.

**Wave 1** (foundation): Khronos + Aether + Hemera + Pheme + Chione + Selene. Aether blocks all others.

**Wave 2** (vertical slices): Kratos + Nike (Builder), Plutus + Iapetus + Marshall (Banking), Hyperion + Phanes (Marketplace), Tethys + Crius + Astraea (Registry + Protocol), Eunomia (Admin).

**Wave 3** (game): Helios-v2 visual + Boreas chat + Moros budget. Helios-v2 is the single largest effort; gets max tier.

**Wave 4** (final): legal + GDPR endpoints (small, folded into Aether or Eunomia scope) + Nemea-RV-v2 E2E re-verify + /ultrareview Run #2 + Kalypso W4 landing polish.

### Effort tier defaults

- **xhigh** default for all 20 agents.
- **max** for heavy architecture: Khronos, Aether, Kratos, Helios-v2.
- 95%+ Opus 4.7 per Ghaisan directive. Sonnet 4.6 for cheap subagent hops inside each agent's internal workflow.

### Mandatory reading expansion per Tier

**Tier A (FULL READ Oak-Woods repo)**: Helios-v2, Epimetheus. Both touch game scenes directly.

**Tier B (TARGETED READ Oak-Woods)**: Marshall (landing CTA is styled like a Phaser menu), Nike (SSE streaming into UIScene chat HUD), Kratos (MA session orchestrates tool calls that feed UIScene), Nemea-RV-v2 (E2E against `window.__NERIUM__` primitive exposure pattern).

**Tier C (skip Oak-Woods)**: all non-game agents (Aether, Pheme, Chione, Selene, Hemera, Plutus, Iapetus, Hyperion, Phanes, Tethys, Crius, Astraea, Moros, Eunomia, Khronos, Boreas, Talos-v2).

Boreas does touch Phaser but via DOMElement + focus arbitration; targeted Phaser docs (not Oak-Woods) are more relevant (`docs.phaser.io/phaser/concepts/gameobjects/dom-element`).

---

## 16. Honest-claim README lines inventory

Lines that MUST appear verbatim in NERIUM README per Kalypso W3 honest-claim discipline:

1. "Stripe is in test mode at submission. Live mode activates post Stripe Atlas verification (typical 10 to 14 days)."
2. "Midtrans is a secondary IDR rail and is sandbox-only at submission."
3. "Tauri builds at submission are unsigned (ad-hoc macOS, unsigned Windows and Linux). Users will see platform security warnings. Paid signing certs planned post-hackathon."
4. "Managed Agent live Builder sessions are whitelisted at submission. Judges, Ghaisan, and one demo account have access. Other visitors see a recorded golden path demo."
5. "Pitch demo caps Anthropic spend at USD 100 per day via Chronos daemon. Cap lifts post-pitch if budget holds."
6. "Four game scenes: Apollo Village Medieval Desert, Caravan Road Transition, Cyberpunk Shanghai District are playable. Steampunk Victorian Workshop is a stub placeholder."
7. "Visual revamp targets Sea of Stars / Crosscode aesthetic tier. New work only. Placeholder checker-tile art is replaced scene by scene; any remaining unreplaced area is flagged in the UI."
8. "React HUD on /play is intentionally disabled. All in-game UI renders via Phaser canvas (Minecraft chat style). Non-/play routes keep React HUD."
9. "Multi-vendor asset gen remains dormant per personal fund constraint. Only CC0 and Opus procedural assets ship."
10. "Legal documents (ToS, Privacy Policy) are Termly-generated drafts at submission. Lawyer review planned pre-GA."
11. "Local MCP is deferred. Remote MCP on nerium.com is the primary Claude.ai custom connector path."
12. "Marketplace category Premium (verified certification, priority listing, custom domain agent) schema is present but issuance workflow is pending."
13. "Agent Registry identity is Ed25519 at submission. No alternative auth paths."
14. "GDPR data export is async via job queue; /v1/me/export returns a job id, ZIP link mailed within minutes."
15. "Analytics and error tracking respect consent. Default is anonymous until user accepts banner."

End of Metis-v3 M1 research document. Handoff to M2 structure design authoritative.