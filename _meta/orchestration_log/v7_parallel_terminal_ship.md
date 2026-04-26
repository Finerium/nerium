# V7 Orchestration Log: Parallel Terminal Ship to Submission

**Phase:** Final submission window. Minggu 26 April 2026 ~23:00 WIB through Senin 27 April 2026 ~06:00 WIB.

**Trigger:** V6 context window approaching 80% threshold during the visual asset cycle plus Sekuri integration plus multi-agent ferry coordination plus Vercel deploy iterations plus 3 visual regression fixes plus Phase 0 plus Phase 1 Nemea ship.

**Working dir:** `~/Documents/CerebralvalleyHackathon/`

**Submission cutoff:** Senin 27 April 2026 07:00 WIB hard, 06:00 WIB target window with 1 hour safety buffer.

**Effective work window from V6 to V7 handoff:** approximately 8 hours.

---

## Section 1: V6 to V7 transition state

V6 era closed with:

- 13 SHA Helios-v2 ship S0 through S12 plus Phase 1 procedural file deprecation rename
- 4 Wave A parallel ship SHAs (Hyperion + Astraea, Iapetus + Plutus, ModelSelectionModal, Eunomia + Tethys)
- T5 Sekuri integration ship at commit 6b7d87c
- T6 Aether-Vercel deploy ship across multiple iterations ending at production live URL https://nerium-one.vercel.app
- T7 pixel-art Builder + Marketplace web route ship at commits f0cd19c plus e460119
- Nemea-RV-v2 W4 Phase 0 visual fix + Phase 1 ferry partial ship
- 8 anomaly workarounds documented operating-stable (Upstash Redis URL empty, mcp package omitted, Neon DSN channel binding stripped, TrustedHost vercel.app added, Vercel Python imports module-level bypass, NERIUM secret keys absent, Alembic CLI flag, macOS Finder duplicates)

V6 to V7 handoff document staged at `~/Documents/CerebralvalleyHackathon/_meta/HACKATHON_HANDOFF_V6_TO_V7.md`.

V7 inherited critical reading discipline from V1 through V6 chain plus 30-35 file output bundle staged at `~/Documents/V6READYHANDOFFCEREBRALL/`.

---

## Section 2: V7 strategic decisions

### Decision 2.1: Vercel-only stack lock (inherited from V6, not relitigated)

Frontend Next.js plus Backend FastAPI Mangum Serverless plus Vercel Postgres Neon iad1 plus Upstash Redis Singapore plus Vercel Blob iad1. NO Hetzner self-host migration. NO Cloudflare R2. NO separate observability stack (Grafana, Prometheus removed from active path, structlog only).

### Decision 2.2: 4 parallel terminal coordination

V7 fired 4 parallel terminals to compress remaining work into the 8-hour window:

| Terminal | Scope | Final SHA | Status |
|---|---|---|---|
| T-NEMEA | W4 Phase 1 ferry 4 plus 5b followup, Phase 2 Lighthouse narrow, Phase 3 E2E pack, Phase 4 visual classify-only plus reshoot | 14f6da9 plus 3ef20bc plus a809c45 | SHIP_READY |
| T-ASSET | Vercel Blob suspension diagnostic plus A3 inline rescue 96 assets to public/assets/ai/ | c4a9df1 (diagnostic) plus c2d074b (A3 inline) | SHIP |
| T-WORLD | Apollo Caravan Cyber main-to-main transitions plus 5 sub-area gates plus UI hints | 19a4875 | SHIP |
| T-REGR | 3 visual gameplay fixes (Lights2D intensity 0.6 calibration, NPC world-anchor wander Helios S8 spec, player sprite flipX cheap mirror) | 3d0a138 | SHIP |

### Decision 2.3: Vercel Blob suspension fallback

V6 era 100% data transfer alert was followed by Path A risk-tolerant decision (NOT upgrade Pro $20). T-ASSET diagnostic confirmed 30-day pause kicked in at submission window: all 96 blob URLs returned HTTP 403 "Your store is blocked". V7 elected A3 inline rescue (NOT A1 Pro upgrade, NOT A2 Cloudflare R2 migration). All 96 assets copied to `public/assets/ai/` with sips downsize, manifest regenerated to relative paths, redeploy unblocks production /play.

### Decision 2.4: Demo video stitch via Remotion separate session

