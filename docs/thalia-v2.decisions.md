---
author: Thalia-v2
session: W2 Session A plus W3 Session B
date: 2026-04-23
status: accepted
---

# Thalia-v2 Session A plus Session B Decisions

Running ADR log for choices that affect cross-agent contracts, file-path conventions, or scope. Decisions below are in force unless superseded by a later ADR signed by V4 or by a Pythia-v2 contract amendment.

## ADR-1 App Router path resolution (gotcha 19)

**Context.** M2 Section 4.4 lists `src/app/play/page.tsx` as the target output for the `/play` route. The actual Next.js 15 App Router in this repository lives at project root `app/`, not at `src/app/`. `tsconfig.json` has no `src/app` include specifically but the glob `**/*.ts` would admit either location. `app/layout.tsx` already exists at project root and wires globals.css + harness.css.

**Options considered.**

1. Author `src/app/play/page.tsx` per M2 literal path, accepting that two App Router roots would collide at build.
2. Migrate the entire existing `app/` tree to `src/app/`, adjusting all V3 pillar page imports.
3. Author `app/play/page.tsx` at project root, matching the existing router location, and treat M2's `src/` prefix as a convention guide rather than a dictate.

**Decision.** Option 3. The M2 path list used `src/` as a grouping convention; the concrete router location is already fixed by V3. Migrating everything to `src/app/` is out of scope for Session A and would break V3 pillar pages under the active harness.

**Consequence.** `app/play/page.tsx` exists at project root. Erato-v2 and Kalypso who reference the page route by URL (`/play`) remain unaffected. If V4 later decides to consolidate into `src/app/`, the migration is one `git mv` that is not blocking today.

## ADR-2 Bridge module file location (contract versus M2 path)

**Context.** M2 Section 4.4 output list names `src/lib/gameBridge.ts`. Pythia-v2 `zustand_bridge.contract.md` Section 6 places the bridge at `src/state/gameBridge.ts`. The contract is the cross-agent authority per Section 9 of NarasiGhaisan.md.

**Decision.** Author the bridge at `src/state/gameBridge.ts` per contract. Provide a thin re-export at `src/lib/gameBridge.ts` so callers following the M2 path still resolve.

**Consequence.** Two file paths, one source of truth. Downstream agents may import from either; both point at the same module.

## ADR-3 Store implementation scope (Session A scaffolds versus full domain ownership)

**Context.** `src/state/stores.ts` declares the five Zustand stores per `game_state.contract.md`. Full action-body implementation belongs to domain-owning agents (Nyx for quest, Linus for dialogue, Erato-v2 for inventory and UI, Euterpe for audio). The bridge module must, however, call `subscribe` and `getState` on all five stores TODAY.

**Decision.** Thalia-v2 ships the MINIMUM viable shape per store: every action listed in the contract is exported, bodies are populated where trivial, stub bodies that `console.info` the call are used where the full FSM belongs to a downstream agent. Each stub is marked with a `STUB` comment citing the owning agent.

**Consequence.** Bridge wiring is runtime-correct today. Downstream agents replace stub bodies in place; the store hook references and contract-conformant field shapes do not change.

## ADR-4 Atlas tile resolution (16x16 sprites on a 32x32 tile grid)

**Context.** The Thalia-v2 spec says "32x32 top-down tilemap". The existing V3 atlases at `public/assets/worlds/{world}/atlas.png` are 64x64 PNGs containing a 4x4 grid of 16x16 sprites (16 slots per `app/builder/worlds/sprite_slots.ts`). Talos W2 was slated to regenerate these; the regenerated artifact is not yet in `public/assets/packs/` at Session A start.

**Decision.** Consume existing V3 atlases as-is: 16x16 sprite frames placed on a 32-column by 20-row tile grid inside ApolloVillageScene. Camera zoom (2x to 4x auto-scaling) produces the SNES-era visual density the spec intended. This is compatible with sprite_slots.ts semantics.

**Consequence.** Asset pipeline unchanged; no dependency on Talos W2 regeneration. When Talos ships new atlases with character/NPC sprites in additional slots, ApolloVillageScene.ts slot constants are the only edit needed.

## ADR-5 Deferred `git mv` moves postponed past Session A

**Context.** Gotcha 22 assigns Thalia-v2 ownership of moving `app/_harness/HarnessShell.tsx`, `ClientThemeBoot.tsx`, `harness.css`, `app/advisor/page.tsx`, `app/builder/page.tsx` to `_deprecated/`. Problem: `HarnessShell` is imported by FOUR additional pillar pages not in the Thalia-v2 move list (marketplace, registry, protocol, and the root page). Executing the harness move while those pages still import it would break the dev-server rendering for every remaining V3 pillar page.

**Options considered.**

1. Move only the listed files, accept broken pillar pages.
2. Move listed files plus rewire remaining pillar pages in the same commit (scope creep into Erato-v2 / Harmonia-RV ownership).
3. Defer moves until a later cleanup pass (post-Harmonia-RV-A integration) where the harness dependency is removed across all pillars in a single coordinated commit.

**Decision.** Option 3. The deferred moves wait for a later worker (candidate: Harmonia-RV-A integration pass or an explicit Talos cleanup spawn) that can retire the harness in lockstep across every pillar page. This preserves V3 pillar surfaces during the game-engine wave.

**Consequence.** `app/_harness/*`, `app/advisor/page.tsx`, `app/builder/page.tsx` remain at their V3 locations. A follow-up ADR will mark the moves executed when the cleanup occurs. No surprise breakage for judges who browse to `/marketplace`, `/registry`, `/protocol`, or `/` during the vertical slice playtest.

## ADR-6 Session A owns scene core only; cinematic deferred to Session B

