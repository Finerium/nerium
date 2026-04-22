---
owner: Morpheus (Protocol Worker, Vendor Adapter UI, P3b)
version: 0.1.0
status: draft
last_updated: 2026-04-22
contract_refs:
  - docs/contracts/vendor_adapter_ui.contract.md v0.1.0
  - docs/contracts/protocol_adapter.contract.md v0.1.0
  - docs/contracts/advisor_ui.contract.md v0.1.0
upstream_refs:
  - docs/heracles.decisions.md ADR-011 (MA lane hidden in Multi-vendor mode)
  - docs/apollo.decisions.md ADR-0001 (model strategy default)
  - docs/apollo.decisions.md ADR-0002 (multi-vendor UI surface posture)
  - _meta/NarasiGhaisan.md Section 3 (flexibility), Section 16 (honest framing)
---

# Morpheus Decisions Log

ADR-style log of strategic and implementation decisions made during the Morpheus (Protocol Worker, Vendor Adapter UI) P3b session. Morpheus owns `MultiVendorPanel`, `TaskAssignmentGrid`, and `HonestAnnotation`, plus the shared `vendor_adapter_ui_types.ts` and `annotation_text.constant.ts` per contract Section 6. Decisions below either respond to the single strategic_decision_hard_stop in morpheus.md (vendor list breadth) or record execution choices that future agents (Harmonia, Nemea, post-hackathon maintainers) need to understand without re-deriving them.

## Summary table

| ADR | Subject | Decision | Ferry to V3? |
|-----|---------|----------|--------------|
| 0001 | Vendor list breadth in Multi-vendor panel | Anthropic + Gemini + Higgsfield primary, Llama and OpenAI optional via caller `availableVendors` | yes |
| 0002 | Honest annotation placement and non-dismissibility | Top of panel, `role="note"`, no close affordance, locked text via constant | no |
| 0003 | Auto-mock enforcement on non-Anthropic vendors | Panel rewrites `execution_status` to `'mock'` before `onAssignmentChange` fires | no |
| 0004 | MA lane visibility in Multi-vendor view | Hidden; central `stripManagedAgentsLane` filter drops any `ma` pseudo-vendor | no |
| 0005 | Styling strategy via advisor CSS custom properties | Reuse `--advisor-*` custom props with `morpheus-*` class prefix, no new palette | no |
| 0006 | Capability mismatch handling on assignment | Permitted but surfaced with `capability mismatch` badge on the selected cell | no |
| 0007 | Auto-mode panel scope | Out of scope for Morpheus; Erato owns the selector-level honest annotation | no |
| 0008 | ReadOnly semantics | Disable non-selected cells, keep current assignments visible, dim panel opacity | no |

---

## ADR 0001. Vendor list breadth in the Multi-vendor panel

**Context.** morpheus.md flags this as the single `strategic_decision_hard_stop`: "Vendor list surface (just Gemini and Higgsfield, or broader including Llama, GPT, etc.)." Contract `vendor_adapter_ui.contract.md` Section 10 explicitly defers the answer to Morpheus, noting the `availableVendors` prop supports any subset. NarasiGhaisan Section 3 frames multi-vendor as a brand differentiator ("Claude plus Gemini plus Higgsfield plus others"), so breadth carries product weight; Section 16 caps the marketing claim at honest framing, so visible depth should not imply hidden real integrations.

**Recommendation.** Anthropic plus Gemini plus Higgsfield are the primary vendors that always render when callers supply defaults. Llama (`llama_generic`) and OpenAI (`openai_generic`) are allowed as secondary chips when the caller passes profiles for them. This matches the Proteus-defined `VendorId` union exactly (no new IDs) and matches the two vendors Proteus actually stubbed in P1 (`gemini_adapter.mock.ts` plus the Higgsfield placeholder mentioned in `protocol_adapter.contract.md` Section 4).

**Alternatives considered.**

