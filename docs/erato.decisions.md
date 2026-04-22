---
owner: Erato (Builder Worker, Advisor UI, P2)
version: 0.1.0
status: draft
last_updated: 2026-04-22
contract_refs:
  - docs/contracts/advisor_ui.contract.md v0.1.0
  - docs/contracts/advisor_interaction.contract.md v0.1.0
  - docs/contracts/prediction_layer_surface.contract.md v0.1.0
---

# Erato Decisions Log

ADR-style log of the Advisor UI P2 session. Two of the strategic_decision_hard_stops flagged in `.claude/agents/erato.md` are resolved here without V3 ferry because each has an explicit recommendation embedded in the prompt plus upstream contract text; the third (voice/tone) is explicitly owned by Apollo per apollo.decisions.md and Erato is pure presentation. The remaining entries cover minor contract drifts Erato introduces to stay within the hard-constrained 5-artifact output spec while still honouring the advisor_ui contract behaviourally.

## Summary table

| ADR  | Subject                                    | Decision                                                                                 | Ferry to V3? |
|------|--------------------------------------------|------------------------------------------------------------------------------------------|--------------|
| 0001 | Schema import path                         | Relative `../apollo`, not `@/advisor/schema/advisor_interaction`                         | no           |
| 0002 | Inline LocaleToggle plus WorldAestheticPicker | Render inline within AdvisorChat; do not ship standalone files                           | no           |
| 0003 | Voice input scope                          | Text only for hackathon per Erato prompt recommendation                                  | no           |
| 0004 | Voice and tone ownership                   | Apollo owns, Erato renders verbatim; no Ghaisan ferry from Erato                         | no           |
| 0005 | Long-wait cancel affordance                | Visual dismiss only; no `onCancel` prop in contract v0.1.0                               | no           |
| 0006 | Design tokens stub                         | CSS custom properties inline on `.advisor-root`, Harmonia P4 sweeps                      | no           |
| 0007 | Zustand store placement                    | Defer to Apollo mount layer; Erato components are pure-props                             | no           |
| 0008 | Honest-claim annotation rendering          | Hardcoded in ModelStrategySelector, mirrors apollo.config.json                           | no           |
| 0009 | Prediction warning severity inference      | Keyword heuristic on turn content when attached_components omit severity                 | no           |
| 0010 | Warning action event surface               | DOM `CustomEvent('nerium:prediction-warning-action')` for Acknowledge and Revise         | no           |
| 0011 | Brevity overflow visual marker             | `data-brevity-overflow` attribute on bubble, no content truncation                       | no           |

---

## ADR 0001. Schema import path

**Context.** `docs/contracts/advisor_ui.contract.md` Section 3 and the sibling `advisor_interaction.contract.md` Section 6 both specify `app/advisor/schema/advisor_interaction.ts` as the canonical schema location. Apollo's P2 output explicitly did not create that file (see `docs/apollo.decisions.md` ADR 0008), inlining all types in `app/advisor/apollo.ts` instead because Apollo's hard constraint listed exactly four artifacts and did not authorise a schema file. Erato needs `AdvisorSession`, `AdvisorTurn`, `AttachedComponent`, `Locale`, `ModelStrategy`, and `WorldAesthetic` at compile time.

**Decision.** Import types from the sibling module via relative path `../apollo`. Do not create `app/advisor/schema/advisor_interaction.ts` in this session; that file is scheduled by Apollo for a post-hackathon refactor and would exceed Erato's 5-artifact output spec.

**Alternatives considered.**

- Create a re-export barrel at `app/advisor/schema/advisor_interaction.ts` so the contract-stated path resolves. Rejected: violates Erato's "Output file paths exactly per Task Specification" hard constraint and would fork schema ownership.
- Wait for Apollo's post-hackathon refactor before building UI. Rejected: blocks the hackathon critical path.

**Consequence.** Contract v0.2.0 should either retitle Section 3 examples to the actual path or promote schema extraction to a first-class Apollo artifact. Tracked here so Harmonia and Morpheus do not treat the contract drift as a bug.

---

## ADR 0002. Inline LocaleToggle and WorldAestheticPicker

