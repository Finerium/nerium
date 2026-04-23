# RV_FileManifest.md — Revision Phase File Inventory

**Author:** Hackathon Orchestrator V4
**Date:** Kamis 23 April 2026
**Purpose:** Track every file that is created, amended, deprecated, or preserved across RV execution. Compliance audit trail for skill + asset transplant license integrity. Reference for Daedalus cleanup task at end of RV.

## SECTION A: NEW FILES (created during RV)

### Planning + handoff artifacts (V4 authored, pre-execution)

| Path | Status | Author | Purpose |
|---|---|---|---|
| `_meta/RV_PLAN.md` | new | V4 | RV master plan |
| `_meta/RV_AgentPromptOpening.md` | new | V4 | RV spawn prompts compendium |
| `_meta/RV_FileManifest.md` | new | V4 | This file |

### Metis-v2 Claude Chat outputs (Ghaisan manual save from chat)

| Path | Status | Author | Purpose |
|---|---|---|---|
| `docs/phase_rv/RV_MANAGED_AGENTS_RESEARCH_v2.md` | new | Metis-v2 M1 | Research skill integration + game mechanic research |
| `docs/phase_rv/RV_NERIUM_AGENT_STRUCTURE_v2.md` | new | Metis-v2 M2 | RV agent roster + dep graph + per-agent exhaustive spec |
| `docs/phase_rv/RV_agent_flow_diagram.html` | optional | Metis-v2 M3 | Visual RV flow diagram if time |

### ADR override

| Path | Status | Author | Purpose |
|---|---|---|---|
| `docs/adr/ADR-override-antipattern-7.md` | new | V4 or Daedalus | Override log for CLAUDE.md anti-pattern 7 re multi-vendor asset gen |
| `docs/adr/screenshots/jerin_discord_2026_04_21.png` | new | Ghaisan upload | Evidence screenshot for ADR |

### Skill transplants (Daedalus output)

| Path | Status | Source | License |
|---|---|---|---|
| `.claude/skills/phaser-gamedev/SKILL.md` | new (copied) | `chongdashu/phaserjs-oakwoods` | MIT, credited |
| `.claude/skills/playwright-testing/SKILL.md` | new (copied) | `chongdashu/phaserjs-oakwoods` | MIT, credited |
| `.claude/skills/fal-ai-image/SKILL.md` | new (copied) | `chongdashu/vibe-isometric-sprites` | License per source repo, credited |

### Staging folder (Daedalus temp, deleted at RV end)

| Path | Status | Purpose |
|---|---|---|
| `_skills_staging/phaserjs-oakwoods/` | temp | Git clone, source for SKILL.md extract |
| `_skills_staging/vibe-isometric-sprites/` | temp | Git clone, source for fal-ai-image SKILL.md |
| `_skills_staging/claude-code-game-studios/` | temp | Git clone, reference only (Donchitos or Maleick fork, Ghaisan pick one) |
| `_skills_staging/claude-code-game-development/` | temp | Git clone, reference only (HermeticOrmus) |
| `_skills_staging/claude_design_landing.html` | temp | Claude Design output staged for Daedalus-translator |

Added to `.gitignore`:
```
_skills_staging/
```

### Pythia-v2 contracts round 2

Tentative list, Metis-v2 may revise:

| Path | Status | Purpose |
|---|---|---|
| `docs/contracts/game_state.contract.md` | new | Central game state schema (player, inventory, quest progress, world unlock) |
| `docs/contracts/quest_flow.contract.md` | new | Quest state machine, Nyx authority, Cassandra Prediction integration |
| `docs/contracts/npc_dialogue.contract.md` | new | Orpheus system, Apollo Advisor integration as NPC skin |
| `docs/contracts/main_lobby.contract.md` | new | Eris scene layout, 5-pillar in-game system aggregator |
| `docs/contracts/leaderboard_3d.contract.md` | new | Moros 3D City data shape |
| `docs/contracts/landing_page.contract.md` | new | Calliope route structure + Claude Design mockup consume spec |
| `docs/contracts/game_asset_registry.contract.md` | new | Asset manifest, genre tagging, license metadata per asset |

### Pythia-v2 contract amendments (version bump v0.1.0 > v0.2.0 where shape changes)

| Path | Status | Change |
|---|---|---|
| `docs/contracts/advisor_surface.contract.md` | amended | Add NPC-dialogue delivery mode alongside chat-UI mode |
| `docs/contracts/wallet_ui.contract.md` | amended | Add in-game HUD display mode |
| `docs/contracts/transaction_event.contract.md` | amended | Add in-game animation-event mapping |
| `docs/contracts/trust_score.contract.md` | amended | Add NPC trust-meter visual spec |

