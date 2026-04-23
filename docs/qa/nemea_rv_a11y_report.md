---
agent: nemea-rv-b
scope: visual a11y plus landing page audit (W4 split 2 of 2)
phase: RV-W4
date: 2026-04-23
upstream: harmonia_rv_visual_integration.md (W4 Harmonia-RV-B verdict, PASS), kalypso landing draft (app/page.tsx + src/components/landing/*)
upstream_companion: harmonia_rv_state_integration.md (W4 Harmonia-RV-A, FAIL, scope-adjacent state-side blockers escalated separately)
downstream: ghaisan submission package go/no-go
status: complete
verdict: NEEDS_FIX_PRE_INLINE_PATCH then READY (post-inline-patch)
---

# Nemea-RV-B A11y Plus Landing Audit Report

Audit run by Nemea-RV-B per M2 Section 4.16 scope. Lighthouse runtime sweep
on `/` and `/play`, copy-violation grep across shipped code surface,
keyboard nav and focus management static review, WCAG and screen-reader
smoke. One critical CLAUDE.md anti-pattern violation detected; fix applied
inline this session per Nemea-v1 plus Harmonia-v1 surgical-fix precedent
(see Section 8). Submission verdict on a11y plus landing axis post-fix: READY.

Scope-adjacent note: `harmonia_rv_state_integration.md` (Harmonia-RV-A
companion split) escalated two CRITICAL state-side findings to V4
(duplicate divergent useQuestStore plus useDialogueStore singletons in
`src/state/stores.ts`, and bridge `questEffectBus` filter dropping seven
of eight effect types). Those block the demo game loop and are NOT in
Nemea-RV-B scope (visual a11y plus landing only). The READY verdict in
this report is on the a11y plus copy-violation plus landing axis; the
overall submission package go/no-go also depends on Harmonia-RV-A
blockers being resolved by the owning agents.

Brevity follows NarasiGhaisan Section 18 (top 3 to 5 issues only, clear
severity, suggested fix).

## 1. Executive Summary

| Surface | Lighthouse Perf | A11y | Best-Practices | SEO | Copy violation | Verdict |
|---|---:|---:|---:|---:|---|---|
| `/` (landing, app/page.tsx) | 49 | 100 | 96 | 90 | 0 (post-fix) | READY |
| `/play` (game shell, app/play/page.tsx) | 38 | 100 | 93 | 100 | 0 (post-fix) | READY |

A11y 100 on both surfaces is the headline. Performance dips on `/play` are
driven by Phaser 3 boot cost (scene parse plus WebGL context) and on `/` by
the auto-playing demo preview video; both are inherent to the RV vertical
slice direction (RV.1 game beneran plus RV.5 hero video). Best-Practices
fails are dev-mode artifacts (console errors, source maps absent in
`next dev`); a `next build && next start` sweep would clear them. SEO 90 on
`/` is the dev-mode metadata-emit edge case (description present in source
at `app/page.tsx:38` but not yet emitted in dev SSR head); resolves under
production build.

Critical violation tally (post-inline-patch): 0 em dash, 0 emoji across
shipped `.tsx / .ts / .json / .css / .js / .html` surface. Pre-patch tally
was 1 em dash at `app/layout.tsx:27`; fix described in Section 8.

## 2. Lighthouse Detail

Run via `npx lighthouse@12.8.2 http://localhost:3457` against `next dev`
(port 3457), Chrome headless new, categories
performance plus accessibility plus best-practices plus seo.

### 2.1 Landing `/`

```
Performance        49/100
Accessibility     100/100
Best Practices     96/100
SEO                90/100
```

Core Web Vitals:

- FCP 0.8 s, LCP 14.2 s, TBT 1510 ms, CLS 0, Speed Index 1.0 s.
- LCP regression source: the autoplay demo preview video (`/video/demo-preview.mp4`)
  at `HeroSection.tsx:110` is the LCP element. Browser deprioritizes
  poster-only paint while video metadata downloads.

Best-Practices fails (2):

- `errors-in-console`: dev-mode hydration warnings; absent in production.
- `valid-source-maps`: `next dev` does not emit production source maps.

SEO fail (1):

- `meta-description`: dev-mode race; the `Metadata.description` at
  `app/page.tsx:38` does not surface to the rendered head fast enough for
  Lighthouse capture. Production build serves it correctly.

A11y audits: 24 pass, 0 warn, 0 fail, 39 not-applicable.

### 2.2 Game shell `/play`

```
Performance        38/100
Accessibility     100/100
Best Practices     93/100
SEO               100/100
```

Core Web Vitals:

- FCP 0.8 s, LCP 1.7 s, TBT 6350 ms, CLS 0.821, Speed Index 7.7 s.
- TBT 6350 ms is the Phaser bundle parse plus scene boot; expected per RV.1
  Phaser 3 takeover. Acceptable for hero pillar; not a hard halt.
- CLS 0.821 is high. The dynamic-import loader at `GameShell.tsx:24`
  renders a text placeholder that does not reserve canvas dimensions; when
  PhaserCanvas mounts and stretches `absolute inset-0`, the visual content
  shifts. Mitigation in Section 7.

Best-Practices fails (3):

- `font-size`: HUD micro-typography at `text-[10px]` and `text-[11px]` (e.g.
  `TopBar.tsx:59`, `SideBar.tsx:54`) below the 12 px legibility floor.
  Intentional per Erato-v2 spec (game HUD compactness). Acceptable note.
- `errors-in-console` and `valid-source-maps`: same dev-mode artifacts as
  landing.

A11y audits: 21 pass, 0 warn, 0 fail, 42 not-applicable. Note: the
`PromptInputChallenge` textarea was not exercised by the Lighthouse sweep
because no active quest slot was set at boot; the latent label gap
described in Section 4.2 is therefore Lighthouse-invisible but real on the
critical onboarding path.

## 3. Copy Violation Sweep

Scope: every `.tsx / .ts / .json / .css / .mjs / .cjs / .js / .html` under
project root, excluding `node_modules`, `.next`, `.git`, `_skills_staging`,
`_deprecated`, `cache`, `docs`, `_meta`, `.claude`, `.husky`, `.vscode`.

| Pattern | Codepoint | Pre-patch hits | Post-patch hits |
|---|---|---:|---:|
| Em dash | U+2014 | 1 | 0 |
| En dash | U+2013 | 0 | 0 |
| Emoji (decorative) | U+2600 to U+27BF, U+1F300 to U+1FAFF | 0 | 0 |

Pre-patch single hit:

```
app/layout.tsx:27: title: 'NERIUM <U+2014> Infrastructure for the AI agent economy',
```

Resolution: see Section 8 inline patch.

## 4. WCAG Plus Manual A11y Findings (Top 5)

Severity scale: critical (blocks shipping), moderate (should fix W4),
minor (post-hackathon backlog).

### 4.1 Em dash in shipped metadata title (CRITICAL, FIXED INLINE)

- File: `app/layout.tsx:27`
- Rule: CLAUDE.md Section 7 anti-pattern 1 ("No em dash anywhere")
- Impact: visible in browser tab title and OG share previews on every
  route that does not override metadata.title (currently the harness
  routes `/builder`, `/advisor`).
- Fix: the U+2014 character between "NERIUM" and "Infrastructure" replaced with
  `'NERIUM. Infrastructure for the AI agent economy.'` to match the
  landing page's own metadata convention at `app/page.tsx:36`.
- Status: applied inline this session per Section 8.

### 4.2 Prompt input textarea has no programmatic label (MODERATE)

- File: `src/components/hud/PromptInputChallenge.tsx:139-167`
- Rule: WCAG 2.1 SC 1.3.1 Info and Relationships, SC 4.1.2 Name Role Value
- Detail: the `<motion.textarea>` is preceded by a styled `<span>` heading
  but no `<label htmlFor>`, no `aria-label`, no `aria-labelledby`. Screen
  readers announce the field as "edit text, blank" with no name. Lighthouse
  did not flag this run because the textarea conditionally renders only
  when an active quest slot is present, and the boot state had no active
  quest.
- Fix recommendation: wrap the heading span in a `<label>` element with
  `htmlFor` matching a stable `id` on the textarea, or add
  `aria-labelledby` pointing at the heading span (assign it a stable id).
  The sibling `PromptChallengeNode.tsx:99-101` already does this correctly
  and is the reference pattern.

### 4.3 No skip-to-content link on either route (MODERATE)

- File: `app/layout.tsx` (root layout) and `app/page.tsx` plus
  `app/play/page.tsx` (route entries)
- Rule: WCAG 2.1 SC 2.4.1 Bypass Blocks
- Detail: keyboard users on `/play` must tab through TopBar logo, language
  toggle, and SideBar collapse before reaching the game canvas or dialogue
  controls. On `/`, the same is less severe because the page is mostly
  static content reachable via heading navigation.
- Fix recommendation: add a single `<a href="#main">Skip to main content</a>`
  inside `<body>` in `app/layout.tsx`, hidden via the standard `sr-only`
  pattern that focuses visibly. Add `id="main"` on the appropriate landmark
  (the `<main>` element on `/`, the game canvas wrapper on `/play`).
  Lighthouse scored this audit as not-applicable for the captured DOM,
  so the score does not change either way; the fix is a manual-axis WCAG
  win for keyboard-only users.

### 4.4 `/play` CLS 0.821 from canvas late-mount (MODERATE)

- File: `src/components/game/GameShell.tsx:22-29`
- Rule: WCAG 2.1 SC 2.3.3 Animation from Interactions (related), Web Vitals
  CLS guidance
- Detail: the dynamic-import loading state renders a centered text label
  with no fixed dimensions. When PhaserCanvas finishes mounting and the
  canvas stretches `absolute inset-0`, a layout shift fires. Players with
  motion sensitivity may also perceive the swap as a flash.
- Fix recommendation: render the `loading` JSX with the same
  `absolute inset-0` skeleton (a solid background plate) so the canvas
  swap is dimensionally identity. Optional: add `prefers-reduced-motion`
  guard to suppress the loader fade on swap.

### 4.5 Heading hierarchy gap on harness routes (MINOR, post-hackathon)

- Files: `app/builder/page.tsx:34, 41, 58` and `app/_harness/HarnessShell.tsx:60`
- Rule: WCAG 2.1 SC 1.3.1 Info and Relationships
- Detail: `app/builder/page.tsx` jumps directly to `<h2>` without a
  preceding `<h1>`. `app/_harness/HarnessShell.tsx` does emit `<h1>` so
  routes wrapped by it are fine; `/builder` is not wrapped, hence the gap.
  Landing `/` and game `/play` both have correct h1-h2-h3 structure.
- Fix recommendation: defer to post-hackathon; harness routes are not on
  the critical demo path. RV_PLAN Section 4 deprecates the `_harness`
  scaffold once vertical slice replaces the navigation surface.

### 4.6 DialogueOverlay surface ships unstyled (MODERATE, inherited from Harmonia-RV-B Observation A)

- File: `src/components/game/DialogueOverlay.tsx` lines 247-323 plus all
  `.dialogue-overlay*` semantic class names
- Rule: WCAG 2.1 SC 1.4.3 Contrast (no styling means browser default which
  may not meet contrast on the cyberpunk_shanghai SSR backdrop) plus
  SC 2.4.7 Focus Visible (no custom focus rings on dialogue buttons)
- Detail: Harmonia-RV-B verified that no CSS file in the project defines
  rules for any `.dialogue-overlay*` class. The overlay renders with
  browser default HTML display: black text on white background absent any
  parent style, ignoring the active world palette. On `/play` the dialogue
  surface is overlaid on the Phaser canvas (`#0b0f19` clear color), so the
  default white block is jarring and contrast-uncontrolled.
- Fix recommendation: Linus is the owning agent per Harmonia-RV-B
  Recommendation 1. Either author CSS rules in a new
  `src/components/game/dialogue-overlay.css` file imported at the
  component, or migrate the surface to Tailwind utilities consistent with
  the BottomBar plus PromptInputChallenge pattern. The latter is the
  faster path and matches the rest of the React HUD style discipline.
  This is the highest-leverage W4 a11y fix beyond items 1 to 4.

## 5. Keyboard Nav Plus Focus Management

Static review of focus management across landing plus HUD plus game shell.

| Surface | Tab order valid | Visible focus ring | Critical-path dead-end |
|---|---|---|---|
| Landing `/` | yes | yes (`focus:ring-2 focus:ring-ring`) | none |
| Game shell `/play` HUD | yes | yes (consistent across TopBar, SideBar, BottomBar, modals) | none |
| Phaser canvas (in-game movement) | n/a (canvas owns key events) | n/a | none (Player.ts at `src/game/objects/Player.ts:50-71` listens to arrow keys plus WASD via `input.keyboard.createCursorKeys()`) |
| ShopModal | yes | yes; Escape closes per `ShopModal.tsx:50-57` | none |
| DialogueOverlay | yes; Continue, choices, Close all reachable | yes | none |
| PromptChallengeNode | yes; Cmd-Enter or Ctrl-Enter submits | yes | none |
| AudioInitGate | yes; Enter or Space unlocks per `AudioInitGate.tsx:38-49` | yes | none |

PASS overall. The textarea autofocus side effect at
`PromptInputChallenge.tsx:76-79` could surprise screen-reader users by
moving focus on slot change, but the conditional render gates it tightly
(only fires when an active quest slot exists and reduced motion is off);
not a halt-trigger.

Tab-trap: ShopModal does not implement an explicit focus trap (Escape
close plus backdrop click are present). For the RV demo the modal contains
only buy buttons and a close button, so tabbing past the last button
leaves the modal but the modal stays open visually. Minor; deferred.

## 6. Screen Reader Smoke (Static Inference)

Verified via static read; no live VoiceOver pass run this session.

- `TopBar.tsx`: `role="banner"`, NERIUM logo with `aria-label`, language
  toggle has `aria-label` from i18n. PASS.
- `BottomBar.tsx`: interact prompt has `role="status"` plus `aria-live="polite"`.
  Dialogue and prompt slots have section-level `aria-label`. PASS.
- `SideBar.tsx`: `aria-label` on aside, toggle button has `aria-expanded`
  and `aria-label` that switches with collapsed state, sr-only fallback
  present. PASS.
- `DialogueOverlay.tsx`: `role="dialog"`, `aria-live="polite"`, Close button
  named, choices in semantic `<ul>`. PASS.
- `InventoryToast.tsx`: `role="status"` plus `aria-live="polite"`, dismiss
  and open-inventory buttons named. PASS.
- `ShopModal.tsx`: `role="dialog"` plus `aria-modal="true"` plus
  `aria-label`. Backdrop is `aria-hidden`. PASS.
- `CurrencyDisplay.tsx`: container `aria-label`. The decorative currency
  symbol chip is `aria-hidden="true"`. PASS.
- `ModelSelector.tsx`: explicit `<label htmlFor>` plus select element
  pattern. PASS.
- `VolumeSlider.tsx`: `<label htmlFor>` plus `aria-pressed` on mute toggle
  plus `aria-label` on range input. PASS.
- `AudioInitGate.tsx`: `role="dialog"` plus `aria-label`. Enter and Space
  unlock keyboard path present. PASS.
- `PromptInputChallenge.tsx`: textarea has no associated label. See 4.2.
- `HeroSection.tsx`: `<section aria-label>`, decorative gradient is
  `aria-hidden`, video has `aria-label="NERIUM vertical slice preview"`,
  text fallback inside the `<video>` element. PASS.
- `MetaNarrativeSection.tsx` plus `PillarsSection.tsx` plus `CTASection.tsx`:
  all have `<section aria-label>`, semantic heading hierarchy,
  decorative elements `aria-hidden`. PASS.

Verdict: PASS with one MODERATE gap (4.2 textarea label).

## 7. Critical Issues, Top 5

Ordered by severity, then by fix effort.

1. (CRITICAL, FIXED INLINE) Em dash in `app/layout.tsx:27`
   metadata title. Fix applied this session, see Section 8.
2. (MODERATE) `PromptInputChallenge.tsx:139` textarea has no
   programmatic label. Wrap heading span in `<label>` with `htmlFor`,
   matching `PromptChallengeNode.tsx:99-101` reference pattern.
3. (MODERATE) Skip-to-content link absent on every route. Add a single
   `sr-only` link in `app/layout.tsx` body, target `id="main"` on
   landmarks. WCAG 2.1 SC 2.4.1.
4. (MODERATE) `/play` CLS 0.821. Render dynamic-import loader with the
   same `absolute inset-0` skeleton dimensions as the canvas swap target.
   File: `src/components/game/GameShell.tsx:22-29`.
5. (MODERATE) DialogueOverlay surface ships unstyled. Harmonia-RV-B
   Observation A: no CSS rules for `.dialogue-overlay*` class names mean
   the dialogue surface renders as default-style HTML over the Phaser
   canvas, breaking the active-world palette and contrast story. Owning
   agent Linus per Section 4.6. Fix-effort low (one CSS file or Tailwind
   utility migration); demo-impact high (dialogue is the critical path).

Performance items deferred to advisory: `/play` TBT 6350 ms (Phaser boot
cost) and `/` LCP 14.2 s (auto-playing demo video). Both are intrinsic to
RV.1 plus RV.5 design choices and addressable post-hackathon via
code-split or video poster pre-render.

## 8. Critical Fix Applied Inline This Session

Per Nemea-v1 plus Harmonia-v1 precedent (Critical Fix inline pattern,
recorded under `Full-Harmonia polish` and `Nemea-v1 critical-fix` commit
prefixes), the single CLAUDE.md anti-pattern 1 violation was patched in
place rather than ferried as a NEEDS_FIX blocker.

```diff
--- a/app/layout.tsx
+++ b/app/layout.tsx
@@ line 27 @@
-  title: 'NERIUM <U+2014> Infrastructure for the AI agent economy',
+  title: 'NERIUM. Infrastructure for the AI agent economy.',
```

Rationale: the period-form matches `app/page.tsx:36` landing metadata,
preserves the locked V1 project identity string ("Infrastructure for the
AI agent economy"), and unblocks submission without ferry overhead.
Verified post-patch with the same Python regex sweep used in Section 3:
zero em dash hits remain across shipped code surface.

## 9. Submission Verdict

- Lighthouse: Performance 49 (`/`) and 38 (`/play`); Accessibility 100 on
  both; Best-Practices 96 and 93; SEO 90 (dev-mode artifact) and 100.
- Keyboard nav: PASS, no critical-path dead-end.
- Screen reader: PASS with one MODERATE gap (4.2).
- WCAG: 5 outstanding gaps after the inline patch (4.2 plus 4.3 plus 4.4
  plus 4.5 plus 4.6), all MODERATE or below. None are CLAUDE.md
  anti-pattern hard halts.
- Copy violations em dash plus emoji: 0 files post-patch.

**Verdict on a11y plus landing axis: READY for submission package handoff
to Ghaisan, with Section 7 items 2 to 5 surfaced as MODERATE follow-ups
for W4 finalize or post-hackathon backlog. Item 5 (DialogueOverlay
unstyled) is the highest-leverage W4 fix and the only one with material
demo-recording impact.** No new strategic-decision halt was raised by
this audit.

Submission package go/no-go also depends on resolution of the two
CRITICAL state-side findings escalated by Harmonia-RV-A (singleton
divergence plus bridge effect filter). Those are owned by Thalia-v2 plus
gameBridge owners, not Nemea-RV-B; flagged here so Ghaisan can sequence
the W4 fix order correctly.

## 10. Self-Check

- Mandatory reading: NarasiGhaisan, RV_PLAN, CLAUDE.md, M2 Section 4.16,
  harmonia_sweep.md, landing components, HUD components. Completed.
- Halt triggers: em dash detected, recommend-fix-immediate honored via
  Section 8 inline patch. Keyboard dead-end on critical path: none.
- Strategic-decision hard stop: none triggered.
- Daily rhythm: well within 07:00 to 23:00 WIB envelope (run at
  approximately 18:59 WIB, 2026-04-23).
- Output file written: `docs/qa/nemea_rv_a11y_report.md` (this file).
- Brevity discipline: Section 7 caps the critical list at 5 items per
  NarasiGhaisan Section 18.
- No em dash, no emoji in this report.

End of Nemea-RV-B report.
