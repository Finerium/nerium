# RV_PLAN.md — NERIUM Hackathon Revision Phase Master Plan

**Author:** Hackathon Orchestrator V4 (Claude Opus 4.7 via Claude.ai chat interface)
**Date:** Kamis 23 April 2026 afternoon WIB
**Status:** Active execution plan, post-Nemea-v1 READY verdict, pre-RV-0 kickoff
**Context trigger:** Ghaisan review pertama UI localhost + Nemea screenshots surface fundamental gap: Builder shipped sebagai dashboard + 3-world visual skin, bukan sebagai game. User playability goal tidak tercapai. NarasiGhaisan Section 2 recursive automation thesis implementation salah interpret (game surface only, bukan game experience).

## SECTION 0: RV PIVOT RATIONALE

### What V4 shipped through Nemea-v1

5-pillar NERIUM platform dengan Builder sebagai tab navigation alongside Marketplace / Banking / Registry / Protocol / Advisor. 3 world aesthetic (Medieval Desert + Cyberpunk Shanghai + Steampunk Victorian) applied sebagai color palette per pillar. Blueprint Moment, Lumio cache replay, Prediction Layer, MA integration semua functional. 32 contracts v0.1.0 conformant, 5 integration paths PASS, 0 em dash 0 emoji across 123 files.

Verdict Nemea-v1: **READY** from integration + conformance standpoint. 3 critical bugs fixed inline (Next.js routes scaffold, PostCSS Tailwind wiring, Lumio cache static serve).

### What the review revealed

Visual + UX level gaps not caught by Nemea contract-focus QA:

1. Cyberpunk Shanghai palette lemah, tidak kerasa cyberpunk
2. Medieval Desert dan Steampunk Victorian terlalu mirip, ga ada differentiation
3. Builder disejajarkan dengan 4 pilar lain di navigation, padahal Builder adalah brand utama dan flagship subscription tier
4. Builder experience masih website-style (form + chat surface), bukan immersive game takeover
5. "Gamification" di-interpret sebagai visual theming (pixel art styling di dashboard), bukan game mechanic beneran
6. User tidak ketagihan, tidak ada reason untuk main lagi, tidak ada progression loop

### RV direction locked

**Builder pivot: dashboard ke game beneran.** User masuk Builder = masuk game 2D (Phaser 3 engine), bukan masuk website page. Prompting, revisi, agent structure config semua terjadi in-game sebagai quest mechanic. Marketplace + Banking + Registry + Protocol integrate sebagai in-game systems (shop, currency, NPC faction, multi-vendor caravan) dalam main lobby, bukan tab navigation terpisah.

**3D City jadi leaderboard view terpisah** (single page, `/leaderboard` route). Gedung tertinggi = user yang paling sering complete project dengan Builder. Flex surface, bukan core experience. Reuse aesthetic direction dari V1 `NERIUMcyberpunkcity.html` discovery prototype (aesthetic reference only, NEW WORK ONLY still in effect, code written fresh).

**Website jadi landing page saja.** Hero section + 3 scroll-reveal section + CTA "Play in browser" (embed Phaser) + CTA "Download game" (placeholder post-hackathon). Landing page di-generate via Claude Design workflow di fase akhir, 1 Worker translate mockup ke Next.js component.

**Scope game untuk hackathon demo: Opsi A vertical slice.** Satu quest complete polished end-to-end (onboarding quest = Lumio build replay in-game). User masuk, ketemu 1 NPC, ketemu prompt challenge, Apollo Advisor respond dalam NPC skin, 1 mini Builder run complete in-game, award inventory item. Polished 1 loop beats 3 rough loops untuk 3-min demo video.

### Meta-narrative enhancement

Original: "NERIUM built itself by running the manual workflow it automates, one last time."

RV addition: "NERIUM built itself using the multi-vendor flexibility it advertises." Gemini Nano Banana 2 used untuk asset generation (sprite, tileset, world-specific props) per V3 anti-pattern 7 override (see Section 3 below). Product feature (Multi-vendor mode per NarasiGhaisan Section 3) demonstrated literally by dev workflow. Honest-claim surfaced di README dan asset metadata.

## SECTION 1: RV DECISION LOG (NEW LOCKS)

RV.1 **Builder pivot: game beneran, bukan game-themed dashboard.** Phaser 3 + TypeScript engine. Prompting + agent structure config + quest progression di dalam game scene. Builder route `/game` adalah full-viewport Phaser takeover, bukan Next.js page embedded.