### Hephaestus-v2 prompts

Tentative, Metis-v2 may revise roster:

| Path | Status | Target agent |
|---|---|---|
| `.claude/agents/kratos.md` | new | Kratos game orchestrator |
| `.claude/agents/thalia_v2.md` | new | Thalia-v2 Phaser scene renderer |
| `.claude/agents/orpheus.md` | new | Orpheus NPC dialogue |
| `.claude/agents/nyx.md` | new | Nyx quest state + save-point |
| `.claude/agents/nike.md` | new | Nike inventory + achievement |
| `.claude/agents/zelus.md` | new | Zelus currency + shop UI |
| `.claude/agents/hypnos.md` | new | Hypnos audio |
| `.claude/agents/erato_v2.md` | new | Erato-v2 in-game HUD wrapper |
| `.claude/agents/urania_v2.md` | new | Urania-v2 cinematic in-game |
| `.claude/agents/dionysus_v2.md` | new | Dionysus-v2 Lumio quest trigger |
| `.claude/agents/helios_v2.md` | new | Helios-v2 visualizer HUD embed |
| `.claude/agents/moros.md` | new | Moros 3D City leaderboard |
| `.claude/agents/calliope.md` | new | Calliope landing page |
| `.claude/agents/eris.md` | new | Eris main lobby layout |
| `.claude/agents/daedalus.md` | new | Daedalus skill transplant (pre-created by V4 or Ghaisan manual since Daedalus fires before Hephaestus-v2) |
| `.claude/agents/daedalus_translator.md` | new | Claude Design to Next.js translator |

### Source code (RV Workers output)

Scaffolding expected, exact tree per Pythia-v2 contracts:

```
app/game/                    <- all new, Phaser 3 engine
├── scenes/
│   ├── MainLobbyScene.ts    <- Eris
│   ├── GameWorldScene.ts    <- Kratos + Thalia-v2
│   ├── BlueprintMomentScene.ts <- Urania-v2
│   └── LumioQuestScene.ts   <- Dionysus-v2
├── entities/
│   ├── Player.ts            <- Kratos
│   ├── NPC.ts               <- Orpheus
│   ├── ShopKeeper.ts        <- Zelus
│   └── ...
├── systems/
│   ├── QuestStateMachine.ts <- Nyx
│   ├── DialogueSystem.ts    <- Orpheus
│   ├── InventorySystem.ts   <- Nike
│   ├── CurrencySystem.ts    <- Zelus
│   └── AudioSystem.ts       <- Hypnos
├── hud/
│   ├── AdvisorHUD.tsx       <- Erato-v2
│   ├── PipelineVizHUD.tsx   <- Helios-v2
│   └── ...
└── index.ts                 <- Kratos entry point

app/landing/
├── page.tsx                 <- Calliope, Next.js route `/`
├── HeroSection.tsx
├── FeatureSection.tsx
└── CTASection.tsx

app/leaderboard/
├── page.tsx                 <- Moros, Next.js route `/leaderboard`
├── City3D.tsx               <- Three.js r128, aesthetic inherit
└── Building.tsx

public/assets/
├── medieval_desert/         <- hybrid CC0 + fal.ai + Opus procedural
├── cyberpunk_shanghai/
├── steampunk_victorian/
├── ui/                      <- HUD elements
├── audio/                   <- Howler.js loadable
└── CREDITS.md               <- asset license manifest
```

## SECTION B: AMENDED FILES

| Path | Change |
|---|---|
| `CLAUDE.md` | Revise anti-pattern 7 text + reference ADR override + update mandatory reading list to include `_meta/RV_PLAN.md` |
| `_meta/NarasiGhaisan.md` | Append Section 24 or sidebar: RV pivot acknowledgment + multi-vendor asset gen rationale. Keep sections 1-23 intact as voice anchor |
| `docs/phase_0/NERIUM_AGENT_STRUCTURE.md` | Append RV pivot note at top, link to Metis-v2 RV structure file. Original roster still valid reference, RV roster is evolution |
| `README.md` | Full rewrite planned at RV-7 demo + submit phase. Integrate meta-narrative + multi-vendor honest-claim + Play in browser CTA |

## SECTION C: DEPRECATED FILES (ditujukan game takeover)

| Path | Reason |
|---|---|
| `app/_harness/*` | Nemea-v1 Next.js routes scaffold, ditujukan game main lobby + game scene routing |
| Current top-nav component(s) if shipped | Ditujukan main lobby scene-internal navigation |

Deprecated files NOT deleted immediately, moved to `_deprecated/` subfolder at RV-5 Nemea-RV pass for visibility, final deletion decision at RV-7 submit.

