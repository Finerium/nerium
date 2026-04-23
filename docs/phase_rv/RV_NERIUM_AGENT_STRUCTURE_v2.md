# NERIUM RV M2 Agent Structure Document v2

## 0. Document meta

- **Version**: v2 (supersedes V3 Metis P0 agent structure 22 product-side + 5 specialist)
- **Date**: April 23, 2026
- **Author**: Metis-v2 (M2 Agent Structure Phase, RV pivot)
- **Handoff target**: V4 ferry to M3 (optional flow diagram) then to Hephaestus-v2 (prompt authoring batch)
- **Status**: DECISION-READY for Hephaestus-v2 consumption, awaiting V4 ferry approval
- **Mandatory reading for downstream agents**: this document, `RV_MANAGED_AGENTS_RESEARCH_v2.md` (M1), `RV_PLAN.md` (V4 master), `CLAUDE.md` (root), `NarasiGhaisan.md` (voice anchor), assigned Pythia-v2 contracts

---

## 1. Executive summary

M2 locks the RV agent roster at **9 product-side workers plus 7 specialists plus 1 reserved**, total 17 agents (16 active plus Thea standby). This collapses the V4 pre-sketch of 14 product-side plus 7 specialist by absorbing Kratos (orchestrator) into Hephaestus-v2 generalist pattern, Nike (inventory) plus Zelus (currency shop) into Erato-v2 React HUD layer, Hypnos into new Euterpe dedicated audio agent, Moros (3D leaderboard) into Kalypso landing page as static mockup for RV-4 deferral, and Eris (main lobby) into Thalia-v2 scene management.

**All 16 active agents run on Claude Opus 4.7**, preserving the "Built with Opus 4.7" hackathon narrative at 100% distribution. No Sonnet, no Haiku. Deterministic high-volume work (sprite slicing, atlas packing, ledger appends, Playwright regression) is handled via script execution invoked by Opus, not inference delegation.

The dependency graph resolves in four waves over roughly 3.5 days. Wave 1 infrastructure (Pythia-v2 contracts, Talos setup plus skills, Talos-translator P0 inventory, Hephaestus-v2 prompt batch) runs Kamis evening into Jumat morning. Wave 2 game engine core (Thalia-v2, Nyx, Linus, Talos asset generation) runs Jumat full day in parallel. Wave 3 support plus polish (Erato-v2, Hesperus, Euterpe, Kalypso) runs Sabtu. Wave 4 integration plus QA (Harmonia-RV splits, Nemea-RV splits) runs Minggu with demo bake on Minggu afternoon for Senin 06:00 WIB target submission.

Total API credit projection for RV: approximately **$185 to $190 of the remaining $500 budget**. Talos dominates at approximately $18 to $22 across three sessions (setup, skills, CC0 curation plus Opus procedural lead). Hephaestus-v2 single-batch session at approximately $22. All other agents between $5 and $15. Margin of $10 to $65 reserved for unforeseen iteration and Ghaisan-triggered revisions. Ghaisan personal fund $0 for external asset generation; fal.ai spend removed entirely.

Three structural commitments carry forward from M1 as non-negotiable: the Phaser-React-Zustand hybrid boundary (React HUD never inside Phaser canvas, Phaser scene never touches React directly), the custom JSON quest and dialogue runtimes (no inkjs, no Yarn Spinner, no behavior trees), and the revised asset hierarchy CC0 Kenney-Oak Woods-Warped City primary plus Opus SVG/Canvas procedural gap-fill, with fal.ai Nano Banana 2 pipeline transplanted as dormant `.claude/skills/` infrastructure for post-hackathon activation only.

---

## 2. Approved decisions inherited from M1 ferry (Ghaisan Gate response)

These decisions are LOCKED and drive all per-agent specifications below.

**Pixel-art resolution**: 32x32 SNES-era uniform across all three worlds (Medieval Desert, Cyberpunk Shanghai, Steampunk Victorian). Cyberpunk does NOT get higher resolution. Differentiation comes from palette plus tile motif plus ambient FX (neon glow, sand particle, steam puff), not resolution tier. Phaser canvas uses `Phaser.Scale.RESIZE` with integer scaling preferred for pixel crispness.

**Audio layer**: Dedicated agent Euterpe (fresh Greek, muse of music, no collision). Scope tight: Howler.js integration wrapper plus Kenney sfx curation plus 3-world ambient loop selection plus quest trigger sfx mapping. Single terminal, approximately 1 to 1.5 hours. NOT absorbed into Kalypso or Talos.

**Mini Builder cinematic**: Scripted Phaser tweens over pre-generated tiles. No fal.ai frame generation. Owned by Thalia-v2. Interface stable via Dionysus-v2 event trigger pattern so post-hackathon upgrade to generated cinematic is a renderer swap.

**Dialogue format escape hatch**: Custom JSON only. No ink `source` field reserved. Ink overhead not justified for vertical slice.

**Thea QA agent**: Reserved, no spawn. Activate only if RV-4 polish phase surfaces real batch-consistency need that inline Claude check-loops inside Talos cannot absorb.

**3D leaderboard**: Isolated `/leaderboard` route, post-MVP. No shared game state. If time tight, collapses to static mockup on landing page (Kalypso owns).

**.codex/skills mirror**: SKIP. Claude Code only. No Codex CLI usage planned.

**Brullov attribution**: `public/assets/CREDITS.md` plus README footer. Owned by Talos (setup phase).

**Roster count**: 9 product-side plus 7 specialist plus 1 reserved. Confirmed.

---

## 3. Agent roster overview

### 3.1 Product-side workers (9 active)

| # | Agent | Tier | Layer | Model | Wave | Primary output |
|---|---|---|---|---|---|---|
| 1 | Talos | Product-side | Infrastructure | Opus 4.7 | W1 plus W2 | `.claude/skills/` (incl. dormant fal.ai transplant), project scaffold, CC0 curation, Opus SVG/Canvas procedural lead, `asset-ledger.jsonl` |
| 2 | Nyx | Product-side | Game engine core | Opus 4.7 | W2 | Quest FSM, `useQuestStore`, `lumio_onboarding.json`, TCE runtime |
| 3 | Linus | Product-side | Game engine core | Opus 4.7 | W2 | Dialogue runtime React reducer, `apollo_intro.json`, `DialogueOverlay` |
| 4 | Thalia-v2 | Product-side | Game engine core | Opus 4.7 | W2 | Phaser scenes, player controller, ApolloVillageScene, mini Builder cinematic tweens |
| 5 | Erato-v2 | Product-side | React HUD | Opus 4.7 | W3 | TopBar, BottomBar, SideBar, PromptInputChallenge, InventoryToast, ModelSelector |
| 6 | Hesperus | Product-side | Visual polish | Opus 4.7 | W3 | Opus SVG HUD chrome, Canvas procedural FX (sand, neon, steam) |
| 7 | Euterpe | Product-side | Audio | Opus 4.7 | W3 | Howler.js wrapper, Kenney sfx curation, ambient loops, cue map |
| 8 | Kalypso | Product-side | Marketing surface | Opus 4.7 | W3 plus W4 | Landing page, hero video placeholder, README, submission package |
| 9 | Thalia-v2 (cinematic sub-phase) | Product-side | Game engine core | Opus 4.7 | W3 | Mini Builder cinematic scene (separate sub-session) |

Thalia-v2 appears twice because the scene-core work in W2 and the cinematic work in W3 are distinct sessions with different upstream dependencies. Same agent definition.

### 3.2 Reserved (1 conditional)

| # | Agent | Tier | Layer | Model | Trigger | Scope if spawned |
|---|---|---|---|---|---|---|
| 10 | Thea | Product-side | Visual QA | Opus 4.7 | RV-4 polish surfaces batch consistency bottleneck | Cross-batch sprite consistency (palette histogram plus silhouette variance), 3-world visual cohesion check |

### 3.3 Specialist tier (7 active)

| # | Specialist | Role | Model | Wave | Splits |
|---|---|---|---|---|---|
| 11 | Pythia-v2 | Modular contract authority round 2 | Opus 4.7 | W1 | single |
| 12 | Hephaestus-v2 | Prompt authoring batch (all 9 plus 1 reserved) | Opus 4.7 | W1 | single batch |
| 13 | Talos-translator | P0 artifact inventory plus reuse-rewrite decisions | Opus 4.7 | W1 | single |
| 14 | Harmonia-RV-A | State plus contract integration check | Opus 4.7 | W4 | split 1 of 2 |
| 15 | Harmonia-RV-B | Visual plus asset integration check | Opus 4.7 | W4 | split 2 of 2 |
| 16 | Nemea-RV-A | Scene plus state regression (Playwright) | Opus 4.7 | W4 | split 1 of 2 |
| 17 | Nemea-RV-B | Visual a11y QA plus landing page audit | Opus 4.7 | W4 | split 2 of 2 |

Harmonia-RV-C and Nemea-RV-C (cross-world cohesion) are reserved splits; spawn only if three worlds land in the vertical slice (currently only Apollo Village lands, with Cyberpunk teaser at caravan transition). Default: not spawned.

### 3.4 Model distribution math

- Active agents: 16 (9 product-side plus 7 specialist)
- Opus 4.7: 16 of 16 = **100%**
- Sonnet 4.6: 0
- Haiku 4.5: 0
- Kickoff target 95% exceeded. Deterministic high-volume work (sprite slicing, atlas packing, Playwright regression, ledger appends) delegated to shell scripts invoked by Opus, not to lower-tier inference.

---

## 4. Per-agent templates

Each template covers: name, tier, role, model, phase or wave, upstream dependencies, downstream handoffs, input files, output files, halt triggers, strategic decision hard-stops, token budget estimate.

### 4.1 Talos