RV.2 **Vertical slice 1 quest polished.** Opsi A locked per Ghaisan decision. Onboarding quest = Lumio build replay in-game. Quest structure: NPC intro dialog > prompt challenge > Apollo Advisor in-NPC-skin respond > mini Builder run cinematic > inventory item award.

RV.3 **Marketplace + Banking + Registry + Protocol integrate sebagai in-game systems.** Main lobby scene house: shop (Marketplace), currency display (Banking), NPC roster with trust meter (Registry), multi-vendor caravan faction (Protocol). Bukan tab navigation terpisah.

RV.4 **3D City leaderboard: separate route `/leaderboard`.** Single-page, 10-20 building placeholder data, aesthetic reference dari V1 `NERIUMcyberpunkcity.html` discovery prototype. Code NEW WORK ONLY per CLAUDE.md anti-pattern. Building height = projects completed metric.

RV.5 **Landing page scope: minimal.** Hero full-viewport + 3 scroll-reveal section + dual CTA. Generated via Claude Design mockup > 1 Worker translate ke Next.js component. Route `/`.

RV.6 **V3 anti-pattern 7 explicitly overridden.** Original lock "No Gemini, Higgsfield, or non-Anthropic model for shipped execution" rephrased to "No non-Anthropic model for shipped execution LOGIC (Worker runtime, Apollo reasoning, etc.)." Asset generation (sprite, tileset, image) via fal.ai Nano Banana 2 ALLOWED with honest-claim annotation in README and asset metadata. Evidence: Joshua Jerin Cerebral Valley confirm 2026-04-21 10:21 PM Discord "Yes you are free to use any tools you may like to code your project." ADR trail di `docs/adr/ADR-override-antipattern-7.md` dengan screenshot evidence committed.

RV.7 **Asset strategy hybrid Opsi 2.** CC0 base (Kenney.nl multi-genre + Oak Woods brullov for Medieval forest baseline) + fal.ai Nano Banana 2 generated untuk fill genre gap (cyberpunk chars + steampunk props + desert buildings) + Opus SVG/Canvas procedural sebagai 3rd fallback. All assets licensed compatible MIT repo, credits in `public/assets/CREDITS.md`.

RV.8 **Skill transplant via staging folder.** `_skills_staging/` di working dir root, gitignored, used by Daedalus untuk git clone external repos + extract SKILL.md files. Transplanted skills go to `.claude/skills/{skill-name}/SKILL.md`, committed. Staging folder deleted at end of RV via Daedalus final cleanup task.

RV.9 **Existing code reuse aggressive.** P0-P5 artifacts preserved where logic still valid. Rewrite layer = UI surface + navigation + visual skin only. Business logic (Apollo Advisor reasoning, Athena BuilderSpecialistExecutor, Cassandra Prediction, Heracles MA lane, Proteus translation, Leads orchestration, contracts v0.1.0) inherits. Reuse-vs-rewrite matrix in Section 4 below.

RV.10 **Parallel aggressive, 6-7 terminal Workers.** Only Metis-v2 Chat + Daedalus + Pythia-v2 + Hephaestus-v2 are solo sequential blockers (dep chain). Post-Hephaestus-v2, all Workers Wave A (6-7 parallel) + Wave B (6-7 parallel) + Harmonia splits (2-3 parallel) + Nemea splits (2-3 parallel) parallelize fully.

RV.11 **Harmonia split into 2-3 parallel sessions.** Early-Harmonia-RV, Mid-Harmonia-RV, Late-Harmonia-RV, each scoped per domain (game scene aesthetics, HUD + dialog UI polish, landing + leaderboard polish). Parallel execution.

RV.12 **Nemea split into 2-3 parallel sessions.** Nemea-integration-v2 (contract conformance + regression), Nemea-visual-v2 (Opus 4.7 computer use screenshot sweep + 3-world diff check), Nemea-game-loop-v2 (Playwright quest E2E test + canvas state verification). Parallel execution with clear report partitioning.

RV.13 **Claude Design fase akhir, independent.** Ghaisan manual generate landing page mockup via claude.ai/design, save HTML output to `_skills_staging/claude_design_landing.html`, single Worker (Daedalus-translator) convert to Next.js component. Claude Design NOT in critical path of game engine build.

RV.14 **Budget override anti-pattern 7 exposure.** fal.ai Nano Banana 2 not covered by $500 Anthropic credit. Ghaisan fund separately if needed (free tier fal.ai limited, consider cap $20-40 USD personal). Track spend mental via fal.ai dashboard. Anthropic credit still $335 remaining target use for Worker authoring + MA runtime + Nemea QA.

## SECTION 2: RV AGENT ROSTER (to be finalized by Metis-v2)

