---
author: Thalia-v2
session: W2 Session A
date: 2026-04-23
status: accepted
---

# Thalia-v2 Session A Decisions

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
