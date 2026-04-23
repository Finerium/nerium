---
agent: kalypso
phase: RV W3 draft
status: W3 draft, W4 finalize pending
date: 2026-04-23
version: 0.1.0
scope: landing page + README synthesis + submission package scaffold
---

# Kalypso decisions (ADR log)

## D1. Landing page route path: `app/page.tsx`, not `src/app/page.tsx`

**Context**: The Kalypso agent prompt in `.claude/agents/kalypso.md` Section "Output Files Produced" lists `src/app/page.tsx`. The session opening prompt from V4 also instructed `src/app/page.tsx`.

**Observation**: The active Next.js App Router in this repository lives at project root `app/`, NOT `src/app/`. Evidence:

- `app/layout.tsx` exists and defines the root layout
- `app/play/page.tsx` was shipped by Thalia-v2 with an explicit decision note (see `docs/thalia-v2.decisions.md`) that routes belong at project-root `app/`, not `src/app/`
- `tsconfig.json` has no path alias pointing `src/app/` to Next.js routing
- `next.config.ts` has no `experimental.appDir` or other override pointing to `src/app/`

**Hazard**: If a `src/app/page.tsx` were added alongside `app/layout.tsx`, Next.js 15 would pick one and silently ignore the other per `_meta/translator_notes.md` gotcha 19. Most likely outcome: Next.js serves the root `app/` router and the new file at `src/app/page.tsx` is dead code, producing no functional landing page at `/`.

**Decision**: Landing page ships at `app/page.tsx`, replacing the Nemea-v1 Phase 5 QA emergency harness landing (pillar-card index page). This aligns with `docs/phase_rv/REUSE_REWRITE_MATRIX.md` Section 19 PORT decision (`app/page.tsx -> Kalypso landing page`).

**Consequence**: Components still live at `src/components/landing/*` per session spec; only the route file changes location to match actual active router. All 4 landing section Client Components and the Server Component entry were authored correctly and integrate with the existing `app/layout.tsx` and `app/globals.css` without modification.

**Verified by**: `ls app/page.tsx` post-write returns the Kalypso landing page. `ls src/app/` returns empty (no conflicting duplicate router).

## D2. Layout + harness.css NOT touched

**Context**: `app/layout.tsx` still imports `ClientThemeBoot` from `_harness/` and `harness.css`. Ownership of the layout rewrite and harness retirement is Thalia-v2 per `_meta/translator_notes.md` gotcha 22. Kalypso does not touch files owned by other Workers.

**Decision**: Layout left intact. Landing page renders through the existing harness chrome, but each landing section explicitly sets `bg-background`, `bg-[oklch(...)]`, and related Tailwind utility classes, so harness defaults are harmlessly overridden. No visual regression.

**Consequence**: W4 finalize pass will verify visual integration after Thalia-v2 rewrites `app/layout.tsx` and retires `_harness/` (per gotcha 22 deferred move schedule).

## D3. Demo video placeholder: 14KB solid-color mp4

**Context**: W3 draft requires a demo video asset at `public/video/demo-preview.mp4`. The real recording is a W4 deliverable pending vertical-slice gameplay completion.

**Options considered**:
1. Commit `.gitkeep` only, note W4 pending inside HeroSection
2. Generate a solid-color placeholder with ffmpeg
3. Embed an animated SVG instead of a video element

**Decision**: Option 2. ffmpeg is available locally (`/opt/homebrew/bin/ffmpeg`). Generated a 6-second 1920x1080 H.264 mp4 at 14KB, color 0x0a0a14 (matching OKLCH background token). Companion SVG poster at `public/video/demo-preview-poster.svg` renders "NERIUM / Vertical slice preview / W4 FINALIZE PENDING" typography for poster-image fallback and for users with autoplay disabled.

**Consequence**: Landing page hero has a real video element wired up, autoplay loop muted playsInline. W4 finalize pass replaces `demo-preview.mp4` with the actual demo cut from Ghaisan's recording.

**Drawback noted**: ffmpeg build on this machine lacks the `drawtext` filter (libfreetype not linked), so text inside the mp4 is not rendered. The SVG poster compensates by providing the same text as the `poster` attribute of the video element.

## D4. Moros static leaderboard mockup: deferred

**Context**: `.claude/agents/kalypso.md` section "Task Specification per Sub-Phase" item 6 marks `StaticLeaderboardMockup.tsx` as optional, include only if headroom permits.

**Decision**: Not shipped in W3 draft. Will re-evaluate in W4 finalize once the full landing scroll is visually verified and if Ghaisan requests a leaderboard teaser.

**Rationale**: A half-built static mockup dilutes the focused four-section landing narrative. If included later, it will slot between `PillarsSection` and `CTASection` with honest-claim label "preview, post-hackathon".

## D5. Honest-claim annotations: 4 items in README

**Context**: Per `.claude/agents/kalypso.md` Context section and CLAUDE.md Section 7 anti-patterns, honest-claim annotations are non-negotiable.

**Decision**: 4 annotations committed to `README.md`:

1. Demo scope (RV vertical slice = 1 quest, other pillars = prototype surfaces)
2. Multi-vendor asset pipeline (fal.ai dormant, ADR override, personal fund USD 0)
3. Shipped assets (CC0 + Opus procedural, brullov empty per redistribution clause)
4. Reasoning layer (100 percent Opus 4.7, no other vendor in reasoning path)

Each annotation includes a file reference so claims are verifiable.

## D6. 100 to 200 word summary: 173 words