The 3-minute submission demo video assembled in a separate Claude Code session at `~/Documents/cerebralDemo-Video/`. Stitch combined 2 segments: Claude Design Session 1 plus Session 2 unzipped HTML iframes plus Gemini-generated voiceover wav with bundled cyberpunk synthwave background music. Asset2 screen record of /play playthrough merged in. Final render `~/Documents/cerebralDemo-Video/out/nerium_demo_final.mp4` approximately 124 seconds, well under 3:00 hard cap.

### Decision 2.5: YouTube unlisted upload

Final video uploaded to YouTube Unlisted at `https://youtu.be/DJQXitRa1VE` (video ID `DJQXitRa1VE`). Embed URL `https://www.youtube.com/embed/DJQXitRa1VE`. Kalypso W4 Phase 1 injects iframe directly into landing page hero replacing the W3 placeholder mp4 video tag.

### Decision 2.6: Form copy drafted ahead of submission window

V7 drafted Cerebral Valley submission form copy for Fields 4 through 9 staged at `_meta/submission/cerebral_valley_submission_form_fill.md` (9985 bytes). Each field is a copy-paste block with reasoning footnote. README content authored Phase 2 mirrors form copy verbatim where appropriate (Field 5 Project Description distilled into README intro, Field 9 Managed Agents block mirrored verbatim into README Section "Managed Agents discipline"). If drift occurs between README and form copy, form copy wins per V7 hierarchy rule.

### Decision 2.7: Kalypso W4 fire post-YouTube-baked

Kalypso W4 final session fires AFTER YouTube URL bake-in to embed the iframe directly. Single comprehensive session covers Phase 0 bug hunt + Phase 1 landing polish + Phase 2 README finalization + Phase 3 SUBMISSION_CHECKLIST + Phase 4 visual snapshot + Phase 6 orchestration log English translation + V6 + V7 action log + INDEX + Phase 5 atomic final commit.

---

## Section 3: V6 to V7 ferry items resolved

### Ferry F1: Vercel Blob 30-day pause active

V7 confirmed via T-ASSET diagnostic at `docs/qa/asset_diagnostic_report.md`. All 96 keys 403. Resolved via A3 inline rescue at commit c2d074b.

### Ferry F2: 3 visual gameplay regressions

Resolved via T-REGR at commit 3d0a138. Lights2D intensity 0.6 calibration in `src/game/visual/lighting.ts`. NPC wander spec implemented in `src/game/objects/NPC.ts` plus `ApolloVillageScene.spawnTintedNpc`. Player sprite flipX cheap mirror in `src/game/objects/Player.ts`.

### Ferry F3: World transitions unreachable beyond Apollo Village

Resolved via T-WORLD at commit 19a4875. Generic TransitionZone helper class wires 4 main-to-main edges (Apollo east, Caravan west + east, Cyber west) plus 4 missing Cyber sub-area entries plus missing Caravan mountain pass entry. All 13 advertised scenes reachable post-ship.

### Ferry F4: 23 obsolete e2e tests post Helios-v2 S11 React HUD removal

Resolved via T-NEMEA Ferry 4 + 5b at commit 14f6da9. Tests retired via `test.describe.skip` with block comment referencing S11 commit 8fadf4b architectural shift. ADR authored at `docs/adr/ADR-S11-react-hud-removal-test-obsolescence.md`.

### Ferry F5: Local dev Turbopack cache corruption

Documented in T-NEMEA Phase 3 report at `docs/qa/nemea_w4_phase3_e2e.md`. Production unaffected (verified via Phase 0 push test plus Phase 4 visual capture). Local Playwright failure inflation classified DELTA_PRE_EXISTING_FRONTEND, NOT NEW_REGRESSION_NEEDS_V7.

---

## Section 4: V7 ferry items deferred to post-submit

1. `apollo_village_scene.spec.ts` tests 2-4 stale inventory (test asserts Phase 0 deleted ambient prop sprites)
2. Builder `live_session.py:226 _proxy_stream` httpx StreamConsumed pre-existing failure
3. Two additional orphaned Arq crons (`registry.identity.cron.key_rotation`, `trust.cron.refresh_scores`) one-line aggregator addition
4. Pricing.spec.ts Starter checkout test failure
5. CyberpunkShanghai mild visual redundancy polish (Phase 0 scope-limited Apollo only)
6. ASSET_KEYS registry / PreloadScene scrub for deleted ambient prop sprites
7. P5 import path rename to Pythia-v4
8. Local dev `.next/` Turbopack cache stale (clear with `rm -rf .next/` before each Playwright run)
9. CONTRIBUTING.md, CODE_OF_CONDUCT.md, CI badges (post-launch polish)