- Option A (accepted). Three primary vendors, two optional. Preserves brand breadth without silent-claiming integrations that do not yet exist (Llama, OpenAI) while keeping the door open for callers that want to demo them.
- Option B. Ship all five by default. Rejected because neither Llama nor OpenAI has a dedicated mock adapter yet; showing them un-gated invites questions Morpheus cannot answer on demo day.
- Option C. Ship only Anthropic and Gemini. Rejected because Higgsfield is explicitly called out in NarasiGhaisan Section 3 alongside Gemini; dropping it would weaken the brand prop per Section 3.

**Ferry to V3.** Yes. Morpheus ships Option A as the default and makes the breadth caller-controlled via `availableVendors`. V3 can lock a different default by editing Erato's mount point (the array passed into `MultiVendorPanel.availableVendors`); no change to Morpheus or the contract is required.

**Consequence.** The panel renders any vendors passed in, minus the MA lane (ADR 0004). If the caller passes an empty array, the fallback Anthropic-only profile renders per contract Section 8 ("Missing `availableVendors`: render the panel with a minimal fallback showing only Anthropic").

---

## ADR 0002. Honest annotation placement and non-dismissibility

**Context.** morpheus.md hard_constraints require the `HonestAnnotation` to be "VISIBLE WITHOUT HOVER, minimum font-size 12px, contrast WCAG AA, positioned top of Multi-vendor panel NOT hidden in tooltip". NarasiGhaisan Section 16 forbids hiding the claim behind interaction. Contract Section 4 says the panel "renders the honest annotation at the top, always visible, with the locked phrasing unless `annotation_text` override supplied".

**Decision.** `HonestAnnotation` mounts as the first direct child of `MultiVendorPanel`, with `role="note"`, `aria-live="polite"`, and no dismiss affordance. Base font-size is 12px per contract minimum; the label span uses an uppercase mono treatment at 10px (treated as a decorative affordance beside the body text, which remains 12px per AA small-text rules). The default text is `HONEST_CLAIM_LOCKED_TEXT` from `annotation_text.constant.ts`, which carries the exact phrase mandated by morpheus.md soft_guidance and contract Section 3 default ("demo execution Anthropic only, multi-vendor unlock post-hackathon"). Callers may pass `annotation_text` for locale override; blank overrides fall back to the locked default and emit a console warning per contract Section 8 ("Invalid annotation override: falls back to locked default text and logs warning").

**Rationale.** Non-dismissibility and top placement remove the two most common ways a well-meaning UI eventually hides an annotation (collapsible disclosure, tooltip). Both would defeat the point of Section 16. `role="note"` keeps the element in screen-reader order without claiming interactive control semantics, mirroring the existing `advisor-strategy-note` pattern already in `ModelStrategySelector.tsx`.

**Consequence.** Morpheus does not expose a dismiss or collapse affordance at any layer. If a downstream designer asks for one, halt-and-ferry per morpheus.md Halt Trigger 1 ("UX conflict between honesty annotation visibility and Multi-vendor visual appeal").

---

## ADR 0003. Auto-mock enforcement on non-Anthropic vendors

**Context.** CLAUDE.md anti-pattern 7 forbids any shipped-path claim of working Gemini / Higgsfield / Llama integration during the hackathon. Contract Section 4 mandates "Non-Anthropic assignments automatically mark `execution_status: 'mock'` for hackathon scope." Contract Section 9 testing surface includes "Execution status auto-mock: assign Gemini to `code_generation`, assert the resulting `VendorAssignment.execution_status === 'mock'`."

**Decision.** Enforcement lives in two places, both centralised on `normaliseExecutionStatus` / `enforceMockPolicy` from `vendor_adapter_ui_types.ts`:

1. `MultiVendorPanel` normalises incoming `assignments` on every render via `useMemo(() => enforceMockPolicy(assignments))` so the child grid always receives a normalised list.
2. The internal `buildNextAssignments` helper stamps `execution_status` from `normaliseExecutionStatus(vendor_id)` before publishing; the panel re-runs `enforceMockPolicy` on the outgoing array so even a rogue caller-inserted entry is corrected before `onAssignmentChange` fires.

