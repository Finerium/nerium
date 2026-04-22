---
name: Thalia Decisions Log
description: ADR log for Thalia P3b Builder Worker 2D pixel worlds, including sprite license records and strategic_decision ferry items.
agent: thalia
phase: P3b
date: 2026-04-22
status: complete
---

# Thalia Decisions Log

Architecture decisions and license records for the 2D pixel world visualization surface produced under `app/builder/worlds/`.

## Mandatory reading record

- `_meta/NarasiGhaisan.md` Section 7 (three-world preference) and Section 8 (visual + business first) read and applied.
- `CLAUDE.md` root context applied: no em dash, no emoji, no Gemini or Nano Banana, NEW WORK ONLY on the NERIUMcyberpunkcity.html aesthetic reference.
- `docs/contracts/world_aesthetic.contract.md` v0.1.0 consumed: Section 3 schema, Section 4 registry surface, Section 5 event signatures, Section 6 file paths, Section 7 naming, Section 8 error handling.
- `docs/contracts/sprite_atlas.contract.md` v0.1.0 consumed: atlas and sprite shape, license enum, registry API, attribution report contract.
- `docs/contracts/design_tokens.contract.md` v0.1.0 consumed: Early-Harmonia `design-tokens.ts` shape reused by the world descriptors to keep OKLCH values consistent across the token file and the `WorldPalette` primitives.
- `app/builder/viz/PipelineCanvas.tsx` scanned to align with Helios agent-node semantics.
- `docs/phase_0/NERIUM_AGENT_STRUCTURE.md` Section 5.13 (Thalia spec) followed.

## ADR-01: Default world on first Builder run (ferried to V3)

Context: Thalia `strategic_decision_hard_stop` Section of the prompt file required ferry on the default world question. Ghaisan has not greenlit an explicit default.

Recommendation: `cyberpunk_shanghai` because (a) it is the existing NERIUMcyberpunkcity.html brand aesthetic, (b) NarasiGhaisan Section 23 cites cyberpunk visual preference, (c) shipped build renders well in dark mode for demo video contrast. Implementation honors the recommendation via `DEFAULT_WORLD = 'cyberpunk_shanghai'` in `WorldAestheticRegistry.ts` until V3 confirms.

Decision: `cyberpunk_shanghai` provisional. Flagged in session end-of-turn ferry for V3 explicit confirm.

## ADR-02: World switch free-choice versus tier-gated (ferried to V3)

Context: Thalia `strategic_decision_hard_stop` also covers whether the world switcher is free or paywalled under a Builder tier.

Recommendation: Free. World aesthetic is playful identity, not premium functionality. Tier-gating playfulness undermines the NarasiGhaisan Section 7 delight framing and discourages exploration of the 3-world surface that the demo video features.

Decision: Free implemented. The `WorldSwitcher.tsx` component has no tier checks. Revisit post-hackathon if monetization research surfaces specific demand for premium theme packs.

## ADR-03: Sprite size 16 times 16 on a 4 by 4 atlas grid (64 times 64 PNG)

Considered: 32 times 32 tiles on a 256 times 256 atlas (classic RPG feel, more detail budget per sprite), and 8 times 8 tiles on a 32 times 32 atlas (ultra-retro).

Chosen: 16 times 16 tiles, 4 by 4 grid, 64 times 64 PNG per world.

Why: 16 times 16 is the classic NES and Pokemon Gen 1 tile size, reads unambiguously as pixel art, stays below 1 KB compressed per world atlas (actual encoded sizes: medieval 785 bytes, cyberpunk 615 bytes, steampunk 726 bytes), and keeps the sprite count tight enough that every slot is intentional rather than filler. The atlas ships at native 64 px and is scaled 3 times at render time for on-screen visibility.

How to apply: The 4 by 4 grid is codified in `app/builder/worlds/sprite_slots.ts` with 16 semantic slot IDs shared across all worlds. A consumer that resolves a sprite by slot name (for example `agent_node_active`) works regardless of active world.