- **Name**: Talos
- **Tier**: Product-side, infrastructure
- **Role**: Consolidated infrastructure owner. Three sub-phases: (a) project setup scaffolding, (b) skill transplant authoring including dormant fal.ai infrastructure for post-hackathon activation, (c) CC0 asset curation (Kenney multi-genre plus Oak Woods brullov plus Warped City) and Opus SVG/Canvas procedural generation lead. Fal.ai Nano Banana 2 pipeline transplanted as `.claude/skills/fal-nano-banana-sprite/SKILL.md` only; no active fal.ai spend in shipped build per Ghaisan personal fund $0 constraint
- **Model**: Opus 4.7
- **Wave**: W1 setup plus skills, W2 CC0 curation plus Opus procedural asset lead
- **Sessions**: 3 (setup, skills, asset curation plus procedural); if token pressure halts one, split into separate terminals
- **Upstream**: Metis-v2 M1 research, V4 RV_PLAN locks, Pythia-v2 `game_asset_registry.contract.md` (CC0 plus Opus procedural fields active, fal.ai fields marked deprecated-reserved) and `asset_ledger.contract.md`
- **Downstream**: Thalia-v2 (sliced spritesheets plus atlas JSON, `phaser-scene-authoring` skill), Nyx (`quest-json-schema` skill), Linus (`dialogue-tree-authoring` skill), Erato-v2 (`zustand-bridge` skill, UI asset fallbacks from Kenney), Hesperus (Opus SVG references), Euterpe (Kenney audio pack pulled to `public/audio/`), Kalypso (README scaffold)
- **Input files**: `RV_MANAGED_AGENTS_RESEARCH_v2.md`, `RV_PLAN.md`, Pythia contracts, V4 locks, Kenney pack list, Oak Woods brullov license notes, Warped City CC0 notes, fal.ai docs (reference only for dormant skill authoring, no active API calls)
- **Output files**:
  - `package.json`, `tsconfig.json`, `next.config.ts` (with `phaser3spectorjs` alias for both Turbopack and webpack), `tailwind.config.ts`, `.gitignore` (including `_skills_staging/`)
  - `.claude/skills/phaser-scene-authoring/SKILL.md` plus `references/` plus `assets/`
  - `.claude/skills/zustand-bridge/SKILL.md`
  - `.claude/skills/quest-json-schema/SKILL.md`
  - `.claude/skills/dialogue-tree-authoring/SKILL.md`
  - `.claude/skills/fal-nano-banana-sprite/SKILL.md` (dormant infrastructure transplant, documented but not exercised in shipped build)
  - `.claude/hooks/validate-commit.sh`, `session-start.sh`, `log-agent.sh`
  - `.claude/settings.json`
  - `lib/falClient.ts` (fal.ai API wrapper authored but not invoked in shipped build, reserved for post-hackathon)
  - `scripts/slice-sprite.py` (Pillow slicer, deferred usage; reserved for post-hackathon fal.ai activation)
  - `scripts/pack-atlas.ts` (free-tex-packer CLI wrapper, used for CC0 Kenney plus Oak Woods plus Warped City tile packing)
  - `scripts/opus-svg-export.ts` (Opus-generated SVG to PNG rasterizer for Phaser texture loads)
  - `public/assets/cc0/kenney-roguelike/` (pulled, primary sprite source)
  - `public/assets/cc0/kenney-ui-rpg-expansion/` (pulled, primary HUD UI source)
  - `public/assets/cc0/kenney-audio-rpg/` (pulled, Euterpe upstream)
  - `public/assets/cc0/warped-city/` (pulled, Cyberpunk Shanghai primary)
  - `public/assets/cc0/oak-woods/` (pulled with brullov attribution, Medieval Desert accent)
  - `public/assets/procedural/` (Opus SVG plus Canvas procedural outputs for gap-fill, rasterized PNGs for Phaser)
  - `public/assets/assets.json` (manifest committed, PNG bulk gitignored if file size pressure)
  - `asset-ledger.jsonl` (append-only log of every CC0 import plus Opus procedural generation: source, license, rasterized dimensions, reviewer decision)
  - `public/assets/CREDITS.md` (brullov, Kenney, Warped City, every CC-BY author)
  - `README.md` honest-claim line (authored by Talos, finalized by Kalypso): "Shipped with CC0 plus Opus procedural assets only. Multi-vendor asset pipeline tested via skill transplant but not exercised in shipped build due to scope constraint."
  - `_skills_staging/` drafting area (gitignored)
- **Halt triggers**:
  - CC0 pack coverage gap surfaces on visual-identity-critical asset with no Opus procedural substitute path
  - Opus procedural generation exceeds 3 iteration attempts on same asset with no acceptable output
  - Any `.claude/skills/<n>/SKILL.md` exceeds 500 lines
  - `pnpm build` fails after scaffold
  - Turbopack `phaser3spectorjs` resolution error not fixed by alias
  - Strict Mode double-mount issue surfaces on first Phaser test
  - CC0 license ambiguity on any pulled asset (escalate to Ghaisan)
- **Strategic decision hard stops** (require V4 ferry approval):
  - Diverging from revised asset hierarchy (CC0 primary, Opus SVG/Canvas procedural gap-fill, fal.ai dormant-only)
  - Activating fal.ai pipeline in shipped build (explicit scope violation, Ghaisan personal fund $0 constraint)
  - Changing 32x32 SNES-era pixel resolution
  - Adding non-Kenney plus non-brullov plus non-Warped-City CC0 source
  - Restructuring `.claude/skills/` layout
  - Skipping brullov attribution in CREDITS.md
- **Token budget**: 120k input plus 50k output aggregate across 3 sessions. Approximately $18 to $22 API. Reduced from initial $25 estimate due to fal.ai subtask removal.

### 4.2 Nyx

- **Name**: Nyx (primordial goddess of night, fresh Greek, no collision)
- **Tier**: Product-side, game engine core
- **Role**: Quest state FSM owner. Authors `useQuestStore` with trigger dispatcher, zod-validated quest JSON schema, `lumio_onboarding.json` vertical slice quest, TCE runtime library, QuestTracker component contract
- **Model**: Opus 4.7
- **Wave**: W2 (after Talos setup plus `quest-json-schema` skill plus Pythia contracts)
- **Sessions**: 1
- **Upstream**: Talos `quest-json-schema` skill plus project scaffold, Pythia-v2 `game_state.contract.md` plus `quest_schema.contract.md`, Hephaestus-v2 `.claude/agents/nyx.md` prompt
- **Downstream**: Linus (dialogue choice effect fires `fireTrigger`), Thalia-v2 (Phaser scene events bubble through bridge to `fireTrigger`), Erato-v2 (QuestTracker component subscribes to `useQuestStore` via narrow selector)
- **Input files**: `RV_MANAGED_AGENTS_RESEARCH_v2.md` Section 3 (game mechanic research), Pythia contracts, `quest-json-schema` skill, `zustand-bridge` skill
- **Output files**:
  - `src/stores/questStore.ts` (Zustand with `subscribeWithSelector`, fields `activeQuests`, `completedQuests`, `stepIndex`, actions `fireTrigger`, `advanceStep`, `completeQuest`)
  - `src/data/quests/_schema.ts` (zod schemas for Quest, Step, Trigger, Condition, Effect)
  - `src/data/quests/lumio_onboarding.json` (9-step quest per M1 Section 3.6 breakdown)
  - `src/lib/questRunner.ts` (TCE dispatcher, pure functions, no React import)
  - `src/components/game/QuestTracker.tsx` (HUD element, React Client Component, narrow selector)
  - `tests/quest.test.ts` (zod validation plus TCE dispatch unit tests)
- **Halt triggers**:
  - Quest JSON fails zod validation on load
  - Circular trigger dependency detected (step A fires trigger that satisfies step A)
  - `fireTrigger` call depth exceeds 10 (infinite loop guard)
  - TCE grammar gap surfaces that Pythia contract did not specify
- **Strategic decision hard stops**:
  - Adding behavior tree or dependency graph complexity (linear FSM is locked)
  - Adding quest branching (defer post-hackathon)
  - Changing Step or Trigger schema without Pythia-v2 contract revision
  - Rendering QuestTracker inside Phaser (must stay React HUD)
- **Token budget**: 80k input plus 40k output. Approximately $12 API.

### 4.3 Linus

- **Name**: Linus (poet musician, son of Apollo per Greek myth, fresh Greek name no collision)
- **Tier**: Product-side, game engine core
- **Role**: Dialogue runtime owner. Authors custom JSON dialogue schema, ~40 line React reducer, DialogueOverlay component, `apollo_intro.json` vertical slice conversation, prompt-challenge node type integration
- **Model**: Opus 4.7
- **Wave**: W2 (parallel to Nyx)
- **Sessions**: 1
- **Upstream**: Talos `dialogue-tree-authoring` skill plus project scaffold, Pythia-v2 `dialogue_schema.contract.md`, Hephaestus-v2 `.claude/agents/linus.md` prompt
- **Downstream**: Nyx (dialogue choice effect calls `fireTrigger`), Erato-v2 (BottomBar renders DialogueOverlay), Euterpe (dialogue node events fire typewriter sfx cue)
- **Input files**: M1 research Section 3.2, Pythia contracts, `dialogue-tree-authoring` skill
- **Output files**:
  - `src/stores/dialogueStore.ts` (Zustand with `activeId`, `nodeId`, `vars`, `streaming`)
  - `src/data/dialogues/_schema.ts` (zod for Dialogue, Node, Choice, Challenge, Effect)
  - `src/data/dialogues/apollo_intro.json` (greet, prompt_brief, builder_cinematic, end nodes)
  - `src/components/game/DialogueOverlay.tsx` (React reducer, typewriter effect, conditional choice rendering)
  - `src/lib/dialogueRunner.ts` (node transition, condition eval via `new Function` or `jsep`)
  - `src/components/game/PromptChallengeNode.tsx` (embedded prompt-input node type renderer)
  - `tests/dialogue.test.ts`
- **Halt triggers**:
  - Dialogue JSON fails zod validation
  - Prompt-challenge node type ambiguity (no clear bridge to Nyx trigger firing)
  - Condition grammar unparseable (e.g., `trust.apollo >= ${dynamic}`)
  - Typewriter timing conflict with Euterpe audio cues
