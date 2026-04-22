---
name: harmonia.decisions
description: Architecture decision record for the Harmonia cross-cutting aesthetic coordinator Worker, beginning with the Early-Harmonia split session 1 of 2 design-tokens emit.
owner: Harmonia (Early-Harmonia session 1 of 2; Full-Harmonia P4 continues below the Early-Harmonia cutline)
status: draft
version: 0.1.0
last_updated: 2026-04-22
---

# Harmonia Decisions

Architecture decision record for the Harmonia Worker. Entries track palette provenance, schema extensions, scope splits, and cross-Worker coordination rationale. Decisions are appended chronologically; older entries stay for audit.

Early-Harmonia ships the data surface (tokens.ts + theme_runtime.ts + minimal world aesthetic type stub) to unblock Thalia and every downstream P3b Worker. Full-Harmonia picks up aesthetic consistency sweep, component diff patching, and font-face consolidation after all P3 Workers complete.

---

## ADR 001: Split session scope

**Date:** 2026-04-22 (Day 1 post-kickoff)
**Author:** Early-Harmonia (Ghaisan-invoked split session 1 of 2)

**Context.** The base Harmonia prompt at `.claude/agents/harmonia.md` bundles two responsibilities: emit canonical design tokens and sweep all prior Worker component outputs to substitute hardcoded values with token references. Phase P4 of that prompt assumed every P3 Worker completes first. During the Day 1 P3a wave the downstream Workers (Thalia, Urania, Dionysus, Triton, Morpheus) surfaced a hard dependency on the canonical token data for their P3b wave and cannot wait until P4.

**Decision.** Split Harmonia into two sessions.

- Early-Harmonia (this session) emits only the data surface: tokens.ts with three WorldTheme objects, theme_runtime.ts with applyWorld / getActive / onChange, and the minimal world_aesthetic_types.ts stub required for the tokens.ts import to resolve. No cross-Worker diff patching. No font-face consolidation. No animation coordination audit. No typography polish of existing files.
- Full-Harmonia (P4) runs after all P3 Workers complete and executes the sweep: glob every `app/**/*.tsx` and `app/**/*.css`, identify hardcoded hex colors / font stacks / ms durations / px spacing, substitute with token references, and emit typography.css font-face declarations and animations.ts helpers if a cross-Worker need still holds after the data surface absorbs the bulk.

**Consequences.** Unblocks Thalia P3b wave 2 and the other P3b Workers immediately. Full-Harmonia session still runs at P4 with narrower scope (sweep only). Honest-claim discipline applies: this ADR documents the scope-split so future audits do not assume a full P4 pass was done at Day 1.

---

## ADR 002: Ghaisan Decision 3 unified single file

**Date:** 2026-04-22
**Author:** Early-Harmonia

**Context.** The base Harmonia prompt and the Section 5.22 spec in `docs/phase_0/NERIUM_AGENT_STRUCTURE.md` list three output files under `app/shared/design/`: tokens.ts, typography.css, animations.ts. The design_tokens.contract.md v0.1.0 schema nests typography and animation tokens inside the WorldTheme shape. Ghaisan Decision 3 (2026-04-22) locks the canonical shape to a single file.

**Decision.** Treat tokens.ts as the unified source of truth per Ghaisan Decision 3. Typography and animation tokens live as fields inside each WorldTheme object and flow through the same runtime flattener. A separate typography.css with @font-face declarations and a separate animations.ts helper module are deferred to Full-Harmonia P4 if a non-absorbable cross-Worker need actually surfaces; otherwise they are dropped.

**Consequences.** Single import path for every consumer. No duplication of scale / weight / duration values across files. Fonts referenced by family name only in tokens.ts, so consumers either rely on system fallbacks or load via Google Fonts `<link>` / `@import` until Full-Harmonia handles global font-face consolidation.

---

## ADR 003: Minimal world_aesthetic_types.ts seeded by Early-Harmonia

**Date:** 2026-04-22
**Author:** Early-Harmonia

**Context.** `docs/contracts/design_tokens.contract.md` Section 3 imports `WorldId` and `OKLCHColor` from `@/builder/worlds/world_aesthetic_types`. That file is Thalia-owned per `docs/contracts/world_aesthetic.contract.md` Section 6. In the split-session order Early-Harmonia ships before Thalia, so the file does not yet exist when tokens.ts compiles.