## ADR-04: Opus-procedural sprite generation over CC0 packs for session 1

Considered: Download Kenney.nl "1-Bit Pack" (2024 edition, CC0), OpenGameArt "Tiny 16 City" (CC0), or commission Claude Design generation for sprite art.

Chosen: 100 percent Opus-procedural sprites authored through `scripts/build_world_atlases.mjs`. Pure Node zlib-based PNG encoder, no external image toolchain.

Why: (1) Hard constraint `NO Gemini / Nano Banana / Higgsfield` in the Thalia prompt plus V2 Anti-pattern 7 locked CC0-plus-procedural only. (2) Network downloads were out of session scope. (3) Procedural pipeline is deterministic and re-runnable: edit the drawer function, run `node scripts/build_world_atlases.mjs`, atlas regenerates. (4) License is clean MIT matching the NERIUM repo root, zero attribution debt.

How to apply: Future contributors can add sprites by editing the drawing functions in `scripts/build_world_atlases.mjs` then re-running. CC0 pack imports remain an option post-hackathon if detail density becomes a demo requirement; the atlas schema accepts either procedural or CC0 sources in the same license enum.

## ADR-05: Mirror atlas.png to two paths

Chosen: Write every PNG to both `public/assets/worlds/{world_id}/atlas.png` (URL-accessible via Next.js static serving) and `app/builder/worlds/{world_id}/tiles.png` (colocated with `atlas.json` and `descriptor.ts` per the Thalia prompt file-path spec).

Why: The Thalia prompt output list specifies `tiles.png` colocated with the atlas JSON. The Pythia `sprite_atlas.contract.md` Section 3 defines `image_path` as "relative to /public". The two paths can be reconciled by writing the file twice; each copy is under 1 KB so the cost is negligible.

How to apply: `atlas.json` sets `image_path: "/assets/worlds/{world_id}/atlas.png"`. Runtime consumers (SpriteAtlasRegistry, Pixi `Assets.load`) hit the public URL. The app-dir copy exists for contract-spec conformance and for potential future webpack static imports; drop it without behavior change if the redundancy becomes a lint concern.

## ADR-06: Typed TypeScript mirror of atlas.json

Chosen: `app/builder/worlds/{world_id}/atlas.ts` imports `atlas.json` and re-exports it typed as `SpriteAtlas`.

Why: Next.js 15 supports JSON imports when `resolveJsonModule` is enabled, but the project currently ships no explicit `tsconfig.json` (Next auto-generates on first `next dev`). Wrapping the JSON import in a typed module gives consumers a stable path that works whether the JSON import is eager, lazy, or substituted with a fetch loader in a later refactor.

How to apply: When `atlas.json` changes, both files update naturally because `atlas.ts` imports the JSON directly. If the project later removes JSON module resolution, swap the import for an inlined object literal or a fetch-driven loader without touching every consumer.

## ADR-07: Pixi.js dynamic import for SSR safety

Chosen: `ConstructionAnimation.ts` loads `pixi.js` via dynamic `await import('pixi.js')` inside `mount()`.

Why: Pixi.js is a WebGL runtime that fails at module load under Node SSR. Dynamic import keeps the server bundle free of Pixi and defers the fetch to the browser on mount. The consuming React surface must itself live behind a `'use client'` boundary or `next/dynamic` wrapper.

How to apply: Consumers receive a class they instantiate then call `mount(container)` on. The hydration pathway is `mount` returns a promise; render a placeholder until it resolves. Storybook and Nemea regression surfaces can skip the mount entirely and drive the class via `addFloor` in a stub harness.

## ADR-08: Shared sprite slot layout across all three worlds

Chosen: The same 16 semantic slot IDs and their grid positions apply to every world atlas. `sprite_slots.ts` is the canonical listing.