- **Strategic decision hard stops**:
  - Adopting inkjs, Yarn Spinner, Twine, or rex DialogQuest
  - Rendering DialogueOverlay inside Phaser canvas
  - Changing Node or Challenge schema without Pythia-v2 contract revision
- **Token budget**: 70k input plus 35k output. Approximately $10 API.

### 4.4 Thalia-v2

- **Name**: Thalia-v2 (muse of comedy and pastoral poetry, P0 roster upgrade)
- **Tier**: Product-side, game engine core
- **Role**: Phaser scene author plus player controller plus scene manager. Absorbs V4 pre-sketch Eris (main lobby) scope. Authors BootScene, PreloadScene, ApolloVillageScene, MiniBuilderCinematicScene, player 8-direction Arcade physics controller, tilemap loading, NPC object class, scene transitions, caravan unlock sequence, Phaser-to-Zustand bridge
- **Model**: Opus 4.7
- **Wave**: W2 (scene core) plus W3 (mini Builder cinematic sub-session)
- **Sessions**: 2
- **Upstream**: Talos `phaser-scene-authoring` skill plus project scaffold plus sliced sprite assets plus CC0 tilesets, Pythia-v2 `event_bus.contract.md` plus `game_state.contract.md`, Hephaestus-v2 `.claude/agents/thalia-v2.md` prompt
- **Downstream**: Erato-v2 (React HUD subscribes to scene events via bridge), Nyx (scene events fire quest triggers), Linus (npc-interact event opens dialogue), Euterpe (scene-ready event plays ambient loop), Hesperus (PhaserCanvas loads SVG chrome as texture)
- **Input files**: M1 research Sections 2 (external repo analysis) plus 5 (Phaser plus Next.js 15 embed), Pythia contracts, `phaser-scene-authoring` skill, spritesheet atlases from Talos, assets.json manifest
- **Output files**:
  - `src/game/scenes/BootScene.ts` (initial config, asset-pack loader)
  - `src/game/scenes/PreloadScene.ts` (boot-asset-pack plus preload-asset-pack JSON)
  - `src/game/scenes/ApolloVillageScene.ts` (Apollo Village main lobby, top-down 32x32 tilemap, player spawn, Apollo NPC zone, caravan spawn gated by quest state)
  - `src/game/scenes/MiniBuilderCinematicScene.ts` (scripted tween sequence over pre-generated tiles, "scaffold reveal" animation, emits `cinematic:complete`)
  - `src/game/objects/Player.ts` (8-direction Arcade physics, keyboard input via `createCursorKeys`)
  - `src/game/objects/NPC.ts` (sprite plus interact zone plus name label)
  - `src/game/objects/Caravan.ts` (gated spawn, fade-in, pointer-down fires `world:unlock`)
  - `src/components/game/PhaserCanvas.tsx` (Client Component, dynamic import consumer, Strict Mode guarded lifecycle)
  - `src/components/game/GameShell.tsx` (Client Component wrapper, Tailwind grid layout, dynamic PhaserCanvas import with `ssr: false`)
  - `src/app/play/page.tsx` (Server Component, renders GameShell)
  - `src/lib/gameBridge.ts` (Zustand subscribeWithSelector plus Phaser game.events wiring)
  - `public/assets/packs/boot-asset-pack.json`, `preload-asset-pack.json`
  - `tests/phaser-smoke.spec.ts` (Playwright plus `window.__TEST__` hook)
- **Halt triggers**:
  - Phaser SSR error despite dynamic import alias (escalate to Talos for next.config fix)
  - Spritesheet atlas shape mismatch with Talos output
  - Scene transition race condition between Boot and Preload
  - `game.destroy(true)` leaks reference on Strict Mode unmount
  - Tilemap loading fails for Oak Woods or Warped City CC0 source
- **Strategic decision hard stops**:
  - Rendering HUD, currency, shop, prompt input, or inventory inside Phaser (React HUD boundary locked)
  - Embedding fal.ai client-side API calls inside Phaser scene (fal.ai is dormant transplant infrastructure only, not invoked in shipped build)
  - Building full Cyberpunk Shanghai or Steampunk Victorian scenes in vertical slice (only Apollo Village plus caravan teaser land)
  - Swapping Phaser 3 for Phaser 4 beta
- **Token budget**: 120k input plus 60k output across 2 sessions. Approximately $18 API.

### 4.5 Erato-v2

- **Name**: Erato-v2 (muse of love poetry, P0 roster upgrade)
- **Tier**: Product-side, React HUD layer
- **Role**: React HUD overlay author. Absorbs V4 pre-sketch Nike (inventory) plus Zelus (currency shop) plus Helios-v2 (HUD visualizer) scope. Authors TopBar (currency plus quest progress), BottomBar (dialog plus prompt input), SideBar (agent structure editor mini-viewer), PromptInputChallenge, InventoryToast, ApolloStream (ported from P0), CurrencyDisplay (USD/IDR i18n), ModelSelector, ShopModal
- **Model**: Opus 4.7
- **Wave**: W3 (after Thalia-v2 PhaserCanvas ready plus Nyx QuestTracker plus Linus DialogueOverlay)
- **Sessions**: 1
- **Upstream**: Thalia-v2 PhaserCanvas plus bridge, Nyx `useQuestStore` plus QuestTracker, Linus `dialogueStore` plus DialogueOverlay, Talos `zustand-bridge` skill plus Kenney UI RPG Expansion, Talos-translator ported P0 components (Apollo stream, Helios viz, Cassandra if relevant), Hephaestus-v2 `.claude/agents/erato-v2.md` prompt
- **Downstream**: Hesperus (SVG chrome applied as layer under Tailwind borders), Harmonia-RV-A (integration check), Kalypso (HUD screenshot source for landing page)
- **Input files**: M1 research Sections 3 plus 5, existing P0 Apollo/Helios/Cassandra components from Talos-translator, `zustand-bridge` skill, Pythia-v2 `game_state.contract.md`
- **Output files**:
  - `src/components/hud/TopBar.tsx` (currency plus quest tracker plus minimap ring)
  - `src/components/hud/BottomBar.tsx` (DialogueOverlay slot plus PromptInputChallenge slot)
  - `src/components/hud/SideBar.tsx` (agent structure editor mini-viewer, collapsible)
  - `src/components/hud/PromptInputChallenge.tsx` (textarea plus submit button, fires `prompts.submissions` plus `fireTrigger`)
  - `src/components/hud/InventoryToast.tsx` (Framer Motion slide-in, subscribes to `inventory.lastAwarded`)
  - `src/components/hud/ApolloStream.tsx` (ported from P0, reuses streaming hook)
  - `src/components/hud/CurrencyDisplay.tsx` (next-intl USD/IDR formatter, toggle)
  - `src/components/hud/ModelSelector.tsx` (Opus 4.7 plus Sonnet 4.6 selector, honest-claim)
  - `src/components/hud/ShopModal.tsx` (gated by `ui.shopOpen`, Framer Motion)
  - `src/stores/uiStore.ts` (Zustand for modal visibility, sidebar collapsed state, language, model choice)
  - `src/stores/inventoryStore.ts` (slots, lastAwarded, award action)
  - `src/components/BusBridge.tsx` (top-level translator Phaser `game.events` to Zustand actions)
  - `src/i18n/en.json`, `id.json` (next-intl dictionaries)
- **Halt triggers**:
  - Bridge event name mismatch with Thalia-v2 scene emission
  - Tailwind v4 OKLCH token conflict with Hesperus SVG palette
  - Narrow selector performance regression (more than 4ms React render on HUD tick)
  - next-intl locale loading fails in Client Component
- **Strategic decision hard stops**:
  - Embedding any React component inside Phaser canvas
  - Adding multi-vendor model beyond Opus 4.7 plus Sonnet 4.6 (CLAUDE.md anti-pattern 7 honored)
  - Changing `game_state.contract.md` schema without Pythia revision
  - Rendering ShopModal inside Phaser (locked React)
- **Token budget**: 100k input plus 50k output. Approximately $15 API.

### 4.6 Hesperus

- **Name**: Hesperus (evening star, personification of Venus at dusk, fresh Greek, no collision)
- **Tier**: Product-side, visual polish
- **Role**: Opus SVG author plus Canvas procedural FX author. Authors HUD chrome borders per world genre, dialog frame, NERIUM logo, minimap ring, Canvas particle effects (sand for Medieval, neon glow for Cyberpunk, steam puff for Steampunk)
- **Model**: Opus 4.7
- **Wave**: W3 (parallel to Erato-v2 plus Euterpe)
- **Sessions**: 1
- **Upstream**: Erato-v2 HUD layout finalized (SVG sizing constraints), Talos project scaffold, `/mnt/skills/public/frontend-design/` (public skill reference), Hephaestus-v2 `.claude/agents/hesperus.md` prompt
- **Downstream**: Erato-v2 (HUD borders applied as background via Tailwind `bg-[url(...)]` or inline SVG), Thalia-v2 (PhaserCanvas `this.load.svg()` for in-scene chrome if needed)
- **Input files**: M1 research Section 6.3 (Opus SVG/Canvas procedural), Erato-v2 HUD layout DOM structure, 3-world style bible JSONs from Talos
- **Output files**:
  - `public/svg/hud/border-medieval.svg` (sand-beige brass-ring frame)
  - `public/svg/hud/border-cyberpunk.svg` (neon magenta plus cyan corner glyphs)
  - `public/svg/hud/border-steampunk.svg` (brass-rivet frame)
  - `public/svg/hud/dialog-frame.svg` (genre-neutral, palette swappable via CSS variables)
  - `public/svg/logo/nerium-logo.svg`
  - `public/svg/ui/minimap-ring.svg`
  - `public/svg/ui/inventory-slot.svg`
  - `src/lib/procedural/sandParticles.ts` (Canvas 2D, 60fps cap, instance-pooled)
  - `src/lib/procedural/neonGlow.ts` (Canvas 2D gradient plus blur composite)
  - `src/lib/procedural/steamPuff.ts` (Canvas 2D noise-driven alpha)
  - `src/components/hud/ProceduralFX.tsx` (React wrapper, requestAnimationFrame lifecycle)