**Context**: Strict word count verified via `grep -v` + `wc -w`.

**Decision**: 173 words committed. Annotation `<!-- word count: 173 -->` at end of file for downstream QA. Content leads with creator-side pain (restaurant automation example per NarasiGhaisan Section 5), then buyer fragmentation, then NERIUM thesis, then Opus 4.7 + meta-narrative, then OSS link.

**Halt check**: 173 is within 100 to 200 inclusive. No halt trigger.

## D7. Demo video script: 381 words targeting 450 at 150 wpm

**Context**: 3-minute video = 180 seconds cap. At 150 words per minute, 180 seconds = 450 words. Under-target leaves slack for Ghaisan bahasa-English mix which reads slightly slower.

**Decision**: Committed at 381 words across 7 beats (hook, solution, vertical slice, Blueprint Moment, pillars, meta-narrative close, CTA). Each beat has its target word count verified in a table at end of script.

**Deferred to W4**: Actual recording, voiceover-vs-overlay decision, Blueprint Moment 22-node vs 16-node fixture pick (both are acceptable per translator_notes gotcha 9).

## D8. Deferred moves: 4 pillar page.tsx to `_deprecated/`

**Context**: `_meta/translator_notes.md` gotcha 22 assigns Kalypso ownership of moving pillar page.tsx files to `_deprecated/` after landing page authoring complete. Never `git rm`; always `git mv`.

**Executed**:

- `git mv app/marketplace/page.tsx _deprecated/app/marketplace/page.tsx`
- `git mv app/banking/page.tsx _deprecated/app/banking/page.tsx`
- `git mv app/registry/page.tsx _deprecated/app/registry/page.tsx`
- `git mv app/protocol/page.tsx _deprecated/app/protocol/page.tsx`

All 4 moves succeeded with `R` status (rename) preserving git history and blame.

**Not moved** (owned by other Workers):

- `app/_harness/HarnessShell.tsx`, `ClientThemeBoot.tsx`, `harness.css` (Thalia-v2 owns)
- `app/advisor/page.tsx`, `app/builder/page.tsx` (Thalia-v2 owns, scope mapping to `/play`)
- `app/advisor/ui/styles.css`, `app/marketplace/listing/styles.css`, `app/protocol/demo/styles.css`, `app/protocol/vendor/styles.css`, `app/builder/worlds/WorldSwitcher.tsx` (Erato-v2 owns)

**Consequence**: Routes `/marketplace`, `/banking`, `/registry`, `/protocol` return 404 after Next.js dev server restart. This is intended per RV.3 (pillars collapse into in-game systems within Apollo Village). Landing page at `/` and game at `/play` are the only two live top-level routes now.

## D9. Voice anchor compliance

- NarasiGhaisan Section 23 casual register in README (Builder thesis paragraph uses "tukang" + "arsitek" bilingual terms, "bikin landing page" example in demo script)
- No em dash (U+2014) in any output. Verified by `grep -P "[\x{2014}]" <file>` returns empty across all 10 output files.
- No emoji in any output. Verified by grep sweep.
- Tagline string locked verbatim: "Infrastructure for the AI agent economy" in HeroSection h1.
- Meta-narrative frame preserved verbatim in CLAUDE.md, README.md, MetaNarrativeSection.tsx, demo_script.md, 100_to_200_word_summary.md. No dilution across 5 surfaces.

## Open items for W4 finalize

1. Replace `public/video/demo-preview.mp4` with actual demo recording from Ghaisan
2. Replace video poster `demo-preview-poster.svg` if final video has different aspect ratio
3. Replace any screenshot placeholders with real HUD screenshots from Erato-v2 output (currently none used, all landing visuals are typography and Tailwind gradients)
4. Voice polish pass on README + summary + demo script (NarasiGhaisan Section 13 brevity discipline)
5. Em dash + emoji final sweep across all landing + submission surfaces
6. Optional: spawn `StaticLeaderboardMockup.tsx` if Ghaisan requests a leaderboard teaser
7. OSS link verification (`github.com/Finerium/nerium` must be public + MIT license present at repo root, both confirmed locally but not yet pushed)

## Self-check 19 of 19

| # | Item | Status |
|---|---|---|
| 1 | Mandatory reading bundle complete | PASS |
| 2 | `app/page.tsx` Server Component created | PASS (path corrected from `src/app/page.tsx`, see D1) |
| 3 | HeroSection with locked tagline plus CTA to /play | PASS |
| 4 | MetaNarrativeSection with verbatim frame | PASS |
| 5 | PillarsSection with 5 pillars (Builder hero) | PASS |
| 6 | CTASection | PASS |
| 7 | Demo video placeholder | PASS (mp4 + SVG poster) |
| 8 | README synthesis without clobbering Talos Assets | PASS |
| 9 | 100 to 200 word summary within bounds | PASS (173 words) |
| 10 | 3-min demo script with time stamps | PASS |
| 11 | No em dash anywhere | PASS (grep verified) |
| 12 | No emoji anywhere | PASS (grep verified) |
| 13 | Tagline string exact | PASS |
| 14 | Meta-narrative frame preserved verbatim | PASS (5 surfaces) |
| 15 | Honest-claim discipline | PASS |
| 16 | No live Phaser embed on landing | PASS (Link to /play only) |
| 17 | No 3D WebGL on landing | PASS (Tailwind + Framer Motion only) |
| 18 | No new dependencies silently added | PASS (Framer Motion + GSAP already in package.json) |
| 19 | Commit landed | PENDING (next step of session) |