Metis-v2 Claude Chat will formally design agent structure for RV. V4 pre-sketch below as seed input to Metis-v2 kickoff. Metis-v2 may add / reshape / rename, V4 accepts Metis-v2 output.

### Specialist tier (dev-side, not product-side)

- **Metis-v2** (Claude Chat) — RV agent architect, respawn of V3 Metis. 3-phase ferry pattern (M1 research, M2 structure, M3 diagram if time)
- **Daedalus** (Claude Code) — skill transplant + asset staging specialist. Fresh Greek (craftsman), no collision check needed against MedWatch/IDX rosters (Daedalus in MedWatch was different context and role, but we can use Daedalus fresh here OR substitute Talos or similar if explicit collision concern)
- **Pythia-v2** (Claude Code) — contract round 2 specialist, respawn of V3 Pythia for RV additions only
- **Hephaestus-v2** (Claude Code) — prompt authoring specialist, respawn of V3 Hephaestus for RV agents
- **Daedalus-translator** (Claude Code) — Claude Design HTML to Next.js component translator, final fase
- **Harmonia-RV splits** (Claude Code, 2-3 terminals) — aesthetic polish specialists, scoped per domain
- **Nemea-RV splits** (Claude Code, 2-3 terminals) — QA specialists, scoped per verification type

### Product-side Workers (RV, new or rewritten)

Sketch for Metis-v2 to finalize:

**Game engine core (Wave A, ~6-7 parallel):**
- **Kratos** (game scene orchestrator + input handling + scene loader)
- **Thalia-v2** (Phaser 3 world rendering, 3-world multi-genre pixel art, NEW WORK ONLY kepada existing Thalia v1, focus on Phaser scene beneran)
- **Orpheus** (NPC dialogue system, Apollo Advisor integration sebagai NPC skin)
- **Nyx** (quest state machine + progression + save-point, Cassandra Prediction integration)
- **Nike** (inventory + achievement + leaderboard mechanic, Registry trust score integration)
- **Zelus** (currency + shop UI + transaction animation, Banking integration, Rhea reuse)
- **Hypnos** (ambient audio + music + SFX, Howler.js integration)

**Game support + integration (Wave B, ~6-7 parallel):**
- **Erato-v2** (Builder Advisor UI rework: in-game HUD + prompt input + agent structure editor sidebar)
- **Urania-v2** (Blueprint Moment cinematic in-game, reuse existing logic)
- **Dionysus-v2** (Lumio quest integration, cached run trigger from in-game NPC)
- **Helios-v2** (pipeline visualizer embed in HUD, reuse existing)
- **Moros** (3D City leaderboard `/leaderboard` route, Three.js, aesthetic inherit V1 prototype)
- **Calliope** (landing page route `/`, Next.js, Claude Design mockup consume)
- **Eris** (main lobby scene layout, 5-pillar integration as in-game systems aggregator)

14 product-side Workers total. Metis-v2 may reduce or restructure. V4 preference toward lean 10-12 if Metis-v2 suggest consolidation.

## SECTION 3: RV PHASE MAP AND DEPENDENCIES

### Phase map

| Phase | Activity | Agents | Terminals | Duration est | Status |
|---|---|---|---|---|---|
| RV-0 Metis-v2 ferry | RV agent architecture design | Metis-v2 Claude Chat | 1 (chat) | ~2-3 hrs wall | pending Ghaisan kickoff |
| RV-0.5 Skill transplant + asset staging | Git clone + SKILL.md extract + asset placeholder + ADR-override commit | Daedalus | 1 | ~30-45 min | blocked on Metis-v2 M1 |
| RV-1 Contract round 2 | New contracts for game state, quest flow, NPC dialogue, leaderboard, etc. | Pythia-v2 | 1 | ~45-60 min | blocked on Metis-v2 M2 |
| RV-2 Prompt authoring | `.claude/agents/{new}.md` for all RV agents | Hephaestus-v2 | 1 | ~60-90 min | blocked on RV-1 + Metis-v2 M2 |
| RV-3a Workers Wave A | Game engine core | Kratos + Thalia-v2 + Orpheus + Nyx + Nike + Zelus + Hypnos | 6-7 parallel | ~2-3 hrs parallel | blocked on RV-2 |
| RV-3b Workers Wave B | Game support + integration | Erato-v2 + Urania-v2 + Dionysus-v2 + Helios-v2 + Moros + Calliope + Eris | 6-7 parallel | ~2-3 hrs parallel | blocked on RV-3a core subset |
| RV-4 Harmonia-RV splits | Visual polish scoped domain | 2-3 parallel | 2-3 parallel | ~1-2 hrs | blocked on RV-3b |
| RV-5 Nemea-RV splits | QA split per verification type | 2-3 parallel | 2-3 parallel | ~1-2 hrs | blocked on RV-4 |
| RV-6 Claude Design + translator | Landing page mockup + code translate | Ghaisan manual + Daedalus-translator | 1 | ~1 hr | blocked on RV-5 |
| RV-7 Demo + submit | Video script + record + README + submit | 2 parallel (script Worker + video Ghaisan) | 2 | ~2-3 hrs | blocked on RV-6 |