**Decision.** Early-Harmonia seeds the file with only the minimum surface area required by the design_tokens.contract.md import: the `WorldId` union, a `WORLD_IDS` constant array, the `OKLCHColor` interface, the `isWorldId` guard, and two helpers (`clampOKLCH` for error-handling range clamps per world_aesthetic.contract.md Section 8 and `formatOKLCH` for tests). Thalia extends the file during P3b wave 2 with the full `WorldPalette`, `WorldTypography`, `WorldMotif`, and `WorldDescriptor` shapes per her owner contract.

**Consequences.** tokens.ts compiles immediately. Thalia owns the semantic authoring of palettes / motifs / typography *selections* and may still cross-reference tokens.ts or re-export constants from it. No double source of truth: tokens.ts owns color strings; Thalia owns the per-world descriptor metadata (display name, motif silhouette, sprite atlas id, audio theme id).

---

## ADR 004: Import path convention

**Date:** 2026-04-22
**Author:** Early-Harmonia

**Context.** The design_tokens contract uses the `@/builder/worlds/world_aesthetic_types` path alias. The repo currently lacks a tsconfig.json path alias configuration. Existing Worker files (Dike banking/wallet/EarningsDashboard.tsx, Apollo advisor/apollo.ts, Cassandra prediction surfaces) use relative imports.

**Decision.** Use relative imports in tokens.ts and theme_runtime.ts (`'../../builder/worlds/world_aesthetic_types'`) to match existing convention and avoid compilation failure. If Full-Harmonia or the runtime lead introduces a tsconfig.json path alias during P4 polish, a mechanical find / replace converts these imports without data changes.

**Consequences.** Early-Harmonia output compiles against the current repo state. No blocking tooling change required.

---

## ADR 005: Palette derivation per world

**Date:** 2026-04-22
**Author:** Early-Harmonia

**Medieval Desert.** Source: NarasiGhaisan Section 7 guidance "warna oranye coklat kaya di gurun gitu" plus the V2 expansion table entries (terracotta `#c97a4a`, sand `#e8c57d`, stone `#8b6f47`, shadow `#3d2817`) and the Moroccan souk / Dune Arrakeen / Mos Eisley reference loop in the same section. OKLCH derivation: primary sits at a 45 degree hue with mid-lightness and medium chroma to read as warm clay under ambient daylight; background is pulled up to 0.92 lightness with a mild warm chroma to evoke sandstone parchment rather than stark white. Critical color (oxblood) stays in the same red-orange family as primary to keep the palette earthy.

**Cyberpunk Shanghai.** Source: `docs/phase_0/agent_flow_diagram.html` M3 hex values (cyan `#00f0ff`, magenta `#ff2e88`, purple `#8b5cf6`, void `#06060c`, ink `#e8ecff`, ink-dim `#8888a8`, gold `#ffd166`, gold-hot `#ffb703`) plus Blade Runner 2049 / Ghost in the Shell reference. Translated to OKLCH by mapping hex luminance to the lightness axis, saturation to chroma (cyan and magenta land near the high-chroma boundary), and hue to degrees. Signature shadow_glow uses the magenta hero-glow stack lifted from the M3 `.inspector.tier-ma` rule, preserving the visual identity already approved.

**Steampunk Victorian.** Source: V2 third-world proposal (Section 7 table entry "Steampunk Victorian, brass, oxblood, walnut, BioShock Columbia") pending Ghaisan final confirm. OKLCH derivation: primary sits at 78 degree hue with medium chroma for polished brass; secondary drops lightness to 0.38 at 25 degrees for deep oxblood; accent bridges the two at 48 degrees with higher lightness for antique copper warmth; background lands at 0.90 aged ivory with 85 degree hue for a daylit Columbia sky parchment. Signature shadow_md adds an inset highlight to evoke engraved brass plate; shadow_glow uses a gas-lamp warm glow at brass hue.

**Consequences.** All three palettes validate against the `oklch(L C H)` regex (Section 9 testing surface). Light-background worlds (medieval, steampunk) coexist with the dark-background cyberpunk world without requiring a separate light / dark axis at v0.1.0 because every component sources color through semantic tokens; the background flip is absorbed by the runtime swap. Full-Harmonia P4 sweeps components for any surfaces that silently assume a single background polarity (glow effects, subtle inset highlights) and either normalizes per-world or ferries a strategic decision on theme axis orthogonality.

---

## ADR 006: Shared spacing / radius / scale / weight / line-height across worlds

**Date:** 2026-04-22
**Author:** Early-Harmonia

**Decision.** Early-Harmonia keeps `SpacingTokens` (9 steps), `RadiusTokens` (4 stops), typography scale (7 sizes), typography weights (4 stops), and line heights (3 stops) identical across worlds. Only color, font family, easing curve, and shadow vary per world.

