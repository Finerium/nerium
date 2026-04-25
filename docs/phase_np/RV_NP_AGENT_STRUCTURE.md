# NERIUM NP M2 Agent Structure Document

## 0. Document meta

- **Author**: Metis-v3 (M2 NP agent architect, continuation of Metis-v2 RV lineage)
- **Date**: April 24, 2026 (Jumat pagi WIB)
- **Phase**: NP (Near-Production-grade, Jalur A full backend complete)
- **Upstream**: `RV_NP_RESEARCH.md` (M1, same session)
- **Downstream**: M3 optional flow diagram, Hephaestus-v3 prompt authoring batch, then Wave 0 + Wave 1 kickoff
- **Status**: DECISION-READY, awaiting V4 ferry approval
- **Submission**: Senin 27 April 2026, 06:00 WIB target (07:00 WIB hard)
- **Constraint discipline**: No em dash, no emoji, English technical body, LaTeX for math, 95%+ Opus 4.7 preserved, honest-claim per Kalypso W3, no budget or time estimate fabrication per V4 directive

---

## 1. Executive summary

NP roster locks at **20 active agents + 2 reuse-execute roles**, total 22 entities across 5 waves. Collapses V4 pre-sketch 20+Kalypso-rerun sizing by folding legal plus GDPR plus in-app notification (orig Astraea splits) into existing owners, reassigning Astraea from legal to trust score (clean category fit), and keeping Epimetheus as the discrete Wave 0 bridge that resolves RV NEEDS_FIX before any NP wave begins.

All 20 active agents run **Claude Opus 4.7 at effort xhigh** (four hit **effort max**: Khronos, Aether, Kratos, Helios-v2). Sonnet 4.6 reserved for in-agent cheap subagent hops (tool_use orchestration, extraction), not routing at agent level. Haiku not used.

Wave dependency is strict but parallel-aggressive:

- **Wave 0** (Kamis 24 Apr evening start, parallel with Wave 1): Epimetheus alone, resolves 5 RV blockers + Harmonia-RV-A duplicate store finding + caravan build. Exit on Nemea-RV-v2 23/23 green.
- **Wave 1** (Jumat 25 Apr, 6 parallel): Aether (blocks all), Khronos, Hemera, Pheme, Chione, Selene. Foundation infra + contracts round 3 via Pythia-v3 in parallel.
- **Wave 2** (Sabtu 26 Apr, 10 parallel max but practically 6-7 concurrent terminals): Kratos, Nike, Plutus, Iapetus, Marshall, Hyperion, Phanes, Tethys, Crius, Astraea, Moros, Eunomia. Vertical slices across 5 pillars + admin + budget daemon.
- **Wave 3** (Minggu 26 Apr morning-afternoon, 3 parallel): Helios-v2 (single largest effort, 5-7 sessions), Boreas (chat UIScene), plus Talos-v2 reuse-execute for skill transplant sync.
- **Wave 4** (Minggu 26 Apr evening + Senin 27 Apr 00:00-06:00 WIB, sequential final): Nemea-RV-v2 (E2E re-verify NP surface), /ultrareview Run #2, Kalypso W4 (landing polish + demo video + README honest-claim).

Critical commitments inherited from M1 research:

1. Single Hetzner CX32 box runs FastAPI + Postgres 16 + Redis 7 + GlitchTip + ClamAV + Caddy. Cloudflare proxied DNS + R2 file storage + Grafana Cloud Free observability + PostHog Cloud Free analytics + Resend Free email.
2. Python-only backend runtime (FastAPI + FastMCP + asyncpg + Arq + structlog). Node only in Next.js frontend.
3. Stripe test mode Senin pitch + Midtrans sandbox secondary IDR rail + honest-claim README line.
4. Phaser UIScene parallel with world scenes via `scene.launch`, zero React HUD on `/play`, Zustand `useGameStore` authoritative across React + Phaser. `dom: { createContainer: true }` in game config for Minecraft chat DOMElement.
5. Hemera feature flag Postgres-backed with APScheduler TTL sweep, audit trigger, whitelist gate for `builder.live` flag (judges + Ghaisan + demo account overrides).
6. Oak-Woods skill transplant mandatory: `phaser-gamedev` + `playwright-testing` skills copied to `nerium/.claude/skills/` by Talos-v2 Wave 3 reuse-execute, adapted top-down JRPG per M1 Section G.40 matrix.
7. Ed25519 identity across Registry + Protocol. JWT only for short-lived bearer tokens under 5 min.
8. All 15 honest-claim README lines per M1 Section 16 shipped verbatim by Kalypso W4.

---

## 2. Approved decisions inherited from M1 + V4 Gate responses (locked)

**Gate 1**: Epimetheus bridge Wave 0, B1-B4 surgical fix + Harmonia duplicate store consolidation + B5 Option (a) FULL BUILD caravan_vendor NPC + caravan_arrival_zone + caravan_vendor_greet.json. Target 23/23 E2E green post-Epimetheus.

**Gate 2**: Remote MCP primary via Khronos at `https://nerium.com/mcp` (Streamable HTTP, OAuth DCR, RFC 8707 resource indicators, RFC 9728 metadata). Python FastMCP mounted into FastAPI. Local MCP deferred.

**Gate 3**: Feature-flagged whitelist live Builder. Hemera critical-path Postgres-backed. Kratos max effort includes MA session spawner + budget monitor integration + Hemera whitelist gate pre-call.

**Gate 4**: Stripe test mode Senin. Stripe Atlas Global filing recommended start-now. Midtrans secondary IDR sandbox. Plutus stubs both test mode. Indonesia tax route via Delaware C-corp + Stripe US acquirer.

**Gate 5 REVISED**: Keep top-down 3/4 JRPG. Aesthetic upgrade tier Sea of Stars / Crosscode / Stardew / Hyper Light Drifter / Moonlighter / To The Moon. 4 scenes (3 active + 1 stub): ApolloVillage Medieval Desert, CaravanRoad Transition, CyberpunkShanghai District, SteampunkStub Workshop placeholder. Minecraft chat-style full in-game UX on `/play`. React HUD preserved non-/play. Landing 3-CTA with WCAG contrast fix on Play in Browser.

**Additional Ghaisan directives locked**:

- Skills transplant Oak-Woods mandatory (Talos-v2 NP scope).
- Tier A/B/C mandatory reading per M1 Section 15.
- Marketplace 7-category expand (Phanes scope).
- /ultrareview 2-run timing (Run #1 post Epimetheus + Helios-v2 Sessions 2-4, Run #2 pre-submit).
- Marshall bonus CTA contrast fix (WCAG 2.1 AA 4.5:1).
- Effort xhigh default, max for heavy architecture.
- No budget or time estimate fabrication.
- Naming pool audited clean (Section 8 below).

---

## 3. Agent roster overview

### 3.1 Active agents (20)

| # | Agent | Layer | Pillar | Model | Effort | Wave | Primary output |
|---|---|---|---|---|---|---|---|
| 1 | Epimetheus | Bridge | Game engine | Opus 4.7 | xhigh | W0 | B1-B5 fix + caravan build + Harmonia store consolidation |
| 2 | Khronos | Infra | MCP | Opus 4.7 | **max** | W1 | Remote MCP server, OAuth DCR, Streamable HTTP transport |
| 3 | Aether | Infra | Backend core | Opus 4.7 | **max** | W1 | FastAPI core, Postgres multi-tenant + RLS, Redis, lifespan, middleware stack, problem+json errors, OpenAPI 3.1 |
| 4 | Phanes | Marketplace | Listings | Opus 4.7 | xhigh | W2 | 7-category listing schema, sub-schema jsonb validation, licensing, pricing CRUD |
| 5 | Hyperion | Marketplace | Search | Opus 4.7 | xhigh | W2 | FTS + pgvector hybrid search with RRF, Voyage embedding integration, bilingual ID+EN tokenization |
| 6 | Kratos | Builder | Runtime | Opus 4.7 | **max** | W2 | Agent orchestration (Claude Agent SDK + custom DAG), MA session lifecycle, whitelist gate, SSE streaming, parallel tool_use handling |
| 7 | Nike | Builder | Realtime | Opus 4.7 | xhigh | W2 | WebSocket server + SSE fallback, ConnectionManager, Redis pub/sub fanout, heartbeat, reconnect with Last-Event-ID resume |
| 8 | Plutus | Banking | Payments | Opus 4.7 | xhigh | W2 | Stripe test mode, subscription CRUD, Checkout Session, double-entry ledger, Mode B deep link |
| 9 | Iapetus | Marketplace | Commerce | Opus 4.7 | xhigh | W2 | Stripe Connect Express, purchase flow, creator dashboard, payout, review rating |
| 10 | Tethys | Registry | Identity | Opus 4.7 | xhigh | W2 | Ed25519 agent identity, public key pinning, rotation grace window, signature verification |
| 11 | Crius | Protocol | Multi-vendor | Opus 4.7 | xhigh | W2 | Vendor adapter registry, AES-256-GCM envelope encryption, circuit breaker + Tenacity retry, fallback chain |
| 12 | Astraea | Registry | Trust | Opus 4.7 | xhigh | W2 | Trust score Bayesian + Wilson, pg_cron nightly refresh, new-agent boost, per-category formula |
| 13 | Chione | Infra | Storage | Opus 4.7 | xhigh | W1 | Cloudflare R2 file storage, presigned upload, ClamAV virus scan sidecar, CDN image serving |
| 14 | Pheme | Infra | Email | Opus 4.7 | xhigh | W1 | Resend + React Email templates, DKIM/SPF/DMARC config, transactional send, digest scheduling |
| 15 | Hemera | Infra | Feature flags | Opus 4.7 | xhigh | W1 | Postgres-backed flag service, Redis 10s cache, APScheduler TTL sweep, audit trigger, whitelist gate |
| 16 | Selene | Infra | Observability | Opus 4.7 | xhigh | W1 | structlog JSON + OpenTelemetry + Grafana Cloud Free, trace correlation, GlitchTip self-host |
| 17 | Eunomia | Admin | Ops | Opus 4.7 | xhigh | W2 | SQLAdmin panel, user management, moderation queue, Hemera flag UI, maintenance mode, GDPR data export endpoints, Klaro consent banner integration |
| 18 | Moros | Ops | Budget daemon | Opus 4.7 | xhigh | W2 | Chronos budget monitor, Admin Usage API poll + local accounting hybrid, Redis cap flag, auto-disable Hemera flag on overspend, rate limiter coordination |
| 19 | Marshall | UI | Pricing + Treasurer | Opus 4.7 | xhigh | W2 | Pricing section landing, in-game treasurer NPC, cross-pillar tier-state consistency, **CTA contrast fix bonus** |
| 20 | Boreas | Game | Chat UIScene | Opus 4.7 | xhigh | W3 | Minecraft chat-style UIScene, DOMElement + IME guard, command parser, typewriter streaming from SSE, focus arbitration state machine |
| 21 | Helios-v2 | Game | Visual revamp | Opus 4.7 | **max** | W3 | Multi-scene top-down revamp tier Sea of Stars / Crosscode, 5-layer depth, y-sort, ambient FX, per-world palettes, 20-40 props per scene density, character animation state machine 4-direction |

(Note: entries numbered 1-21 to reflect Epimetheus as #1 Wave 0, but roster count is 20 active. Khronos, Marshall, Helios-v2 are 3 in count; Helios-v2 marked #21 purely for Wave 3 highlight.)

### 3.2 Reuse-execute roles (2)

| # | Agent | Type | Origin | Wave | NP scope |
|---|---|---|---|---|---|
| R1 | Talos-v2 | Reuse (RV W1 origin) | P0 artifact + skill transplant | W3 | Oak-Woods skill port to `nerium/.claude/skills/phaser-gamedev/` + `playwright-testing/`, adapt for top-down JRPG per M1 Section G.40 matrix, co-commit `.codex/skills/` mirror |
| R2 | Nemea-RV-v2 | Reuse (RV W4 origin) | Regression QA specialist | W0 + W4 | W0 verify Epimetheus 23/23 E2E green, W4 re-run full E2E on NP surface after Wave 3 ship, plus full a11y sweep post-Kalypso W4 |

### 3.3 Specialist tier (existing, reused)

Pythia-v3, Hephaestus-v3 follow RV pattern:

| Specialist | Role | Wave | Sessions |
|---|---|---|---|
| Pythia-v3 | Contract round 3, NP additions (15-20 new contracts including mcp, oauth_dcr, ledger, marketplace_listing, agent_identity, vendor_adapter, feature_flag, chat_ui, visual_manifest) | W1 (parallel with Aether start) | 1 |
| Hephaestus-v3 | Prompt authoring batch for 20 active agents + 2 reuse-execute | W1 late (after Pythia-v3 contracts ready) | 1 batch |
| Metis-v3 Chat | Architecture oversight, ferry halts, flow diagram | W0-W4 | chat sessions |

### 3.4 Model distribution

- 20 active agents on Opus 4.7 = **100%**
- Sonnet 4.6 = **0 as agent-level routing**, reserved for cheap in-agent subagent hops (Kratos uses Sonnet 4.6 for Anthropic tool_use pipeline sub-dispatches per M1 Section B.15 routing heuristic)
- Haiku = **0**
- Effort tier breakdown: max (4 agents: Khronos, Aether, Kratos, Helios-v2), xhigh (16 agents)

---

## 4. Per-agent templates

### 4.1 Epimetheus (W0 Bridge)

- **Name**: Epimetheus (Titan of afterthought and hindsight, fresh Greek, audited clean vs MedWatch + IDX + P0 + RV banned lists Section 8)
- **Layer**: Game engine bridge
- **Role**: Close RV regression NEEDS_FIX verdict gap before NP begins. 5 blockers (B1-B5) + Harmonia-RV-A duplicate singleton consolidation + caravan build Option (a)
- **Model**: Opus 4.7, effort xhigh
- **Wave**: W0 (Kamis 24 Apr evening start, parallel with Wave 1 infra but isolated dep chain)
- **Sessions**: 1 (halt escalate to V4 if exceeds 97% context)
- **Upstream**:
  - M1 research `RV_NP_RESEARCH.md` Section 2 (Epimetheus resolution plan detail)
  - M2 this document Section 4.1 (scope definition)
  - Pythia-v3 contract updates (if any needed for caravan dialogue schema)
  - RV existing contracts `docs/contracts/quest_schema.contract.md` v0.1.0 + `dialogue_schema.contract.md` + `game_state.contract.md` + `game_event_bus.contract.md`
  - Nemea-RV-A regression report `docs/qa/nemea_rv_regression_report.md`
  - Harmonia-RV-A state integration report `docs/qa/harmonia_rv_state_integration.md`
- **Downstream**:
  - Nemea-RV-v2 (re-run E2E, expect 23/23 green)
  - All NP Wave 1-3 workers (quest runtime stable foundation)
- **Input files (mandatory reading)**:
  - `_meta/NarasiGhaisan.md` (voice anchor)
  - `CLAUDE.md` root
  - `docs/phase_np/RV_NP_RESEARCH.md` (Section 2)
  - `docs/phase_np/RV_NP_AGENT_STRUCTURE.md` (this document Section 4.1)
  - Pythia-v3 contracts as applicable
  - `docs/qa/nemea_rv_regression_report.md` + `docs/qa/harmonia_rv_state_integration.md`
  - **Tier A Oak-Woods FULL READ**: `_Reference/phaserjs-oakwoods/` (src/main.ts + src/scenes/BootScene.ts + src/scenes/GameScene.ts + `.claude/skills/phaser-gamedev/SKILL.md` + all references) because Epimetheus touches scenes directly
  - Existing `src/stores/*.ts`, `src/state/*.ts`, `src/game/scenes/*.ts`, `src/game/objects/NPC.ts`, `src/components/BusBridge.tsx`, `src/lib/gameBridge.ts` (read before modify)
- **Output files**:
  - **B1 fix**: add `useQuestStore.getState().autostartFromCatalog()` call site at `/play` root container mount (either `src/components/game/PhaserCanvas.tsx` useEffect post-bridge wiring, OR new `src/components/QuestBootstrap.tsx` rendered above GameHUD)
  - **B2 fix**: add at same mount site:
    ```ts
    import apolloIntroJson from '@/data/dialogues/apollo_intro.json';
    import { parseDialogue } from '@/data/dialogues/_schema';
    import { registerDialogues } from '@/stores/dialogueStore';
    registerDialogues([parseDialogue(apolloIntroJson, 'apollo_intro')]);
    ```
  - **B3 fix**: rewrite `src/lib/gameBridge.ts` (or `src/state/gameBridge.ts`) `questEffectBus.on(handler)` from single-case to full switch 8 branches per M1 Section 2
  - **B4 fix**: add `game.dialogue.node_entered` case in `src/components/BusBridge.tsx` translating to `questStore.fireTrigger({ type: 'dialogue_node_reached', dialogueId, nodeId })`
  - **Harmonia consolidation**: replace inline `create<QuestStore>()(...)` + `create<DialogueStore>()(...)` blocks in `src/state/stores.ts` with:
    ```ts
    export { useQuestStore } from '../stores/questStore';
    export { useDialogueStore } from '../stores/dialogueStore';
    ```
    mirroring existing audio re-export pattern at line 360. Verify every consumer in code (grep for `useQuestStore`, `useDialogueStore`) resolves to canonical singleton post-change.
  - **B5 caravan build Option (a)**:
    - New sprite + animation in `ApolloVillageScene.create()`: `caravan_vendor` NPC spawn at tilemap object layer coordinates (author new Tiled object `npc_caravan_vendor` at zone edge)
    - New zone in Tiled: `caravan_arrival_zone` as ObjectLayer rectangle, overlap body emits `game.zone.enter` with zoneId payload
    - New dialogue file `src/data/dialogues/caravan_vendor_greet.json` with schema-conformant nodes (greet, farewell, trade_intro, farewell_complete)
    - Register new dialogue in bootstrap mount site (extend B2 fix to include `caravan_vendor_greet`)
  - Commit message `fix(rv-bridge): B1-B5 + Harmonia store consolidation + caravan build, via Epimetheus Wave 0`
  - Post-commit halt + ferry to V4, wait Nemea-RV-v2 verify before NP Wave 2 spawn
- **Halt triggers**:
  - Context 97% threshold (split into Epimetheus-A + Epimetheus-B per M1 Hephaestus pattern)
  - B3 effect switch reveals contract schema gap (escalate to Pythia-v3)
  - Duplicate store consolidation breaks re-export path (rollback, escalate to V4)
  - Caravan dialogue schema fails zod validation on load (escalate to Linus RV origin author for schema alignment)
  - Nemea-RV-v2 verify returns less than 20/23 green (escalate, do NOT unlock NP Wave 2)
- **Strategic decision hard stops** (V4 ferry required):
  - Changing quest_schema or dialogue_schema contract shape
  - Moving caravan scene beyond ApolloVillageScene (defer CaravanRoadScene to Helios-v2 Wave 3)
  - Introducing new store singleton beyond the 5 contract-specified (questStore, dialogueStore, inventoryStore, uiStore, audioStore)
  - Using React HUD for caravan interaction (game-layer only per RV.1)

### 4.2 Khronos (W1 MCP)

- **Name**: Khronos (pre-locked Ghaisan directive, no override; distinct spelling vs Chronos to avoid internal ambiguity vs Chronos Titan of time. Khronos here = MCP server personification)
- **Layer**: Infrastructure
- **Role**: Remote MCP server hosted at `https://nerium.com/mcp`, Claude.ai custom connector integration via OAuth 2.1 Dynamic Client Registration (RFC 7591) + PKCE + resource indicators (RFC 8707) + Protected Resource Metadata (RFC 9728) + Streamable HTTP transport per 2025-06-18 MCP spec. JWT RS256 signing with rotating JWKS. Tool exposure (list_projects, list_agents, search_marketplace, get_agent_identity, etc). Rate limit per token + per IP via Redis token bucket. Cloudflare edge allowlist `160.79.104.0/21` Anthropic egress for `/mcp/*` path.
- **Model**: Opus 4.7, **effort max**
- **Wave**: W1 (parallel with Aether after Aether FastAPI lifespan stable)
- **Sessions**: 2 (session 1 server scaffold + OAuth flow, session 2 tools exposure + rate limit + observability wire-up)
- **Upstream**:
  - Aether FastAPI core + lifespan (MCP mounts as ASGI sub-app at `/mcp`)
  - Phanes Postgres schema (read operations exposed as tools: list_projects, list_agents)
  - Hemera feature flag (for per-user MCP tool gating if judged overcall)
  - Pythia-v3 contracts: new `mcp_protocol.contract.md` + `oauth_dcr.contract.md`
  - M1 research Section A.1 (MCP spec) + A.2 (OAuth DCR)
- **Downstream**:
  - Claude.ai custom connector catalog listing (user adds at `claude.ai/mcp/install?server=https://nerium.com/mcp`)
  - Kratos (MCP tools call into Kratos MA session API for Builder runs initiated via MCP conversation)
- **Input files (mandatory reading)**:
  - `RV_NP_RESEARCH.md` Sections A.1 + A.2
  - `docs/contracts/mcp_protocol.contract.md` (Pythia-v3 authored)
  - `docs/contracts/oauth_dcr.contract.md` (Pythia-v3 authored)
  - MCP spec official docs `spec.modelcontextprotocol.io` at `/specification/draft/basic/authorization`
  - Claude.ai custom connector docs at `claude.com/docs/connectors/building/authentication`
  - FastMCP Python docs `github.com/modelcontextprotocol/python-sdk`
  - Logto docs (if Logto self-host path chosen) OR FastAPI OAuth self-implement reference patterns
- **Output files**:
  - `src/backend/mcp/server.py` (FastMCP mount + tool decorators)
  - `src/backend/mcp/tools/` (list_projects.py, list_agents.py, search_marketplace.py, get_agent_identity.py, create_ma_session.py)
  - `src/backend/auth/oauth_dcr.py` (DCR endpoint + /oauth/register + /oauth/authorize + /oauth/token + /oauth/jwks.json)
  - `src/backend/auth/jwt_signer.py` (RS256 rotating JWKS)
  - `src/backend/well_known/oauth_protected_resource.json` (served via FastAPI route `/.well-known/oauth-protected-resource`)
  - `src/backend/well_known/oauth_authorization_server.json`
  - `src/backend/middleware/rate_limit_mcp.py` (Lua Redis token bucket, per-token + per-IP)
  - Cloudflare WAF rule config snippet (committed as `ops/cloudflare/waf_mcp_allowlist.json` for docs, Ghaisan applies via dashboard)
  - `tests/mcp/test_dcr_flow.py` + `tests/mcp/test_tool_exposure.py`
- **Halt triggers**:
  - FastMCP version incompatibility with FastAPI lifespan (fallback: run FastMCP in separate process, reverse proxy via Caddy)
  - Claude.ai `ofid_*` reliability error during E2E test (fallback: pre-registered client via `oauth_anthropic_creds`, email Anthropic for static client_id)
  - JWT JWKS rotation breaks verifier (audit key rotation window, extend grace)
  - Rate limit tuning false-positive on demo judge traffic (temporarily raise cap via Hemera flag `mcp.rate_limit_override`)
- **Strategic decision hard stops**:
  - Switching from Python FastMCP to Node TypeScript MCP SDK (V4 ferry, major scope change)
  - Adding Local MCP mode (defer post-hackathon per Gate 2 Option a)
  - Exposing tools that mutate billing data (Plutus scope, not Khronos scope)
  - Changing OAuth flow from DCR to pre-registered clients only (locked DCR per MCP spec + Claude.ai integration)

### 4.3 Aether (W1 Backend core)

- **Name**: Aether (primordial air + upper atmosphere Greek, fresh, audited clean)
- **Layer**: Infrastructure backbone
- **Role**: FastAPI production core. Postgres 16 multi-tenant with RLS defense-in-depth. Redis 7 session + cache + rate limit + pub/sub. Arq background job queue. Lifespan-managed pools. Middleware stack (CORS, TrustedHost, request-id correlation, access log, auth). OpenAPI 3.1 + Pydantic v2. URL versioning `/v1/`. Cursor pagination. RFC 7807 problem+json errors. UUID v7 primary keys. Alembic async migrations. Database schema ship including users, sessions, quest_progress, inventory, marketplace_listing, transaction_ledger, trust_score, agent_identity, vendor_adapter, file_storage_manifest.
- **Model**: Opus 4.7, **effort max**
- **Wave**: W1 (blocks ALL other agents, fires first after Pythia-v3 contracts ready)
- **Sessions**: 3 (session 1 core scaffold + Postgres + RLS, session 2 Redis + Arq + middleware, session 3 Alembic migrations + full schema + seed)
- **Upstream**:
  - Pythia-v3 all NP contracts (~15-20 new beyond RV 8)
  - M1 research Sections A.5 + A.6 + A.7 + A.8 + A.10
  - Existing P0 + RV contracts valid (inherit per RV.9 reuse-aggressive)
- **Downstream**:
  - **ALL other active agents** (every agent writes to or reads from Aether's DB + Redis + API routes)
  - Particularly: Khronos mounts at `/mcp`, Plutus mounts at `/v1/billing`, Iapetus at `/v1/marketplace`, Nike at `/ws/realtime`, Tethys at `/v1/registry`, Kratos at `/v1/ma/sessions`
- **Input files (mandatory reading)**:
  - `RV_NP_RESEARCH.md` full Part A + Part E
  - All Pythia-v3 contracts
  - `CLAUDE.md` root
  - FastAPI docs, asyncpg docs, Pydantic v2 docs, Alembic async pattern
- **Output files**:
  - `src/backend/main.py` (app factory + lifespan)
  - `src/backend/config.py` (pydantic-settings)
  - `src/backend/db/pool.py` (asyncpg pool, RLS `SET LOCAL app.tenant_id` helper)
  - `src/backend/db/migrations/` (Alembic)
  - `src/backend/middleware/` (cors.py, trusted_host.py, request_id.py, access_log.py, auth.py)
  - `src/backend/errors/problem_json.py` (RFC 7807)
  - `src/backend/pagination/cursor.py` (base64 JSON opaque cursor)
  - `src/backend/models/` (Pydantic v2 request + response schemas)
  - `src/backend/routers/v1/` (subroutes mount by other agents, Aether provides index)
  - `src/backend/workers/arq_worker.py` (Arq job queue + retry + DLQ)
  - `src/backend/utils/uuid7.py`
  - `src/backend/tests/test_lifespan.py` + `test_rls_isolation.py` + `test_cursor_pagination.py` + `test_problem_json.py`
- **Halt triggers**:
  - Context 97% threshold (split mandatory, Aether is largest agent by surface)
  - Pythia-v3 contract schema gap (block, escalate, re-spawn Pythia-v3)
  - Alembic migration circular dep (rollback + schema redesign)
  - RLS policy breaks test isolation (audit `SET LOCAL` vs `SET` semantics)
- **Strategic decision hard stops**:
  - Adding ORM (SQLAlchemy + asyncpg raw is the locked pattern per M1 Section A.5)
  - Switching to schema-per-tenant multi-tenancy (locked shared schema + RLS per M1 Section A.6)
  - Adding pgbouncer layer (defer post-hackathon; asyncpg pool with `max_size=20` on CX32 is sufficient for submission scale)
  - Moving background queue off Arq (Celery overkill, Dramatiq sync-first, BullMQ adds Node)

### 4.4 Phanes (W2 Marketplace Listings)

- **Name**: Phanes (primordial generative principle Greek, fresh, clean)
- **Role**: 7-category Marketplace listing schema implementation. Category + subtype enum (Core Agent: agent / agent_bundle / agent_team; Content: prompt / skill / quest_template / dialogue_tree / context_pack; Infra: mcp_config / connector / workflow / eval_suite; Assets: voice_profile / visual_theme / sprite_pack / sound_pack; Services: custom_build_service / consulting_hour; Data: dataset / analytics_dashboard; Premium: verified_certification / priority_listing / custom_domain_agent). Pricing model (free / one_time / subscription_monthly / subscription_yearly / usage_based / tiered). License (MIT / CC0 / CC_BY_4 / CC_BY_SA_4 / CC_BY_NC_4 / APACHE_2 / CUSTOM_COMMERCIAL / PROPRIETARY). Category-specific metadata sub-schema in jsonb with zod validation. Creator submission flow, draft to publish workflow, version history.
- **Model**: Opus 4.7, effort xhigh
- **Wave**: W2 (post Aether schema ready)
- **Sessions**: 2
- **Upstream**: Aether, Pythia-v3 `marketplace_listing.contract.md`, Chione (for asset file uploads), Hemera (feature flag for Premium category gating pre-GA), M1 research Section C.21
- **Downstream**: Hyperion (search index consumer), Iapetus (purchase flow reads listings), Astraea (trust score per listing), Eunomia (admin moderation queue)
- **Input files**:
  - `RV_NP_RESEARCH.md` Section C.21
  - `docs/contracts/marketplace_listing.contract.md` (Pythia-v3)
  - Aether database schema
- **Output files**:
  - `src/backend/routers/v1/marketplace/listing.py` (CRUD)
  - `src/backend/models/marketplace/listing.py` (Pydantic)
  - `src/backend/db/migrations/XXX_marketplace_listing.py`
  - `src/backend/validators/category_subschema.py` (per-category jsonb validator)
  - `src/frontend/app/marketplace/publish/page.tsx` (creator submission UI, multi-step wizard, category picker first then subtype then metadata)
  - `src/frontend/components/marketplace/CategoryPicker.tsx` + `SubtypeForm.tsx` + `LicensePicker.tsx` + `PricingPicker.tsx`
  - Seed data `src/backend/db/seed/demo_listings.sql` (3-5 listings per category for pitch demo)
  - `tests/marketplace/test_listing_crud.py` + `test_category_subschema_validator.py`
- **Halt triggers**: category enum ambiguity (escalate to Pythia-v3 for schema amend), creator submission form UX conflict with 7-category complexity (progressive disclosure pattern, one screen per step)
- **Strategic hard stops**: collapsing 7 categories to fewer (locked per Gate directive), opening Premium category issuance pre-GA (verified_certification issuance workflow pending per Open Question 5)

### 4.5 Hyperion (W2 Marketplace Search)

- **Name**: Hyperion (Titan of observation and light, fresh)
- **Role**: Hybrid search FTS + pgvector. Postgres tsvector + GIN + pg_trgm for lexical, pgvector cosine for semantic, Reciprocal Rank Fusion (RRF, k=60) for merge. Bilingual ID+EN tokenization using `'simple'` config. Embedding model Voyage `voyage-3.5` (1024-dim) primary, OpenAI `text-embedding-3-small` (1536-dim) fallback. Search API `/v1/marketplace/search` with category + subtype + license + price_range + sort filters. Autocomplete suggestion endpoint.
- **Model**: Opus 4.7, effort xhigh
- **Wave**: W2 (parallel Phanes after Aether schema)
- **Sessions**: 2
- **Upstream**: Aether, Phanes (listing data source), Crius (vendor adapter for embedding API fallback chain), Pythia-v3 `search_index.contract.md`, M1 Section C.18
- **Downstream**: Iapetus (filters listings for purchase), Kratos (MCP `search_marketplace` tool via Khronos)
- **Input files**: `RV_NP_RESEARCH.md` Section C.18, pgvector docs, Voyage API docs, Anthropic embedding API docs
- **Output files**:
  - `src/backend/search/fts_indexer.py`
  - `src/backend/search/vector_indexer.py` (Voyage embedding on listing publish/update)
  - `src/backend/search/hybrid_rrf.py`
  - `src/backend/routers/v1/marketplace/search.py`
  - `src/backend/db/migrations/XXX_search_indexes.py` (GIN + pgvector ivfflat)
  - `src/frontend/app/marketplace/page.tsx` (search UI)
  - `src/frontend/components/marketplace/SearchBar.tsx` + `FilterSidebar.tsx` + `ListingCard.tsx` + `ResultGrid.tsx`
  - `tests/search/test_rrf_merge.py` + `test_bilingual_tokenization.py`
- **Halt triggers**: pgvector extension unavailable on Postgres deployment (fallback: commit schema but disable vector branch until extension installed; FTS-only temporarily), Voyage API rate limit (fallback to OpenAI per Crius circuit breaker)
- **Strategic hard stops**: moving search off Postgres to Algolia/Typesense (rejected per M1 Section C.18 zero-infra principle)

### 4.6 Kratos (W2 Builder Runtime)

- **Name**: Kratos (personification of strength and power Greek, fresh)
- **Role**: Agent orchestration runtime. Inner loop via Claude Agent SDK (`claude_agent_sdk.query` / `ClaudeSDKClient`, Opus 4.7 requires v0.2.111+). Outer DAG via custom Python state machine (asyncio + Postgres `ma_step` table). MA session lifecycle (queued / running / streaming / completed / cancelled / failed / budget_capped). Hemera whitelist gate pre-call. Chronos budget integration (Moros owns daemon, Kratos reads cap flag). SSE streaming to client via Nike infra. Parallel tool_use handling. Model routing heuristic per M1 Section B.15.
- **Model**: Opus 4.7, **effort max**
- **Wave**: W2 (after Aether + Nike + Hemera + Moros)
- **Sessions**: 3 (session 1 state machine + MA session CRUD, session 2 Claude Agent SDK inner loop + tool_use handling, session 3 SSE streaming + resume + cancel)
- **Upstream**: Aether, Nike (WebSocket + SSE infra), Hemera (builder.live flag gate), Moros (chronos:ma_capped Redis flag), Tethys (agent identity verify tool_use calls), Crius (vendor adapter for model fallback), Pythia-v3 `ma_session.contract.md`, M1 Sections B.11 + B.12 + B.13 + B.14 + B.15
- **Downstream**: Nike (streams events), frontend Builder UI (Boreas chat receives streams), Plutus (records token cost to ledger via Arq worker post-session), Selene (OpenTelemetry traces per session)
- **Input files**: `RV_NP_RESEARCH.md` full Part B, Claude Agent SDK docs, Anthropic Messages API streaming docs
- **Output files**:
  - `src/backend/ma/state_machine.py` (status transitions, DAG orchestrator)
  - `src/backend/ma/claude_sdk_runner.py` (inner agent loop, tool_use aggregator)
  - `src/backend/ma/session.py` (CRUD + lifecycle)
  - `src/backend/ma/streaming.py` (SSE proxy, re-wrap Anthropic events to `nerium.*` wire format)
  - `src/backend/ma/whitelist_gate.py` (Hemera flag check pre-call)
  - `src/backend/ma/budget_guard.py` (Moros flag check + post-call cost write)
  - `src/backend/ma/tool_registry.py` (tool_use schema validation)
  - `src/backend/routers/v1/ma/sessions.py` (API endpoints)
  - `src/backend/db/migrations/XXX_ma_session.py`
  - `tests/ma/test_state_machine.py` + `test_streaming_resume.py` + `test_whitelist_gate.py` + `test_budget_cap_short_circuit.py`
- **Halt triggers**: Claude Agent SDK version mismatch (Opus 4.7 needs v0.2.111+, halt if local env has older), tool_use parallel aggregation race (add lock per session), SSE connection drop mid-stream (resume via Last-Event-ID tested), budget cap triggered mid-session (clean cancel, store final state, return budget_capped status to client)
- **Strategic hard stops**: running live Builder without Hemera whitelist gate (locked Gate 3), model routing to non-Anthropic default (locked CLAUDE.md anti-pattern 7, exception only for Crius fallback user-visible slot), bypassing Chronos budget daemon (locked Moros integration)

### 4.7 Nike (W2 Realtime)

- **Name**: Nike (goddess of victory Greek, fresh, clean)
- **Role**: WebSocket server on `/ws/realtime` + SSE endpoint per route. FastAPI native WebSocket + ConnectionManager + Redis pub/sub fanout. Auth via 60s JWT ticket as query param. Heartbeat 25s. Reconnection exponential backoff. State snapshot send on reconnect via last-seen event id for Redis Stream replay. Broadcast rooms per user + per session.
- **Model**: Opus 4.7, effort xhigh
- **Wave**: W2 (after Aether + Redis)
- **Sessions**: 2
- **Upstream**: Aether, Kratos (publishes session events), M1 Section A.9 + B.13, Pythia-v3 `realtime_bus.contract.md`
- **Downstream**: Boreas (chat UIScene receives SSE + WebSocket messages), frontend Builder streaming UI, push notification Moros/Boreas
- **Input files**: `RV_NP_RESEARCH.md` Section A.9 + B.13
- **Output files**:
  - `src/backend/realtime/ws_server.py` (FastAPI WebSocket endpoint)
  - `src/backend/realtime/sse_server.py` (per-resource SSE endpoint)
  - `src/backend/realtime/connection_manager.py` (per-user connection registry, Redis pub/sub)
  - `src/backend/realtime/ticket.py` (60s JWT ticket issue + verify)
  - `src/backend/realtime/resume.py` (Last-Event-ID + Redis Stream replay)
  - `src/backend/realtime/heartbeat.py`
  - `tests/realtime/test_reconnect_resume.py`
- **Halt triggers**: ConnectionManager memory leak on mass disconnect, Redis Stream trim policy unclear (set `XADD MAXLEN ~ 10000` per stream), JWT ticket expiry race on slow mobile network (extend ticket window to 120s if justified)

### 4.8 Plutus (W2 Banking Payments)

- **Name**: Plutus (god of wealth Greek, fresh, clean)
- **Role**: Stripe test mode integration. Subscription tier CRUD (Free, Solo, Team, Enterprise). Stripe Checkout Session hosted flow for Mode A web. Transaction ledger double-entry internal (own record, not Stripe-derived only). Stripe webhook handler (charge.succeeded, charge.refunded, subscription.created/updated/deleted, payment_failed, invoice.paid). Proration logic via Stripe native. Mode B Tauri deep link return via `nerium://auth/callback` after Stripe Checkout redirect. Invoice PDF generation (WeasyPrint + Jinja2). SCA compliance automatic via Stripe Elements.
- **Model**: Opus 4.7, effort xhigh
- **Wave**: W2 (post Aether + Pheme ready for email receipts)
- **Sessions**: 2
- **Upstream**: Aether, Pheme (invoice email send), Pythia-v3 `stripe_integration.contract.md` + `ledger_double_entry.contract.md`, M1 Sections C.16 + C.19
- **Downstream**: Iapetus (Stripe Connect for creator payouts shares base Stripe client), Eunomia (admin refund UI), Moros (budget monitor reconciliation with Stripe revenue stream)
- **Input files**: `RV_NP_RESEARCH.md` Sections C.16 + C.19, Stripe Python SDK docs, Stripe test mode docs
- **Output files**:
  - `src/backend/billing/stripe_client.py` (test mode API key wrapper)
  - `src/backend/billing/subscription.py` (CRUD + tier logic)
  - `src/backend/billing/checkout.py` (Stripe Checkout Session creation)
  - `src/backend/billing/webhook.py` (idempotent handler, event id as ledger idempotency_key)
  - `src/backend/billing/ledger.py` (double-entry schema operations)
  - `src/backend/billing/invoice_pdf.py` (WeasyPrint + Jinja2 templates)
  - `src/backend/billing/tauri_deep_link.py` (return URL bounce)
  - `src/backend/routers/v1/billing/` (subscription, checkout, invoice routes)
  - `src/backend/db/migrations/XXX_billing_ledger.py`
  - Seed `src/backend/db/seed/demo_customers.sql` (2-3 test Stripe customers + subscriptions for pitch)
  - `tests/billing/test_webhook_idempotency.py` + `test_ledger_double_entry.py`
- **Halt triggers**: Stripe test mode API 500 (Stripe-side, retry with backoff), SCA challenge flow in test mode (use Stripe test cards explicitly triggering 3DS), deep link return URL not working in Tauri embedded WebView (fallback system browser per M1 Section A.3)
- **Strategic hard stops**: enabling live mode before Stripe Atlas verification (locked Gate 4), skipping internal ledger (locked audit requirement per Section C.19), using Stripe metadata as source of truth (locked NERIUM owns ledger)

### 4.9 Iapetus (W2 Marketplace Commerce)

- **Name**: Iapetus (Titan, father of Prometheus Greek, fresh, clean)
- **Role**: Stripe Connect Express creator onboarding. Marketplace purchase flow (add to cart optional, checkout direct). Creator dashboard (sales analytics, earnings tracking, payout history). Review + rating system. Revenue split (platform take rate default 20%, configurable per-category). Payout schedule (monthly default, weekly for Verified sellers).
- **Model**: Opus 4.7, effort xhigh
- **Wave**: W2 (parallel Plutus, shared Stripe client)
- **Sessions**: 2
- **Upstream**: Aether, Plutus (Stripe client + ledger), Phanes (listing data), Hyperion (search filters into purchase flow), Pythia-v3 `stripe_connect.contract.md` + `marketplace_purchase.contract.md` + `creator_dashboard.contract.md`, M1 Section C.16 + C.17
- **Downstream**: Astraea (review feeds trust score), Eunomia (admin override refunds), Kratos (purchased listings available to buyer's MA sessions)
- **Input files**: `RV_NP_RESEARCH.md` Sections C.16 + C.17, Stripe Connect Express docs
- **Output files**:
  - `src/backend/commerce/connect.py` (Express account onboarding)
  - `src/backend/commerce/purchase.py` (checkout flow)
  - `src/backend/commerce/payout.py` (monthly schedule cron via Arq)
  - `src/backend/commerce/review.py` (rating CRUD with Wilson score integration)
  - `src/backend/routers/v1/commerce/` (purchase, dashboard, review routes)
  - `src/frontend/app/dashboard/page.tsx` (creator dashboard, Recharts graphs)
  - `src/frontend/components/dashboard/EarningsChart.tsx` + `SalesTable.tsx` + `PayoutSchedule.tsx`
  - `src/frontend/app/marketplace/[listingId]/page.tsx` (detail + buy button)
  - Seed `src/backend/db/seed/demo_purchases.sql` (2-3 fake purchases for pitch demo ledger)
  - `tests/commerce/test_purchase_flow.py` + `test_revenue_split.py`
- **Halt triggers**: Stripe Connect Express onboarding multi-step form too complex to wire in session 1 (split: session 1 stub onboarding + session 2 production), revenue split math rounding errors (use BIGINT smallest unit, never FLOAT per ledger principle)
- **Strategic hard stops**: activating Connect live mode pre-Atlas (Gate 4 locked), running Marketplace purchase for non-Verified listings in Senin pitch (defer Premium category per Open Question 5)

### 4.10 Tethys (W2 Registry Identity)

- **Name**: Tethys (Titan of fresh water Greek, fresh, clean)
- **Role**: Ed25519 agent identity. Public key pinning at registration. Signature verification on every agent execution. Key rotation 14-day grace window (retiring status accepts both old + new, cron flips to revoked at retires_at). PyNaCl library. Identity CRUD endpoints. JWT EdDSA only for short-lived bearer under 5 min (NOT primary identity path, primary is raw signed artifacts).
- **Model**: Opus 4.7, effort xhigh
- **Wave**: W2 (post Aether)
- **Sessions**: 2
- **Upstream**: Aether, Pythia-v3 `agent_identity.contract.md` + `key_rotation.contract.md`, M1 Section D.23
- **Downstream**: Astraea (identity verified flag feeds trust score), Crius (vendor identity separate schema but shares Ed25519 pattern), Kratos (verify agent identity before tool_use execution in MA session), Khronos (MCP expose `get_agent_identity` tool)
- **Input files**: `RV_NP_RESEARCH.md` Section D.23, PyNaCl docs, Ed25519 RFC 8032
- **Output files**:
  - `src/backend/registry/identity.py` (Ed25519 sign + verify)
  - `src/backend/registry/rotation.py` (14-day grace, retires_at cron)
  - `src/backend/registry/jwt_edd.py` (short-lived bearer only)
  - `src/backend/routers/v1/registry/identity.py`
  - `src/backend/db/migrations/XXX_agent_identity.py` (schema: id uuid, owner_user_id, public_key bytea 32, created_at, status enum active/retiring/revoked, retires_at)
  - `tests/registry/test_ed25519_sign_verify.py` + `test_rotation_grace.py`
- **Halt triggers**: PyNaCl libsodium library linking issue on Docker Alpine (switch to Debian-based base), signature verification side-channel leak concern (use constant-time comparison)

### 4.11 Crius (W2 Protocol Multi-vendor)

- **Name**: Crius (Titan of constellations Greek, fresh, clean)
- **Role**: Multi-vendor adapter registry. Per-record AES-256-GCM DEK envelope encryption, KEK in Hetzner systemd env file (chmod 600). Circuit breaker via `pybreaker` (fail_max=5, reset_timeout=30, success_threshold=2) + Tenacity retry with exponential jitter. Ordered fallback chain (OpenAI > Anthropic > local vLLM) with per-vendor Hemera flag to disable fallback if user-visible divergence. Vendor-agnostic IR schema from P0 Proteus preserved. Request router per request-type (chat, embedding, image_gen, tts).
- **Model**: Opus 4.7, effort xhigh
- **Wave**: W2
- **Sessions**: 2
- **Upstream**: Aether, Hemera (per-vendor kill switch), Hyperion (consumes embedding API via Crius), Pythia-v3 `vendor_adapter.contract.md` + `ir_schema.contract.md`, M1 Section D.24
- **Downstream**: Kratos (model routing fallback), Hyperion (embedding API fallback), any feature needing multi-vendor
- **Input files**: `RV_NP_RESEARCH.md` Section D.24, existing P0 Proteus IR schema
- **Output files**:
  - `src/backend/protocol/adapters/` (openai.py, anthropic.py, vllm.py)
  - `src/backend/protocol/router.py` (request type routing)
  - `src/backend/protocol/circuit_breaker.py` (pybreaker wrapper)
  - `src/backend/protocol/retry.py` (Tenacity with jitter)
  - `src/backend/protocol/crypto.py` (AES-256-GCM envelope)
  - `src/backend/protocol/key_vault.py` (KEK from env + DEK per record)
  - `src/backend/routers/v1/protocol/vendor.py` (CRUD adapter configs)
  - `src/backend/db/migrations/XXX_vendor_adapter.py`
  - `tests/protocol/test_circuit_breaker.py` + `test_envelope_encryption.py` + `test_fallback_chain.py`
- **Halt triggers**: circuit breaker state leak across workers (use Redis-backed state instead of in-memory), KEK rotation breaks existing DEKs (implement dual-KEK grace window same as Tethys identity rotation pattern)

### 4.12 Astraea (W2 Registry Trust)

- **Name**: Astraea (goddess of justice and stars Greek, fresh, clean)
- **Role**: Trust score calculation. Bayesian smoothed mean for marketplace sort (m=15 prior weight, C=3.5 global average baseline). Wilson lower bound for binary helpful/spam signals. Per-category formula variations (agent = execution_count + success_rate + review_weighted; sprite_pack = download_count + review; skill = usage_count + review). New-agent boost factor (score + 0.2 * exp(-age_days/3) first 7 days). Pg_cron nightly refresh of precomputed `agent_trust_score` column. Verified badge grant logic (auto via threshold or manual via Eunomia admin).
- **Model**: Opus 4.7, effort xhigh
- **Wave**: W2 (parallel Tethys after Aether)
- **Sessions**: 2
- **Upstream**: Aether, Tethys (identity verified flag boost), Iapetus (review data), Phanes (listing metadata for per-category), Pythia-v3 `trust_score.contract.md`, M1 Section D.22
- **Downstream**: Hyperion (trust score as search boost), Eunomia (admin badge grant override), Marketplace UI (sort by trust)
- **Input files**: `RV_NP_RESEARCH.md` Section D.22
- **Output files**:
  - `src/backend/trust/bayesian.py` (m + C + formula)
  - `src/backend/trust/wilson.py` (lower bound interval)
  - `src/backend/trust/per_category.py` (dispatch by category)
  - `src/backend/trust/new_agent_boost.py`
  - `src/backend/trust/pg_cron_refresh.sql` (committed migration)
  - `src/backend/routers/v1/registry/trust.py` (read score endpoint)
  - `tests/trust/test_bayesian_smoothing.py` + `test_wilson_interval.py` + `test_new_agent_decay.py`
- **Halt triggers**: pg_cron extension unavailable (fallback: APScheduler cron in-app), Wilson math precision edge case (use mpmath or numpy.float64, not Python native float)

### 4.13 Chione (W1 Storage)

- **Name**: Chione (goddess of snow Greek, fresh, clean)
- **Role**: File storage via Cloudflare R2 (S3-compatible API). Presigned POST upload cap 25 MB. ClamAV sidecar scan on upload complete. Images served direct R2 via Cloudflare CDN (free egress, no transform in MVP). Profile avatar, custom prompt library, Built app output archive (Builder output files post-session), sprite pack ZIP download for Marketplace Assets.
- **Model**: Opus 4.7, effort xhigh
- **Wave**: W1 (parallel Aether after API core stable)
- **Sessions**: 1
- **Upstream**: Aether, Pythia-v3 `file_storage.contract.md`, M1 Section E.28
- **Downstream**: Phanes (asset file uploads for sprite_pack / sound_pack / visual_theme listings), Iapetus (creator uploads for custom_build_service), Eunomia (admin access archived files for moderation)
- **Input files**: `RV_NP_RESEARCH.md` Section E.28, Cloudflare R2 API docs, ClamAV daemon docs
- **Output files**:
  - `src/backend/storage/r2_client.py` (boto3 + Cloudflare R2 endpoint)
  - `src/backend/storage/presigned.py` (POST signed URL generator)
  - `src/backend/storage/clamav_scan.py` (sidecar invocation + quarantine on virus found)
  - `src/backend/routers/v1/storage/upload.py` + `download.py`
  - `src/backend/db/migrations/XXX_file_storage_manifest.py`
  - ClamAV Docker Compose addition to `docker-compose.yml`
  - `tests/storage/test_presigned_upload.py` + `test_virus_scan_quarantine.py`
- **Halt triggers**: ClamAV Docker image too heavy for CX32 (defer virus scan to Arq async job, flag file as "scanning" until complete), R2 egress metrics spike unexpected (audit CDN cache rules)

### 4.14 Pheme (W1 Email)

- **Name**: Pheme (goddess of fame and rumor Greek, fresh, clean)
- **Role**: Resend + React Email transactional. DKIM + SPF + DMARC on `mail.nerium.com` subdomain. Templates (welcome, quest_completion, marketplace_sale, billing_reminder, password_reset, invoice_receipt). Warm-up schedule new domain (under 50/day week 1). Unsubscribe compliance.
- **Model**: Opus 4.7, effort xhigh
- **Wave**: W1
- **Sessions**: 1
- **Upstream**: Aether, Pythia-v3 `email_transactional.contract.md`, M1 Section C.20
- **Downstream**: Plutus (invoice email), Iapetus (marketplace sale notifications), Tethys (identity key rotation alerts), Eunomia (admin maintenance mode notice)
- **Input files**: `RV_NP_RESEARCH.md` Section C.20
- **Output files**:
  - `src/backend/email/resend_client.py`
  - `src/backend/email/templates/` (React Email components: welcome.tsx, quest_completion.tsx, marketplace_sale.tsx, billing_reminder.tsx, password_reset.tsx, invoice_receipt.tsx)
  - `src/backend/email/send.py` (queue via Arq)
  - `src/backend/email/warmup.py` (daily cap scheduler)
  - `src/backend/email/unsubscribe.py`
  - DKIM + SPF + DMARC DNS records documented at `ops/dns/email_records.md` (Ghaisan applies via Cloudflare DNS)
- **Halt triggers**: Resend free tier 3k/mo cap approaching mid-pitch (upgrade to paid tier or pause non-critical emails), DMARC quarantine triggers on new domain (extend warmup period)

### 4.15 Hemera (W1 Feature Flags)

- **Name**: Hemera (goddess of day Greek, fresh, clean)
- **Role**: Postgres-backed feature flag service (custom per spec). Schema: `hemera_flag` (flag_name PK, default_value jsonb), `hemera_override` (user_id + flag_name + value + expires_at), `hemera_audit` (actor_id + flag_name + action + old_value + new_value + at). Redis 10s cache. APScheduler TTL sweep nightly. Audit trigger on override insert/update/delete writes to audit with `current_setting('hemera.actor_id')`. Whitelist gate flag `builder.live` default false; judges + Ghaisan + demo user get permanent overrides.
- **Model**: Opus 4.7, effort xhigh
- **Wave**: W1
- **Sessions**: 1
- **Upstream**: Aether, Pythia-v3 `feature_flag.contract.md`, M1 Section E.34
- **Downstream**: Kratos (builder.live gate), Moros (mcp.rate_limit_override), Crius (vendor_xyz.disabled), Eunomia (flag UI), all NP agents (any feature gated)
- **Input files**: `RV_NP_RESEARCH.md` Section E.34
- **Output files**:
  - `src/backend/flags/service.py` (get_flag with Redis cache + fallback default)
  - `src/backend/flags/override.py` (set, delete, TTL sweep)
  - `src/backend/flags/audit.py` (insert trigger SQL)
  - `src/backend/db/migrations/XXX_hemera_flag.py` + `XXX_hemera_override.py` + `XXX_hemera_audit.py` + `XXX_hemera_audit_trigger.sql`
  - `src/backend/routers/v1/admin/flags.py` (admin-only CRUD)
  - Seed default flags `src/backend/db/seed/default_flags.sql` (builder.live=false, mcp.rate_limit_cap=100, ma.daily_budget_usd=100, etc.)
  - `tests/flags/test_cache_invalidation.py` + `test_ttl_sweep.py` + `test_audit_trigger.py`
- **Halt triggers**: Redis cache invalidation lag on multi-worker deploy (add pub/sub invalidation or accept 10s staleness), audit trigger infinite recursion (guard with `pg_trigger_depth()` check)

### 4.16 Selene (W1 Observability)

- **Name**: Selene (goddess of moon Greek, fresh, clean)
- **Role**: Structured logging + tracing + metrics. `structlog` JSON + `opentelemetry-instrumentation-logging` + `asgi-correlation-id` for X-Request-ID. Ship to Grafana Cloud Free via Alloy agent or direct Loki push (50 GB logs / 50 GB traces / 10k series metrics / 14-day retention / 3 users free). GlitchTip self-host for error tracking (Sentry-compatible wire protocol). OpenTelemetry SDK across FastAPI + httpx + SQLAlchemy + Redis + Arq.
- **Model**: Opus 4.7, effort xhigh
- **Wave**: W1
- **Sessions**: 1
- **Upstream**: Aether, Pythia-v3 `observability.contract.md`, M1 Sections E.29 + E.31 + E.32
- **Downstream**: all agents (shared logger), Eunomia (admin dashboard link to Grafana), Moros (budget monitor reads OTel metrics for spend tracking)
- **Input files**: `RV_NP_RESEARCH.md` Sections E.29 + E.31 + E.32, structlog docs, OpenTelemetry Python SDK docs, GlitchTip deployment docs
- **Output files**:
  - `src/backend/obs/logger.py` (structlog config + JSON formatter)
  - `src/backend/obs/tracing.py` (OpenTelemetry provider + exporters)
  - `src/backend/obs/metrics.py` (Prometheus metrics endpoint if needed)
  - `src/backend/middleware/correlation_id.py`
  - GlitchTip Docker Compose service addition
  - Grafana dashboard JSON `ops/grafana/fastapi_dashboard.json` (reference blueswen/fastapi-observability)
  - Alloy agent config `ops/alloy/config.river`
  - `tests/obs/test_trace_correlation.py`
- **Halt triggers**: Grafana Cloud free tier quota exceeded pre-launch (reduce log volume via sampling + debug log level only in dev), GlitchTip self-host RAM pressure on CX32 (drop GlitchTip, use Sentry Cloud Developer free 5k errors/mo)

### 4.17 Eunomia (W2 Admin Ops)

- **Name**: Eunomia (goddess of order Greek, fresh, clean)
- **Role**: SQLAdmin panel at `/admin`. User management (ban, unban, impersonate read-only). Moderation queue (listing approvals, review reports, abuse flags). Hemera flag UI (CRUD + override + audit view). Maintenance mode toggle. GDPR data export endpoints (`POST /v1/me/export` async Arq job + signed R2 URL email via Pheme, `DELETE /v1/me` soft-delete 30-day + purge cron). Klaro consent banner integration (self-hosted BSD-3, 57 KB, script type=text/plain unlock on consent). ToS + Privacy + Credits pages served static.
- **Model**: Opus 4.7, effort xhigh
- **Wave**: W2
- **Sessions**: 2 (session 1 admin panel + moderation queue, session 2 GDPR endpoints + legal pages + consent banner)
- **Upstream**: Aether, Hemera (flag UI backend), Chione (R2 for export ZIP), Pheme (export link email), all other agents (their data surfaces in admin CRUD), Pythia-v3 `admin_panel.contract.md` + `gdpr_compliance.contract.md`, M1 Sections E.33 + F.35 + F.36 + F.37
- **Downstream**: Ghaisan (admin user self), Marshall (pricing page references legal), Kalypso W4 (landing links to ToS/Privacy)
- **Input files**: `RV_NP_RESEARCH.md` Sections E.33 + F.35 + F.36 + F.37, SQLAdmin docs, Klaro docs, Termly template output
- **Output files**:
  - `src/backend/admin/sqladmin_setup.py` (SQLAdmin mount at `/admin`, auth via session cookie + is_superuser)
  - `src/backend/admin/views/` (UserView, ListingView, TransactionView, FlagView, ModerationQueueView)
  - `src/backend/gdpr/export.py` (async Arq job, ZIP all user data, upload R2, signed URL)
  - `src/backend/gdpr/delete.py` (30-day soft delete, purge cron)
  - `src/backend/gdpr/consent.py` (consent table history)
  - `src/frontend/app/legal/terms/page.tsx` (Termly draft, Ghaisan edit)
  - `src/frontend/app/legal/privacy/page.tsx`
  - `src/frontend/app/legal/credits/page.tsx`
  - `src/frontend/app/maintenance/page.tsx` (maintenance mode landing)
  - `src/frontend/components/ConsentBanner.tsx` (Klaro wrapper)
  - `tests/admin/test_moderation_queue.py` + `tests/gdpr/test_data_export.py` + `test_soft_delete_cascade.py`
- **Halt triggers**: SQLAdmin auth integration collision with main session cookie (explicit session backend), Klaro script replacement bug (test with CSP nonce), legal text lawyer-review delay (ship Termly draft with prominent "draft, pending review" banner, remove pre-GA)

### 4.18 Moros (W2 Budget Daemon)

- **Name**: Moros (daemon of doom Greek, fresh, clean; fitting for budget-kill daemon)
- **Role**: Chronos budget monitor (internal name Chronos, agent name Moros for myth coherence). Admin Usage API poll every 5 min (`/v1/organizations/usage_report/messages` from Anthropic). Hybrid local accounting (record after each Kratos stream close via `message_delta.usage`). Redis key `chronos:ma_capped=1` flips on overspend threshold (USD 100/day default per M1 Open Question 7). Both Kratos `create_session` and stream loop short-circuit on cap flag. Auto-disable Hemera `builder.live` flag on cap reached, auto-re-enable next day 00:00 UTC via Arq cron. Rate limiter coordination (Lua token bucket co-owner).
- **Model**: Opus 4.7, effort xhigh
- **Wave**: W2 (after Aether + Hemera + Kratos-partial; can fire mid-Kratos to wire cap flag)
- **Sessions**: 1
- **Upstream**: Aether, Hemera (flag auto-disable), Kratos (reads cap flag pre-call), Pythia-v3 `budget_monitor.contract.md`, M1 Section B.12 + D.25
- **Downstream**: Kratos (cap check), Eunomia (admin dashboard spend metrics), Selene (OTel metric emission)
- **Input files**: `RV_NP_RESEARCH.md` Section B.12 + D.25, Anthropic Admin Usage API docs, Lua token bucket reference
- **Output files**:
  - `src/backend/budget/usage_api_poller.py` (5-min cron via Arq)
  - `src/backend/budget/local_accountant.py` (per-session cost write on stream close)
  - `src/backend/budget/cap_flag.py` (Redis SET/GET + Hemera auto-disable)
  - `src/backend/budget/daily_reset.py` (00:00 UTC cron)
  - `src/backend/rate_limit/token_bucket.lua` (committed Lua script)
  - `src/backend/rate_limit/redis_limiter.py` (Python wrapper)
  - `tests/budget/test_cap_short_circuit.py` + `test_usage_reconciliation.py`
- **Halt triggers**: Anthropic Admin Usage API rate limit (increase poll to 10 min if needed), local accountant skew vs API report > 5% (alert via Selene, manual reconcile), cap flag set but Kratos still dispatches (race on Redis read, add atomic check via Lua)

### 4.19 Marshall (W2 Pricing + Treasurer)

- **Name**: Marshall (pre-locked Ghaisan directive, non-Greek exception accepted as pitch-differentiator choice per kickoff)
- **Role**: Pricing section on landing page (4-tier card layout matching Claude Design aesthetic: Free, Solo, Team, Enterprise). In-game treasurer NPC (Phaser scene sprite + dialogue + tier upgrade prompt + subscription state HUD sync). Cross-pillar tier-state consistency (Marketplace + Banking + Registry + Protocol UI show correct tier everywhere). **BONUS scope**: fix landing primary CTA "Play In Browser" contrast violation (white on phosphor-green ~2.5:1 current, target 4.5:1 WCAG 2.1 AA). Change approach: dark text color use `--ink` CSS variable `oklch(0.14 0.012 250)` on phosphor-green background. Match Claude Design aesthetic fidelity per RV W3 Kalypso port.
- **Model**: Opus 4.7, effort xhigh
- **Wave**: W2 (post Plutus subscription tier CRUD)
- **Sessions**: 2
- **Upstream**: Plutus (subscription tier data), Helios-v2 (in-game treasurer NPC sprite authoring, Helios provides sprite + Marshall provides dialogue + subscription sync logic), Kalypso W3 landing source `_skills_staging/claude_design_landing.html` + ported Next.js components, Pythia-v3 `pricing_tier.contract.md` + `treasurer_npc.contract.md`
- **Downstream**: Kalypso W4 (final landing integration), Eunomia (admin can grant manual tier via Marshall API)
- **Input files (Tier B Oak-Woods TARGETED READ)**: `src/scenes/GameScene.ts` (NPC placement pattern line 80-105 decoration + sprite.setOrigin(0.5, 1) ground-align pattern), `.claude/skills/phaser-gamedev/SKILL.md` core-patterns (sprite creation + input handling for treasurer interaction). SKIP tilemaps + performance references. Plus `_skills_staging/claude_design_landing.html` for palette + aesthetic
- **Output files**:
  - `src/frontend/app/pricing/page.tsx` (4-tier pricing section)
  - `src/frontend/components/pricing/TierCard.tsx` (matches Claude Design CRT + phosphor aesthetic)
  - `src/frontend/components/landing/PlayInBrowserCTA.tsx` (contrast-fixed version of existing CTA, uses `--ink` on `--phos` background)
  - `src/game/objects/TreasurerNPC.ts` (Phaser sprite in ApolloVillageScene)
  - `src/data/dialogues/treasurer_greet.json` (tier upgrade dialogue tree)
  - `src/backend/routers/v1/billing/tier_state.py` (GET /v1/billing/tier current user)
  - `src/frontend/hooks/useSubscriptionTier.ts` (Zustand selector + React Query)
  - Cross-pillar audit: add tier check in Marketplace publish flow (Phanes), Banking upgrade page (Plutus), Registry verified badge (Astraea), Protocol advanced adapter (Crius)
  - `tests/pricing/test_tier_consistency.py`
- **Halt triggers**: CTA contrast fix breaks Claude Design visual hierarchy (alternate: invert to phosphor-green text on dark background with phosphor border; maintain primary > secondary hierarchy visually), treasurer NPC interaction conflicts with Boreas chat mode (coordinate via focus arbitration state machine)
- **Strategic hard stops**: adding 5th tier beyond 4 (locked Free + Solo + Team + Enterprise), changing Claude Design palette (locked per Kalypso W3 RV port aesthetic fidelity)

### 4.20 Boreas (W3 Chat UIScene)

- **Name**: Boreas (god of north wind Greek, fresh, clean; fitting for chat message delivery metaphor)
- **Role**: Minecraft chat-style UIScene. Phaser `Scene` launched via `scene.launch('UIScene')` from BootScene, persists across world scene transitions. `Phaser.GameObjects.DOMElement` HTML input embed (preserves IME composition critical for Indonesian + Chinese + Japanese users; `compositionstart`/`compositionend` guard before Enter processing). Chat history scrollable (ArrowUp/Down recall, Ctrl+L clear, persist last 100 entries to sessionStorage). Command parser prefix `/` (`/clear /help /save /model opus-4.7 /model sonnet-4.6 /debug`). Typewriter effect NPC response streaming from Nike SSE into DOM text node at configurable cps (default 60), `scrollTop = scrollHeight` auto-scroll. Focus arbitration state machine: movement mode (WASD active, chat blurred), chat mode (T opens, Esc cancels, Enter sends, WASD disabled), dialogue mode (1-4 choice keys, WASD disabled). `focusin`/`focusout` DOM event bubbling listener globally.
- **Model**: Opus 4.7, effort xhigh
- **Wave**: W3 (post Nike SSE + Aether + Epimetheus quest runtime stable)
- **Sessions**: 2 (session 1 UIScene + DOMElement + focus arbitration, session 2 typewriter + command parser + history)
- **Upstream**: Nike (SSE stream source), Kratos (MA session event source), Helios-v2 (scene coordination, chat overlay doesn't clip world sprites), Pythia-v3 `chat_ui.contract.md` + `command_parser.contract.md`, M1 Sections G.43 + G.44
- **Downstream**: all /play route UX (chat is sole input surface, React HUD deprecated per Gate 5 pivot), Marshall (treasurer NPC dialogue via same chat surface)
- **Input files (Tier B Oak-Woods TARGETED READ)**: `src/scenes/BootScene.ts` (Scene lifecycle pattern, registry cross-scene data), `.claude/skills/phaser-gamedev/SKILL.md` scene architecture references (specifically `this.registry.set()` cross-scene data sharing = relevant for chat state). `.claude/skills/playwright-testing/SKILL.md` `window.__TEST__.ready` readiness signal pattern for Nemea-RV-v2 E2E. SKIP spritesheets + performance + tilemaps
- **Output files**:
  - `src/game/scenes/UIScene.ts` (DOMElement host, persists across world)
  - `src/game/ui/ChatInput.ts` (DOMElement wrapper, IME guard, input event handling)
  - `src/game/ui/ChatHistory.ts` (scrollable log, history recall)
  - `src/game/ui/CommandParser.ts` (`/` prefix dispatch)
  - `src/game/ui/TypewriterEffect.ts` (cps-controlled DOM text drain)
  - `src/lib/focusArbitration.ts` (hook `useFocusArbitration`, `focusin`/`focusout` listener, `scene.input.keyboard.enabled` toggle)
  - `src/stores/chatStore.ts` (Zustand slice: chatMode enum, history array, current input, streaming buffer)
  - `src/frontend/styles/chat.css` (pixel font, CRT border, phosphor-green scheme matching landing aesthetic)
  - `tests/chat/test_ime_guard.py` (Playwright)
  - `tests/chat/test_focus_arbitration.py`
  - `tests/chat/test_command_parser.py`
- **Halt triggers**: IME composition edge case on Safari macOS (fallback: BitmapText input mode, ship with announcement "IME support best on Chrome/Firefox"), DOMElement z-index below Phaser canvas (ensure UIScene depth > world scene, DOMElement container attached via `dom: { createContainer: true }` in game config), typewriter streaming race with user new chat input (buffer per-message, lock current message rendering)
- **Strategic hard stops**: using React HUD on /play (locked Gate 5 pivot, React HUD deprecated on /play only), skipping focus arbitration (locked, core UX requirement per M1 Section G.44), introducing 5th chat mode beyond movement/chat/dialogue (locked 3-state FSM)

### 4.21 Helios-v2 (W3 Visual Revamp)

- **Name**: Helios-v2 (reuse P0 Helios pipeline visualizer agent upgraded; visual revamp scope expansion per V4 NP post-RV review directive; new sessions fresh implementation, old Helios scope P0 pipeline viz absorbed into Erato-v2 RV output already shipped, v2 upgrade focus on visual revamp only)
- **Role**: Phaser game visual quality revamp tier Sea of Stars / Crosscode / Stardew / Hyper Light Drifter / Moonlighter / To The Moon. 4 scenes (3 active + 1 stub). 5-layer depth (sky_gradient -100, parallax_bg -50, ground_tiles -10, world_tiles 0 collision, above_tiles 100 roof/canopy overhang). Dynamic y-sort via `setDepth(sprite.y)` in update loop. 20-40 props per 10x10 tile area (320x320 px). Per-world palette 32-48 colors saturated not muted. Phaser Lights2D system with ambient + 2-3 point lights per scene. Day-night overlay gradient rectangle `setBlendMode(Phaser.BlendModes.MULTIPLY)` alpha-tweened over 5-min game cycle. Ambient FX particle emitter per scene (Apollo dust motes, Caravan leaves, Cyberpunk rain + neon smog, Steampunk steam puffs + gear sparks; 30-60 particles, low alpha, slow drift). Character animation 4-direction state machine (down/left/right/up x 4 walk frames + 4 idle breathing frames + 1-3 interact frames), 9 fps walk + 4 fps idle + 10 fps interact, anims.chain queue. NPC variety 5-10 populated + 2-3 stub per scene, 4-5 variant sprite pool per world palette. Decoration y-sort discipline per Oak-Woods `setOrigin(0.5, 1)` pattern.
- **Model**: Opus 4.7, **effort max**
- **Wave**: W3 (post Epimetheus W0 + Aether W1 + all Wave 2 backend stable)
- **Sessions**: **7** (largest single agent of NP roster)
  - Session 1: Research + architecture plan (review Oak-Woods + 11 visual_inspiration + Claude Design scene mockups if Ghaisan provides + skill references; decision matrix asset approach + NPC pool size + ambient AI complexity; scene transition system design; input focus arbitration coordination with Boreas)
  - Session 2: ApolloVillageScene full revamp (top-down desert palette + decoration density tent/rock/cactus/plank shack; layered depth sky gradient + parallax desert silhouette + mid-layer vegetation + foreground acacia canopy overhang; warm orange evening lighting + point light per torch; sand particle drift + dust swirl ambient FX; 5-8 ambient NPC villager/merchant/child/guard/elder; Apollo NPC + 2-3 flavor NPC; music loop hook)
  - Session 3: CyberpunkShanghaiScene (neon palette + decoration hologram/vending/trash/neon sign; magenta+cyan neon clash dark base + rim-light on puddle reflection; neon flicker + steam from manhole + rain drip + hologram pulse ambient FX; 5-8 NPC synth-vendor/cyborg-guard/street-rat/salaryman; caravan_vendor relocated here per B5 Epimetheus build; cyberpunk synthwave ambient music)
  - Session 4: CaravanRoadScene (transition scene travel montage tilemap road + distant desert fade + starting cyberpunk silhouette on horizon; caravan cart NPC + driver; 2-3 ambient traveler NPC; road dust + occasional bird fly + distant cyberpunk neon tease FX; cinematic fade tween scene-to-scene; quest step 5-7 narrative flow)
  - Session 5: SteampunkStubScene (brass pipe + wooden floor + cog wheel decoration + steam vent tilemap; engineer NPC stub "Come back when you unlock Chapter 2"; 2-3 NPC brass-clad guard/inventor/apprentice; steam puff + gear rotation + spark FX; warm oil lamp glow + occasional blue electric arc; steampunk victorian music)
  - Session 6: Character animation rigging (player 4-direction top-down idle 4 + walk 4x4 + interact 1; 10-15 NPC sprite variants per world palette; anims.play + anims.chain state machine)
  - Session 7: Polish + integration (scene transition smoothness 500ms fade; ambient NPC wander edge case stuck behind decoration + crowd clustering; `window.__NERIUM__` primitive state exposure for E2E; deterministic test mode seed handling for ambient randomness; 60fps cap integer scale pixel crisp verification; Playwright E2E adaptation)
- **Upstream**: Epimetheus W0 complete, Aether + Nike stable, Boreas scene coordination (UIScene overlay depth doesn't conflict with world layers), Talos-v2 reuse-execute skill transplant done (Oak-Woods phaser-gamedev skill ported), Pythia-v3 `visual_manifest.contract.md` + `scene_transition.contract.md`, M1 Sections G.39-G.45
- **Downstream**: Boreas (chat overlay coordinates), Marshall (treasurer NPC sprite reuse pattern), Nemea-RV-v2 Wave 4 (E2E against visual refresh)
- **Input files (Tier A Oak-Woods FULL READ mandatory)**:
  - `_Reference/phaserjs-oakwoods/src/main.ts` + `src/scenes/BootScene.ts` + `src/scenes/GameScene.ts` (all source files)
  - `.claude/skills/phaser-gamedev/SKILL.md` + all 4 references (spritesheets-nineslice + tilemaps + arcade-physics + performance)
  - `.claude/skills/playwright-testing/SKILL.md` + 3 references
  - `plans/bubbly-roaming-scone.md`
  - `prompts/01-create-assets-json.txt` + `prompts/02-plan-implementation.txt`
  - `_Reference/visual_inspiration/*.png` all 11 screenshots (Sea of Stars + Crosscode + Stardew + Hyper Light Drifter + Moonlighter + To The Moon tier references)
  - `RV_NP_RESEARCH.md` Sections G.39-G.45 (critical deep section)
  - Existing shipped RV scenes `src/game/scenes/ApolloVillageScene.ts` + `src/game/scenes/MiniBuilderCinematicScene.ts` (read before refactor; revamp preserves quest mechanic + trigger emission while replacing visual layer)
- **Output files**:
  - `src/game/scenes/ApolloVillageScene.ts` (full revamp)
  - `src/game/scenes/CaravanRoadScene.ts` (NEW)
  - `src/game/scenes/CyberpunkShanghaiScene.ts` (NEW)
  - `src/game/scenes/SteampunkStubScene.ts` (NEW stub)
  - `src/game/scenes/BootScene.ts` (extend asset loader)
  - `src/game/scenes/PreloadScene.ts` (per-scene atlas pack)
  - `src/game/objects/NPC.ts` (extend with wander FSM + variant sprite + flavor dialogue pool)
  - `src/game/objects/Player.ts` (4-direction state machine refactor from RV)
  - `src/game/objects/AmbientFX.ts` (particle emitter per-scene factory)
  - `src/game/objects/DayNightOverlay.ts` (gradient rectangle tween)
  - `src/game/objects/Lighting.ts` (Phaser Lights2D wrapper)
  - `src/game/util/ySort.ts` (setDepth sprite.y helper)
  - `src/data/scenes/apollo_village_manifest.json` (assets + NPC list + decoration coordinates)
  - `src/data/scenes/caravan_road_manifest.json`
  - `src/data/scenes/cyberpunk_shanghai_manifest.json`
  - `src/data/scenes/steampunk_stub_manifest.json`
  - `src/data/npcs/variants.json` (per-world NPC variant pool with flavor dialogue pools of 10-15 lines each)
  - `public/assets/` per-world atlases (CC0 Kenney + Opus procedural only, fal.ai dormant per RV.6 + Ghaisan $0 personal fund)
  - `tests/game/test_scene_transition.py` (Playwright)
  - `tests/game/test_y_sort_depth.py`
  - `tests/game/test_ambient_npc_wander.py`
- **Halt triggers**: session context 97% threshold (split session N into A+B mid-session, commit partial), asset budget concern despite CC0-only strategy (fallback Opus procedural for missing sprites via Canvas or SVG-to-PNG render), Phaser Lights2D performance drop below 60fps on mid-tier laptop (fallback gradient overlay per-scene darkening, skip dynamic point lights), day-night cycle overlapping with quest event timing (decouple cycle from quest state, pure cosmetic)
- **Strategic hard stops**: inverting asset hierarchy back to fal.ai primary (locked per RV.6 dormant + Ghaisan $0), pivoting to side-scroll perspective (locked top-down per Gate 5 revised Option C), adding 5th scene (locked 3 active + 1 stub, scope discipline), embedding React HUD on /play (locked Gate 5 pivot Minecraft chat-style full in-game), using Opus procedural for sprite character (CC0 Kenney primary, Opus for UI chrome + particle FX only)

---

## 5. Dependency graph

### 5.1 ASCII flow diagram

```
                     METIS-V3 M1 RESEARCH
                              |
                              v
                     METIS-V3 M2 (this doc)
                              |
            +-----------------+------------------+
            |                                    |
            v                                    v
       PYTHIA-V3                         METIS-V3 M3 optional
       (NP contracts round 3)
            |
            v
       HEPHAESTUS-V3
       (prompt batch 20 agents + 2 reuse-execute)
            |
            +------------------+
            |                  |
            v                  v
      WAVE 0 start      WAVE 1 start (parallel)
            |                  |
      +-----+------+    +------+------+------+------+------+------+
      v            v    v      v      v      v      v      v      v
 EPIMETHEUS  (isolated) AETHER  KHRONOS CHIONE PHEME HEMERA SELENE
 (B1-B5 +            (blocks   (MCP    (R2    (mail) (flags)(obs)
  caravan +           ALL)     + OAuth)  storage)
  Harmonia            |
  consolidation)       |
      |               (Aether stable)
      v               |
  NEMEA-RV-V2        v
  (verify 23/23)   WAVE 2 start (parallel, max 10 concurrent practical 6-7)
      |            |
      |            +----+----+----+----+----+----+----+----+----+----+----+
      |            |    |    |    |    |    |    |    |    |    |    |    |
      v            v    v    v    v    v    v    v    v    v    v    v    v
    (Green)     PHANES HYPERION KRATOS NIKE PLUTUS IAPETUS TETHYS CRIUS ASTRAEA EUNOMIA MOROS MARSHALL
      |            (listing)(search)(runtime)(WS)(Stripe)(Connect)(identity)(vendor)(trust)(admin) (budget) (pricing+treasurer+CTA fix)
      |            |    |    |    |    |    |    |    |    |    |    |    |
      +------------+----+----+----+----+----+----+----+----+----+----+----+
                              |
                              v
                         WAVE 3 start (3 parallel)
                              |
            +-----------------+-----------------+-----------------+
            v                                   v                 v
        HELIOS-V2                          BOREAS          TALOS-V2 reuse-execute
        (visual revamp,                    (chat UIScene,  (Oak-Woods skill port)
         7 sessions,                        DOMElement IME,
         max effort)                        typewriter,
            |                               focus arbitration)
            |                                   |                 |
            +-----------------+-----------------+-----------------+
                              |
                              v
                         WAVE 4 start (sequential)
                              |
                    +---------+----------+
                    v                    v
             NEMEA-RV-V2 W4          /ULTRAREVIEW Run #2
             (E2E NP surface       (post-Kalypso W4)
             + a11y sweep)
                    |                    |
                    +----------+---------+
                               |
                               v
                          KALYPSO W4
                         (landing polish
                          + demo video script
                          + README honest-claim
                          + submission package)
                               |
                               v
                          GHAISAN SUBMIT
                          (Senin 06:00 WIB
                           target, 07:00 WIB hard)
```

### 5.2 Dependency table

| Agent | Hard upstream (blocking) | Soft upstream (informational) | Hard downstream |
|---|---|---|---|
| Pythia-v3 | M2 this doc | M1, CLAUDE.md, existing P0+RV contracts | Hephaestus-v3, Aether, Khronos, all NP workers |
| Hephaestus-v3 | Pythia-v3 all contracts | M1, M2, NarasiGhaisan | all 20 active + 2 reuse-execute agents (receive prompt file) |
| Epimetheus (W0) | M1 + M2 + Hephaestus-v3 prompt | Nemea-RV-A + Harmonia-RV-A reports | Nemea-RV-v2 verify, all Wave 2+ game-adjacent (Helios-v2, Boreas, Marshall) |
| Aether (W1) | Pythia-v3, M1, Hephaestus | NarasiGhaisan | ALL other NP active agents |
| Khronos (W1) | Aether lifespan stable, Pythia-v3 mcp+oauth contracts | M1 A.1+A.2 | Kratos (MCP exposes MA sessions tool), Claude.ai custom connector |
| Chione (W1) | Aether | M1 E.28 | Phanes (asset upload), Eunomia (archive access), Iapetus (creator file upload) |
| Pheme (W1) | Aether | M1 C.20 | Plutus (invoice email), Iapetus (sale notification), Eunomia (GDPR export email), Tethys (key rotation alert) |
| Hemera (W1) | Aether | M1 E.34 | Kratos (builder.live gate), Moros (cap auto-disable), Crius (vendor kill switch), Eunomia (flag UI) |
| Selene (W1) | Aether | M1 E.29+E.31+E.32 | ALL agents (shared logger), Eunomia (dashboard link), Moros (metric source) |
| Phanes (W2) | Aether, Chione | M1 C.21 | Hyperion (search index), Iapetus (purchase reads), Astraea (trust per listing), Eunomia (moderation queue) |
| Hyperion (W2) | Aether, Phanes, Crius (embedding fallback) | M1 C.18 | Iapetus (filters purchase), Kratos (MCP tool search_marketplace) |
| Kratos (W2) | Aether, Nike, Hemera, Moros, Tethys | M1 B.11-B.15 | Nike (streams events), Plutus (post-session cost write), Selene (OTel traces) |
| Nike (W2) | Aether | M1 A.9+B.13 | Boreas (chat SSE consumer), frontend Builder UI |
| Plutus (W2) | Aether, Pheme | M1 C.16+C.19 | Iapetus (Stripe client share), Eunomia (refund UI), Moros (revenue metric) |
| Iapetus (W2) | Aether, Plutus, Phanes, Hyperion | M1 C.16+C.17 | Astraea (review data), Eunomia (admin refund), Kratos (purchased listings available to buyer) |
| Tethys (W2) | Aether | M1 D.23 | Astraea (verified flag), Crius (key pattern reuse), Kratos (verify tool_use), Khronos (MCP expose get_agent_identity) |
| Crius (W2) | Aether, Hemera | M1 D.24 | Kratos (model routing fallback), Hyperion (embedding fallback) |
| Astraea (W2) | Aether, Tethys, Iapetus (review), Phanes (listing metadata) | M1 D.22 | Hyperion (trust boost search), Eunomia (badge grant override), Marketplace UI (sort by trust) |
| Eunomia (W2) | Aether, Hemera, Chione, Pheme, Selene | M1 E.33+F.35+F.36+F.37 | Ghaisan admin self, Marshall (legal pages reference), Kalypso W4 (landing legal links) |
| Moros (W2) | Aether, Hemera, Kratos partial | M1 B.12+D.25 | Kratos (cap check), Eunomia (admin dashboard spend), Selene (OTel metric) |
| Marshall (W2) | Plutus, Helios-v2 partial (treasurer sprite), Kalypso W3 | M1 landing palette, Tier B Oak-Woods | Kalypso W4 (final landing), Eunomia (manual tier grant) |
| Helios-v2 (W3) | Epimetheus W0 complete, Aether+Nike stable, all W2 done, Talos-v2 skill transplant done | M1 G.39-G.45, Tier A Oak-Woods FULL | Boreas (scene coordination), Marshall (treasurer NPC), Nemea-RV-v2 W4 |
| Boreas (W3) | Nike, Kratos, Aether, Epimetheus W0, Helios-v2 architecture (session 1 output) | M1 G.43+G.44, Tier B Oak-Woods | all /play route UX (sole input surface), Marshall (treasurer dialogue via chat) |
| Talos-v2 (W3 reuse-execute) | All Wave 2, Hephaestus-v3 prompt | M1 Section 13, Tier A Oak-Woods | Helios-v2 session 1 kickoff (skill available), Boreas scene architecture, Nemea-RV-v2 W4 (playwright-testing skill) |
| Nemea-RV-v2 (W0 + W4) | Epimetheus W0 for first verify, all Wave 3 done for W4 verify | M1 Section G, Tier B Oak-Woods playwright-testing skill | Ghaisan go/no-go for /ultrareview Run #2 + submission |
| Kalypso W4 (final) | Nemea-RV-v2 W4 pass, /ultrareview Run #2 pass | M1 Section 16 honest-claim inventory, NarasiGhaisan | Ghaisan submission package (video + 100-200 word summary + repo link) |

### 5.3 Cycle check

Manual verification acyclic. Notable consideration:

- Marshall depends on Helios-v2 partial (treasurer NPC sprite) but Helios-v2 session 1 (research + architecture) is sufficient for Marshall to start, Marshall doesn't need full 7-session Helios-v2 complete.
- Boreas depends on Helios-v2 architecture session 1 output (scene coordination spec) but not full visual revamp; Boreas session 1 focuses on UIScene + DOMElement + focus arbitration (independent of visual layer), Boreas session 2 typewriter + command parser can proceed while Helios-v2 runs sessions 2-5.
- Kratos + Nike have soft mutual dependency (Kratos streams via Nike infra, Nike consumes Kratos events); decouple by defining shared `realtime_bus.contract.md` Pythia-v3 explicitly, both build against contract not each other's implementation.

Verified acyclic.

---

## 6. Parallel execution wave schedule

### 6.1 Wave 0 (Kamis 24 Apr evening WIB, parallel with Wave 1 start)

- Terminal A: Epimetheus single session (may split A+B if context threshold)

Exit criteria: Nemea-RV-v2 verify returns 23/23 E2E green.

### 6.2 Wave 1 (Jumat 25 Apr full day WIB)

Pre-Wave 1: Pythia-v3 single session contract round 3 + Hephaestus-v3 single batch prompt authoring (Pythia-v3 then Hephaestus-v3, sequential blockers).

Parallel terminals (6 concurrent):

- Terminal A: Aether (3 sessions sequential, blocks others on schema stable)
- Terminal B: Khronos (2 sessions, fires after Aether session 1 stable)
- Terminal C: Chione (1 session, fires after Aether session 1 stable)
- Terminal D: Pheme (1 session, fires after Aether session 1 stable)
- Terminal E: Hemera (1 session, fires after Aether session 2 stable)
- Terminal F: Selene (1 session, fires after Aether session 2 stable)

Exit criteria: `pnpm build` passes + Aether all migrations ship + all W1 contracts honored by workers via integration smoke test.

### 6.3 Wave 2 (Sabtu 26 Apr full day WIB)

Parallel terminals (practical 6-7 concurrent, max 10):

- Terminal A: Phanes (2 sessions)
- Terminal B: Hyperion (2 sessions)
- Terminal C: Kratos (3 sessions)
- Terminal D: Nike (2 sessions)
- Terminal E: Plutus (2 sessions)
- Terminal F: Iapetus (2 sessions)
- Terminal G: Tethys (2 sessions)
- Terminal H: Crius (2 sessions)
- Terminal I: Astraea (2 sessions)
- Terminal J: Eunomia (2 sessions, can start late Sabtu after other W2 progress)
- Terminal K: Moros (1 session, fires after Kratos session 1 + Hemera ready)
- Terminal L: Marshall (2 sessions, fires after Plutus session 1 + Kalypso W3 landing ported)

Exit criteria: all 12 W2 agents ship their deliverables, integration smoke tests pass per contract, Eunomia admin panel reachable at `/admin`.

### 6.4 Wave 3 (Minggu 26 Apr morning-afternoon WIB)

Parallel terminals (3 concurrent):

- Terminal A: Helios-v2 (7 sessions sequential within terminal, largest single agent by far)
- Terminal B: Boreas (2 sessions, session 1 parallel to Helios-v2 session 1-2, session 2 parallel to Helios-v2 session 3-4)
- Terminal C: Talos-v2 reuse-execute (1 session skill transplant, fires first thing Minggu pagi, blocks Helios-v2 session 1 on skill availability)

Exit criteria: /play route renders 4 scenes with aesthetic revamp, chat UIScene functional, /ultrareview Run #1 executed post session 4 of Helios-v2 (checkpoint).

### 6.5 Wave 4 (Minggu 26 Apr evening WIB + Senin 27 Apr 00:00-06:00 WIB, sequential final)

- Terminal A: Nemea-RV-v2 W4 (E2E full NP surface + a11y sweep)
- Terminal B: /ultrareview Run #2 (pre-submit, scope full branch vs main)
- Terminal C: Kalypso W4 final (landing polish + demo video script + README honest-claim 15 lines + submission package + 100-200 word summary)
- Ghaisan manual: record 3-min demo video, upload, submit Cerebral Valley form by 06:00 WIB target (07:00 WIB hard deadline).

Exit criteria: Senin 06:00 WIB submission complete.

### 6.6 Daily rhythm enforcement

Per CLAUDE.md Daily Rhythm Lock: 07:00 WIB to 23:00 WIB Claude Code activity window. 23:00 freeze for Ananke day log. Wave boundaries align:

- Kamis 24 Apr 23:00: Wave 0 + Wave 1 partial ship (Epimetheus + Pythia-v3 + Hephaestus-v3 + Aether session 1-2)
- Jumat 25 Apr 23:00: Wave 1 complete
- Sabtu 26 Apr 23:00: Wave 2 complete
- Minggu 27 Apr 17:00: Wave 3 complete
- Minggu evening through Senin 06:00 WIB: Wave 4 demo bake + submit

Ananke W0-W4 log compilation runs daily 23:00, produces `_meta/orchestration_log/day_N.md`.

---

## 7. Reuse-rewrite matrix (NP continuation from RV)

### 7.1 KEEP (ship as-is)

| Artifact | NP disposition |
|---|---|
| All P0 shipped logic (Apollo Advisor core, Helios viz, Cassandra prediction) | KEEP, already preserved in RV |
| RV shipped Nyx questStore + Linus dialogueStore canonical | KEEP (Epimetheus re-exports, not rewrites) |
| RV shipped Euterpe audio layer Howler.js | KEEP (NP expands cues per scene) |
| RV shipped Hesperus SVG HUD chrome | KEEP for non-/play routes; deprecate on /play (Gate 5 Minecraft chat pivot) |
| RV shipped Thalia-v2 ApolloVillageScene + MiniBuilderCinematicScene | KEEP mechanic, REPLACE visual layer via Helios-v2 (Helios-v2 refactors keeping quest mechanic + trigger emission intact) |
| RV shipped Kalypso landing ported from Claude Design | KEEP, extend via Marshall CTA contrast fix |
| RV shipped Erato-v2 React HUD for Builder prompt input | DEPRECATE on /play per Gate 5 pivot; KEEP components available for dashboard + marketplace reuse if applicable |
| RV shipped Pythia-v2 8 contracts | EXTEND to v0.2.0 via Pythia-v3 (quest_schema + dialogue_schema + game_state + item_schema + game_asset_registry + game_event_bus + zustand_bridge + asset_ledger; audit vs Harmonia-RV-A verdicts, ship amendments) |
| RV shipped Nemea-RV-A + Harmonia-RV-A patterns | REUSE via Nemea-RV-v2 W0 + W4 re-executions |

### 7.2 PORT (refactor significantly)

| Artifact | NP destination | Owner |
|---|---|---|
| RV `src/state/stores.ts` inline QuestStore + DialogueStore creates | Replaced by re-export shims | Epimetheus |
| RV `src/lib/gameBridge.ts` effect listener single-case | Replaced by 8-branch switch | Epimetheus |
| RV `src/components/BusBridge.tsx` missing dialogue_node_reached case | Added | Epimetheus |
| RV ApolloVillageScene missing caravan_vendor | Added caravan actors | Epimetheus + Helios-v2 W3 revamp |
| RV shipped P0 Proteus IR schema protocol adapter | Extended to multi-vendor per-vendor adapter registry | Crius |
| RV shipped Rhea banking wallet component | Refactored for subscription tier display + cross-pillar sync | Marshall |
| RV landing CTA white text on phosphor-green | WCAG fixed | Marshall |

### 7.3 NEW (authored fresh in NP)

| NP artifact | Owner |
|---|---|
| Khronos Remote MCP server + OAuth DCR | Khronos |
| Aether FastAPI core + multi-tenant Postgres + Redis + Arq | Aether |
| Phanes 7-category Marketplace listing schema | Phanes |
| Hyperion hybrid FTS + pgvector search | Hyperion |
| Kratos MA session orchestration runtime + Claude Agent SDK integration | Kratos |
| Nike WebSocket + SSE realtime server | Nike |
| Plutus Stripe test mode + double-entry ledger + invoice PDF | Plutus |
| Iapetus Stripe Connect Express + purchase + payout | Iapetus |
| Tethys Ed25519 agent identity + rotation | Tethys |
| Crius multi-vendor adapter + AES-256-GCM envelope | Crius |
| Astraea trust score Bayesian + Wilson + per-category | Astraea |
| Chione Cloudflare R2 storage + ClamAV | Chione |
| Pheme Resend + React Email templates + DKIM/SPF/DMARC | Pheme |
| Hemera Postgres-backed feature flag | Hemera |
| Selene structlog + OTel + Grafana Cloud Free + GlitchTip | Selene |
| Eunomia SQLAdmin panel + GDPR endpoints + Klaro consent + legal pages | Eunomia |
| Moros Chronos budget daemon + Admin Usage API poll | Moros |
| Marshall pricing UI + treasurer NPC + cross-pillar tier sync + CTA contrast fix | Marshall |
| Helios-v2 4-scene visual revamp + 5-layer depth + ambient FX + NPC variety | Helios-v2 |
| Boreas chat UIScene + DOMElement + IME + typewriter + focus arbitration | Boreas |
| Oak-Woods skill transplant phaser-gamedev + playwright-testing | Talos-v2 reuse-execute |
| Multi-scene transition system | Helios-v2 session 7 |
| `.codex/skills/` mirror | Talos-v2 (co-commit) |

### 7.4 DEPRECATE (remove from NP build)

| Artifact | Rationale |
|---|---|
| RV shipped Erato-v2 React HUD on /play route (TopBar + BottomBar + SideBar + PromptInputChallenge + InventoryToast + ApolloStream + CurrencyDisplay + ModelSelector + ShopModal) | Gate 5 Minecraft chat-style full in-game pivot; React HUD moved to Phaser canvas via Boreas UIScene. Components preserved as files but not rendered on /play. |
| `docs/phase_rv/` staging reference | Move to `docs/archive/` post-NP M2 approval |
| fal.ai Nano Banana 2 integration (RV.6 dormant) | Remains dormant per Ghaisan $0 personal fund + RV.6 override; skill transplanted but not exercised. Honest-claim README line enforced. |
| V4 pre-sketch agent names not selected (Hyperion in pre-sketch but used; Phanes in pre-sketch and used; Aether in pre-sketch and used; Prometheus-alt rejected due MedWatch collision; Nike reused) | N/A, all pre-sketch names either used or dropped per Section 8 audit |

---

## 8. Naming collision audit

### 8.1 Banned pools (from kickoff)

**MedWatch banned**: Orion, Clio, Raphael, Daedalus, Hestia, Gaia, Iris, Nemesis, Hygeia, Mercury, Mnemosyne, Argus, Hermes, Prometheus, Atlas, Themis, Calliope, Terpsichore, Pygmalion, Orpheus.

**IDX banned**: Orion, Theron, Raphael, Konstantin, Lysander, Vivienne, Cassander, Nikolai, Aldric, Beatrix (V1 handoff full list).

**P0 specialist + product banned**: Apollo, Athena, Demeter, Tyche, Hecate, Proteus, Cassandra, Erato, Urania, Helios, Dionysus, Thalia, Eos, Artemis, Coeus, Dike, Rhea, Phoebe, Triton, Morpheus, Heracles, Harmonia, Poseidon, Metis, Hephaestus, Pythia, Nemea, Ananke.

**RV fresh banned**: Talos, Nyx, Linus, Kalypso, Hesperus, Euterpe, Thea.

### 8.2 Pre-locked NP names (Ghaisan directive, no override)

| Name | Role | Collision status |
|---|---|---|
| Khronos | MCP server | Distinct spelling vs Chronos (not on any banned list), PRE-LOCKED CLEAN |
| Marshall | Pricing + Treasurer | Non-Greek exception explicit acceptance per Ghaisan kickoff, PRE-LOCKED |

### 8.3 NP fresh candidates audit

| Name | Greek origin | MedWatch | IDX | P0 | RV | Status |
|---|---|---|---|---|---|---|
| Epimetheus | Titan afterthought/hindsight | clean | clean | clean | clean | ACCEPT |
| Aether | primordial upper atmosphere | clean | clean | clean | clean | ACCEPT |
| Phanes | primordial generative | clean | clean | clean | clean | ACCEPT |
| Hyperion | Titan observation+light | clean | clean | clean | clean | ACCEPT |
| Kratos | personification strength | clean | clean | clean | clean | ACCEPT |
| Nike | goddess victory | clean | clean | clean | clean | ACCEPT |
| Plutus | god of wealth | clean | clean | clean | clean | ACCEPT |
| Iapetus | Titan father of Prometheus | clean | clean | clean | clean | ACCEPT |
| Tethys | Titan fresh water | clean | clean | clean | clean | ACCEPT |
| Crius | Titan constellation | clean | clean | clean | clean | ACCEPT |
| Astraea | goddess justice+stars | clean | clean | clean | clean | ACCEPT |
| Chione | goddess snow | clean | clean | clean | clean | ACCEPT |
| Pheme | goddess fame/rumor | clean | clean | clean | clean | ACCEPT |
| Hemera | goddess day | clean | clean | clean | clean | ACCEPT |
| Selene | goddess moon | clean | clean | clean | clean | ACCEPT |
| Eunomia | goddess of order | clean | clean | clean | clean | ACCEPT |
| Moros | daemon of doom | clean | clean | clean | clean | ACCEPT |
| Boreas | god of north wind | clean | clean | clean | clean | ACCEPT |

### 8.4 Reuse names (upgraded)

| Name | Suffix | Origin | Status |
|---|---|---|---|
| Helios-v2 | -v2 | P0 pipeline visualizer | REUSE with NP scope upgrade (visual revamp) |
| Talos-v2 | -v2 | RV W1 origin | REUSE as reuse-execute, skill transplant scope extension |
| Nemea-RV-v2 | -RV-v2 | RV W4 specialist split | REUSE as reuse-execute, NP E2E + a11y re-verify |
| Pythia-v3 | -v3 | P0 specialist, RV upgrade was v2 | REUSE with NP contract round 3 |
| Hephaestus-v3 | -v3 | P0 specialist, RV upgrade was v2 | REUSE with NP prompt authoring batch |
| Metis-v3 | -v3 | RV upgrade was v2 | REUSE as agent architect chat |

All suffixes follow NERIUM convention: `-v2 / -v3` signals major phase upgrade (RV, NP); `-RV-A/-RV-B/-RV-v2` signals RV-phase specialist splits or re-executions.

### 8.5 Dropped candidates

| Pre-sketch name | Reason |
|---|---|
| Prometheus-alt | MedWatch banned; rejected |
| Hermes-alt | MedWatch banned; rejected, Iapetus chosen for Marketplace role |

---

## 9. Halt triggers + strategic decision hard-stops catalog

### 9.1 Global halt triggers (all agents)

Per CLAUDE.md Section 7 anti-patterns plus RV+NP extensions:

1. Em dash detected in any output
2. Emoji detected in any output
3. Silent-assume on ambiguous cross-cutting decision (halt and ferry)
4. Per-file Hephaestus ferry attempt (anti-pattern 6, batch session pattern locked)
5. Non-Anthropic runtime execution (CLAUDE.md anti-pattern 7 override exception only for Crius vendor_adapter fallback user-visible slot + dormant fal.ai per RV.6; Khronos MCP + Kratos MA all Anthropic-only)
6. Context window 97% threshold (split session, commit partial, resume new terminal)
7. Any `.claude/skills/<name>/SKILL.md` exceeds 500 lines
8. `pnpm build` failure (on backend equivalent `uv sync && pytest` failure)
9. 23:00 WIB hard stop per Daily Rhythm Lock
10. Ghaisan explicit halt command via ferry

### 9.2 Per-agent strategic decision hard-stops (consolidated)

Any of the following requires V4 ferry approval before proceeding:

- Khronos: switching Python FastMCP to Node TypeScript SDK, adding Local MCP mode, exposing mutating billing tools
- Aether: adding ORM layer (asyncpg raw locked), switching to schema-per-tenant, adding pgbouncer pre-submit, moving queue off Arq
- Epimetheus: changing quest_schema / dialogue_schema contract shape, moving caravan beyond ApolloVillageScene, introducing new store singleton beyond 5 contract-specified, using React HUD for caravan interaction
- Phanes: collapsing 7 categories, opening Premium issuance pre-GA
- Hyperion: moving search off Postgres to Algolia/Typesense/Meilisearch
- Kratos: running live Builder without Hemera whitelist gate, model routing non-Anthropic default, bypassing Chronos budget daemon
- Plutus: enabling Stripe live mode pre-Atlas, skipping internal ledger, using Stripe metadata as source-of-truth
- Iapetus: activating Connect live mode pre-Atlas, running Premium listing purchase pre-GA
- Helios-v2: inverting asset hierarchy (fal.ai primary), pivoting to side-scroll, adding 5th scene, embedding React HUD on /play, using Opus procedural for sprite character
- Boreas: using React HUD on /play, skipping focus arbitration, introducing 5th chat mode
- Marshall: adding 5th pricing tier, changing Claude Design palette
- All agents: scope narrow suggestion (5-pillar scope locked), Vercel push proposal (defer post-hackathon), Gemini/Higgsfield runtime execution, dismissing Oak-Woods skill transplant mandate for Tier A/B agents

### 9.3 Ferry escalation protocol

Any halt trigger or strategic hard-stop: agent writes halt notice to `_meta/halt_log/<timestamp>_<agent>.md` with reason + proposed resolution options + recommended option. Ghaisan receives via V4 ferry message. Ghaisan approves or redirects. Agent resumes.

---

## 10. Mandatory reading expansion per Tier A/B/C

### 10.1 Tier A (FULL READ Oak-Woods + M1 Section G deep)

**Agents**: Epimetheus, Helios-v2

**Files**:
- `_Reference/phaserjs-oakwoods/src/main.ts`
- `_Reference/phaserjs-oakwoods/src/scenes/BootScene.ts`
- `_Reference/phaserjs-oakwoods/src/scenes/GameScene.ts`
- `_Reference/phaserjs-oakwoods/.claude/skills/phaser-gamedev/SKILL.md` + all 4 references (spritesheets-nineslice + tilemaps + arcade-physics + performance)
- `_Reference/phaserjs-oakwoods/.claude/skills/playwright-testing/SKILL.md` + all 3 references
- `_Reference/phaserjs-oakwoods/plans/bubbly-roaming-scone.md`
- `_Reference/phaserjs-oakwoods/prompts/01-create-assets-json.txt`
- `_Reference/phaserjs-oakwoods/prompts/02-plan-implementation.txt`
- `_Reference/phaserjs-oakwoods/CLAUDE.md`
- `_Reference/phaserjs-oakwoods/README.md`
- `_Reference/visual_inspiration/*.png` all 11 screenshots (Helios-v2 primary; Epimetheus skim for context)
- `RV_NP_RESEARCH.md` Sections G.39-G.45 (full)

### 10.2 Tier B (TARGETED READ Oak-Woods)

**Agents**: Marshall, Nike, Kratos, Boreas, Nemea-RV-v2

**Specific files per agent**:

| Agent | Oak-Woods files |
|---|---|
| Marshall | `src/scenes/GameScene.ts` (NPC placement line 80-105 + `setOrigin(0.5, 1)` pattern), `.claude/skills/phaser-gamedev/SKILL.md` core-patterns only |
| Nike | `src/main.ts` (Phaser config), `src/scenes/BootScene.ts` (registry + manifest pattern, `this.registry.set()` cross-scene), `.claude/skills/playwright-testing/SKILL.md` `__TEST__.ready` signal pattern |
| Kratos | `.claude/skills/phaser-gamedev/SKILL.md` scene transitions + asset loading, `.claude/skills/playwright-testing/SKILL.md` event seam pattern (skim for integration surface with game-layer events) |
| Boreas | `src/scenes/BootScene.ts` (scene lifecycle + registry cross-scene data), `.claude/skills/phaser-gamedev/SKILL.md` scene architecture, `.claude/skills/playwright-testing/SKILL.md` `__TEST__.ready` readiness signal |
| Nemea-RV-v2 | `.claude/skills/playwright-testing/SKILL.md` FULL (all 3 references), targeted `src/scenes/GameScene.ts` event emission for test seam |

Skip tilemaps + performance + spritesheets for all Tier B (unless agent scope specifically needs).

### 10.3 Tier C (skip Oak-Woods)

**Agents**: Pythia-v3, Hephaestus-v3, Aether, Khronos, Chione, Pheme, Hemera, Selene, Phanes, Hyperion, Plutus, Iapetus, Tethys, Crius, Astraea, Eunomia, Moros, Talos-v2 (reuse-execute for skill transplant itself, but skill authoring not requires reading Oak-Woods deeply since ports MD files verbatim with adaptation comments).

Tier C receives general M1 research document + their section + their contracts from Pythia-v3 + NarasiGhaisan + CLAUDE.md.

### 10.4 Universal mandatory reading (all agents)

- `_meta/NarasiGhaisan.md` v1.1 (voice anchor)
- `CLAUDE.md` root (post-RV amendment, anti-pattern 7 override)
- `docs/phase_np/RV_NP_RESEARCH.md` (M1)
- `docs/phase_np/RV_NP_AGENT_STRUCTURE.md` (this M2, own agent section per Section 4)
- Pythia-v3 contracts assigned to agent per Section 4 upstream
- Agent's own prompt file `.claude/agents/<agent>.md` (Hephaestus-v3 authored)

---

## 11. Self-check 19 of 19

Per V3 Metis pattern, each item must be YES or EXPLICITLY NA before handoff.

1. **All agent names Greek mythology from fresh pool (or pre-locked exception), no collision**: YES. Section 8 audit confirms 18 fresh Greek names (Epimetheus, Aether, Phanes, Hyperion, Kratos, Nike, Plutus, Iapetus, Tethys, Crius, Astraea, Chione, Pheme, Hemera, Selene, Eunomia, Moros, Boreas) + 2 pre-locked (Khronos Greek-distinct, Marshall non-Greek exception) + 6 reuse suffixed (Helios-v2, Talos-v2, Nemea-RV-v2, Pythia-v3, Hephaestus-v3, Metis-v3) = all clean vs MedWatch + IDX + P0 + RV banned.
2. **95%+ Opus 4.7 distribution preserved**: YES. 20 of 20 active agents on Opus 4.7 = 100%. Sonnet 4.6 only for in-agent subagent hops inside Kratos MA orchestration per M1 routing heuristic, not agent-level routing. Haiku 0.
3. **No em dash anywhere in this document**: YES verified grep-ready.
4. **No emoji anywhere in this document**: YES verified.
5. **Technical artifact in English**: YES.
6. **Reuse-rewrite matrix aligned with RV_PLAN Section 4 + RV inheritance**: YES. Section 7 extends RV matrix: KEEP preserves P0+RV shipped valid logic; PORT handles Epimetheus surgical fixes; NEW covers all 20 NP agent outputs; DEPRECATE clearly flags RV Erato-v2 React HUD on /play + fal.ai dormant infrastructure continuation.
7. **Dependency graph acyclic**: YES. Section 5.3 manual verification; Kratos+Nike mutual dep resolved via shared `realtime_bus.contract.md`; Boreas+Helios-v2 soft dep resolved by Helios-v2 session 1 kickoff architecture output.
8. **Parallel wave schedule respects upstream dependencies**: YES. Section 6 wave boundaries align to dependency table 5.2.
9. **Every active agent has upstream and downstream defined**: YES. Section 4 each template.
10. **Every active agent has halt triggers defined**: YES. Section 4 + Section 9.1 global.
11. **Every active agent has strategic decision hard-stops defined**: YES. Section 4 + Section 9.2 consolidated.
12. **Token budget estimate**: NA per V4 directive (no budget estimate fabrication).
13. **Every active agent has input files and output files enumerated**: YES.
14. **Hephaestus-v3 batches all prompts in single session (anti-pattern 6)**: YES. Section 3.3 single batch 20 active + 2 reuse-execute prompts, halt only at context threshold.
15. **`.claude/skills/` committed, `_skills_staging/` gitignored**: YES. Talos-v2 reuse-execute W3 Session 1 explicitly commits `.claude/skills/phaser-gamedev/` + `.claude/skills/playwright-testing/` + `.codex/skills/` mirror per M1 Section 13 + Ghaisan directive.
16. **No agent prompt expected to exceed 500 lines**: YES. Hephaestus-v3 halt trigger caps at 400 lines per prompt, skill authoring 500-line discipline enforced per M1 Section A.3 + RV pattern.
17. **Asset hierarchy preserved (CC0 + Opus procedural only, fal.ai dormant per RV.6)**: YES. Helios-v2 strategic hard-stop section explicitly locks this; honest-claim README line 9 ships.
18. **Phaser + Next.js 15 embed preserved per RV architecture**: YES. `dom: { createContainer: true }` added to game config for Boreas DOMElement; `next/dynamic` with `ssr: false` pattern preserved per RV Thalia-v2 output.
19. **Gate 5 REVISED Option C discipline (top-down + aesthetic tier Sea of Stars/Crosscode + multi-scene + Minecraft chat + React HUD on non-/play preserved)**: YES. Helios-v2 + Boreas + Marshall strategic hard-stops explicitly enforce. 4 scenes (3 active + 1 stub) locked; single perspective top-down 3/4 JRPG locked.

**Self-check result: 18 YES + 1 NA = 18/18 pass with 1 NA (item 12 per V4 directive).**

---

## 12. Open questions for Ghaisan (low-stake defaults proposed)

Carry-forward from M1 Section 14 (10 open questions), with M2 recommendations:

1. **Hemera flag storage**: Custom Postgres M1-recommended (chosen default). Confirm OK.
2. **Stripe Atlas filing timing**: Recommend file now (parallel to NP waves). Confirm OK.
3. **Midtrans sandbox activation**: Recommend activate in M2 immediately. Confirm OK.
4. **License enforceability per Marketplace subtype**: Legal review pre-M3. No immediate action, defer post-pitch.
5. **Verified certification issuance workflow (Premium category)**: Pending, not in NP scope. Defer post-pitch.
6. **OpenAI Workspace Agents positioning framing**: Recommend "App Store vs iPhone" primary + Unity Asset Store secondary analog. Confirm OK.
7. **Budget cap default**: Recommend USD 100/day for submission week (not 50/day). Confirm OK.
8. **Steampunk stub scope**: Recommend minimal stub with "coming soon" sign. Confirm OK.
9. **Skills co-location `.claude/` + `.codex/` mirror**: Recommend both (Talos-v2 scope). Confirm OK.
10. **OAuth fallback via `oauth_anthropic_creds` pre-registered client**: Recommend email Anthropic now, get static client_id ready. Confirm OK.

New M2-specific questions:

11. **Wave 2 terminal concurrency practical cap**: M2 recommends 6-7 concurrent per Ghaisan capacity (not 10-12). Confirm OK or specify different cap.
12. **Helios-v2 7-session count**: Single agent largest effort. Confirm 7 sessions acceptable or want to split into Helios-v2-A + Helios-v2-B (scope per scene sub-agent).
13. **Epimetheus Wave 0 standalone terminal vs folded into Wave 1 Aether terminal**: M2 recommends standalone terminal (isolated dep chain + parallel runtime). Confirm OK.
14. **Pythia-v3 contract count**: expect ~15-20 new contracts. Confirm expansion vs RV cap of 8 + amendments.
15. **Nemea-RV-v2 scope at W4**: full E2E + a11y sweep + /ultrareview Run #2 trigger. Confirm combined vs splitting Nemea-RV-v2-A (E2E) + Nemea-RV-v2-B (a11y).

---

## 13. Handoff notes to M3 (optional) and Hephaestus-v3

### 13.1 If M3 proceeds

M3 produces `RV_NP_agent_flow_diagram.html` interactive visualization:

- 20 active nodes + 2 reuse-execute nodes + 3 specialist tier + Metis-v3 entry + Ghaisan submit exit (27 nodes total)
- 5-wave layout (W0 + W1 + W2 + W3 + W4) + Ferry + Submit rails
- Dependency arrows per Section 5 graph
- Model distribution color coding (all Opus 4.7 single color highlight)
- Hover per-node summary (role + wave + session count + effort tier)
- Click expand halt triggers + strategic hard-stops
- Play-mode timeline animation Kamis evening through Senin 06:00 WIB
- Self-contained single HTML file cyberpunk aesthetic matching RV_agent_flow_diagram.html

M3 optional per kickoff; can skip if Ghaisan prefers direct Hephaestus-v3 prompt authoring.

### 13.2 Hephaestus-v3 consumption checklist

Each `.claude/agents/<agent>.md` prompt must include:

- **Frontmatter**: name, description (pushy trigger phrases), model: opus-4-7, effort: xhigh (or max), tools allowlist
- **Mandatory reading preamble** per Tier A/B/C Section 10 mapping, including: NarasiGhaisan.md, CLAUDE.md, RV_NP_RESEARCH.md (own section), RV_NP_AGENT_STRUCTURE.md (own Section 4 template), Pythia-v3 contracts assigned per upstream, Oak-Woods files per Tier mapping
- **Role body**: role statement per Section 4, scope boundaries, deliverables list, halt triggers, strategic decision hard-stops
- **Collaboration protocol**: "Question, Options, Decision, Draft, Approval" + "May I write this to [filepath]?" before every write-tool use
- **Anti-pattern honors**: no em dash, no emoji, runtime execution Anthropic-only, React HUD boundary per Gate 5 for game-adjacent agents, 500-line SKILL.md cap, 400-line prompt cap per-agent

Each prompt target length 200-400 lines (halt at 400 per prompt). Total batch size 20 active + 2 reuse-execute = 22 prompt files.

### 13.3 Wave 0 + Wave 1 kickoff readiness

After V4 ferry approves M2 (+ optional M3), Ghaisan proceeds:

1. Save `docs/phase_np/RV_NP_RESEARCH.md` + `docs/phase_np/RV_NP_AGENT_STRUCTURE.md` (+ optional flow diagram HTML)
2. Commit `docs(np): M1 research + M2 agent structure by Metis-v3`
3. Spawn Pythia-v3 single terminal (contract round 3)
4. Post-Pythia-v3 complete, spawn Hephaestus-v3 single terminal (prompt batch)
5. Post-Hephaestus-v3 complete, spawn Wave 0 Epimetheus + Wave 1 (Aether first, then Khronos + Chione + Pheme + Hemera + Selene as Aether sessions complete) per Section 6 schedule

---

## 14. Version history

- v1 (this document, April 24, 2026 Jumat pagi WIB): initial NP agent structure by Metis-v3 post-M1 research + post-Ghaisan Gate 1-5 lock + Epimetheus bridge decision.

**End of M2. Awaiting V4 ferry approval. No Wave 0 or Wave 1 spawn until Ghaisan approves.**