### Dependency graph

```
Metis-v2 Claude Chat (RV agent structure design, 3 ferry halts)
    |
    | (M1 skill research output)
    v
Daedalus (skill transplant + asset staging + ADR override)
    |
    | (skills + assets staged)
    v
Pythia-v2 (contract round 2 for RV additions)
    |
    | (new contracts committed)
    v
Hephaestus-v2 (prompt authoring for RV agents)
    |
    | (all .claude/agents/{rv}.md committed)
    v
+-----------------------+
|                       |
Workers Wave A          Workers Wave B (can partial overlap)
Game engine core        Game support + integration
(6-7 parallel)          (6-7 parallel)
|                       |
+-----------+-----------+
            |
            v
Harmonia-RV splits (2-3 parallel, aesthetic sweep)
            |
            v
Nemea-RV splits (2-3 parallel, QA split)
            |
            v
Claude Design (Ghaisan manual, independent)
            |
            v
Daedalus-translator (landing page translate)
            |
            v
Demo video + README + Submit (Kamis 23 - Senin 27 06:00 WIB)
```

## SECTION 4: REUSE VS REWRITE MATRIX

### Preserved as-is (business logic valid)

- `app/builder/advisor/apollo.ts` (AdvisorAgent class + prompts)
- `app/builder/prediction/cassandra.ts` (Prediction Layer logic + 100-pass simulation)
- `app/builder/visualizer/Helios *.tsx` (pipeline visualizer components, reuse in in-game HUD)
- `app/builder/integration/heracles/*.ts` (MA integration, all Heracles artifacts)
- `app/builder/executor/BuilderSpecialistExecutor.ts` (core abstraction)
- `app/shared/events/pipeline_event.ts` + `app/shared/events/handoff_events.ts`
- `app/builder/blueprint/Urania*.tsx` (Blueprint Moment logic, reuse as in-game cinematic)
- `app/builder/lumio/lumio_cache.json` (Dionysus bake output, reuse as in-game quest trigger)
- All 5 Leads `app/{pillar}/leads/*.output.md` + `*.decisions.md`
- `app/protocol/adapters/*` (Proteus translation logic, reuse as caravan multi-vendor)
- `docs/contracts/*.contract.md` v0.1.0 all 32 files (amend where necessary, version bump to v0.2.0 per-file if signature changes)
- `_meta/NarasiGhaisan.md` (voice anchor, no change)

### Amended (surface rewritten, logic preserved)

- `app/builder/advisor/Erato*.tsx` (rewrite as in-game HUD + NPC dialogue wrapper, logic stay)
- `app/marketplace/listing/Eos*.tsx` + `app/marketplace/browse/Artemis*.tsx` + `app/marketplace/search/Coeus*.tsx` (rewrite as in-game shop interaction, logic stay)
- `app/banking/wallet/Dike*.tsx` + `app/banking/stream/Rhea*.tsx` (rewrite as in-game currency HUD + transaction animation, logic stay)
- `app/registry/identity/Phoebe*.tsx` (rewrite as in-game NPC trust meter display, logic stay)
- `app/protocol/adapter-ui/Morpheus*.tsx` + `app/protocol/translation-demo/Triton*.tsx` (rewrite as in-game caravan faction UI, logic stay)
- Thalia v1 artifacts `app/builder/worlds/*` (rewrite completely as Phaser 3 scene, V1 Thalia was Pixi.js + CSS filters, not real game engine)

### Deprecated (Nemea-v1 scaffold, ditujukan game takeover)

- `app/_harness/*` Next.js routes scaffold bikinan Nemea-v1 Critical Fix #1 (page.tsx per-pillar). Ditujukan navigation game lobby + `/game` + `/leaderboard`.
- Current Next.js top-level navigation component. Replaced by game main lobby.

### New (RV additions)