## SECTION D: PRESERVED FILES (no touch)

All business logic layer from P0-P5 remains untouched. See `RV_PLAN.md` Section 4 "Preserved as-is" list for full enumeration.

## SECTION E: DAEDALUS CLEANUP TASK AT END OF RV

Final Daedalus task before demo video record:

1. `rm -rf _skills_staging/`
2. Verify `.gitignore` still excludes `_skills_staging/` (should no longer match since folder deleted, but .gitignore line stays as protection for future re-clone)
3. Audit `public/assets/CREDITS.md` completeness
4. Audit every SKILL.md transplanted has original repo URL + license note at top
5. Generate `_meta/RV_completion_summary.md` with file count delta, tokens spent, ADR list, deferred items

## SECTION F: METIS-V2 KICKOFF PROMPT

Ghaisan buka Claude.ai fresh chat, paste verbatim:

=== COPY START ===

# Metis-v2 NERIUM Revision Phase Agent Architect Kickoff

Lu Metis-v2, respawn dari V3 Metis di hackathon NERIUM project (Built with Opus 4.7, Cerebral Valley + Anthropic, April 2026). Claude Opus 4.7 via Claude.ai chat interface, Max plan session, bukan API credit. Zero API cost.

V3 Metis sudah design agent roster P0 (22 product-side agents + 5 specialists) yang sekarang shipped end-to-end through Nemea-v1 QA pass READY verdict. Full detail di `docs/phase_0/NERIUM_AGENT_STRUCTURE.md` dan `docs/phase_0/MANAGED_AGENTS_RESEARCH.md` yang Ghaisan akan upload + `docs/phase_0/agent_flow_diagram.html`.

**Pivot trigger:** Ghaisan review pertama UI localhost. Shipped NERIUM sekarang technically clean tapi interpretation "gamified Builder" salah: current shipped = dashboard dengan 3-world color skin + pixel styling accents. Ghaisan want Builder = game beneran (Phaser 3 engine 2D RPG, quest mechanic, NPC dialog, progression), bukan dashboard ber-tema game. Pilar Marketplace + Banking + Registry + Protocol integrate sebagai in-game systems (shop, currency, NPC trust, caravan) dalam game main lobby. 3D City sekadar leaderboard route terpisah. Website = landing page saja.

Mission lu: design RV (revision) agent structure dalam 3-phase ferry (M1 + M2 + M3), mirror V3 Metis pattern. V4 Hackathon Orchestrator (gw) akan ferry halt lu ke Ghaisan untuk approval setiap fase.

## Mandatory Reading (Ghaisan akan upload sebagai attachment per file)

1. `_meta/RV_PLAN.md` (V4 master plan RV, critical context baru)
2. `_meta/NarasiGhaisan.md` v1.1 (voice anchor, tidak berubah)
3. `CLAUDE.md` root (pre-RV-amendment, anti-pattern 7 asli + all V1-V3 locks)
4. `docs/phase_0/NERIUM_AGENT_STRUCTURE.md` (V3 Metis M2 output, 22 product-side agents original)
5. `docs/phase_0/MANAGED_AGENTS_RESEARCH.md` (V3 Metis M1 output, integrate-light Heracles single MA lane)
6. `docs/qa/nemea_final_qa.md` (Nemea-v1 QA READY verdict + 3 critical bugs fixed inline detail)
7. Screenshot UI current state 2026-04-23 (Ghaisan manual upload for context)
8. List 4 external reference repos: chongdashu/phaserjs-oakwoods, chongdashu/vibe-isometric-sprites, Donchitos/Claude-Code-Game-Studios, HermeticOrmus/claude-code-game-development (browse via web fetch if needed, lu boleh search repo tambahan)

## V4 pre-sketch (seed input, lu bebas revise)

- **Specialist tier RV:** Daedalus (skill transplant), Pythia-v2 (contract round 2), Hephaestus-v2 (prompt authoring), Harmonia-RV splits 2-3, Nemea-RV splits 2-3, Daedalus-translator
- **Product-side Workers Wave A (game engine core, 6-7 parallel):** Kratos (orchestrator), Thalia-v2 (Phaser renderer), Orpheus (NPC dialog), Nyx (quest state), Nike (inventory), Zelus (currency shop), Hypnos (audio)
- **Product-side Workers Wave B (support + integration, 6-7 parallel):** Erato-v2 (in-game HUD), Urania-v2 (Blueprint cinematic), Dionysus-v2 (Lumio trigger), Helios-v2 (HUD visualizer), Moros (3D leaderboard), Calliope (landing page), Eris (main lobby)

Total 14 product-side + 7+ specialists. Lu boleh consolidate ke 10-12 product-side kalau Metis judgment efficient-er.