**Context.** `advisor_ui.contract.md` Section 6 lists `LocaleToggle.tsx` and `WorldAestheticPicker.tsx` as separate component files. Erato's output spec in `NERIUM_AGENT_STRUCTURE.md` Section 5.8 plus `.claude/agents/erato.md` Task Specification lists five artifacts and excludes both files. Erato's hard constraint requires exact output paths.

**Decision.** Render both controls inline within `AdvisorChat.tsx` as small pill groups at the header. Keep behaviour aligned with the contract (callback props `onLocaleToggle`, `onWorldAestheticChange`; ARIA labels on every button; pressed state visible).

**Rationale.** Mirrors Apollo's precedent (ADR 0008 in `apollo.decisions.md`): when contract file lists more artifacts than the agent's output spec, the output spec wins and the behavioural surface collapses into the authorised file. Preserves callable API for Apollo mount without shipping unauthorised files.

**Consequence.** Harmonia aesthetic sweep should scope styling through the inline class names (`advisor-pill-group`, `advisor-pill`) declared in `app/advisor/ui/styles.css`. A post-hackathon extraction is trivial (copy the JSX blocks into dedicated files and import) and should coincide with the schema barrel move in ADR 0001.

---

## ADR 0003. Voice input scope

**Context.** Erato prompt lists this as a strategic_decision_hard_stop with a direct recommendation: "Whether to include voice input (mic) or text-only for hackathon. Recommendation: text-only for hackathon scope." Contract Section 10 and Section 11 further state voice input deferred to post-hackathon.

**Decision.** Text-only textarea composer for hackathon scope. No microphone UI, no Web Speech API integration, no speech-to-text hook surface.

**Rationale.** Demo video is three minutes max; voice input adds complexity (permission prompt handling, noise robustness, platform gaps on Safari) with negligible demo impact relative to the Builder hero storyline. Post-hackathon refactor reintroduces voice per contract Section 11.

**Consequence.** No ferry. Post-hackathon ticket: add an optional `SpeechInputProvider` injected via props-level dependency injection, keeping the pure-props surface.

---

## ADR 0004. Voice and tone ownership

**Context.** Both the prompt and contract list the Advisor character's voice and tone as a strategic_decision_hard_stop ("voice tone of Advisor character must match Ghaisan voice preferences, requires sample review").

**Decision.** Erato does not author Advisor turn copy. Apollo's `AdvisorResponseGenerator` (see `app/advisor/apollo.ts` and `apollo.prompts.ts`) owns the generated tone; Erato renders `AdvisorTurn.content` verbatim. The brevity visual marker (ADR 0011) is defensive, not authoritative.

**Rationale.** Voice and tone rides through Apollo's prompts. Erato mixing in copywriter decisions would create tone drift during demo. Welcome-state strings and placeholder copy are the only strings Erato authors; both track NarasiGhaisan Section 13 brevity and use plain localised phrasing without Advisor character flavour.

**Consequence.** Any Ghaisan sample review for Advisor voice ferries through Apollo, not Erato. If Ghaisan sign-off changes the prompt template, Erato does not need a redeploy.

---

## ADR 0005. Long-wait cancel affordance

**Context.** `advisor_ui.contract.md` Section 8: "If `isAwaitingAdvisorTurn` remains true past 15 seconds, render a subdued progress indicator and a cancel affordance." Contract v0.1.0 does not expose an `onCancel` callback prop. Adding a new callback is a contract change that would require Pythia v0.2.0 and a V3 ferry.

**Decision.** Render the progress indicator after 15 seconds and a visible Dismiss button. Clicking Dismiss clears the local affordance (hides the indicator for the current await window) and emits a DOM `CustomEvent('nerium:prediction-warning-action', { detail: { warning_id: 'long-wait-cancel', action: 'acknowledge' } })`. Apollo mount layer can listen for this event if it wants to act on the signal.

**Rationale.** Keeps the contract immutable for P2. Provides a user-visible affordance (so the screen does not feel stuck) while honestly acknowledging that Erato cannot cancel upstream LLM work without a callback prop. The custom event gives Apollo an escape hatch without reintroducing prop-drilling.