- **Halt triggers**:
  - SVG palette drift from world style-bible (Cyberpunk uses Medieval colors)
  - Canvas FX drops frames below 60fps on mid-tier laptop
  - SVG file size exceeds 20KB per file (should be compact)
- **Strategic decision hard stops**:
  - Using fal.ai for UI chrome or any other shipped asset (fal.ai is dormant transplant only, zero shipped invocation)
  - Using CSS-only for particle FX (Canvas procedural locked for organic motion)
  - Embedding raster images where vector suffices
- **Token budget**: 60k input plus 30k output. Approximately $8 API.

### 4.7 Euterpe

- **Name**: Euterpe (muse of music and lyric poetry, fresh Greek, no collision)
- **Tier**: Product-side, audio
- **Role**: Howler.js integration wrapper plus Kenney sfx curation plus 3-world ambient loop selection plus quest trigger sfx mapping plus mixing levels. Scope per Ghaisan Gate 1 Q3: tight single-terminal, 1 to 1.5 hours
- **Model**: Opus 4.7
- **Wave**: W3 (parallel to Erato-v2 plus Hesperus)
- **Sessions**: 1
- **Upstream**: Talos CC0 pull including Kenney audio packs (50 RPG sfx plus UI sfx plus ambient), Thalia-v2 scene events taxonomy, Nyx quest trigger taxonomy, Linus dialogue node events, Pythia-v2 `event_bus.contract.md`, Hephaestus-v2 `.claude/agents/euterpe.md` prompt
- **Downstream**: Thalia-v2 (scene-ready plays ambient loop), Erato-v2 (UI sfx on button press plus inventory toast), Linus (typewriter sfx on dialog line), Harmonia-RV-B (audio plus visual integration check)
- **Input files**: Howler.js docs (https://howlerjs.com), Kenney audio packs pulled by Talos to `public/audio/cc0/`, M1 research audio scope flag (Section 8 Q3), event bus contract
- **Output files**:
  - `src/lib/audioEngine.ts` (Howler.js wrapper, `play(cue)`, `setVolume`, `mute`, autoplay-policy-gated init)
  - `src/stores/audioStore.ts` (Zustand: master, sfx, music, ambient volume, muted)
  - `src/data/audio/cues.json` (event name to audio file map plus volume plus loop flag)
  - `public/audio/ambient/apollo-village-loop.mp3` (curated from Kenney ambient)
  - `public/audio/ambient/cyberpunk-teaser-loop.mp3`
  - `public/audio/ambient/steampunk-placeholder-loop.mp3`
  - `public/audio/sfx/prompt-submit.mp3`, `dialog-advance.mp3`, `item-pickup.mp3`, `quest-complete.mp3`, `caravan-unlock.mp3`, `cinematic-sting.mp3`, `ui-hover.mp3`, `ui-click.mp3` (all from Kenney)
  - `src/components/ui/VolumeSlider.tsx` (Erato-v2 consumes in SideBar)
  - `src/components/AudioInitGate.tsx` (user-gesture gate for autoplay policy)
- **Halt triggers**:
  - Howler instance leak on scene shutdown (cleanup contract violation)
  - Browser autoplay policy block on first load (must gate behind user gesture)
  - Ambient loop seam audible pop (cross-fade required)
  - Kenney audio file license mismatch
- **Strategic decision hard stops**:
  - Composing original music (hackathon scope is curate CC0 only)
  - Using Web Audio API directly (Howler.js locked per tech stack)
  - Hiring external audio (budget and scope prohibit)
- **Token budget**: 50k input plus 25k output. Approximately $7 API.

### 4.8 Kalypso

- **Name**: Kalypso (nymph of Ogygia, associated with lure and enchantment, fits landing page "lure visitor into NERIUM universe" metaphor, fresh Greek name no collision)
- **Tier**: Product-side, marketing surface
- **Role**: Landing page plus README plus submission package. Landing page at `/` (Next.js Server Component), hero video placeholder plus OSS link plus 100 to 200 word summary plus meta-narrative section plus CTA to `/play`. Also authors top-of-repo README synthesis. Moros deferred scope absorbed here as optional static 3D leaderboard mockup on landing if time permits
- **Model**: Opus 4.7
- **Wave**: W3 draft plus W4 finalize
- **Sessions**: 2 (draft with placeholders, finalize after vertical slice demo-ready)
- **Upstream**: Thalia-v2 game playable (hero video recording source), Talos README scaffold plus CREDITS.md, NarasiGhaisan.md voice anchor, CLAUDE.md meta-narrative, Hephaestus-v2 `.claude/agents/kalypso.md` prompt
- **Downstream**: Nemea-RV-B (a11y QA on landing page), Ghaisan submission package (video plus 100 to 200 word summary plus repo link)
- **Input files**: NarasiGhaisan.md, CLAUDE.md meta-narrative section, recorded vertical-slice demo video, existing P0 landing page if any (via Talos-translator decision)
- **Output files**:
  - `src/app/page.tsx` (Server Component, landing route)
  - `src/components/landing/HeroSection.tsx` (hero video, tagline "Infrastructure for the AI agent economy", CTA to /play)
  - `src/components/landing/MetaNarrativeSection.tsx` ("NERIUM built itself")
  - `src/components/landing/PillarsSection.tsx` (5 pillars brief)
  - `src/components/landing/CTASection.tsx`
  - `src/components/landing/StaticLeaderboardMockup.tsx` (optional, Moros deferred scope)
  - `public/video/demo-preview.mp4` placeholder plus final
  - `README.md` top-of-repo synthesis
  - `docs/submission/100_to_200_word_summary.md`
  - `docs/submission/demo_script.md` (3-min video script)
- **Halt triggers**:
  - Voice anchor drift from NarasiGhaisan.md (em dash appears, emoji appears, formal register)
  - Copy exceeds 200 words on summary section
  - Hero video render fails
  - OSS link broken
- **Strategic decision hard stops**:
  - Embedding live Phaser canvas on landing (link to /play only)
  - Adding 3D WebGL effect to landing (Tailwind plus Framer Motion only)
  - Diluting meta-narrative ("NERIUM built itself")
  - Claiming feature not shipped (honest-claim discipline per CLAUDE.md Section 7)
- **Token budget**: 60k input plus 25k output across 2 sessions. Approximately $9 API.

### 4.9 Thea (RESERVED, conditional spawn)

- **Name**: Thea (titaness of sight and clear vision, fresh Greek, no collision)
- **Tier**: Product-side, visual QA
- **Role**: Cross-batch sprite consistency QA. Palette histogram comparison across world batches, silhouette variance check, 3-world visual cohesion verdict. NOT spawned unless RV-4 polish phase surfaces real need
- **Model**: Opus 4.7
- **Wave**: W4 conditional
- **Spawn condition**: Talos in-line Claude check-loop inside asset pipeline fails to catch two or more cross-batch consistency failures, OR Ghaisan demands a third-party consistency verdict before demo
- **Token budget if spawned**: 40k input plus 20k output. Approximately $6 API.

### 4.10 Pythia-v2 (specialist)

- **Name**: Pythia-v2 (oracle of Delphi, P0 specialist roster upgrade)
- **Tier**: Specialist, contract authority
- **Role**: Modular contract authoring round 2 for RV. Drafts contracts for every shared interface that cross-agent integration depends on
- **Model**: Opus 4.7
- **Wave**: W1 (before all product-side workers)
- **Sessions**: 1
- **Upstream**: Metis-v2 M1 research, M2 this document, V4 RV_PLAN locks
- **Downstream**: ALL 9 product-side workers, Hephaestus-v2 prompt authoring (contracts referenced in prompts)
- **Input files**: M1 research, M2 agent structure, NERIUM root CLAUDE.md
- **Output files**:
  - `docs/contracts/game_state.contract.md` (shared Zustand store shape across questStore, dialogueStore, inventoryStore, uiStore, audioStore)
  - `docs/contracts/quest_schema.contract.md` (Quest, Step, Trigger, Condition, Effect zod-derived spec)
  - `docs/contracts/dialogue_schema.contract.md` (Dialogue, Node, Choice, Challenge, Effect spec)
  - `docs/contracts/item_schema.contract.md`
  - `docs/contracts/game_asset_registry.contract.md` (CC0 source catalog plus Opus procedural plus fal.ai dormant fields marked deprecated-reserved)
  - `docs/contracts/event_bus.contract.md` (canonical Phaser `game.events` event name registry plus payload shapes)
  - `docs/contracts/zustand_bridge.contract.md` (subscribe pattern, fireImmediately flag, cleanup on SHUTDOWN)
  - `docs/contracts/asset_ledger.contract.md` (JSONL append schema per generation)
- **Halt triggers**:
  - Contract ambiguity not resolvable from M1 or M2
  - Circular dependency between contracts (e.g., quest imports dialogue imports quest)
  - Schema conflict with existing P0 contracts (Talos-translator flags)
- **Strategic decision hard stops**:
  - Revising any V4 lock without ferry approval (e.g., tech stack swap)
  - Introducing new tech stack component (e.g., Redux instead of Zustand)
- **Token budget**: 80k input plus 50k output. Approximately $13 API.

### 4.11 Hephaestus-v2 (specialist)

- **Name**: Hephaestus-v2 (god of forge and craft, P0 specialist roster upgrade)
- **Tier**: Specialist, prompt authoring
- **Role**: Batch authors all 9 active product-side `.claude/agents/<n>.md` prompt files plus Thea reserved skeleton in single session. Enforces anti-pattern 6 (no per-file ferry) per CLAUDE.md Section 7
- **Model**: Opus 4.7
- **Wave**: W1 (after Pythia-v2 contracts ready plus Talos-translator P0 inventory)
- **Sessions**: 1 single batch
- **Upstream**: M2 this document, Pythia-v2 contracts, Talos-translator reuse-rewrite matrix, NarasiGhaisan.md
- **Downstream**: ALL 9 product-side workers plus Thea reserved receive `.claude/agents/<n>.md` prompt
- **Input files**: M2, contracts, matrix, voice anchor, CLAUDE.md
- **Output files**:
  - `.claude/agents/talos.md`
  - `.claude/agents/nyx.md`
  - `.claude/agents/linus.md`
  - `.claude/agents/thalia-v2.md`
  - `.claude/agents/erato-v2.md`
  - `.claude/agents/hesperus.md`
  - `.claude/agents/euterpe.md`
  - `.claude/agents/kalypso.md`
  - `.claude/agents/thea.md` (reserved skeleton, `disable-model-invocation: true` until spawned)
- **Halt triggers**:
  - Context window reaches 97% threshold (per MedWatch V5 Section 10.9 lesson)
  - Any single agent prompt exceeds 400 lines (skill discipline enforced)
  - Contract reference unresolvable in Pythia contracts
- **Strategic decision hard stops**:
  - Per-file ferry (explicit anti-pattern 6, halt only at context threshold)
  - Separate session per agent (batching is locked)
  - Omitting mandatory reading list in any agent prompt
- **Token budget**: 180k input plus 80k output single batch. Approximately $22 API. Single highest-cost session.

### 4.12 Talos-translator (specialist)

- **Name**: Talos-translator (distinct agent from Talos product-side, translator specialization)
- **Tier**: Specialist, P0 artifact migration
- **Role**: Walks through every P0 artifact from V3 shipped dashboard (22 product-side agents' outputs) and outputs per-artifact decision KEEP, PORT, or DEPRECATE with rationale. Feeds Section 7 reuse-rewrite matrix and Erato-v2 downstream
- **Model**: Opus 4.7
- **Wave**: W1 (parallel to Pythia-v2)
- **Sessions**: 1
- **Upstream**: V3 shipped codebase, P0 agent structure document, Nemea-v1 QA report, `docs/phase_0/` outputs
- **Downstream**: Erato-v2 (receives ported components), Pythia-v2 (flags schema conflicts), Hephaestus-v2 (matrix informs prompt authoring)
- **Input files**: V3 shipped repo, P0 agent structure, Nemea-v1 QA, existing `src/` tree
- **Output files**:
  - `docs/phase_rv/P0_ARTIFACT_INVENTORY.md` (full catalog of V3 outputs)
  - `docs/phase_rv/REUSE_REWRITE_MATRIX.md` (per-artifact decision with rationale)
  - `src/components/hud/ported/` (ApolloStream, HeliosPipelineViz, CassandraPrediction if kept)
  - `_meta/translator_notes.md` (gotchas for Erato-v2)
- **Halt triggers**:
  - Artifact count exceeds single-session digest capacity (split into two sessions)
  - Component fails to port cleanly (logic coupled to old dashboard shell)
- **Strategic decision hard stops**:
  - Rewriting any component Ghaisan explicitly marked REUSE in RV_PLAN
  - Deprecating Apollo Advisor core logic (it is the Builder demo fulcrum)
- **Token budget**: 80k input plus 40k output. Approximately $12 API.

### 4.13 Harmonia-RV-A (specialist)

- **Name**: Harmonia-RV-A (goddess of harmony, P0 specialist split 1 of 2)
- **Tier**: Specialist, integration check
- **Role**: State plus contract integration check. Verifies every Zustand store shape matches Pythia-v2 contract, every bridge event name matches `event_bus.contract.md` registry, every quest-to-dialogue-to-inventory handoff executes end to end without state leak
- **Model**: Opus 4.7
- **Wave**: W4
- **Sessions**: 1
- **Upstream**: Wave 2 plus Wave 3 outputs shipped, Pythia-v2 contracts
- **Downstream**: Nemea-RV-A (regression test suite), Ghaisan integration verdict
- **Output files**:
  - `docs/qa/harmonia_rv_state_integration.md` (per-contract verdict plus gap list)
- **Halt triggers**: contract violation detected (escalate to owning worker for fix)
- **Strategic decision hard stops**: none (advisory role)
- **Token budget**: 70k input plus 25k output. Approximately $9 API.

### 4.14 Harmonia-RV-B (specialist)

- **Name**: Harmonia-RV-B (goddess of harmony, split 2 of 2)
- **Tier**: Specialist, integration check
- **Role**: Visual plus asset plus audio integration check. Verifies sprite atlas loads correctly in Phaser, SVG chrome palette matches world style-bible, Howler cues fire on correct events, Framer Motion transitions do not conflict with Phaser scene transitions
- **Model**: Opus 4.7
- **Wave**: W4
- **Sessions**: 1
- **Upstream**: Wave 3 outputs (Thalia-v2 cinematic, Erato-v2 HUD, Hesperus SVG, Euterpe audio)
- **Downstream**: Nemea-RV-B (visual a11y QA), Ghaisan verdict
- **Output files**:
  - `docs/qa/harmonia_rv_visual_integration.md`
- **Halt triggers**: asset loading failure, palette drift unresolved by Hesperus
- **Strategic decision hard stops**: none (advisory role)
- **Token budget**: 70k input plus 25k output. Approximately $9 API.

### 4.15 Nemea-RV-A (specialist)

- **Name**: Nemea-RV-A (personification of Nemean valley, P0 specialist split 1 of 2)
- **Tier**: Specialist, regression QA
- **Role**: Scene plus state regression via Playwright. Uses `window.__TEST__` hook per M1 research, runs quest-flow end-to-end test, runs dialogue-flow test, runs inventory-award test, runs caravan-unlock test
- **Model**: Opus 4.7
- **Wave**: W4
- **Sessions**: 1
- **Upstream**: Harmonia-RV-A verdict, vertical-slice playable
- **Downstream**: Ghaisan go/no-go for demo recording
- **Output files**:
  - `tests/e2e/lumio_quest.spec.ts`
  - `tests/e2e/dialogue_flow.spec.ts`
  - `tests/e2e/inventory_award.spec.ts`
  - `tests/e2e/caravan_unlock.spec.ts`
  - `docs/qa/nemea_rv_regression_report.md`
- **Halt triggers**: test failure on critical path (quest incomplete, dialogue freeze, inventory missing)
- **Strategic decision hard stops**: recommending demo scope cut (requires V4 ferry)
- **Token budget**: 70k input plus 30k output. Approximately $10 API.

### 4.16 Nemea-RV-B (specialist)

- **Name**: Nemea-RV-B (split 2 of 2)
- **Tier**: Specialist, visual a11y QA
- **Role**: Visual a11y plus landing page audit. Lighthouse run, keyboard nav check, screen reader smoke test on React HUD, landing page WCAG check, copy review for em dash and emoji violations
- **Model**: Opus 4.7
- **Wave**: W4
- **Sessions**: 1
- **Upstream**: Harmonia-RV-B verdict, Kalypso landing page ready
- **Downstream**: Ghaisan submission package go/no-go
- **Output files**:
  - `docs/qa/nemea_rv_a11y_report.md` (Lighthouse scores, WCAG gaps, copy violations)
- **Halt triggers**: em dash or emoji detected in any shipped surface, keyboard nav dead-end on critical path
- **Strategic decision hard stops**: none (advisory plus hard-stop on style violations per CLAUDE.md Section 7)
- **Token budget**: 60k input plus 25k output. Approximately $8 API.

---

## 5. Dependency graph

### 5.1 ASCII flow diagram

```
                       METIS-V2 M1 RESEARCH
                               |
                               v
                       METIS-V2 M2 (this doc)
                               |
            +------------------+------------------+
            |                  |                  |
            v                  v                  v
      PYTHIA-V2         DAEDALUS-TRANSLATOR   DAEDALUS
      (contracts)       (P0 matrix)           (setup + skills + assets)
            |                  |                  |
            +--------+---------+---------+--------+
                     |                   |
                     v                   v
              HEPHAESTUS-V2        DAEDALUS-W2
              (prompt batch)       (fal sprite gen)
                     |                   |
                     v                   v
            +--------+--------+----------+
            |                 |
            v                 v
         NYX               THALIA-V2-A              ORPHEUS
         (quest)           (scenes core)            (dialogue)
            |                 |                       |
            +--------+--------+-----------+-----------+
                     |                    |
                     v                    v
             THALIA-V2-B           +------+------+
             (cinematic)           |             |
                     \             v             v
                      \         ERATO-V2      EUTERPE    HESPERUS
                       \        (React HUD)   (audio)    (SVG FX)
                        \             \         /          /
                         \             \       /          /
                          v             v     v          v
                         CALLIOPE-W3 (landing draft)
                              |
                              v
                     +--------+--------+
                     |                 |
                     v                 v
              HARMONIA-RV-A     HARMONIA-RV-B
              (state integ)     (visual integ)
                     |                 |
                     v                 v
              NEMEA-RV-A         NEMEA-RV-B
              (regression)       (a11y)
                     |                 |
                     +--------+--------+
                              |
                              v
                        CALLIOPE-W4
                      (landing finalize + submission)
                              |
                              v
                          GHAISAN
                      (Senin 06:00 WIB)
```

### 5.2 Dependency table (upstream to downstream, explicit)

| Agent | Hard upstream (blocking) | Soft upstream (informational) | Hard downstream |
|---|---|---|---|
| Pythia-v2 | M2 doc | M1 research, CLAUDE.md | Hephaestus-v2, all product-side |
| Talos-translator | V3 shipped repo | M1, M2 | Erato-v2, Pythia-v2 schema conflict flags |
| Talos (W1 setup) | M2 doc, Pythia-v2 contracts | M1 | All product-side (scaffold plus skills) |
| Hephaestus-v2 | Pythia-v2, Talos-translator, Talos W1 | M1, M2 | All product-side (prompts) |
| Talos (W2 assets) | Talos W1, Pythia `game_asset_registry.contract.md`, Hephaestus `.claude/agents/talos.md` | M1 Section 6 | Thalia-v2, Erato-v2 UI, Euterpe audio import, Hesperus SVG refs |
| Nyx | Talos W1 (skill plus scaffold), Pythia `quest_schema`, `game_state`, Hephaestus `.claude/agents/nyx.md` | M1 Section 3 | Erato-v2 (QuestTracker consumer), Linus (fires triggers), Thalia-v2 (scene-event triggers) |
| Linus | Talos W1 (skill plus scaffold), Pythia `dialogue_schema`, Hephaestus `.claude/agents/linus.md` | M1 Section 3.2 | Erato-v2 (BottomBar host), Nyx (dialogue-triggered quest effects), Euterpe (typewriter cue) |
| Thalia-v2-A | Talos W1 plus W2 assets, Pythia `event_bus`, `game_state`, Hephaestus `.claude/agents/thalia-v2.md` | M1 Sections 2 plus 5 | Erato-v2 (bridge consumer), Nyx (fires triggers), Linus (npc-interact trigger), Euterpe (scene-ready cue), Hesperus (in-scene SVG) |
| Thalia-v2-B cinematic | Thalia-v2-A, Talos W2 tile assets | M1 Q5 answer | Erato-v2 (cinematic-complete listener triggers inventory toast) |
| Erato-v2 | Thalia-v2-A, Nyx, Linus, Talos-translator (ported P0), Talos W1 `zustand-bridge` skill, Hephaestus `.claude/agents/erato-v2.md` | M1 | Hesperus (chrome applied), Harmonia-RV-A, Kalypso (HUD screenshot) |
| Hesperus | Erato-v2 HUD layout, Talos W1 scaffold, Hephaestus `.claude/agents/hesperus.md` | M1 Section 6.3 | Erato-v2 (chrome applied), Thalia-v2 (in-scene SVG) |
| Euterpe | Talos W2 Kenney audio pull, Thalia-v2 scene events, Nyx quest triggers, Linus dialogue events, Pythia `event_bus`, Hephaestus `.claude/agents/euterpe.md` | M1 Q3 | Thalia-v2 (scene-level cue consumer), Erato-v2 (UI sfx), Linus (typewriter cue) |
| Kalypso-W3 | Thalia-v2-A playable (hero video source), Talos README scaffold, Hephaestus `.claude/agents/kalypso.md` | NarasiGhaisan, CLAUDE.md meta-narrative | Nemea-RV-B (a11y) |
| Kalypso-W4 | Nemea-RV-B pass, Ghaisan approval on draft | - | Ghaisan submission |
| Harmonia-RV-A | W2 plus W3 outputs shipped | Pythia contracts | Nemea-RV-A |
| Harmonia-RV-B | W3 outputs shipped | M1 asset hierarchy | Nemea-RV-B |
| Nemea-RV-A | Harmonia-RV-A verdict, vertical slice playable | - | Ghaisan go/no-go demo |
| Nemea-RV-B | Harmonia-RV-B verdict, Kalypso-W3 draft | - | Ghaisan submission package go/no-go |
| Thea (reserved) | Conditional on Talos in-line QA insufficient | Harmonia-RV-B flags | Talos W2 iteration |

### 5.3 Cycle check

Manual verification: no cycle. Nyx and Linus have mutual downstream references (quest fires dialogue, dialogue fires quest effect) but neither blocks the other's core authoring; they integrate via Pythia-v2 contracts at boundary. Erato-v2 consumes from Nyx, Linus, Thalia-v2 but produces no output back to those agents. Verified acyclic.

---

## 6. Parallel execution wave schedule

### 6.1 Wave 1: Infrastructure (Kamis evening WIB, approximately 4 to 6 hours)

Parallel lanes, 4 terminals active:

- Terminal A: Pythia-v2 single session (contracts)
- Terminal B: Talos-translator single session (P0 matrix plus porting)
- Terminal C: Talos W1 session 1 (project setup scaffold)
- Terminal D: Talos W1 session 2 (skill authoring, blocked by session 1 completion)

After Pythia-v2 plus Talos-translator plus Talos W1 sessions all complete:

- Terminal A (reuse): Hephaestus-v2 single batch session (prompts for all 9 plus Thea)

Wave 1 exit criteria: `pnpm build` passes on scaffold, all Pythia contracts land, all `.claude/skills/` land, all `.claude/agents/` land, P0 matrix published to `docs/phase_rv/REUSE_REWRITE_MATRIX.md`.

### 6.2 Wave 2: Game engine core (Jumat full day WIB, approximately 10 to 12 hours)

Parallel lanes, 4 terminals active:

- Terminal A: Nyx (quest FSM)
- Terminal B: Linus (dialogue runtime)
- Terminal C: Thalia-v2-A (scenes core)
- Terminal D: Talos W2 (CC0 curation from Kenney plus Oak Woods plus Warped City, Opus SVG/Canvas procedural gap-fill generation)

All four run in parallel. Thalia-v2-A depends on Talos W2 spritesheet output, so Thalia-v2-A internal sequencing: scaffold scene structure first, stub assets, swap in real sprites when Talos W2 lands mid-day.

Wave 2 exit criteria: ApolloVillageScene loads with player movement, quest state store dispatches triggers, dialogue overlay renders JSON-driven nodes, sprite atlas loaded, caravan placeholder spawnable.

### 6.3 Wave 3: Support plus polish (Sabtu full day WIB, approximately 10 to 12 hours)

Parallel lanes, 4 terminals active:

- Terminal A: Erato-v2 (React HUD overlay)
- Terminal B: Hesperus (SVG chrome plus Canvas FX)
- Terminal C: Euterpe (audio integration)
- Terminal D: Thalia-v2-B (cinematic) plus Kalypso-W3 (landing draft) sequential

Wave 3 exit criteria: HUD functional with narrow selectors, dialog plus prompt plus inventory plus currency HUD rendering, SVG chrome applied, audio cues firing on quest plus dialogue plus scene events, cinematic tween playable on trigger, landing page draft up.

### 6.4 Wave 4: Integration plus QA (Minggu morning WIB, approximately 4 to 6 hours) then demo bake Minggu afternoon

Parallel lanes, 4 terminals:

- Terminal A: Harmonia-RV-A (state integration)
- Terminal B: Harmonia-RV-B (visual plus audio integration)
- Terminal C: Nemea-RV-A (regression Playwright)
- Terminal D: Nemea-RV-B (a11y audit)

Sequential final:
- Kalypso-W4 finalize landing plus submission package
- Ghaisan demo video recording plus upload

Wave 4 exit criteria: all four QA reports green or acceptable-with-notes, submission package ready, demo video recorded.

Target submission: **Senin 27 April 06:00 WIB**, hard deadline 07:00 WIB buffer.

### 6.5 Daily rhythm enforcement

Per CLAUDE.md Section "Daily Rhythm Lock": Claude Code activity window 07:00 to 23:00 WIB hard. 23:00 freeze for Ananke log compile. No new specialist spawn after 23:00. Wave boundaries align to daily rhythm:

- Kamis 23:00 freeze: Wave 1 complete
- Jumat 23:00 freeze: Wave 2 complete
- Sabtu 23:00 freeze: Wave 3 complete
- Minggu morning through 17:00: Wave 4 complete
- Minggu evening: demo bake plus submission prep
- Senin 06:00 WIB: submit

Ananke W1 to W4 log compilation runs daily at 23:00, produces `_meta/orchestration_log/day_N.md`.

---

## 7. Reuse-rewrite matrix

**Authoritative source**: `_meta/RV_PLAN.md` Section 4 reuse-rewrite matrix (mandatory reading for every RV agent, referenced by direct pointer not duplicated here per Ghaisan Gate A Q2 response). Talos-translator in Wave 1 produces the authoritative per-artifact operational decisions at `docs/phase_rv/REUSE_REWRITE_MATRIX.md`. This M2 section provides a consumption seed that downstream agents align against the RV_PLAN master; any conflict between this seed and RV_PLAN Section 4 resolves in favor of RV_PLAN.

### 7.1 KEEP (port as-is, minor wrap)

| P0 artifact | RV destination | Responsible agent | Rationale |
|---|---|---|---|
| Apollo Advisor streaming component | `src/components/hud/ported/ApolloStream.tsx` | Talos-translator plus Erato-v2 | Builder demo fulcrum, logic valid, reuses `/api/apollo/stream` endpoint |
| Helios pipeline viz | `src/components/hud/ported/HeliosPipelineViz.tsx` | Talos-translator plus Erato-v2 | SideBar agent structure editor mini-viewer consumer |
| Cassandra prediction component | `src/components/hud/ported/CassandraPrediction.tsx` (conditional) | Talos-translator plus Erato-v2 | Keep if Builder flow surfaces prediction; else deprecate for vertical slice |
| `_meta/NarasiGhaisan.md` | unchanged | none | Voice anchor immutable |
| `CLAUDE.md` root | unchanged plus RV amendments footer | Ghaisan direct | V1 to V3 locks preserved, anti-pattern 7 overridden per RV.6 |
| FastAPI backend plus SQLite | unchanged | none | Runtime backend unchanged by UI pivot |
| Anthropic Python SDK Opus 4.7 orchestration | unchanged | none | Core build pattern unchanged |
| Managed Agents Heracles lane | unchanged | none | MA integration intact |
| P0 `docs/contracts/` core contracts | review for RV compatibility | Pythia-v2 | Subset carries forward |

### 7.2 PORT (refactor significantly)

| P0 artifact | RV destination | Responsible agent | Rationale |
|---|---|---|---|
| Dashboard shell React components | Replaced by `GameShell` plus `PhaserCanvas` plus React HUD | Thalia-v2 plus Erato-v2 | Shell is no longer a dashboard |
| 3-world color skin CSS | Absorbed into Phaser tilemap palette plus Hesperus SVG tokens | Thalia-v2 plus Hesperus | World differentiation moves from CSS class to game layer |
| Pixel styling accents | Absorbed into 32x32 sprite art uniform across worlds | Talos W2 plus Thalia-v2 | Aesthetic is now the primary medium, not an accent |
| V3 landing page if exists | Refactored by Kalypso | Kalypso | Align with hybrid game plus marketing surface split |

### 7.3 DEPRECATE (remove from RV build)

| P0 artifact | Rationale |
|---|---|
| V3 Kratos orchestrator role (hypothetical, if existed) | Replaced by Hephaestus-v2 generalist plus workers |
| V3 dashboard routing for 5 pillars | Collapsed into in-game systems (Marketplace shop, Banking currency, Registry NPC trust, Protocol caravan) plus `/play` plus `/leaderboard` plus `/` |
| V3 3-world skinning as routes | Replaced by Phaser scenes within single `/play` route |
| P5 3D cyberpunk city shipped code | Keep as reference only per CLAUDE.md "NEW WORK ONLY" rule, regenerate in isolated `/leaderboard` route post-MVP |

### 7.4 NEW (not in P0, authored fresh in RV)

| RV artifact | Responsible agent |
|---|---|
| Phaser 3 integration | Thalia-v2 plus Talos setup |
| Zustand bridge pattern | Erato-v2 plus Talos skill |
| Quest JSON schema plus runtime | Nyx |
| Dialogue JSON schema plus runtime | Linus |
| fal.ai Nano Banana 2 pipeline (dormant `.claude/skills/` transplant only, zero shipped invocation) | Talos |
| `.claude/skills/` 5 skill directory | Talos |
| Howler.js audio engine wrapper | Euterpe |
| Opus SVG HUD chrome plus Canvas procedural FX | Hesperus |
| 32x32 sprite atlases 3-world (sourced from CC0 Kenney plus Oak Woods plus Warped City, gap-filled by Opus SVG/Canvas procedural) | Talos (CC0 curation plus Opus procedural) plus Thalia-v2 (consume via atlas.json) |
| Mini Builder cinematic scene | Thalia-v2-B |
| i18n USD/IDR toggle | Erato-v2 |
| `.claude/hooks/` validation scripts | Talos |
| `asset-ledger.jsonl` | Talos |

Talos-translator will produce the authoritative matrix covering every P0 file; this seed is non-exhaustive.

---

## 8. Naming collision audit

Checked against four rosters per kickoff:

**MedWatch roster**: Ghaisan confirmed via Revision 2 bundle that three V4 pre-sketch names (Daedalus, Orpheus, Calliope) collided with MedWatch banned pool per `_meta/HACKATHON_HANDOFF_V1_TO_V2.md` Section 4. Swapped: Daedalus to Talos, Orpheus to Linus, Calliope to Kalypso. Remaining V4 pre-sketch names (Kratos, Nyx, Nike, Zelus, Hypnos, Moros, Eris) confirmed clean though Kratos, Nike, Zelus, Hypnos, Moros, Eris all dropped or absorbed per Section 8.3. Final roster clean.

**IDX roster**: Ghaisan confirmed clean via Revision 2. No collision with any RV-active name.

**P0 specialist roster**: Metis, Hephaestus, Pythia, Nemea, Ananke. RV reuses Hephaestus-v2, Pythia-v2, Nemea-RV with explicit `-v2` or `-RV` suffix to signal upgrade. Harmonia moves from P0 product to RV specialist (Harmonia-RV-A plus Harmonia-RV-B). Ananke remains unchanged.

**P0 product roster**: Apollo, Athena, Demeter, Tyche, Hecate, Proteus, Cassandra, Erato, Urania, Helios, Dionysus, Thalia, Eos, Artemis, Coeus, Dike, Rhea, Phoebe, Triton, Morpheus, Heracles, Harmonia, Poseidon. RV reuses Thalia-v2, Erato-v2 with explicit `-v2` suffix.

### 8.1 Fresh name audit (RV introductions)

| Name | Greek origin | P0 collision | MedWatch status | IDX status | Decision |
|---|---|---|---|---|---|
| Nyx | primordial goddess of night | none | CONFIRMED clean per Ghaisan | CONFIRMED clean | ACCEPT |
| Linus | poet musician, son of Apollo | none | CONFIRMED clean post-swap | CONFIRMED clean | ACCEPT |
| Kalypso | nymph of Ogygia, associated with lure and enchantment | none | CONFIRMED clean post-swap | CONFIRMED clean | ACCEPT |
| Talos | bronze automaton, master craftsman | none | CONFIRMED clean post-swap | CONFIRMED clean | ACCEPT |
| Hesperus | evening star, personification of Venus at dusk | none | CONFIRMED clean per Ghaisan | CONFIRMED clean | ACCEPT |
| Euterpe | muse of music and lyric poetry | none | CONFIRMED clean per Ghaisan | CONFIRMED clean | ACCEPT |
| Thea | titaness of sight and clear vision | none | CONFIRMED clean per Ghaisan | CONFIRMED clean | RESERVE (conditional) |
| Talos-translator | distinct suffix | internal disambiguation required | n/a | n/a | ACCEPT (explicit suffix distinguishes from product-side Talos) |

### 8.2 Suffix convention

- `-v2` signals P0 agent upgraded for RV (Thalia-v2, Erato-v2, Pythia-v2, Hephaestus-v2)
- `-RV-A` / `-RV-B` signals P0 specialist split into RV parallel lanes (Harmonia-RV-A, Nemea-RV-A)
- `-translator` signals distinct role within same Greek name (Talos vs Talos-translator)

### 8.3 Dropped names from V4 pre-sketch

| V4 name | Role in V4 | RV disposition | Absorbed by |
|---|---|---|---|
| Kratos | orchestrator | DROPPED | Hephaestus-v2 generalist pattern covers orchestration |
| Nike | inventory | DROPPED | Erato-v2 InventoryToast plus inventoryStore |
| Zelus | currency shop | DROPPED | Erato-v2 CurrencyDisplay plus ShopModal |
| Hypnos | audio | DROPPED | Replaced by Euterpe (cleaner semantic fit) |
| Moros | 3D leaderboard | DEFERRED to RV-4 | Kalypso absorbs as static mockup option |
| Eris | main lobby | DROPPED | Thalia-v2 ApolloVillageScene covers main lobby |

---

## 9. Token budget estimates

### 9.1 Per-agent projection

| Agent | Sessions | Input tokens | Output tokens | Est API cost |
|---|---|---|---|---|
| Talos | 3 | 120k | 50k | $18 to $22 |
| Nyx | 1 | 80k | 40k | $12 |
| Linus | 1 | 70k | 35k | $10 |
| Thalia-v2 | 2 | 120k | 60k | $18 |
| Erato-v2 | 1 | 100k | 50k | $15 |
| Hesperus | 1 | 60k | 30k | $8 |
| Euterpe | 1 | 50k | 25k | $7 |
| Kalypso | 2 | 60k | 25k | $9 |
| Thea (reserved) | 1 conditional | 40k | 20k | $6 |
| Pythia-v2 | 1 | 80k | 50k | $13 |
| Hephaestus-v2 | 1 batch | 180k | 80k | $22 |
| Talos-translator | 1 | 80k | 40k | $12 |
| Harmonia-RV-A | 1 | 70k | 25k | $9 |
| Harmonia-RV-B | 1 | 70k | 25k | $9 |
| Nemea-RV-A | 1 | 70k | 30k | $10 |
| Nemea-RV-B | 1 | 60k | 25k | $8 |
| **Active subtotal (16 agents)** | | **~1.29M input** | **~590k output** | **~$185** |
| **Plus Thea conditional** | | **+40k** | **+20k** | **+$6** |
| **Grand total ceiling** | | | | **~$190** |

Figures use Opus 4.7 pricing approximation (input approximately $15 per 1M, output approximately $75 per 1M). Rounded.

### 9.2 Budget alignment

Total P0 plus RV API budget: $500.

P0 spent (estimated from CLAUDE.md budget section Day 0 through Day 5, approximately Day 0 to Day 2.5 before RV pivot): approximately $250 to $300.

P0 remaining entering RV: approximately $200 to $250.

RV projection: **$185 to $190** active, plus Thea $6 conditional, plus iteration reserve. Revised down from initial $187 to $193 estimate due to Talos fal.ai subtask removal (Talos token budget reduced by approximately $3 to $7).

Margin: approximately $10 to $65 headroom against remaining budget. Tight but feasible. Ghaisan triggered revisions or additional QA loops could exceed; **halt plus re-scope ferry triggered at $140 spent** (75% of $185 to $190 ceiling, per Ghaisan Gate A Q6 response).

### 9.3 MA exposure

Heracles MA lane cap per CLAUDE.md budget section: $150 of $500. RV does not materially change Heracles MA scope (existing integration preserved per Section 7.1 KEEP). MA exposure carries forward unchanged.

### 9.4 fal.ai budget (post-revision: zeroed)

Ghaisan personal fund: $0.

Per Revision 1 bundle: fal.ai Nano Banana 2 pipeline removed from shipped scope entirely. M1 Section 6.1 projection of $2.32 for vertical-slice sprite batch is now deprecated. Fal.ai artifacts (skill SKILL.md, `lib/falClient.ts`, `scripts/slice-sprite.py`) transplanted as dormant infrastructure for post-hackathon activation. Asset strategy shipped with CC0 Kenney plus Oak Woods brullov plus Warped City plus Opus SVG/Canvas procedural only. Honest-claim line in README enforces scope accuracy per Section 4.1 Talos output files.

---

## 10. Halt triggers and strategic decision hard-stops catalog

### 10.1 Global halt triggers (any agent)

Per CLAUDE.md Section 7 anti-patterns plus RV extensions:

1. Em dash detected in any output
2. Emoji detected in any output
3. Scope narrow suggestion (5-pillar scope is locked)
4. Silent-assume on ambiguous cross-cutting decision (halt and ferry)
5. Proposing Vercel push (deferred pending Ghaisan explicit final lock)
6. Per-file Hephaestus ferry attempt (batch session pattern locked)
7. Gemini, Higgsfield, or non-Anthropic runtime execution (asset generation fal.ai authorized per RV.6 override BUT not exercised in shipped build per Ghaisan personal fund $0 constraint; runtime execution remains Anthropic-only)
8. Context window approaches 97% (compact and resume next session)
9. Any `.claude/skills/<n>/SKILL.md` exceeds 500 lines
10. `pnpm build` failure
11. 23:00 WIB hard stop reached
12. Ghaisan explicitly commands halt via ferry

### 10.2 Per-agent strategic decision hard-stops

Consolidated from Section 4 per-agent templates. Any of the following requires V4 ferry approval before proceeding:

- Diverging from revised asset hierarchy (CC0 primary, Opus SVG/Canvas procedural gap-fill, fal.ai dormant-only infrastructure transplant)
- Activating fal.ai pipeline in shipped build (explicit scope violation, Ghaisan personal fund $0 constraint)
- Changing 32x32 SNES-era pixel resolution
- Adopting inkjs, Yarn Spinner, Twine, or rex DialogQuest for dialogue runtime
- Adopting behavior tree or dependency graph for quest runtime
- Rendering HUD, currency, shop, prompt input, dialog, or inventory inside Phaser canvas
- Embedding any React component inside Phaser scene
- Using fal.ai for any shipped asset in RV (fal.ai transplanted as dormant skill only, zero shipped invocation)
- Composing original music (hackathon scope is curate CC0 only)
- Embedding live Phaser canvas on landing page
- Adding 3D WebGL effect to landing page
- Adding multi-vendor model beyond Opus 4.7 plus Sonnet 4.6 in shipped selector
- Diluting "NERIUM built itself" meta-narrative
- Claiming feature not shipped (honest-claim per CLAUDE.md Section 7)
- Swapping Phaser 3 for Phaser 4 beta
- Swapping Zustand for Redux or Jotai
- Deprecating Apollo Advisor core logic
- Rewriting components Ghaisan explicitly marked REUSE
- Per-file Hephaestus ferry
- Adding new tech stack component (CLAUDE.md tech stack is locked)
- Skipping brullov or Kenney attribution in CREDITS.md

### 10.3 Ferry escalation protocol

Any halt trigger or strategic hard-stop: agent writes halt notice to `_meta/halt_log/<timestamp>_<agent>.md` with reason plus proposed resolution options plus recommended option. Ghaisan receives via V4 ferry message. Ghaisan approves or redirects. Agent resumes.

---

## 11. Self-check 19 of 19

Per V3 Metis pattern. Each item must be YES or EXPLICITLY NA before handoff.

1. **All agent names Greek mythology from fresh pool, no collision with P0 roster**: YES. Nyx, Linus, Kalypso, Talos, Hesperus, Euterpe, Thea all verified non-collision with P0 specialist, P0 product, MedWatch banned pool (per `_meta/HACKATHON_HANDOFF_V1_TO_V2.md` Section 4), and IDX rosters. Initial Metis-v2 pre-revision pick of Daedalus plus Orpheus plus Calliope collided with MedWatch banned pool; swapped per Revision 2 bundle to Talos plus Linus plus Kalypso. Resolution documented in Section 12 Q1.
2. **95% Opus 4.7 distribution preserved**: YES and exceeded. 16 of 16 active agents on Opus 4.7 equals 100%. Deterministic work via script execution.
3. **No em dash anywhere in this document**: YES. Verified via scan. All grammatical separators use comma, period, parentheses, or sentence break.
4. **No emoji anywhere in this document**: YES. Verified via scan.
5. **Technical artifact in English**: YES. Entire document in English.
6. **Reuse-rewrite matrix aligned with RV_PLAN Section 4 guidance**: YES. Section 7 references RV_PLAN Section 4 directly as authoritative source (per Ghaisan Gate A response); Talos-translator finalizes per-artifact decisions in Wave 1. No schema duplication, no conflict with master.
7. **Dependency graph acyclic**: YES. Section 5.3 manual verification.
8. **Parallel wave schedule respects upstream dependencies**: YES. Section 6 wave boundaries align to dependency table 5.2.
9. **Every agent has upstream and downstream defined**: YES. Section 4 each template.
10. **Every agent has halt triggers defined**: YES. Section 4 each template plus Section 10.1 global.
11. **Every agent has strategic decision hard-stops defined**: YES. Section 4 each template plus Section 10.2 consolidated.
12. **Every agent has token budget estimate**: YES. Section 4 each template plus Section 9 aggregated.
13. **Every agent has input files and output files enumerated**: YES. Section 4 each template.
14. **Hephaestus-v2 batches all prompts in single session (anti-pattern 6 respected)**: YES. Section 4.11. Halt only at context threshold.
15. **`.claude/skills/` committed to repo, not `_skills_staging/` gitignored**: YES. Section 4.1 Talos output files explicitly commits `.claude/skills/` and gitignores `_skills_staging/`.
16. **No agent prompt expected to exceed 500 lines**: YES. Hephaestus-v2 halt trigger caps at 400 lines. Skill authoring discipline per M1 Section 4.3 caps SKILL.md under 500 lines.
17. **Revised asset hierarchy preserved (CC0 primary, Opus SVG/Canvas procedural gap-fill, fal.ai dormant transplant only)**: YES. Section 4.1 Talos plus Section 4.6 Hesperus plus Section 10.2 hard-stops enforce. Original fal.ai-primary hierarchy removed per Ghaisan personal fund $0 constraint.
18. **Phaser imported only in dynamically loaded module**: YES. Section 4.4 Thalia-v2 output files structure SSR boundary. `phaser3spectorjs` alias in `next.config.ts` per Section 4.1 Talos.
19. **32x32 SNES-era pixel art uniform across three worlds**: YES. Section 2 approved decision locked. Section 4.1 Talos CC0 Kenney plus Oak Woods plus Warped City 32x32 sources enforce. Section 4.4 Thalia-v2 scene resolution matches.

**Self-check result: 19 of 19 pass. All items YES (item 6 upgraded from PARTIAL to YES per Ghaisan Gate B acceptance and Ghaisan Gate A Q2 direct RV_PLAN Section 4 reference lock).**

---

## 12. Open questions for Ghaisan (final review before M3)

Low-risk, informational, defaults proposed.

1. **MedWatch plus IDX roster collision**: RESOLVED via Ghaisan Gate A Q1 response and Revision 2 bundle. Three names originally proposed by Metis-v2 (Daedalus, Calliope, Orpheus) collided with MedWatch banned pool per `_meta/HACKATHON_HANDOFF_V1_TO_V2.md` Section 4. Swapped: Daedalus to Talos, Calliope to Kalypso, Orpheus to Linus. Final 7 RV-fresh names verified clean against MedWatch plus IDX plus P0 specialist plus P0 product rosters: Talos, Linus, Kalypso, Nyx, Hesperus, Euterpe, Thea. No further action required.
2. **RV_PLAN Section 4 authoritative reuse-rewrite matrix**: RESOLVED via Ghaisan Gate A Q2 response. Section 7 references RV_PLAN Section 4 directly (Ghaisan mandatory reading attachment) without duplicating the matrix text. Talos-translator in Wave 1 produces the authoritative per-artifact decisions in `docs/phase_rv/REUSE_REWRITE_MATRIX.md`. No duplication, no re-paste.
3. **Harmonia-RV-C plus Nemea-RV-C splits**: Reserved as unspawned. Spawn if Ghaisan wants pre-emptive cross-world cohesion QA, else skip. Default: skip.
4. **Thea conditional spawn authority**: Does Talos in-line Claude check-loop have authority to escalate to Thea spawn autonomously, or must every Thea spawn go through V4 ferry? Default: V4 ferry only.
5. **Kalypso static leaderboard mockup on landing**: Include as part of Kalypso scope, or strictly defer any leaderboard visual to post-MVP? Default: include as low-effort visual decoration only if Kalypso session has headroom.
6. **Budget alert threshold**: RESOLVED via Ghaisan Gate A Q6 response. Trigger: **$140 spent** on RV Anthropic API (75% of revised $185 to $190 ceiling, tighter than initial $150 default). Trips halt plus re-scope ferry giving Ghaisan response buffer before hitting hard ceiling.

---

## 13. Handoff notes to M3 (optional flow diagram) and Hephaestus-v2

### 13.1 If M3 proceeds

M3 produces `RV_agent_flow_diagram.html` interactive visualization of:
- 16 active nodes plus 1 reserved
- 4-wave layout with dependency arrows
- Model distribution color coding (all Opus 4.7 single color for 100% consistency highlight)
- Hover: per-node summary pulling from this document Section 4
- Click: expand halt triggers plus hard-stops
- Optional play-mode animating wave progression

M3 is optional per kickoff; can skip if Ghaisan prefers to proceed directly to Hephaestus-v2 prompt authoring for time economy.

### 13.2 Hephaestus-v2 consumption checklist

When Hephaestus-v2 batch authors `.claude/agents/<n>.md` for each product-side worker, the prompt file must include:

- **Frontmatter**: `name`, `description` (pushy trigger phrases), `model: opus-4-7`, `tools` allowlist
- **Mandatory reading preamble**: `RV_MANAGED_AGENTS_RESEARCH_v2.md`, `RV_NERIUM_AGENT_STRUCTURE_v2.md` (this doc, agent's own section), Pythia contracts assigned (per Section 4 upstream), assigned skills (per Section 4 upstream), `CLAUDE.md`, `NarasiGhaisan.md`
- **Role body**: role statement, scope boundaries, deliverables, halt triggers, strategic decision hard-stops, token budget
- **Handoff protocol**: per agent downstream from Section 4
- **Collaboration protocol**: "Question, Options, Decision, Draft, Approval" plus "May I write this to [filepath]?" before every write-tool use
- **Anti-pattern 7 honor**: shipped runtime execution Anthropic only; asset generation fal.ai authorized by RV.6 override but zero shipped invocation per Ghaisan personal fund $0; CC0 plus Opus procedural only in shipped build

Each prompt target length: 150 to 400 lines. Hephaestus-v2 halt trigger 400 lines per prompt; context threshold 97% overall session.

### 13.3 Wave 1 kickoff readiness

After V4 ferry approves M2 (plus optional M3), Hephaestus-v2 plus Pythia-v2 plus Talos-translator plus Talos W1 can spawn in parallel on Kamis evening. Ghaisan triggers Wave 1 via Claude Code terminal launches.

---

## 14. Version history

- v1 (this document, April 23, 2026): initial RV agent structure by Metis-v2 post-M1 research and post-Ghaisan Gate 1 to 3 approval.

**End of M2. Awaiting V4 ferry approval. No Wave 1 spawn until Ghaisan approves.**