---

## Section 5: V7 ship metrics

- Total commits across V7 era: 5 production commits (T-REGR, T-WORLD, T-ASSET, T-NEMEA P2-4, T-NEMEA P4 reshoot) plus Kalypso final atomic commit
- Backend pytest at submission: 1246 passed / 6 skipped / 2 KNOWN_PRE_EXISTING failures
- Lighthouse production: / 94 Performance, /play 72 Performance
- Production routes 200 OK: 5 (/, /play, /marketplace, /builder, /pricing)
- Asset count rescued via A3 inline: 96 active (368 MB total, served as static CDN per Vercel public/)
- Total NERIUM agent roster: 54 specialist Claude Code agents across V1 through V7 waves
- Agent prompts in `.claude/agents/`: 55 files at submission (54 active plus 1 Sekuri V6 author trail)
- Orchestration log handoff documents: 6 (V1 through V6) plus V7 action log plus INDEX

---

## Section 6: Manual sequence post-Kalypso ship

V7 hands off to Ghaisan for final manual submission tasks:

1. Termly template paste into 3 legal page placeholders (~10 min)
2. Cerebral Valley form fill via staged copy (~5-7 min)
3. Click Submit Project
4. Verify confirmation email
5. Optional screenshot of confirmation page for backup evidence
6. Optional Discord post in `nerium0leander` channel
7. Commit freeze until April 28 12:00 PM ET / April 29 ~02:00 WIB judge clone window

NERIUM hackathon project finalized at Kalypso W4 final commit.

---

## Section 7: Honest-claim discipline locked V7 era

Per NarasiGhaisan Section 16 plus RV.6 ADR override:

- Stripe in test mode at submission. Production Stripe Atlas activation pending (10 to 14 day onboarding).
- Builder live runtime currently disabled by default. Demo flow uses pre-canned Sekuri templates with theatrical agent spawn animation. Live runtime activates via BYOK pattern for judges with own Anthropic API key.
- Multi-vendor model selection UI showcased (Anthropic + Google + OpenAI + Higgsfield + Seedance + Meta + Mistral + Auto). Live runtime invocation at submission is Anthropic-only via Max plan workflow. Multi-vendor live runtime activates per-vendor billing setup post-launch.
- Voiceover generated via Gemini 2.5 with bundled cyberpunk synthwave background music. Demonstrates further multi-vendor AI usage. Acceptable per hackathon rules: build reasoning is Anthropic-only, media generation is allowed across vendors.
- Vercel Blob 10 GB free tier exhausted at submission state, A3 inline rescue served via Vercel CDN public path post-ship.
- 54 plus specialist agents constructed via Opus 4.7. Single Sonnet 4.6 exception for the Cassandra Prediction Layer per CLAUDE.md budget section. No Gemini, OpenAI, Llama, or Higgsfield in the reasoning path of the shipped build.

---

## Section 8: Working style inherited V1 through V7

- Indonesian gw lu casual conversational, English technical artifacts
- No em dash U+2014 absolute, no emoji absolute
- LaTeX for math, Mermaid for diagrams when possible
- Brevity always, brief response discipline
- Daily rhythm 07:00 to 23:00 WIB hard stop per CLAUDE.md (V7 era exempted for submission night, work continues past 23:00 due to Senin 07:00 hard cutoff)
- V7 functions as orchestrator coordinator, NOT executor. Spawn fresh Claude Code agents for code work. Self-execute only when SendMessage tool unavailable plus scope tight.
- Halt-and-ask preferred over silent-assume on ambiguous strategic dimensions
- Ferry strategic decisions to V7, do not auto-decide

---

## Section 9: V7 close summary

V7 closes with the Kalypso W4 final atomic commit. Repository state submission-ready. Manual tasks remaining for Ghaisan: 3 (Termly paste 3 files, Cerebral Valley form submit, optional post-submit confirmation screenshot).

Total NERIUM specialist agent count across V1 through V7: 54 active.

Total orchestration log handoff documents: V1 through V7 plus this V7 action log plus INDEX.

Submission target: Senin 27 April 2026 06:00 WIB.
Hard deadline: Senin 27 April 2026 07:00 WIB.

End of V7 orchestration log.