**Consequence.** Contract v0.2.0 should add `onAdvisorTurnCancel?: () => Promise<void>`. Post-hackathon refactor note already in contract Section 11 mentions moving to a `useAdvisor()` hook; the cancel callback rides that migration.

---

## ADR 0006. Design tokens stub

**Context.** Tech stack commits to Tailwind v4 with OKLCH tokens (CLAUDE.md) plus a dedicated Harmonia P4 sweep for unified design tokens. Erato runs at P2 before Harmonia's output lands.

**Decision.** Declare CSS custom properties on the `.advisor-root` scope inline in `styles.css`. Use the cyberpunk_shanghai palette as the default with two sibling overrides (`[data-world="medieval_desert"]`, `[data-world="steampunk_victorian"]`). Palette values trace NarasiGhaisan Section 7 directly (cyan `#00f0ff`, magenta `#ff2e88`, base `#06060c`, terracotta `#c97a4a`, sand `#e8c57d`, brass `#c8a14a`, etc.).

**Rationale.** Scoped properties let Harmonia sweep by replacing custom property values without renaming selectors. Using `data-world` attribute switches the palette at runtime when `onWorldAestheticChange` fires; no JavaScript re-render of the style tree needed.

**Consequence.** When Harmonia's `app/shared/design/tokens.ts` ships, replace the inline defaults with references to the Harmonia token names and keep the `data-world` attribute contract intact. Typography is stubbed to system fonts plus Inter or Space Grotesk fallbacks; Harmonia may swap.

---

## ADR 0007. Zustand store placement

**Context.** Erato prompt Soft Guidance: "Use Zustand for chat-surface state." Contract Section 4: "Component props are typed via interfaces above; no any leakage." Section 11 post-hackathon note: "Replace callback-prop surface with a `useAdvisor()` hook that binds to a Zustand store."

**Decision.** Erato P2 components stay pure-props. No Zustand store inside `app/advisor/ui/`. The parent mount layer (Apollo mount for the demo runner, or a future App Router page) owns the Zustand store, derives `AdvisorSession`, and passes it via props. Local UI state (input draft, toast, long-wait timer) uses `useState`.

**Rationale.** Pure-props keeps AdvisorChat drop-in testable without store mocking and aligns with contract Section 4. The Zustand guidance in the prompt is read as "use Zustand at the chat-surface bounding layer," not "import Zustand in every UI file." The Apollo mount layer is the natural bounding layer.