**Rationale.** Cross-world layout consistency matters more than per-world metric variance for a 5-day hackathon surface. A medieval button that is 16 px tall in one world and 20 px tall in another creates regression headache with zero aesthetic payoff. Font family, color, and easing already carry enough per-world character; shadow variance (inset plate vs neon glow vs soft beneath) supplies the remaining texture difference.

**Consequences.** Single shared constant objects (`SHARED_SPACING`, `SHARED_RADIUS`, `SHARED_TYPE_SCALE`, `SHARED_DURATION`) exported implicitly through each theme object, avoiding duplication drift. Post-hackathon, per-world spacing / radius overrides can be introduced by splitting these into per-theme values at that point.

---

## ADR 007: ShadowTokens extension beyond contract v0.1.0

**Date:** 2026-04-22
**Author:** Early-Harmonia

**Context.** The design_tokens.contract.md v0.1.0 schema defines colors, spacing, radius, animation, and typography. The base Harmonia prompt Creative Latitude clause permits additional tokens (shadow, radius, z-index) when beneficial.

**Decision.** Add a `ShadowTokens` interface with four fields (`shadow_sm`, `shadow_md`, `shadow_lg`, `shadow_glow`) and include it on every `WorldTheme`. The four fields cover the stacking depth surfaces already in use by the M3 reference (cards, modals, neon-glow hero surfaces) and give every world a signature hero-glow variant without forcing components to mix it into ad-hoc style props.

**Consequences.** Schema extends the v0.1.0 minimum. Every world must supply all four values (no optional slots), which caught a gap in the medieval world definition where the saffron glow was initially missed. Nemea regression can add shadow coverage tests without a contract revision, since the extension is additive.

---

## ADR 008: CSS custom property naming convention

**Date:** 2026-04-22
**Author:** Early-Harmonia

**Decision.** Runtime translator emits CSS custom property names with the following rules:

- `colors.<name>` becomes `--color-<name-kebab>`. The `color-` prefix keeps semantic names (primary, ring) unambiguous alongside spacing and radius.
- `spacing.<key>` becomes `--<key-kebab>` (for example, `space_4` becomes `--space-4`). The key already self-describes.
- `radius.<key>` becomes `--<key-kebab>` (for example, `radius_md` becomes `--radius-md`).
- `animation.<key>` becomes `--<key-kebab>` (for example, `duration_fast` becomes `--duration-fast`, `ease_standard` becomes `--ease-standard`).
- `typography.<key>` becomes `--<key-kebab>` (for example, `font_family_heading` becomes `--font-family-heading`, `scale_base` becomes `--scale-base`, `weight_bold` becomes `--weight-bold`, `line_height_tight` becomes `--line-height-tight`).
- `shadow.<key>` becomes `--<key-kebab>` (for example, `shadow_glow` becomes `--shadow-glow`).

**Rationale.** Matches the contract example (`--color-primary`, `--space-4`) and follows Tailwind v4 conventions. Keeps the namespace clean without redundant prefixes.

**Consequences.** Tailwind v4 consumers can reference tokens directly (`bg-primary` resolves through `colors.primary: 'var(--color-primary)'` in the eventual tailwind config). Semantic classes can also use raw `var(--color-primary)` for bespoke styles when Tailwind utilities do not fit.

---

## ADR 009: Persistence + SSR safety

**Date:** 2026-04-22
**Author:** Early-Harmonia

**Decision.** Persist the active world to `localStorage` under the key `nerium.active_world`. Hydrate on client boot via `hydrateActiveWorld`. Fall back to `DEFAULT_WORLD = 'cyberpunk_shanghai'` (per world_aesthetic.contract.md Section 4 default world) when persistence is absent. Server-side rendering paths skip DOM writes and run with DEFAULT_WORLD until the client hydrates.

**Rationale.** Next.js 15 App Router renders on the server for the initial paint; client hydration is where CSS custom properties land. Without the server skip, the runtime would throw on `window` access. Without the hydration helper, a browser reload would reset the world unless the consumer manually wires localStorage read themselves, which invites drift.

**Consequences.** A single call to `hydrateActiveWorld()` inside the root client component restores world state. A world switcher UI reads `themeRuntime.getActive()` for the current world and calls `themeRuntime.applyWorld(next)` to change it; persistence and change handlers are automatic.

---

## ADR 010: Event emission shape

**Date:** 2026-04-22
**Author:** Early-Harmonia

**Decision.** On every successful `applyWorld`, the runtime both invokes registered `onChange` handlers and dispatches a `CustomEvent<ThemeAppliedEventPayload>` named `design.theme.applied` on the `window` with detail `{ world_id, previous_world_id }`.

