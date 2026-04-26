# NERIUM

**Infrastructure for the AI agent economy.**

Built with Opus 4.7 for the Cerebral Valley plus Anthropic hackathon, April 2026.

---

## The pain

Indie creators build MCP servers, subagent definitions, and automation workflows. They post on X and Discord for free because no neutral marketplace exists. A restaurant automation agent ends up on a one-off website built by the creator, because Claude Skills, GPT Store, MCP Hubs, and the other seven vendor-locked storefronts each only serve their own build tool. Buyers dig through those eight storefronts, DM the creator on Twitter, and pay via PayPal. The agent economy exists. It just exists in fragments.

## What is NERIUM

NERIUM is the infrastructure layer for that economy, composed of five pillars that each stand alone as a product surface and together form an integrated stack.

1. **Builder (hero).** Gamified agent orchestrator. You play through a Phaser 3 browser game at `/play`. Describe what you want in plain language and a team of AI agents plans, builds, tests, and ships the software for you. Pick the model strategy (all Opus, collaborative across Anthropic tiers, multi-vendor, or let the orchestrator decide). Builder replaces the manual meta-orchestration that sits above every current AI coding tool.
2. **Marketplace.** An open neutral storefront for AI agents, MCP servers, and automation workflows. Creators list once and sell across vendors. Buyers discover with a single account. Living templates let you buy a niche agent and customize it automatically via Builder.
3. **Banking.** Usage-based billing for agents that operate live. Stripe for the agent economy. Charge per execution the way utilities charge per kilowatt-hour.
4. **Registry.** Identity, trust score, and audit trail per agent. The DNS of the AI agent layer. Every agent has a verifiable identity card.
5. **Protocol.** A translation layer across vendors. Claude keeps its XML tags, Gemini speaks native, and the glue layer preserves the uniqueness of each model rather than forcing a single universal dialect.

Positioning: AWS plus Stripe plus DNS plus HTTP for the agent economy.

## Builder thesis

Every current AI coding tool replaces the tukang (the code-typing human). Cursor, Claude Code, Bolt, Lovable, Replit Agent, they all sit at the craftsman layer. Builder sits at the arsitek layer, one step up. Describe the product, Builder spawns the architect agent, the architect designs the structure, the structure is handed to a prompt author, the prompt author generates worker prompts, workers execute in parallel, output is assembled and deployed. The user approves at strategic checkpoints and never touches a handoff.

That pattern is what this repository literally ran to build itself. See the meta-narrative below.

---

## Demo video

Coming soon. A 3-minute demo video will be published here after submission. Script draft lives at [`docs/submission/demo_script.md`](./docs/submission/demo_script.md). The 100 to 200 word summary lives at [`docs/submission/100_to_200_word_summary.md`](./docs/submission/100_to_200_word_summary.md).

## Try the vertical slice

The RV vertical slice is a Phaser 3 browser game at the `/play` route. Apollo Village main lobby, Lumio onboarding quest, mini Builder cinematic, inventory reward on completion. Everything is cached locally, no keys required to play the demo. The landing page at `/` is the public-facing intro.

---

## Tech stack

Frontend
- Next.js 15 (App Router, React Server Components at project root `app/`)
- Tailwind CSS v4 (OKLCH design tokens)
- Phaser 3.90 (game engine for the `/play` vertical slice)
- Framer Motion, GSAP
- Howler.js (audio layer, Euterpe integration)
- Zustand (client state, narrow-selector pattern for HUD)
- Three.js r128 (reserved for `/leaderboard` post-hackathon surface)

Backend and AI
- Python FastAPI (NERIUM runtime backend, post-hackathon)
- SQLite (persistence, post-hackathon)
- Anthropic Python SDK with Claude Opus 4.7
- Managed Agents integration for the Heracles lane

Tooling
- Claude Code CLI (specialist execution, 16 active agents across 4 waves)
- Claude Design (landing page mockup via Cowork plugin)
- Claude.ai chat (orchestration and architecture across V1 through V4)

Model distribution for this submission is 100 percent Opus 4.7. Sixteen active agents, no Sonnet, no Haiku. Deterministic high-volume work (sprite slicing, atlas packing, ledger appends, Playwright regression) is delegated to shell scripts invoked by Opus, not to lower-tier inference.

---

## Production Deploy