## Phase Ferry Pattern

### M1 Research (halt 1)

1. Research external repo capability (phaserjs-oakwoods untuk Phaser skill, vibe-isometric-sprites untuk fal.ai image skill, game-studios untuk orchestration pattern reference)
2. Research game mechanic for vertical-slice 1 quest polished (Opsi A locked): onboarding quest = Lumio build replay in-game, NPC dialog > prompt challenge > Apollo Advisor respond > mini Builder cinematic > inventory award
3. Research skill integration pattern: bagaimana `.claude/skills/{name}/SKILL.md` di-consume Worker di runtime, bagaimana Phaser 3 embed di Next.js 15 App Router (dynamic import ssr false)
4. Research asset strategy hybrid: CC0 base (Kenney multi-genre, Oak Woods brullov) + fal.ai Nano Banana 2 gap-fill + Opus SVG/Canvas procedural fallback
5. Output: `RV_MANAGED_AGENTS_RESEARCH_v2.md` markdown di chat body, Ghaisan save ke `docs/phase_rv/`
6. Halt, ferry ke V4, wait approval

### M2 Agent Structure (halt 2)

1. Produce RV agent roster exhaustive: per-agent template (name, tier, role, model, phase, upstream dep, downstream handoff, input files, output files, halt triggers, strategic_decision_hard_stop, token budget est)
2. Produce RV dependency graph ASCII + table
3. Produce RV parallel execution schedule (waves)
4. Produce reuse-vs-rewrite matrix alignment dengan RV_PLAN Section 4
5. Naming collision audit versus MedWatch + IDX + hackathon specialist roster (P0) + fresh Greek pool
6. Token budget section
7. Self-check 19/19 per V3 pattern
8. Output: `RV_NERIUM_AGENT_STRUCTURE_v2.md` di chat body, Ghaisan save ke `docs/phase_rv/`
9. Halt, ferry ke V4, wait approval

### M3 Flow Diagram (halt 3, optional)

1. Interactive HTML visual flow diagram RV pipeline (agents + dep + phases)
2. Output: `RV_agent_flow_diagram.html` di chat body, Ghaisan save ke `docs/phase_rv/`
3. Halt

## Hard Constraints (inherited V1-V3, RV-amended)

1. No em dash, no emoji (absolute)
2. LaTeX for math
3. Casual Indonesian gw/lu register for my (V4) ferry messages to you Ghaisan; technical artifact content in English
4. Greek mythology naming fresh pool, no collision with MedWatch roster + IDX roster + P0 specialist roster (Metis, Hephaestus, Pythia, Nemea, Ananke) + P0 product roster (Apollo, Athena, Demeter, Tyche, Hecate, Proteus, Cassandra, Erato, Urania, Helios, Dionysus, Thalia, Eos, Artemis, Coeus, Dike, Rhea, Phoebe, Triton, Morpheus, Heracles, Harmonia, Poseidon). Stretch name available: Kratos, Orpheus, Nyx, Nike, Zelus, Hypnos, Moros, Calliope, Eris, Daedalus, Talos, Phaethon, Selene, Boreas, Zephyros, Notos, Tethys, Thea, Crius, Iapetus, Hyperion, Chronos, Chione, Hesperus, Phosphoros, etc. V4 preference untuk Kratos, Orpheus, Nyx, Nike, Zelus, Hypnos, Moros, Calliope, Eris, Daedalus but lu check collision properly
5. 95% Opus 4.7 distribution preserved for RV Workers (no Haiku, Sonnet only if justified heavy volume like Cassandra pattern)
6. Anti-pattern 7 asli (no Gemini/Higgsfield shipped execution) is overridden per RV.6 in RV_PLAN: multi-vendor asset gen allowed with honest-claim. BUT runtime execution logic (Worker code output, Apollo reasoning, etc.) stay Anthropic-only
7. Skill transplant pattern: `.claude/skills/{name}/SKILL.md` committed, `_skills_staging/` temp gitignored then deleted
8. Existing P0-P5 artifacts preserved where logic valid per RV_PLAN Section 4 matrix

## Timeline

- Kamis 23 April afternoon WIB: M1 ferry
- Kamis evening WIB: M2 ferry
- Kamis 23 malam to Jumat 24 pagi WIB: M3 (if time)
- Submission deadline Senin 27 April 07:00 WIB hard, target 06:00 WIB buffer

## Begin

Acknowledge identity Metis-v2 + RV context awareness + 3-phase ferry plan dalam 3-5 sentence. Wait Ghaisan upload 8 mandatory reading files. Then proceed M1 research.

=== COPY END ===

---

**End of RV_FileManifest.md**