Flipping `execution_status` to `'real'` for a non-Anthropic vendor is not reachable from this panel during hackathon scope. Post-hackathon, per contract Section 11 note, the auto-mock step is the single line to remove when multi-vendor real integrations land.

**Consequence.** Tests that assign `gemini` to `code_generation` will always observe `execution_status === 'mock'` regardless of how the caller constructed the input. Tests that assign `anthropic` to any task will always observe `'real'`.

---

## ADR 0004. MA lane visibility in the Multi-vendor view

**Context.** Heracles `ADR-011` locks "Heracles MA lane hidden in Multi-vendor strategy mode". The rationale there: MA is Anthropic-only, so surfacing it inside a strategy labelled "Multi-vendor" would mislead users about what "multi-vendor" means. Heracles explicitly routes this to Morpheus for UI enforcement.

**Decision.** `MultiVendorPanel` centralises the filter in `stripManagedAgentsLane`, which removes any profile whose `vendor_id` matches the MA pseudo-vendor tokens (`managed_agents`, `ma`, `anthropic_ma`). The filter runs once inside a `useMemo` keyed on `availableVendors` so it remains idempotent across re-renders and covers any future caller that leaks an MA profile by accident. The Task dimensions do not include an `managed_agents` row at all; the MA lane lives exclusively on the other two strategy views (`opus_all`, `collaborative`) owned by Apollo and Heracles.

**Alternatives considered.**

- Option A (accepted). Filter at the panel boundary. Simple, caller-agnostic, survives future contract drift.
- Option B. Push the filter into `availableVendors` caller-side (Erato). Rejected because "hide MA in multi-vendor" is a Protocol concern, not an Advisor concern; centralising it in Morpheus keeps Heracles ADR-011 enforcement close to the point of enforcement and reduces the odds of a future caller forgetting.

**Consequence.** Even if Heracles exposes an `managed_agents` profile in a shared catalogue post-hackathon, it will not render inside the Multi-vendor panel until this filter is explicitly relaxed. The relaxation must go through a new ADR that supersedes Heracles ADR-011.

---

## ADR 0005. Styling strategy via advisor CSS custom properties

**Context.** Erato already publishes a full `.advisor-root` palette (cyberpunk_shanghai default, medieval_desert and steampunk_victorian world overrides) in `app/advisor/ui/styles.css`. Harmonia P4 will sweep that palette into the unified `app/shared/design/tokens.ts` per `design_tokens.contract.md`. Morpheus can either duplicate a palette or consume what Erato already publishes.

**Decision.** `app/protocol/vendor/styles.css` adds zero new palette tokens. Every colour, radius, spacing, transition, and typography value is read via `var(--advisor-*, fallback)` so the vendor panel retheme automatically when Erato's world toggle or Harmonia's tokens.ts sweep flips the root custom properties. Selectors use a `morpheus-*` prefix to prevent collision with `advisor-*`.

**Rationale.** Contract Section 4 under `design_tokens.contract.md` says "Components must consume tokens via Tailwind utility classes or via `var(--token-name)` CSS references; hardcoded colors and spacings trigger Nemea regression failure." Reusing advisor tokens keeps the panel inside that rule without forcing Harmonia to diff a separate file. Fallback values in each `var()` call cover the case where the panel is mounted outside `.advisor-root` (e.g., a future Registry or Marketplace surface).

**Consequence.** When Harmonia emits `app/shared/design/tokens.ts`, the morpheus stylesheet inherits the sweep for free. If Harmonia prefers renaming tokens (e.g., `--advisor-bg` to `--color-background`), the fallback values keep the panel rendering correctly during the rename and the actual selector updates happen in a single pass across advisor + vendor styles.

---

## ADR 0006. Capability mismatch handling on assignment

**Context.** Contract Section 8 error handling: "Assignment to a vendor that does not support the task dimension: permitted but flagged with a warning badge; user can choose anyway, annotation notes mock execution." Contract Section 9 does not mandate a test for this, leaving the surface choice to Morpheus.