Why: ConstructionAnimation, Helios agent-node sprite reuse, Urania Blueprint Moment reveal, and Nemea regression all need to resolve sprites by semantic identity (for example `agent_node_active`) without branching on active world. A uniform slot layout collapses three parallel sprite registries into one lookup path and keeps the atlas generator script trivial to extend (one drawer function per slot per world).

How to apply: Adding a new sprite slot requires (a) appending to `SPRITE_SLOTS` in `sprite_slots.ts`, (b) extending the atlas size in the build script, (c) adding three drawer functions (one per world) to `scripts/build_world_atlases.mjs`, (d) adding three sprite entries to the three `atlas.json` files. No consumer changes if the slot ID is referenced through `slotFrame`.

## ADR-09: Ambient flicker implemented via ticker, not per-frame sprite swap

Chosen: `ConstructionAnimation.tick` runs a simple 15-tick ambient toggle. Full implementation with paired `ambient_on` and `ambient_off` sprite swap is noted as a follow-up.

Why: Session time budget. The demo-grade visual pops without per-sprite texture swap. The scaffold is in place; a follow-up session can wire the animation IDs from `{world_id}/animations.ts` to concrete texture rotations.

How to apply: `animations.ts` per world already declares the `ambient_flicker` sequence with correct fps. To upgrade, iterate lamp sprites in `rebuildScene` and swap their `texture` reference based on `animElapsed % (framesInSequence * fps)`.

## Sprite license records (48 sprites total, 16 per world)

All 48 sprites across the three atlases are Opus-procedural originals. No Kenney.nl, OpenGameArt, Claude Design, Gemini, Nano Banana, or Higgsfield assets shipped.

| Atlas | Sprite count | Source | License | Attribution required |
|---|---|---|---|---|
| `medieval_desert_atlas_v1` | 16 | `opus_procedural` | MIT | false |
| `cyberpunk_shanghai_atlas_v1` | 16 | `opus_procedural` | MIT | false |
| `steampunk_victorian_atlas_v1` | 16 | `opus_procedural` | MIT | false |

Attribution report via `spriteAtlasRegistry.attributionReport()` returns three entries with empty `attributions` arrays. `public/assets/attributions.md` reflects this state and carries the reference inspirations that informed the visual vocabulary but were not copied.

## Reference inspirations (not used as assets)

Visual vocabulary references for tone-matching only; no pixel data copied.

- Kenney.nl "1-Bit Pack" and "Tiny Town" (CC0). Reference for minimal silhouette discipline.
- OpenGameArt "Tiny 16 City" and "Micro Roguelike" (CC0). Reference for tile grid density and palette limits.
- NERIUMcyberpunkcity.html in the reference folder. Palette reference only per V2 Anti-pattern 7 NEW WORK ONLY rule.
- Dune (Villeneuve 2021 and 2024), Moroccan souk photography. Palette reference for Medieval Desert.
- Blade Runner 2049, Ghost in the Shell (1995 and 2017). Palette and silhouette reference for Cyberpunk Shanghai.
- BioShock: Infinite (Columbia setting). Palette reference for Steampunk Victorian.

## Open items for V3 confirm or downstream agents

1. Default world lock: V3 to confirm `cyberpunk_shanghai` default (see ADR-01).
2. Tier-gating policy: V3 to confirm free-choice (see ADR-02).
3. Apollo: consume `WorldSwitcher.tsx` in the Advisor chat surface once Erato wiring lands.
4. Harmonia P4 full session: verify that `WorldPalette` primitives in `descriptor.ts` stay in lockstep with `design-tokens.ts` color strings, and optionally generate both from a single source file in a later refactor.
5. Poseidon (if 3D stretch spawned): inherits palette primitives via `worldAestheticRegistry.get(world_id).palette`.
6. Nemea QA: visual regression snapshot per world (recommend 1 screenshot per world at `ConstructionAnimation` with 8 floors populated).

## Self-check summary

Thalia self_check_protocol 19 items: see session end-of-turn report line. All 19 pass in the session report.