**Context.** The Hephaestus-v2 prompt spans two sessions (W2 scenes core, W3 cinematic). Session A kickoff scopes scenes core only.

**Decision.** MiniBuilderCinematicScene is NOT authored in Session A. Placeholder registration is omitted from `PhaserCanvas` scene list to prevent a half-built scene from appearing in the scene registry. Session B adds the cinematic scene plus its `game.cinematic.*` emission wiring.

**Consequence.** `src/game/scenes/MiniBuilderCinematicScene.ts` does not exist at end of Session A. Nyx's `builder-run-started` trigger (quest step 4) cannot yet call `this.scene.start('MiniBuilderCinematic')`; Nyx must stage the trigger so it no-ops if the scene key is absent, OR Nyx can author against the Session B spec and wait for Thalia-v2 W3 to land.

## ADR-7 Cinematic fixture: historical 22-node (gotcha 9)

**Context.** The V3 Urania Blueprint Moment bundles a historical 22-agent roster at `app/builder/moment/BlueprintReveal.tsx` (`NERIUM_TEAM_NODES`). The RV phase roster at `docs/phase_rv/RV_NERIUM_AGENT_STRUCTURE_v2.md` Section 3.1 is 16 agents (9 product-side plus 7 specialists). Gotcha 9 of `_meta/translator_notes.md` requires an explicit decision: "either is valid, do not silently mix".

**Options considered.**

1. Historical 22-node. Matches the submission's meta-narrative "NERIUM built itself by running the manual workflow it automates, one last time" because the 22 agents ARE the pipeline that built the shipped product.
2. Current-state 16-node RV roster. More operationally accurate for a post-hackathon reader but less visually dense and less tied to the actual judge-facing story.
3. Dual-layer (both rosters mapped onto the scene). Explicitly forbidden by gotcha 9.

**Decision.** Option 1. MiniBuilderCinematicScene renders the literal 22-agent roster (advisor 1 plus leads 5 plus ma_lane 1 plus workers 15) inherited verbatim from `NERIUM_TEAM_NODES`. A comment in the scene source references the historical snapshot to make the choice auditable.

**Consequence.** The cinematic, the V3 Blueprint Moment (for any demo video still reachable via Urania code), and the README meta-narrative line are all telling the same 22-agent story. If the RV roster later ships as part of a second-quest cinematic, that second cinematic is authored against a separate fixture and the scene shell reused, not the historical fixture mutated.

## ADR-8 Scene launch pattern: pause lobby plus launch cinematic

**Context.** `scene.start('MiniBuilder')` would stop the ApolloVillage lobby, forcing a full reinitialization on return (tile rebuild, NPC respawn, camera reconfigure, bus re-registration). `scene.launch('MiniBuilder')` keeps the lobby mounted behind the cinematic but leaves the lobby's input and update ticks running. Neither default suits a short scripted sequence where the player should return to their exact position without re-seeing the scene fade-in.

**Decision.** Bridge launches the cinematic with `scene.pause('ApolloVillage')` followed by `scene.launch(MINI_BUILDER_SCENE_KEY, { key, returnToScene: 'ApolloVillage' })`. The cinematic scene calls `scene.resume('ApolloVillage')` and `scene.stop()` in its `finishCinematic()` cleanup. This preserves lobby state across the cinematic, yields a clean camera handoff, and does not leak event listeners because the bus subscription on the lobby scene side runs off `scene.events` not a loop.

**Consequence.** Post-hackathon expansion to a second lobby (Cyberpunk Shanghai) requires passing the active lobby key into the cinematic via scene data, which the `returnToScene` field already supports. The bridge hard-codes `ApolloVillage` as the only lobby for the vertical slice.

## ADR-9 Cinematic trigger path: questEffectBus subscribed inside gameBridge

**Context.** `src/stores/questStore.ts` emits `play_cinematic` onto `questEffectBus` (a local EventEmitter-style bus in `src/lib/questRunner.ts`) when the Lumio onboarding quest reaches the appropriate step. Something must translate that bus event into a Phaser `scene.launch` call. Candidate owners: (a) `ApolloVillageScene` subscribes during `create()`, (b) `gameBridge.ts` subscribes during `wireBridge()`, (c) a new standalone `cinematicCoordinator` module.

**Decision.** Option (b). The bridge already owns the single translation layer between Zustand and Phaser (`zustand_bridge.contract.md` Section 4), and `questEffectBus` is logically another Zustand-adjacent emitter. Adding a standalone coordinator would proliferate one-file modules without contract backing. Wiring inside the ApolloVillageScene would couple cinematic orchestration to a specific scene, blocking a future Cyberpunk Shanghai lobby from reusing the path.

**Consequence.** The bridge imports `questEffectBus` from `src/lib/questRunner.ts` and `MINI_BUILDER_SCENE_KEY` from the cinematic scene file. Teardown disposes of the bus subscription alongside the other disposers, so Strict Mode double-mount still shows a single active subscription at any time.

## ADR-10 Cinematic duration: 12,000 ms

**Context.** Session B brief caps the cinematic at 10 to 15 seconds. Shorter feels cramped for a 22-node reveal plus camera pullback plus MA highlight. Longer risks dominating the 3-minute demo video budget (Kalypso will likely cut 15 to 20 seconds total for this moment including framing lines).

**Decision.** 12,000 ms total. Breakdown lives in the scene file header comment. Phase timings are constants at the top of the file, tuneable if Harmonia-RV-B or Nemea flag pacing issues during integration polish.

**Consequence.** The `CinematicCompletePayload` durationMs lands at approximately 12,000 in normal playback. Smoke test asserts the completion event fires under 15,000 ms as a soft bound (`MINI_BUILDER_TOTAL_MS + 120 ms fallback timer`).