**Decision.** `TaskAssignmentGrid.vendorSupportsTask` returns `false` for image_generation / video_generation on vendors whose profile has `supports_multimodal_input: false`, and `true` otherwise. A selected cell whose vendor lacks capability renders a `capability mismatch` label inside the cell and receives `data-capability-warn="true"` on the root button, which styles.css renders with a dashed border. Unselected cells do not show the badge, so the grid avoids visual noise on every cell.

**Rationale.** Showing the mismatch only on selection matches the contract's "user can choose anyway" framing and keeps the visual hierarchy clean. The dashed border is low-noise but unambiguous; combined with the text label inside the cell, screen readers pick up the warning via the augmented `aria-label`.

**Consequence.** Future vendor profiles that extend the capability surface (for example, a dedicated `supports_video_output` flag) can extend `vendorSupportsTask` without touching the rest of the grid.

---

## ADR 0007. Auto-mode panel scope

**Context.** The session brief notes "Auto mode: wrapper NOT router per Apollo ADR-0005 (ships as wrapper, orchestrator research layer post-hackathon)." Apollo's decisions log currently numbers its auto-related ADR as ADR-0001 ("Options multi_vendor and auto remain UI-surfaceable but carry an honest-claim annotation (ADR-0002)"), and Apollo ADR-0005 is actually about Advisor brevity enforcement. The Erato `ModelStrategySelector` already carries the auto annotation ("Auto routing ships post-hackathon; current demo uses collaborative Anthropic."). Contract `vendor_adapter_ui.contract.md` does not name an auto-mode panel at all.

**Decision.** Morpheus owns the Multi-vendor view only. Auto-mode rendering stays at Erato's selector layer, where its honest annotation already lives. No `AutoModePanel` artifact is produced here.

**Rationale.** Scope creep into auto mode would duplicate annotation logic already shipped in `ModelStrategySelector.tsx` and would exceed the four outputs listed in morpheus.md Task Specification. The intent behind the session brief line ("wrapper not router") is that auto mode ships without a real orchestrator; that intent is already honoured by the selector-level annotation plus the absence of a routing implementation.

**Consequence.** If the V3 orchestrator later wants a Morpheus-owned auto panel (for example, to show the per-task model the orchestrator would have picked), it must first update the contract and the agent structure (M2 Section 5.21 lists only Multi-vendor outputs). Until then, auto mode remains a selector-only surface.

---

## ADR 0008. ReadOnly semantics

**Context.** Contract Section 3 and Section 9 mention a `readOnly` prop. Section 9 testing surface: "Read-only: with `readOnly: true`, click a cell, assert no change event fires." The contract does not describe the visual treatment.

**Decision.** When `readOnly` is true, `MultiVendorPanel` sets `data-read-only="true"` on the root section and passes the flag through to the grid. The grid disables any cell that is not currently selected, preserves the selected cell so the caller can read its state, and keeps the honest annotation fully readable. Panel opacity drops to 0.85 as a visual affordance so reviewers understand they are looking at a snapshot. `onAssignmentChange` and `onToggle` are no-ops while the flag is set.

**Rationale.** The Section 9 assertion only requires that a click on a read-only grid does not fire `onAssignmentChange`. Disabling unselected cells is the cheapest way to guarantee this while keeping the panel legible. Dimming the whole panel to 0.85 (rather than 0.5) preserves text contrast for the honest annotation, which is the one element that must remain sharp regardless of interaction state per ADR 0002.

**Consequence.** Nemea can snapshot the panel with `readOnly` set and get an unambiguous "demo only, no interaction" visual for the final QA screens.

---

## Self-check rubric (for future revisions of this log)

When adding or revising an ADR, verify:
- Decision is stated in one sentence.
- Why references a specific contract section, Apollo or Heracles ADR, or NarasiGhaisan section.
- At least one alternative is considered and explicitly rejected with reasoning.
- Status is Accepted, Proposed, or Superseded (with pointer to the superseding ADR).
- No em dash, no emoji.
