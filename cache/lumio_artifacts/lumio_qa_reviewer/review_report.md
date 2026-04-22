# Lumio QA Review Report

**Author:** lumio_qa_reviewer (step 7)
**Produced:** 2026-04-24T03:22:58Z
**Inputs reviewed:** `builds/lumio/frontend/app/page.tsx`, `builds/lumio/frontend/components/hero.tsx`

## Summary verdict

Ship-ready for a scaled-down demo, with 4 issues logged for live build follow-up. Nothing blocking the demo video record.

## Severity legend

- **sev1**, shipping blocker.
- **sev2**, visible issue, would embarrass if a judge hovered.
- **sev3**, polish debt, document and defer.

## Findings

### sev2, pricing card featured border clips at < 360 px viewport

On iPhone SE width, the 2 px inner border of the Deep Reader card overlaps the "Most chosen" pill by 1 px. Visual only. Fix, reduce pill top offset to `-10px` or shorten pill text at that breakpoint.

### sev3, hero card stack motion flattens with `prefers-reduced-motion: reduce`

Current implementation simply disables the float animation. That is correct behavior, but the resulting stack lacks visual hierarchy. Suggest adding a subtle `transform: translateY(-4px)` static offset for the middle card in the reduced-motion branch.

### sev3, faq accordion animation ease feels abrupt at fast taps

When the user opens two adjacent details in sequence, the height transitions feel stiff at 120 ms. Recommend `300 ms ease-out` for content expansion, 120 ms is fine for collapse.

### sev3, signup step 3 plan card focus ring invisible on `focus-visible`

Keyboard users cannot see the currently-focused plan option. Current `data-selected` border is not driven by focus. Fix, add `:focus-visible` ring with 2 px offset at `--ink` color.

## What was explicitly checked

- Landing scroll at three breakpoints (360, 768, 1440), no layout break.
- Signup wizard full happy path, three steps plus done state.
- Signup wizard invalid email path, inline error messaging clears on correction.
- Keyboard traversal of header nav and hero CTA, tab order sane.
- Color contrast, all text above 4.5:1 on background, primary CTA 7.2:1.
- No em dash appears in any rendered copy (project-wide rule honored).
- No emoji anywhere.
- Print stylesheet renders signup cleanly on A4 portrait.

## Follow-up action, owner

- sev2 pricing card clip: UI builder, 20 min fix.
- sev3 reduced-motion hero: UI builder, 15 min polish.
- sev3 faq ease: UI builder, 10 min polish.
- sev3 plan focus ring: UI builder, 10 min polish.

Total follow-up effort: approximately one hour, all deferred to live build post-demo.
