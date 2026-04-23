---
agent: talos-translator
phase: RV-1 P0 artifact migration
scope: ported reference skeletons for Erato-v2 HUD consumption
date: 2026-04-23
version: 1.0.0
status: shipped, reference only
---

# Ported HUD reference skeletons

Three components ported from V3 dashboard context to RV in-game HUD reference skeletons. Erato-v2 (Wave 3) consumes these as starting points to author the game HUD overlay surfaces. These are NOT drop-in replacements; they illustrate the porting intent and preserve the logic that transfers.

## Files

| File | Ported from | Erato-v2 target |
|---|---|---|
| `ApolloStream.tsx` | `app/advisor/ui/AdvisorChat.tsx` | BottomBar DialogueOverlay (Advisor NPC dialog in-game) |
| `HeliosPipelineViz.tsx` | `app/builder/viz/PipelineCanvas.tsx` | SideBar pipeline mini-viewer |
| `CassandraPrediction.tsx` | `app/advisor/ui/PredictionWarning.tsx` | HUD warning banner overlay |

## What "port" means here

**Preserved (imports from V3 KEEP files)**:
- Apollo session types (`AdvisorSession`, `AdvisorTurn`, `AttachedComponent`, `Locale`, `ModelStrategy`) from `@/app/advisor/apollo`
- Central event bus envelope from `@/app/shared/events/pipeline_event`
- Pipeline visualizer view types from `@/app/builder/viz/types`
- Cassandra prediction schema from `@/app/builder/prediction/schema`
- Apollo brevity helpers `countSentences`, `countQuestionMarks`
- Framer Motion animation patterns
- Zustand factory pattern (`createPipelineStore`)
- ARIA attributes + `prefers-reduced-motion` honor
- Honest-claim annotation copy conventions

**Removed (V3 dashboard-specific)**:
- 6-callback prop drilling (Erato-v2 replaces with Zustand narrow selectors per translator_notes.md gotcha 3)
- `window.dispatchEvent(new CustomEvent('nerium:*'))` escape hatches (gotcha 5)
- Dashboard CSS class namespaces like `.advisor-*`, `.viz-*` (gotcha 7)
- `applyWorld()` cascade coupling (gotcha 8)
- Inline styles specific to dashboard layout (reset or stripped)

**Added (game HUD context)**:
- Data attributes for Zustand bridge hook-up (`data-hud-role`)
- Comments pointing to Erato-v2 integration tasks
- Minimal props surface; state lifts to store

## Consumer (Erato-v2) integration steps

1. Read `translator_notes.md` gotchas 1 through 28 before touching these files.
2. Author `src/stores/advisorStore.ts`, `src/stores/pipelineStore.ts`, `src/stores/warningStore.ts` as narrow Zustand slices.
3. Subscribe HUD elements (TopBar, BottomBar, SideBar) to the stores via `subscribeWithSelector`.
4. Wrap these ported skeletons as the presentation layer of your HUD surfaces.
5. Drop prop drilling in favor of store actions.

## Path aliases notice

V3 `tsconfig.json` does NOT declare a `@/*` path alias, and no `next.config.ts` exists yet. These ported files use deep relative imports (`../../../../app/...`) to reach V3 KEEP files. Talos-v2 W1 setup authors `next.config.ts` per M2 Section 4.1 output list; at that point path aliases may be introduced and Erato-v2 may migrate the relative imports to aliased imports in a single mechanical pass. Do not preemptively introduce an alias here without coordinating with Talos-v2.

## Hard constraint honored

No em dash, no emoji. Zero across these 3 files plus this README per Nemea-RV-B voice audit discipline.

## What these are NOT

- NOT a replacement for V3 AdvisorChat / PipelineCanvas / PredictionWarning. The V3 files stay under `app/` (KEEP in matrix).
- NOT production-ready game HUD. Erato-v2 authors the final production surfaces with Zustand + game-HUD tokens.
- NOT demoable standalone. These import types and logic from V3 KEEP files; they require the full V3 Apollo plus Helios plus Cassandra implementation to work at runtime.
