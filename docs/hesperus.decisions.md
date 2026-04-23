# Hesperus Decisions

**Agent:** Hesperus (Opus 4.7), Product-side Worker, Visual Polish
**Phase:** RV Wave 3 (Sabtu 2026-04-25, parallel with Erato-v2 plus Euterpe)
**Session:** 1 of 1
**Date:** 2026-04-23
**Status:** Shipped
**Scope:** Opus-generated SVG HUD chrome for three worlds plus genre-neutral dialog frame plus brand logo plus minimap ring plus inventory slot, plus three Canvas 2D procedural FX modules plus React wrapper.

## Decisions

### D1. SVG palette discipline: world-locked hex inline, neutral CSS variables

World-specific border SVGs (`border-medieval.svg`, `border-cyberpunk.svg`, `border-steampunk.svg`) inline hex values derived from `app/builder/worlds/{world}/palette.ts` OKLCH source. `<desc>` notes the OKLCH triple so the hex origin is auditable.

Genre-neutral SVGs (`dialog-frame.svg`, `nerium-logo.svg`, `minimap-ring.svg`, `inventory-slot.svg`) use CSS custom properties (`var(--color-primary, #00f0ff)` and peers) with cyberpunk defaults that match the `globals.css @theme` seed. Erato-v2 may override per scene by setting CSS variables on the HUD root.

**Rationale.** World borders are palette-locked per M2 Section 4.6 halt trigger ("SVG palette drift from world style-bible"), so hex is the simplest single-source representation. Neutral UI elements benefit from runtime reskinning without regeneration, which CSS variables deliver without coupling the SVG to the React component tree.

### D2. Hex approximation strategy from OKLCH

OKLCH values in `palette.ts` are the source of truth; hex in the SVG file is a cached approximation for deterministic rendering across browsers that do not yet support `oklch()` in the SVG `fill` attribute. The OKLCH triple is commented in each SVG `<desc>` block; any hex drift can be recomputed by converting the OKLCH triple via a CSS Color Module Level 4 converter.

Medieval Desert primary anchors at `#c97a4a` (OKLCH 0.620 0.140 45.0). Cyberpunk Shanghai uses NarasiGhaisan Section 7 canonical hex (cyan `#00f0ff`, magenta `#ff2e88`, purple `#8b5cf6`) because `tokens.ts` comments flag these as the brand-anchored source. Steampunk Victorian hex follows Talos sub-phase 2 approximations (`#c9a061` brass, `#7a2f24` oxblood, `#a46b3f` walnut) that align with `palette.ts` OKLCH.

### D3. SVG file size budget: 20 KB halt trigger, 4 KB actual ceiling

M2 Section 4.6 sets the halt trigger at 20 KB per file. Observed ceiling across the seven shipped SVGs is 3.7 KB (steampunk border), comfortably within the budget. Decorations use compact primitives (`<rect>`, `<circle>`, `<path>`, `<polygon>`) plus gradients and filters in `<defs>`; no base64 raster payload, no embedded external reference. Future additions should keep the same discipline.

### D4. Canvas procedural FX controller pattern

Each of `sandParticles.ts`, `neonGlow.ts`, `steamPuff.ts` exports a `createX()` factory returning an `FXController` object with `start()`, `stop()`, `destroy()`, `resize()`. The controller owns its own `requestAnimationFrame` loop and internal state. No module-level singleton. Erato-v2 consumers instantiate one controller per mounted surface; the wrapper `ProceduralFX.tsx` handles mount and unmount cleanup.

**Rationale.** Factory pattern mirrors the `createPipelineStore` precedent in `app/builder/viz/PipelineCanvas.tsx` (translator_notes.md gotcha 6). Multiple independent FX layers (for example Medieval world bottom band plus Cyberpunk top banner in a single split-world screenshot) keep isolated state. Destroy-on-unmount is enforced by the React wrapper, eliminating the Howler-style leak class flagged in M2 Section 4.7 Euterpe halt triggers.

### D5. Particle instance pool, zero per-frame allocation

All three FX modules pre-allocate the particle array at `create` time. The tick loop mutates existing particle objects and wraps or respawns them in place rather than creating new objects. Pool count is derived from a density constant clamped to a sane ceiling (240 sand particles, 120 steam puffs, 8 neon orbs maximum). The JIT-friendly monomorphic object shape (`SandParticle`, `SteamParticle`, `NeonOrb`) avoids polymorphic deopts under V8.

**Rationale.** 60 fps budget is 16.67 ms per frame. Per-frame allocation triggers GC pauses that exceed the budget on mid-tier laptops. Pre-allocated pools keep the tick loop GC-free.

### D6. 60 fps cap via rAF plus delta-time clamp

Each tick computes `dt` from `performance.now()` timestamps and clamps the delta to 64 ms (roughly 15.6 fps minimum). Without the clamp, a tab-backgrounded rAF resumption produces a multi-second `dt` that teleports particles off-screen. The clamp preserves visual continuity after a pause without adding latency during normal play.

### D7. prefers-reduced-motion static fallback