The submission is live at a single Vercel project that hosts both the Next.js frontend and the FastAPI backend through a Mangum ASGI adapter. The same domain serves the public landing, the `/play` Phaser slice, the marketplace, and every `/v1/*` and `/api/*` route.

Architecture
- Vercel Edge Network and Vercel Serverless Functions for the public surface
- Vercel Postgres provisioned via Neon for primary persistence (multi-tenant Postgres 16 with Row-Level Security per the Aether contract)
- Upstash Redis over a TCP `rediss://` URL for session, rate limiting, and Hemera flag bootstrap
- Vercel Cron Jobs hit two HTTP entries (`/api/cron/trust-refresh` daily 02:00 UTC and `/api/cron/key-rotation` weekly Sunday 03:00 UTC) instead of a long-lived Arq worker
- Stripe in test mode for the Banking pillar checkout flow, gated behind a Hemera feature flag

Reproduce the deploy
```
vercel link
vercel storage add postgres
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

Honest claims for the deployed surface
- **Stripe runs in test mode only.** Pre-Atlas business entity registration. The Stripe live mode key is never set on the deployed environment; live mode is additionally gated behind the Hemera flag `billing.live_mode_enabled`.
- **Builder ships in theatrical demo mode.** The live runtime that spawns Managed Agents is gated behind the Hemera flag `builder.live` which is seeded `false`. Backend routes that would otherwise spawn an agent return HTTP 403 (`builder_not_enabled`) at the Kratos whitelist gate. ANTHROPIC_API_KEY is intentionally absent from the deployed environment, so even a flag flip cannot reach the Anthropic Managed Agents API without an additional secret rotation.
- **Multi-vendor live runtime gated.** Crius vendor adapter dispatcher exists end-to-end but ships behind a feature flag. The `/builder` UI surfaces vendor selection as a UX preview only.
- **54 plus specialist agents constructed via Opus 4.7.** The codebase was built by a 54-agent specialist roster across four waves (foundation, deep build, integration, polish). Every reasoning-layer agent ran on Opus 4.7 except a single Sonnet 4.6 exception for the Cassandra Prediction Layer per `CLAUDE.md` budget section.

## Try Live Builder Runtime

Builder ships in theatrical demo mode by default. Judges who want to see the real Builder runtime invoke against Anthropic can opt in via Bring Your Own Key (BYOK).

How it works
- The Apollo Workshop dialogue advances to a runtime choice modal after you accept the proposed agent structure. Theatrical (the default) plays the canned spawn animation. Live opens an input field for your own Anthropic API key.
- The key is stored in `sessionStorage` only. It is cleared when you close the tab. NERIUM does not log, store, or transmit your key. There is no NERIUM-side database row, no NERIUM-side Redis key, no log line that contains the key value.
- Live runs route through a stateless backend forwarder at `POST /v1/builder/sessions/live`. The forwarder receives the key in the request body, sets it as the `x-api-key` header on a single Anthropic Messages API call, proxies the SSE stream back to the browser, and the local variable falls out of scope at end of request.
- All Anthropic usage charges go to your Anthropic account, not to NERIUM. We do not pay for or rate-share your usage.
- A client-side counter caps live runs at 5 per browser session via `sessionStorage`. The cap is intentionally conservative.
- On any error path (timeout, network failure, malformed key, upstream 401), the UI silently falls back to the canned theatrical response with a small toast indicator. The demo never breaks.

What we do not do
- We do not store your key in any persistent layer.
- We do not echo your key in any log line, structured or unstructured.
- We do not maintain any NERIUM-side `ANTHROPIC_API_KEY` env variable on the deployed environment. The forwarder cannot fall back to a NERIUM key because there is none.
- We do not retain your prompt or your response. The forwarder is stateless and does not write to any database table.

## Local Development

Scaffold assumes Node 20 plus, a modern browser with WebGL, and optionally Python 3.12 plus a recent Claude Code CLI for the orchestration lane. A typical local run:

```
npm install
npm run dev
```

Open `http://localhost:3000/` for the landing page. Open `http://localhost:3000/play` for the Phaser browser game. The backend runner and Managed Agents integration have their own entrypoints that I will document in a follow-up commit post-hackathon.

---

## Meta-narrative

NERIUM built itself by running the manual workflow it automates, one last time, for this hackathon.