**Rationale.** design_tokens.contract.md Section 5 defines the event signature. Dual-surface emission (callback + window CustomEvent) lets framework-agnostic consumers (non-React modules, vanilla sprinkles) listen without depending on the module-scoped singleton. React consumers prefer the onChange callback because it integrates naturally with hooks.

**Consequences.** No bus scaffolding needed (native CustomEvent is sufficient for the hackathon scope). Full-Harmonia P4 can revisit if cross-frame or cross-worker sync becomes a concern.

---

## ADR 011: Unknown world_id error handling

**Date:** 2026-04-22
**Author:** Early-Harmonia

**Decision.** `applyWorld` called with a world_id not present in the `themes` record logs an error via `console.error` and no-ops. It does not throw.

**Rationale.** design_tokens.contract.md Section 8 requires no-op to avoid visual breakage. world_aesthetic.contract.md Section 8 separately throws `UnknownWorldError` on the `WorldAestheticRegistry.get` path; that is a different interface. The runtime here is the apply path, where breaking visual state is worse than silent degradation with a developer-facing log.

**Consequences.** Defensive. If a malformed persisted value lands in localStorage (future schema drift), the runtime falls through without crashing the UI. The `isWorldId` guard in `readPersistedWorld` already filters malformed strings before apply, so this branch is rarely hit in practice; the error path exists for type-escape scenarios (untyped callers).

---

## Diff summary

**Session:** Early-Harmonia 1 of 2
**Files created:** 4 (three source files plus this ADR)
**Files modified in place:** 0

Cross-Worker component diff patching (substituting hardcoded values with token references) is explicitly out of scope for this session per ADR 001. Full-Harmonia P4 will glob `app/**/*.tsx` + `app/**/*.css` after all P3 Workers complete, produce a candidate patch list, apply substitutions, and record the diff count here under ADR 012 and onwards.

**Files created in this session:**

| Path | Purpose |
|---|---|
| `app/builder/worlds/world_aesthetic_types.ts` | Minimal WorldId + OKLCHColor surface Thalia extends in P3b wave 2. |
| `app/shared/design/tokens.ts` | Canonical tokens: three WorldTheme objects, shared primitives, themes record, DEFAULT_WORLD, getTheme helper. |
| `app/shared/design/theme_runtime.ts` | ThemeRuntime interface implementation: applyWorld, getActive, onChange. Flatten helpers, localStorage persistence, CustomEvent dispatch, SSR safety. |
| `docs/harmonia.decisions.md` | This ADR log. |

**Honest-claim note.** No prior Worker output was touched during this session. The diff is additive only. Full-Harmonia P4 remains responsible for the sweep pass.

---

## Out of scope, deferred to Full-Harmonia P4

- Cross-Worker component sweep: substitute hardcoded hex / font-stack / ms / px values across all P3 Worker outputs with token references.
- typography.css with `@font-face` declarations for Cormorant Garamond, Spectral, Orbitron, Share Tech Mono, Cinzel, Lora, IBM Plex Mono, and the corresponding fallbacks. Early-Harmonia lists the family names in tokens.ts; font loading is a consumer concern until P4.
- animations.ts helpers for complex timeline orchestration (GSAP timeline factory, Framer Motion variant kits) if any surface actually needs them.
- Strategic decision: theme-switching axis orthogonality (per-world `light` / `dark` intra-world variants) is deferred. design_tokens.contract.md Section 10 already notes this as a Harmonia strategic_decision; Ghaisan Decision 3 locks the single-file shape but stays silent on intra-world light / dark.
- Contrast audit: WCAG AA per semantic token pair (foreground on background, primary on background, critical on background). Light-background worlds need manual verification for cyberpunk-derived high-chroma accents. Full-Harmonia runs the audit and records failures here.
- Cross-world glow / shadow layering review: cyberpunk signature magenta glow vs medieval warm saffron glow may conflict on a shared surface (for example, Advisor chat embedded in Marketplace). Full-Harmonia surveys the component graph for such overlap.

---

## Open questions for Ghaisan (ferry only if still blocked after Full-Harmonia review)

1. Intra-world light / dark axis: required for hackathon scope, or post-hackathon refactor?
2. Per-world spacing / radius deviation: keep shared indefinitely, or split after Full-Harmonia sweep if a specific world demands it?
3. Font loading strategy: Google Fonts `<link>` at `app/layout.tsx`, self-hosted `woff2` in `public/fonts/`, or `@font-face` in typography.css?

Each of the above has a working default at v0.1.0 (no light / dark axis, spacing shared, fonts rely on system fallback). Ghaisan input requested only if Full-Harmonia discovers a blocker.
