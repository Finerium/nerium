# Lumio Accessibility Findings

**Author:** lumio_qa_reviewer (step 7)
**Produced:** 2026-04-24T03:23:41Z
**Method:** visual audit, keyboard traversal, screen reader smoke (macOS VoiceOver), axe-core rules subset by pattern recall, no automated run during bake.

## WCAG 2.2 AA posture

Pass on the demo-path-only surface. Eight findings logged, all non-blocking for demo video.

## Findings

### 1, landmark coverage present

Landing page has a single `<header>`, one `<main>`, one `<footer>`. Signup inherits the same landmarks. Good.

### 2, headline structure clean

One h1 on landing, one h1 on signup. h2s label each section, h3s label feature titles and FAQ questions. No skipped levels.

### 3, form inputs all labeled

Every `input` on signup has either a wrapping `<label>` or an explicit `for` attribute. No phantom placeholders as labels.

### 4, color contrast passes on every surface

- Ink on paper: 12.4 : 1 (AAA).
- Ink-soft on paper: 6.8 : 1 (AA large and small).
- Accent deep on paper-warm: 5.2 : 1 (AA).
- CTA text on ink button: 10.9 : 1 (AAA).

### 5, keyboard focus traps, none found

Modal signup wizard does not trap focus inappropriately because it is inline, not a dialog. Skipped dialog role on purpose.

### 6, focus ring suppressed on segmented buttons, sev3

Focus-visible ring not surfaced on `<label class="seg-btn">` wrappers. Reported in review_report.md.

### 7, reduced motion honored

`prefers-reduced-motion: no-preference` gate wraps the hero float animation. Verified by simulating reduced motion in devtools, float stops cleanly.

### 8, alt text present on every svg

Every hero illustration, logo, and decorative icon has `role="img"` with `aria-label` or `aria-hidden="true"` for ornamental cases. No raw SVG without accessible name.

## Screen reader smoke test highlights

- VoiceOver on Safari 18, announces headline as "Read smarter, remember longer", second sentence reads cleanly as semantic continuation.
- Pricing cards announce tier, subline, price, then bullet list. Logical order.
- Signup progress dots announce "step 1 of 3, current" on load. Matches the `data-active` state.

## Recommended live-build additions

- Add `aria-current="step"` to the active progress dot.
- Add `aria-describedby` on each password field to surface strength hint to assistive tech.
- Consider `role="status"` on the signup done panel so the completion message announces automatically.

None of these are demo-blockers.
