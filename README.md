# NERIUM

**Infrastructure for the AI agent economy.**

Built with Claude Opus 4.7 for the Cerebral Valley plus Anthropic hackathon, April 2026. Open source MIT from day one. Live at [nerium-one.vercel.app](https://nerium-one.vercel.app).

---

## What is NERIUM

NERIUM is infrastructure for the AI agent economy. Five integrated pillars: Marketplace, Builder, Banking, Registry, Protocol. The whole stack is packaged as a playable JRPG world to make agent infrastructure accessible to non-technical founders.

The Builder pillar is a gamified prompting editor. A user types one sentence describing their project. Sekuri, the agent structure architect, classifies project complexity (small=4 agents, medium=8, large=14) and proposes a multi-vendor agent roster. Eight vendors are presented in the model selection interface: Anthropic Opus 4.7, Google Gemini Pro, OpenAI Codex, Higgsfield, Seedance, Meta Llama 3.1, Mistral Mixtral, and Auto. The agents spawn in parallel terminals and execute the build end to end.

Marketplace solves the indie creator monetization gap. Today AI skills sit forgotten on Twitter feeds, MCP servers buried in GitHub repos, brilliant prompts traded in Discord and lost by Monday. NERIUM Marketplace gives every creator a permanent home and every buyer a real search engine. Discoverable, rated, sortable by trust score, monetized from day one. Banking treats AI agents the way utilities treat electricity. Every query metered. Every execution billed transparently. Stripe Connect Express integration with usage-based metering. Registry provides cryptographic identity for every agent on the network. Ed25519 signing with weekly key rotation. Astraea Bayesian trust score with Wilson confidence interval recomputed nightly. Protocol provides multi-vendor adapter dispatch with automatic fallback. Circuit breaker and kill switch architecture for graceful failure across Claude, Gemini, and custom models.

---

## Architecture

```
                      ___ landing /  + companion routes
                     /
  Vercel Edge ------+--- Phaser browser game /play (5 scenes wired,
                     \                                13 total advertised)
                      \
                       \__ FastAPI runtime via Mangum Serverless
                                  |
                          +-------+-------+
                          |       |       |
                  Vercel Postgres  Upstash Redis  Vercel Blob (96 assets)
                       (Neon iad1)   (Singapore)
```

5 pillars composed end-to-end, each with its own contract and surface. The Builder pillar is the flagship. The other four are the chassis.

| Pillar      | Surface                                | Contract                                   |
|-------------|----------------------------------------|--------------------------------------------|
| Builder     | `/play` Phaser game + `/builder` web   | Sekuri tier classifier + Heracles MA lane  |
| Marketplace | `/marketplace` + in-game Bazaar        | Listing CRUD + trust score + Stripe Connect|
| Banking     | Tier system + checkout                 | Stripe webhooks + usage metering           |
| Registry    | NPC trust meters + agent identity card | Ed25519 + JWT EdDSA                        |
| Protocol    | Multi-vendor adapter dispatch          | Crius adapter + circuit breaker            |

---

## What works

The honest 15-line claim of what ships at submission, no more no less.

1. Landing page at `/` with 6 parallax scenes, terminal boot, manifesto, 5 pillars, footer
2. Phaser browser game at `/play` with 5 wired scenes (Apollo Village + 3 sub-areas + Caravan Road) of 13 advertised, painted backdrops + NPC sprites + Lights2D
3. Builder Workshop landmark in Apollo Village triggers theatrical Sekuri spawn flow with multi-vendor model selection modal (8 vendors)
4. Marketplace browse + search + creator submit + dashboard at `/marketplace/*`
5. Pricing tiers Free + Starter + Pro + Team at `/pricing` with Stripe Checkout (test mode 4242 4242 4242 4242)
6. Backend FastAPI Mangum on Vercel with Postgres Neon + Upstash Redis + Stripe webhooks
7. BYOK Builder live runtime at `/v1/builder/sessions/live` (judges with own API key invoke real Anthropic call)
8. Astraea trust score nightly cron + Tethys Ed25519 weekly key rotation
9. Hyperion search + Iapetus creator dashboard + Plutus invoice PDF + Eunomia legal placeholders
10. Boreas chat avatar + IntroNarrativeScene 5-pillar cinematic + Howler audio cues
11. Registry pillar agent identity card with Ed25519 verifiable signature on JWT EdDSA
12. Protocol pillar Crius vendor adapter dispatcher with Hemera kill switch + AES-256-GCM envelope encryption per tenant
13. 1246 backend pytest GREEN at submission (2 KNOWN_PRE_EXISTING unrelated httpx StreamConsumed)
14. Lighthouse `/` Performance 94 / Accessibility 92 / SEO 100, `/play` Performance 72 / Accessibility 100, both PASS V4 narrow scope thresholds
15. 54 specialist Claude Code agents authored, audit trail visible at `_meta/orchestration_log/v1` through `v7` plus `.claude/agents/` directory

---

## Submission summary

The AI agent economy already exists in fragments. Indie creators build MCP servers, subagents, and automation workflows, then post them on X and Discord for free because no neutral marketplace exists. A restaurant automation builder ends up making a one-off website. Buyers dig through eight vendor-locked storefronts to find niche agents that may or may not work.

NERIUM is the infrastructure layer for that economy. Five integrated pillars, packaged as a playable JRPG world. Builder is the flagship, a gamified agent orchestrator you play through in a browser. Describe a product in plain language and a team of agents plans, builds, and ships it. Marketplace gives creators a neutral storefront. Banking meters agent execution the way utilities meter electricity. Registry is cryptographic identity for the agent layer. Protocol preserves each model's native dialect across vendors instead of forcing a single one.

This submission was constructed by 54 specialist Claude Opus 4.7 agents over 5 days, orchestrated via formal multi-version handoff documents (V1 through V7). The submission itself ran the manual workflow that NERIUM Builder is designed to replace, one last time. The product's origin story is the product's pitch.

Open source MIT. github.com/Finerium/nerium

---

## Tech stack

**Frontend.** Next.js 15 App Router with React Server Components at project root `app/`. Tailwind CSS v4 with OKLCH design tokens. Phaser 3.90 for the browser game at `/play`. Framer Motion plus GSAP for landing transitions. Howler.js for audio (Euterpe contract). Zustand for client state. Three.js r128 reserved for the post-hackathon `/leaderboard` surface.

**Backend.** Python FastAPI wrapped with Mangum as a single Vercel Serverless Function (`api/index.py`). Vercel Postgres provisioned via Neon iad1 region with Row-Level Security per tenant. Upstash Redis Singapore region over `rediss://` TCP for sessions, rate limits, and Hemera flag bootstrap. Vercel Cron Jobs hit two HTTP entries (daily trust refresh 02:00 UTC, weekly key rotation Sunday 03:00 UTC). Vercel Blob iad1 region for the 96 AI-generated game assets. Stripe in test mode for the Banking pillar checkout flow, gated behind a Hemera feature flag.

**AI runtime.** 100 percent Anthropic Opus 4.7 for the reasoning layer of the shipped build. Single Sonnet 4.6 exception for the Cassandra Prediction Layer (high-volume Monte Carlo). No Gemini, OpenAI, Llama, or Higgsfield in the reasoning path. Asset generation is scoped separately per `docs/adr/ADR-override-antipattern-7.md`: CC0 packs (Kenney plus OpenGameArt Warped City plus Oak Woods brullov plus OpenGameArt Steampunk) plus Opus 4.7 procedural SVG and Canvas. fal.ai Nano Banana 2 is authorized in principle but ships dormant per `_meta/RV_PLAN.md` RV.14 and the personal fund USD 0 constraint.

**Tooling.** Claude Code CLI (specialist execution, 54 active agents across V1 through V7). Claude Design (landing page mockup via Cowork). Claude.ai chat (orchestration across V1 through V7 handoffs).

**Observability.** structlog only at submission. No OpenTelemetry, no Grafana, no Prometheus on the deployed environment. Logs flow through Vercel structured log capture for the FastAPI lambda; Next.js logs flow through Vercel native edge log.

---

## Quick start

```
git clone https://github.com/Finerium/nerium
cd nerium
npm install
npm run dev
```

Open `http://localhost:3000/` for the landing page. Open `http://localhost:3000/play` for the Phaser browser game.

Optional backend (Python 3.12 plus, asyncpg + alembic + arq required):

```
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # fill in secrets locally only, never commit
alembic upgrade head
uvicorn src.backend.main:app --reload --port 8000
```

The backend forwards to Anthropic only for the BYOK Builder live runtime. Scaffold ships with theatrical Builder demo by default, no API key required.

---

## Demo

Watch the 3-minute hackathon submission demo on YouTube:

[https://youtu.be/DJQXitRa1VE](https://youtu.be/DJQXitRa1VE)

Embedded above the fold on the landing page hero at `https://nerium-one.vercel.app`.

Script and timing breakdown lives at [`docs/submission/demo_script.md`](./docs/submission/demo_script.md).

The 100 to 200 word written summary lives at [`docs/submission/100_to_200_word_summary.md`](./docs/submission/100_to_200_word_summary.md).

---

## Built for

Cerebral Valley plus Anthropic hackathon, April 2026 ("Built with Opus 4.7"). 5-day intensive build window, solo team, $500 API credit budget, 95 percent Opus 4.7 model distribution. Submission deadline Senin 27 April 07:00 WIB hard cutoff (April 26 8:00 PM EDT).

Judging criteria weights: Impact 30 percent, Demo 25 percent, Opus 4.7 Use 25 percent, Depth 20 percent. Special prize target: "Best Managed Agents Use" $5K.

---

## Managed Agents discipline

This submission interprets "Claude Managed Agents" as the discipline of structuring, orchestrating, and governing Claude agents at scale. Under that reading, NERIUM ships 54 specialist Claude Code agents authored in `.claude/agents/`, coordinated via formal multi-version handoff documents at `_meta/orchestration_log/` (V1 through V7). Each agent has a defined role, dependency contract, ferry discipline, and 19/19 self-check verification before commit. Multi-version handoff documents capture every locked decision, anti-pattern enforcement, ferry override, and ship summary at the moment of authoring. The audit trail is visible in the repository.

The orchestration roster includes:

- 22 specialist agents shipped in the initial wave (Pythia, Hephaestus, Apollo, Cassandra, Helios, Athena, Demeter, Tyche, Hecate, Proteus, Erato, Urania, Dionysus, Thalia, Triton, Morpheus, Eos, Artemis, Coeus, Dike, Rhea, Phoebe)
- 12 production specialists (Heracles, Harmonia, Marshall, Nemea, Kalypso, Nyx, Linus, Boreas, Helios-v2, Sekuri, Aether-Vercel)
- 8 infrastructure agents (Aether, Khronos, Hemera, Pheme, Chione, Selene, Crius, Astraea)
- 12 wave-2 specialists (Hyperion, Iapetus, Plutus, Tethys, Eunomia, Nike, Kratos, Phanes, Moros, Epimetheus, Metis-v3, Pythia-v3)

The Sekuri agent (V6-authored, prompt at `.claude/agents/sekuri.md`) is itself a meta-management agent. Sekuri ships pre-canned templates that classify user prompts into complexity tiers (small=4 agents, medium=8, large=14) and propose multi-vendor agent structures with per-agent vendor routing. End-users of NERIUM Builder thus inherit the same managed-agent orchestration pattern that constructed this submission.

This is distinct from but complementary to Anthropic's Managed Agents product (the `/v1/sessions` cloud-hosted lifecycle endpoint). The Heracles `AnthropicManagedExecutor.ts` ships as live-ready runtime integration that any user with their own Anthropic API key can invoke via the bring-your-own-key pattern at the `/v1/builder/sessions/live` endpoint. Theatrical fallback (Sekuri pre-canned templates) is presented to visitors without API keys; live runtime invocation activates for judges who provide their own.

The recursive automation thesis: NERIUM was built by managing 54 Claude agents through manual multi-version handoff orchestration, and NERIUM's Builder pillar gives that exact capability to its users. The product literally built itself by running the workflow it automates, one last time.

---

## Production deploy

Live URL: [nerium-one.vercel.app](https://nerium-one.vercel.app)

The submission is live at a single Vercel project that hosts both the Next.js frontend and the FastAPI backend through a Mangum ASGI adapter. The same domain serves the public landing, the `/play` Phaser slice, the marketplace, and every `/v1/*` and `/api/*` route.

```
vercel link
vercel env pull .env.local
vercel env add UPSTASH_REDIS_URL production
vercel env add STRIPE_SECRET_KEY production
vercel env add STRIPE_PUBLISHABLE_KEY production
vercel env add STRIPE_WEBHOOK_SECRET production
vercel env add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY production
vercel env add JWT_SECRET production   # generate via: openssl rand -hex 64
DATABASE_URL=$(grep ^POSTGRES_URL_NON_POOLING= .env.local | cut -d= -f2- | tr -d '"') alembic upgrade head
vercel --prod
```

### Honest claims for the deployed surface

1. **Stripe runs in test mode only.** Pre-Atlas business entity registration. The Stripe live mode key is never set on the deployed environment; live mode is additionally gated behind the Hemera flag `billing.live_mode_enabled`.
2. **Builder ships in theatrical demo mode by default.** The live runtime that spawns Managed Agents is gated behind the Hemera flag `builder.live` which is seeded `false`. Backend routes that would otherwise spawn an agent return HTTP 403 (`builder_not_enabled`) at the Kratos whitelist gate. `ANTHROPIC_API_KEY` is intentionally absent from the deployed environment, so even a flag flip cannot reach the Anthropic Managed Agents API without an additional secret rotation.
3. **Multi-vendor live runtime gated.** The Crius vendor adapter dispatcher exists end-to-end but ships behind a feature flag. The `/builder` UI surfaces vendor selection as a UX preview only.
4. **54 plus specialist agents constructed via Opus 4.7.** The codebase was built by a 54-agent specialist roster across four waves (foundation, deep build, integration, polish). Every reasoning-layer agent ran on Opus 4.7 except a single Sonnet 4.6 exception for the Cassandra Prediction Layer per `CLAUDE.md` budget section.
5. **Vercel Blob 10 GB free tier exhausted.** A1 inline rescue migrated 96 active assets to `public/assets/ai/` static path, served from Vercel CDN. Original Blob URL fallback retained in manifest for future re-migration.
6. **Voiceover and music generated via Gemini 2.5.** The 3-minute submission demo voiceover with bundled background cyberpunk synthwave music was generated via Gemini 2.5. Demonstrates further multi-vendor AI usage. Acceptable per hackathon rules: build reasoning is Anthropic-only, media generation is allowed across vendors.

### Try the live Builder runtime (BYOK)

Builder ships in theatrical demo mode by default. Judges who want to see the real Builder runtime invoke against Anthropic can opt in via Bring Your Own Key (BYOK).

- The Apollo Workshop dialogue advances to a runtime choice modal after you accept the proposed agent structure. Theatrical (the default) plays the canned spawn animation. Live opens an input field for your own Anthropic API key.
- The key is stored in `sessionStorage` only. It is cleared when you close the tab. NERIUM does not log, store, or transmit your key. There is no NERIUM-side database row, no NERIUM-side Redis key, no log line that contains the key value.
- Live runs route through a stateless backend forwarder at `POST /v1/builder/sessions/live`. The forwarder receives the key in the request body, sets it as the `x-api-key` header on a single Anthropic Messages API call, proxies the SSE stream back to the browser, and the local variable falls out of scope at end of request.
- All Anthropic usage charges go to your Anthropic account, not to NERIUM. We do not pay for or rate-share your usage.
- A client-side counter caps live runs at 5 per browser session via `sessionStorage`. The cap is intentionally conservative.
- On any error path (timeout, network failure, malformed key, upstream 401), the UI silently falls back to the canned theatrical response with a small toast indicator. The demo never breaks.

---

## Meta-narrative

NERIUM built itself by running the manual workflow it automates, one last time, for this hackathon.

I lived a 47-agent 9-phase 106-step pipeline manually for an earlier project (Investment AI IDX blueprint). I know every handoff, every dependency, every failure mode. The hackathon build is the same pattern, one more time. An orchestrator in chat. A contract authority. A prompt author. 54 Workers running in parallel terminals with `--dangerously-skip-permissions` enabled. The whole stack that NERIUM Builder is designed to replace.

The product's origin story is the product's pitch. Builder collapses the manual meta-orchestration into a single conversational interface. The workflow that built NERIUM is literally what NERIUM replaces.

---

## Credits

- Voice anchor: [`_meta/NarasiGhaisan.md`](./_meta/NarasiGhaisan.md) (23 sections, mandatory reading for every agent)
- Orchestration log: [`_meta/orchestration_log/INDEX.md`](./_meta/orchestration_log/INDEX.md) (V1 through V7 audit trail)
- ADR override: [`docs/adr/ADR-override-antipattern-7.md`](./docs/adr/ADR-override-antipattern-7.md)
- Asset credits: [`public/assets/CREDITS.md`](./public/assets/CREDITS.md)
- Submission summary (100 to 200 words): [`docs/submission/100_to_200_word_summary.md`](./docs/submission/100_to_200_word_summary.md)
- Demo video script (3 minutes): [`docs/submission/demo_script.md`](./docs/submission/demo_script.md)
- Submission checklist: [`SUBMISSION_CHECKLIST.md`](./SUBMISSION_CHECKLIST.md)
- Discord: `nerium0leander`
- GitHub: [`github.com/Finerium/nerium`](https://github.com/Finerium/nerium)

---

## License

MIT. See [LICENSE](./LICENSE) for full text. Open source from day one, per the hackathon mandate and by my own preference.

---

Ghaisan Khoirul Badruzaman (GitHub `Finerium`). First-year Politeknik Negeri Bandung Teknik Informatika student, Indonesia. Cerebral Valley plus Anthropic hackathon submission, April 2026.