Each module probes `window.matchMedia('(prefers-reduced-motion: reduce)').matches` during `create`. When reduced motion is requested the controller skips the rAF loop and paints a single static frame (sand drift frozen, neon orbs static but present, steam puff mid-life snapshot). The visual identity survives; the motion does not.

**Rationale.** WCAG 2.3.3 Animation from Interactions and Ghaisan's 23-section NarasiGhaisan discipline on a11y sanity require motion opt-out. A static fallback preserves the world skin without bypassing the user preference.

### D8. SSR safety via window guards

Each FX module runs a `typeof window === 'undefined'` guard before touching `matchMedia` or `devicePixelRatio`. The React wrapper is `'use client'`, so the modules only execute client-side, but the guards keep the source safely importable from shared utility code paths.

### D9. DPR clamp at 2x for render cost discipline

`Math.min(window.devicePixelRatio || 1, 2)` caps the backing-store scale factor at 2x. A 3x retina device would otherwise multiply fill-rate cost by 9, blowing the 60 fps budget on long particle runs. The 2x ceiling is visually indistinguishable from 3x at HUD sizes and keeps performance predictable.

### D10. Layer composition boundary honored

React HUD layer only: `ProceduralFX.tsx` lives in `src/components/hud/`. No Phaser scene imports a Canvas 2D FX directly; Phaser scenes use Phaser's own particle manager (`this.add.particles`). Erato-v2 stacks `ProceduralFX` beneath the SVG chrome and above the HUD background plate, per translator_notes.md gotcha 4 (Framer Motion plus Phaser separation).

### D11. No fal.ai invocation, no raster fallback

All seven SVGs and three Canvas FX modules authored from scratch by Opus 4.7 text output. Zero fal.ai calls. Zero external raster imports where vector sufficed. The ADR at `docs/adr/ADR-override-antipattern-7.md` authorizes fal.ai in principle for identity-critical sprites but ships DORMANT per RV.14. Hesperus operates entirely under the primary CC0 plus Opus procedural path.

### D12. Talos sub-phase 2 gap-fill coexists as fallback

Talos shipped gap-fill HUD frame SVGs at `public/assets/procedural/svg/hud_frame_{world}.svg` with the explicit note "Hesperus may supersede during Sub-Phase 3." Hesperus ships production SVGs at `public/svg/hud/border-{world}.svg`. Erato-v2 imports from `public/svg/`; Talos gap-fill remains as emergency fallback and reference. No `git mv` performed; both sets coexist since they serve different asset registry keys.

## Halt triggers observed

None. All 12 artifacts shipped within budget. No palette drift. No file exceeded 4 KB SVG size or 300 lines TypeScript module length.

## Follow-up items for Erato-v2

1. Apply `border-medieval.svg`, `border-cyberpunk.svg`, `border-steampunk.svg` via Tailwind `bg-[url('/svg/hud/border-{world}.svg')]` on TopBar plus BottomBar plus SideBar root wrappers. Use `bg-contain` plus `bg-no-repeat` with a padded inner container so the border does not cover dialog content.
2. `dialog-frame.svg` works as inline SVG or `<img>` backdrop for `DialogueOverlay.tsx`. Set `--color-primary`, `--color-accent`, `--color-border`, `--color-background` on the overlay root to re-theme per world.
3. `nerium-logo.svg` goes in TopBar upper-left or landing hero. Swap brand colors per hero variant via the same CSS variables.
4. `minimap-ring.svg` wraps the minimap canvas or Phaser render target in TopBar.
5. `inventory-slot.svg` is the cell base for InventoryToast plus any future roster grid.
6. `ProceduralFX` component consumed with `variant="sand" | "neon" | "steam"` and optional `density`, `speed`, `orbCount`, `paused` overrides. Stack it at `z-index` below HUD chrome, inside the HUD container via `absolute inset-0`.

## Cross-reference

- `_meta/NarasiGhaisan.md` Section 7 (three-world palette), Section 8 (visual polish non-negotiable)
- `_meta/RV_PLAN.md` RV.7 (hybrid asset strategy), RV.14 (fal.ai dormant budget)
- `CLAUDE.md` anti-pattern 7 (amended)
- `docs/phase_rv/RV_MANAGED_AGENTS_RESEARCH_v2.md` Section 6.3 (Opus SVG and Canvas procedural)
- `docs/phase_rv/RV_NERIUM_AGENT_STRUCTURE_v2.md` Section 4.6 (Hesperus exhaustive)
- `docs/phase_rv/REUSE_REWRITE_MATRIX.md` (KEEP for `app/shared/design/tokens.ts`)
- `_meta/translator_notes.md` gotchas 4, 6, 7, 8 (React plus Phaser boundary, Zustand factory, OKLCH token convention, world-switching retirement)
- `docs/contracts/design_tokens.contract.md` v0.1.0
- `docs/contracts/world_aesthetic.contract.md` v0.1.0
- `docs/adr/ADR-override-antipattern-7.md` (fal.ai dormant authorization)