- `app/game/*` (Phaser 3 scene root + all game code)
- `app/landing/*` (landing page from Claude Design mockup)
- `app/leaderboard/*` (3D City route)
- `.claude/skills/phaser-gamedev/SKILL.md` (transplanted)
- `.claude/skills/playwright-testing/SKILL.md` (transplanted)
- `.claude/skills/fal-ai-image/SKILL.md` (transplanted, use via ADR override)
- `public/assets/{world}/` (game assets per 3 world, genre-scoped)
- `docs/adr/ADR-override-antipattern-7.md` (override log)
- `docs/phase_rv/RV_MANAGED_AGENTS_RESEARCH_v2.md` (Metis-v2 M1)
- `docs/phase_rv/RV_NERIUM_AGENT_STRUCTURE_v2.md` (Metis-v2 M2)
- `docs/contracts/{new_game_contracts}.contract.md` (Pythia-v2 output)
- `.claude/agents/{new_rv_agents}.md` (Hephaestus-v2 output)

## SECTION 5: BUDGET PROJECTION RV

Anthropic credit platform balance at RV-0 kickoff: ~$335 remaining.

| Phase | Spend estimate | Notes |
|---|---|---|
| Metis-v2 Claude Chat | $0 | Max plan, not API credit |
| Daedalus | $3-5 | Skill transplant, cheap |
| Pythia-v2 | $6-10 | Contract round 2, lighter than round 1 (fewer new contracts than 32) |
| Hephaestus-v2 | $4-6 | Authoring ~10-14 prompt files, less than round 1 22 files |
| Workers Wave A (6-7) | $25-40 | Game engine core, Phaser ground-up |
| Workers Wave B (6-7) | $20-35 | Integration + support |
| Harmonia-RV (2-3) | $8-15 | Aesthetic sweep scoped |
| Nemea-RV (2-3) | $10-20 | QA split + Opus 4.7 computer use screenshots |
| Daedalus-translator | $3-5 | Single Worker translate |
| Demo + submit | $5-10 | Video script authoring |
| MA runtime Heracles (preserved usage) | $0-100 | Cap $150, likely minimal since Heracles authoring done, only runtime spend if live demo MA invocation needed |
| **RV subtotal Anthropic credit** | **$84-246** | Conservative range |
| Buffer | $89-251 | From $335 remaining |
| fal.ai Nano Banana 2 (out of Anthropic) | $20-40 | Ghaisan personal fund, cap recommended |

RV fits within remaining $335 Anthropic credit with healthy buffer. fal.ai asset gen separate.

## SECTION 6: V4 ACTION SEQUENCE POST-THIS-PLAN

1. Produce this file + RV_AgentPromptOpening.md + RV_FileManifest.md + Metis-v2 kickoff prompt (markdown files, Ghaisan download)
2. Ghaisan save RV_PLAN.md + RV_FileManifest.md to `~/Documents/CerebralvalleyHackathon/_meta/`
3. Ghaisan save RV_AgentPromptOpening.md to `~/Documents/CerebralvalleyHackathon/_meta/`
4. Ghaisan commit RV planning docs: `docs: RV-0 master plan + agent prompt compendium + file manifest staged`
5. Ghaisan open Claude.ai fresh chat, paste Metis-v2 kickoff prompt
6. Metis-v2 M1 research ferry > V4 review > Ghaisan approve
7. Metis-v2 M2 agent structure ferry > V4 review > Ghaisan approve + save to `docs/phase_rv/`
8. Metis-v2 M3 diagram ferry (optional if time) > save to `docs/phase_rv/`
9. Ghaisan update CLAUDE.md: anti-pattern 7 revised text + ADR-override-antipattern-7.md added
10. Spawn Daedalus via RV_AgentPromptOpening.md Batch RV-0.5 block
11. Proceed down phase sequence per Section 3

## SECTION 7: DECISION LOG GHAISAN RV (confirmed in chat)

- Gamified = game beneran, not visual only (RV.1)
- Marketplace + Registry + pilar lain integrate as in-game systems (RV.3)
- Website = landing page only (RV.5)
- Builder structure exposed as gameplay element, revisable mid-quest (game design enhancement, baked into Nyx + Erato-v2)
- 3D City as leaderboard, 2D as gameplay (RV.4)
- Opsi A vertical slice 1 quest (RV.2)
- Multi-genre pixel art, all 2D (RV.7)
- Nano Banana 2 allowed with honest-claim, ADR override anti-pattern 7 (RV.6)
- Folder staging in CerebralvalleyHackathon, deleted at end (RV.8)
- Claude Design fase akhir, independent (RV.13)
- fal.ai asset gen out-of-pocket (RV.14)
- 6-7 parallel aggressive, Harmonia + Nemea split (RV.10, RV.11, RV.12)
- Respawn Metis-v2 Claude Chat for agent architecture (per this plan Section 6)

---

**End of RV_PLAN.md**