I lived a 47-agent 9-phase 106-step pipeline manually for an earlier project (Investment AI IDX blueprint). I know every handoff, every dependency, every failure mode. The hackathon build is the same pattern, one more time. An orchestrator in chat. A contract authority. A prompt author. Sixteen Workers running in parallel terminals with `--dangerously-skip-permissions` enabled. The whole stack that NERIUM Builder is designed to replace.

The product's origin story is the product's pitch. Builder collapses the manual meta-orchestration into a single conversational interface. The workflow that built NERIUM is literally what NERIUM replaces.

## Honest-claim annotations

This submission is held to a hard honest-claim discipline per [`CLAUDE.md`](./CLAUDE.md) Section 7 anti-patterns and [`_meta/NarasiGhaisan.md`](./_meta/NarasiGhaisan.md) Section 16. Four specific annotations:

1. **Demo scope.** The RV vertical slice at `/play` ships one polished quest (Lumio onboarding, mini Builder cinematic, inventory reward). Marketplace, Banking, Registry, Protocol ship as prototype surfaces integrated into the Apollo Village main lobby, not as live products. Full neutral marketplace, real payment rails, cryptographic identity, and multi-vendor protocol negotiation ship post-hackathon.
2. **Multi-vendor asset pipeline.** fal.ai Nano Banana 2 is authorized in principle per [`docs/adr/ADR-override-antipattern-7.md`](./docs/adr/ADR-override-antipattern-7.md) but ships as dormant infrastructure only via [`.claude/skills/fal-nano-banana-sprite/SKILL.md`](./.claude/skills/fal-nano-banana-sprite/SKILL.md). Not invoked in any shipped code path. Reactivation would require a superseding ADR. Personal fund USD 0 constraint documented in `_meta/RV_PLAN.md` RV.14.
3. **Shipped assets.** CC0 packs (Kenney plus OpenGameArt Warped City plus OpenGameArt Steampunk 32x32) plus Opus 4.7 procedural SVG and Canvas only. Brullov Oak Woods (custom permissive, attribution required) is referenced for local clones but ships empty in the committed repo to respect the no-redistribution clause.
4. **Reasoning layer.** Shipped reasoning is 100 percent Anthropic Opus 4.7. No Gemini, OpenAI, Llama, or Higgsfield in the reasoning path of a shipped build. Asset generation is scoped separately per the ADR override above.

---

## Assets

Shipped with CC0 (Kenney plus OpenGameArt Warped City plus OpenGameArt Steampunk 32x32) plus Opus 4.7 procedural SVG and Canvas assets only. Brullov Oak Woods (custom permissive, attribution required) is referenced for local clones but ships empty in the committed repo to respect the no-redistribution clause. Multi-vendor asset pipeline (fal.ai Nano Banana 2) is transplanted via `.claude/skills/fal-nano-banana-sprite/SKILL.md` as dormant infrastructure and is not exercised in this build. Reactivation would require a superseding ADR that rescinds `docs/adr/ADR-override-antipattern-7.md`. Full attribution in [`public/assets/CREDITS.md`](./public/assets/CREDITS.md); machine-readable provenance in `public/assets/ledger/asset-ledger.jsonl`.

---

## License

MIT. See [LICENSE](./LICENSE) for full text. Open source from day one, per the hackathon mandate and by my own preference.

## Credits and links

- Landing page: `/` (Next.js Server Component, `app/page.tsx`, composed of sections under [`src/components/landing/`](./src/components/landing))
- Vertical slice: `/play` (Phaser 3 browser game, `app/play/page.tsx`)
- Submission summary (100 to 200 words): [`docs/submission/100_to_200_word_summary.md`](./docs/submission/100_to_200_word_summary.md)
- Demo video script (3 minutes): [`docs/submission/demo_script.md`](./docs/submission/demo_script.md)
- Asset credits: [`public/assets/CREDITS.md`](./public/assets/CREDITS.md)
- Voice anchor: [`_meta/NarasiGhaisan.md`](./_meta/NarasiGhaisan.md)
- ADR override on anti-pattern 7: [`docs/adr/ADR-override-antipattern-7.md`](./docs/adr/ADR-override-antipattern-7.md)
- Discord: `nerium0leander`
- GitHub: [`github.com/Finerium/nerium`](https://github.com/Finerium/nerium)

---

Ghaisan Khoirul Badruzaman (GitHub `Finerium`). Cerebral Valley plus Anthropic hackathon submission, April 2026.