**Consequence.** Post-hackathon `useAdvisor()` hook described in contract Section 11 can live in `app/advisor/state/session_store.ts` (already referenced by Apollo's refactor notes). Erato UI files do not need to change beyond replacing the top-level props surface.

---

## ADR 0008. Honest-claim annotation rendering

**Context.** CLAUDE.md anti-pattern 7 plus NarasiGhaisan Section 3 require that `multi_vendor` and `auto` strategy modes carry a visible honest-claim annotation ("demo execution Anthropic only"). Apollo's config already stores annotation strings in `model_strategy.modes.{mode}.honest_claim_annotation`.

**Decision.** Hardcode the annotation strings in `ModelStrategySelector.tsx` at the `MODES` constant. Strings mirror `apollo.config.json` verbatim. Render with `role="note"` below the select control whenever the active mode carries an annotation.

**Rationale.** Importing `apollo.config.json` at runtime requires Next.js JSON import plumbing and couples Erato to Apollo's config IO surface. Apollo config remains the single source of truth for behaviour; Erato mirrors the user-visible strings. If Apollo updates annotation copy, sync requires a one-line change here.

**Consequence.** Contract v0.2.0 could promote `honest_claim_annotation` into the `ModelStrategy` schema as a literal-typed map to eliminate the drift entirely. Tracked as a small followup.

---

## ADR 0009. Prediction warning severity inference

**Context.** `advisor_interaction.contract.md` Section 3 defines `AttachedComponent` with `{ kind: 'prediction_warning'; warning_id: string }`, carrying only the `warning_id`. `PredictionWarningProps` (from `advisor_ui.contract.md`) requires `severity` in `{ 'advisory', 'review_recommended', 'halt_recommended' }`. There is no contract channel that carries severity from Cassandra's `EarlyWarning` object through Apollo's turn into Erato's render pass.

**Decision.** Infer severity heuristically from the rendered turn content. If the content contains `halt`, `stop`, `critical`, or `berhenti`, map to `halt_recommended`. If it contains `review`, `revisi`, `check`, or `risk`, map to `review_recommended`. Otherwise `advisory`. The heuristic mirrors the phrasing shape Cassandra's `gamifiedMessage` helper uses (see `app/builder/prediction/cassandra.ts`).

**Rationale.** Avoids a breaking contract change mid-hackathon. Cassandra's phrasing is deterministic enough that the heuristic hits the correct severity the vast majority of the time.

**Consequence.** Contract v0.2.0 should extend `AttachedComponent` with an optional `severity` field on the `prediction_warning` variant, or add a `warnings: Record<string, EarlyWarning>` prop to `AdvisorChatProps`. Post-hackathon fix. If the heuristic misclassifies in demo (for example, a halt message that does not contain the keyword), the Acknowledge and Revise actions still work; only the colour scheme is off.

---

## ADR 0010. Warning action event surface

**Context.** `PredictionWarningProps` requires `onAcknowledge` and `onRevise` callbacks, but `AdvisorChatProps` does not propagate them from the parent. Apollo's `renderPredictionMap` attaches the warning to a turn with no callback wiring.

**Decision.** Erato dispatches a DOM `CustomEvent('nerium:prediction-warning-action')` with `detail: { warning_id, action: 'acknowledge' | 'revise' }` when the user clicks either button. Apollo mount or a higher-level coordinator listens on `window` and translates the event into a pipeline-bus message.

**Rationale.** Keeps AdvisorChatProps at v0.1.0. Uses a standard browser primitive that both Next.js client components and plain test harnesses can observe. The event name is namespaced with `nerium:` per convention.

**Consequence.** Contract v0.2.0 should add `onPredictionWarningAction?: (input: { warning_id: string; action: 'acknowledge' | 'revise' }) => Promise<void>` to `AdvisorChatProps`. When that ships, Erato removes the CustomEvent dispatch in favour of the callback and Apollo mount drops the window listener.

---

## ADR 0011. Brevity overflow visual marker

**Context.** `advisor_interaction.contract.md` Section 4 explicitly places brevity enforcement at the data layer ("max 3 sentences enforced at data layer not at UI"). Erato prompt Hard Constraints line item: "UI enforce Apollo turn length at presentation layer: truncate or visually indicate if Apollo response > 3 sentences (fallback graceful)." Reading the two together, UI enforcement means defensive marker, not re-truncation.

**Decision.** Render `data-brevity-overflow="true"` on the bubble when an `advisor`-role turn exceeds three sentences or two questions. Styling adds a small magenta glow dot at the top-right corner; content is not truncated. `countSentences` and `countQuestionMarks` helpers are imported from `app/advisor/apollo.ts` for parity with the data-layer enforcement.

**Rationale.** Defensive (Apollo's `enforceAdvisorBrevity` should prevent overflow), but visible if a bypass ever happens so QA can spot it during demo dress rehearsal. Does not re-truncate because that would drop legitimate Apollo content if the data layer ever intentionally relaxes the limit.

**Consequence.** Nemea QA can grep for `[data-brevity-overflow="true"]` during a11y and regression sweeps to catch brevity violations visually. If the marker appears during the demo, Apollo has a bug to fix.

---

## Open follow-ups

- Morpheus (Protocol worker, P3b) owns the multi-vendor expansion panel. Erato leaves `multiVendorPanelSlot` as a pass-through; Morpheus returns a `ReactNode` via Apollo mount.
- Harmonia (P4) sweeps `app/advisor/ui/styles.css` to consolidate tokens with the cross-pillar design tokens contract.
- Helios (P2 sibling, potentially overlapping) plugs into `pipelineVizSlot`; shared event-stream subscription lives in Helios, not Erato.
- Nemea QA pass validates axe-core WCAG AA on the mounted chat; contract Section 9 lists the five required tests.
- Post-hackathon contract v0.2.0 bundles ADR 0001, 0002, 0005, 0009, and 0010 resolutions.
