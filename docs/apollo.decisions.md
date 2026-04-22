---
owner: Apollo (Advisor Tier, P2)
version: 0.1.0
status: draft
last_updated: 2026-04-22
contract_refs:
  - docs/contracts/advisor_interaction.contract.md v0.1.0
  - docs/contracts/pillar_lead_handoff.contract.md v0.1.0
  - docs/contracts/prediction_layer_surface.contract.md v0.1.0
---

# Apollo Decisions Log

ADR-style log of routing, brevity, and strategic decisions made during the Apollo (Advisor Tier) P2 session. Two entries are flagged as strategic_decision_hard_stop per apollo.md; both ferry to V3 with a recommended posture so downstream workers (Erato, Helios, Urania, Dionysus) are unblocked while V3 confirms the lock.

## Summary table

| ADR | Subject | Decision | Ferry to V3? |
|-----|---------|----------|--------------|
| 0001 | Model Strategy default | `collaborative` on new session, `opus_all` for demo override | no |
| 0002 | Multi-vendor UI surface | Show mode with honest-claim annotation | yes |
| 0003 | Gamified warning copy | `building_floor` variant proposed | yes |
| 0004 | Session state persistence | In-memory Map for hackathon, SQLite post-hackathon | no |
| 0005 | Brevity enforcement | Auto-rewrite at data layer, log warning, never surface raw | no |
| 0006 | Pillar routing scheme | Keyword heuristic with fanout up to three pillars | no |
| 0007 | Lead rejection handling | System turn (max 2 sentences), no automatic retry | no |
| 0008 | Schema file location | Inlined in apollo.ts for hackathon, refactor post | no |
| 0009 | Intent parsing default | Keyword heuristic, Opus assist optional via injection | no |
| 0010 | Advisor event publisher | Decoupled from PipelineEvent bus, separate injection | no |

---

## ADR 0001. Model Strategy default and demo override

**Context.** NarasiGhaisan Section 3 locks model flexibility sebagai first-class feature dengan 4 user-selectable modes (opus_all, collaborative, multi_vendor, auto). Hackathon scope constraint per CLAUDE.md anti-pattern 7: shipped execution runs on Anthropic models only. Apollo must pick a default strategy for new sessions dan a demo-override strategy for the 3-minute demo video.

**Decision.** New session default is `collaborative`. Demo override (applied when Apollo detects `demo_mode=true` from an environment flag or URL query param) is `opus_all`. Options multi_vendor and auto remain UI-surfaceable but carry an honest-claim annotation (ADR-0002).

**Rationale.** Collaborative balances cost and quality untuk post-hackathon production use, ngasih developer atau non-technical user entry point yang wajar sebelum upgrade ke Opus all. Demo override forces opus_all supaya judges lihat the premium experience dan "Built with Opus 4.7" spirit at its strongest.

**Consequence.** apollo.config.json `model_strategy.default_for_new_session: "collaborative"`, `demo_override: "opus_all"`. Erato reads the label per locale dari modes map for the selector UI. No Ghaisan ferry, this is within Apollo creative latitude per apollo.md Section Creative Latitude.

---

## ADR 0002. Multi-vendor UI surface (strategic_decision_hard_stop)

**Context.** apollo.md explicitly flags this as a strategic_decision_hard_stop: "Whether to surface Multi-vendor strategy option in UI for hackathon demo (given only Anthropic executes in reality)." NarasiGhaisan Section 3 wants multi-vendor di Builder UI sebagai brand differentiator; NarasiGhaisan Section 16 and CLAUDE.md anti-pattern 7 both forbid non-Anthropic execution during hackathon.

**Recommendation.** Show the mode in the selector UI. Always render the honest-claim annotation next to the label:

> Demo execution Anthropic only, multi-vendor unlock post-hackathon.

Annotation text is in apollo.config.json `model_strategy.modes.multi_vendor.honest_claim_annotation` dan apollo.prompts.ts `MULTI_VENDOR_ANNOTATION_EN` / `MULTI_VENDOR_ANNOTATION_ID` so any surface that renders the mode can read the same string. Auto mode carries a parallel annotation.

**Alternatives considered.**

- Option A (accepted). Show mode with honest-claim annotation. Preserves the brand value prop (NERIUM as vendor-neutral infrastructure) while staying honest about hackathon execution scope.
- Option B. Hide mode entirely until post-hackathon. Cleaner honesty but drops the brand differentiator that NarasiGhaisan Section 3 flags as "pricing strategis."
- Option C. Show mode without annotation and trust users to infer the constraint. Rejected: violates CLAUDE.md anti-pattern honest-claim filter and NarasiGhaisan Section 16.

**Ferry to V3.** Yes. Apollo implements Option A as default so P3 Workers (Erato, Morpheus) are unblocked. V3 may lock, adjust annotation copy, or ferry back with Option B direction. If B is locked, the mode option and annotation strings can be hidden with a single config edit; no executor or Lead contract change required.

**Consequence.** apollo.config.json ships multi_vendor mode as visible. apollo.prompts.ts exposes annotation strings. AdvisorAgent.toggleModelStrategy accepts multi_vendor without throwing; only downstream executor path would reject if actually invoked for real execution (per Athena output `multi_vendor and auto strategies are UI-visible but not wired for hackathon execution`).

---

## ADR 0003. Gamified warning copy (strategic_decision_hard_stop)

**Context.** apollo.md flags tone calibration of gamified framings as strategic_decision_hard_stop: "Requires Ghaisan voice sign-off on representative sample." Cassandra emits EarlyWarning objects; Apollo must render them in gamified user-friendly framing per NarasiGhaisan Section 8 (visual plus business first). The example Ghaisan gave in NarasiGhaisan Section 13 context and in the Apollo spec: "Blueprint scan detected risk in Floor 7, revisi dulu?"

**Recommendation.** Ship three copy variants. Default to `building_floor`. All three are parametrized by floor number (derived from specialist step index) and confidence score string.

Variant A, `building_floor` (recommended default):
- id-ID: "Blueprint scan alert, Floor {floor} confidence {score}, revisi dulu?"
- en-US: "Blueprint scan alert, Floor {floor} confidence {score}, want a revise?"

Variant B, `save_point`:
- id-ID: "Save point risk, step {floor} drop ke {score}, rollback aman?"
- en-US: "Save point risk, step {floor} confidence {score}, roll back?"

Variant C, `neutral`:
- id-ID: "Heads up, step {floor} confidence {score}. Mau revisi?"
- en-US: "Heads up, step {floor} confidence {score}. Revise?"

All three live in apollo.prompts.ts `GAMIFIED_WARNING_COPY_VARIANTS`. Switching is a single config edit.

**Ferry to V3.** Yes. Apollo implements variant A as default. V3 samples variant copy representative (maybe render 2-3 fake warnings in demo harness) and ferries to Ghaisan for voice sign-off. If Ghaisan swaps variant, no code change beyond apollo.config.json `prediction_warning.gamified_copy_variant` switch.

**Consequence.** Default variant = building_floor renders in demo. If V3 locks a different variant, switch config and ship.

---

## ADR 0004. Session state persistence

**Context.** advisor_interaction.contract.md Section 6 says Session state lives in `app/advisor/state/session_store.ts`. Apollo output spec lists 4 artifacts and does not authorize shipping a separate session_store file. Post-hackathon refactor note 11.1 says "Session persistence is in-memory for hackathon; post-hackathon back it with SQLite for resume-on-reload."

**Decision.** Inline `InMemorySessionStore` class in apollo.ts. Export `SessionStore` interface and the concrete class so Erato can instantiate and inject per mount. No disk persistence; on page reload the session is lost. Acceptable hackathon debt.

**Rationale.** Sticking to the 4-artifact output list per Apollo spec. Interface-first design means swapping to SQLite post-hackathon is a single implementation-class change, callers unchanged.

**Consequence.** Session survives only for the lifetime of the client page. Demo flow should start and end within a single page session (true for 3-minute demo).

---

## ADR 0005. Brevity enforcement at data layer

**Context.** NarasiGhaisan Section 13 locks max 3 sentences and max 2 questions per Advisor turn. advisor_interaction.contract.md Section 4 mandates enforcement throws `AdvisorBrevityViolation`, caught by `receiveUserTurn` / `renderPredictionMap`, rewrites the turn to conform and logs a warning, never surfaces raw violation to user.

**Decision.** Apollo enforces brevity at the data layer in `enforceAdvisorBrevity` inside apollo.ts. Algorithm:
1. Count sentences via `/[^.!?]+[.!?]+/g` matches.
2. If > max_sentences, take the first N matches and rejoin.
3. Count question marks via `/\?/g` matches.
4. If > max_questions, truncate at the character after the max-th question mark.
5. Return `BrevityResult` with violated flag and reason.

The prompt layer (apollo.prompts.ts system prompt and per-variant builders) independently instructs Opus to stay within the bounds, so enforcement is defense in depth.

**Rationale.** Section 13 framing is strict. Opus may occasionally drift long despite the prompt. Auto-rewrite guarantees the constraint holds at publish time regardless of generator behavior. Log warning preserves debuggability without surfacing the degraded content to the user.

**Consequence.** AdvisorAgent.receiveUserTurn, renderPredictionMap, presentBlueprintMoment, and the internal emitSystemRejectTurn all run output through enforcement. AdvisorBrevityViolation is exported so tests can catch it; auto_rewrite_on_violation toggle in config allows future strict-mode where the violation escapes instead of rewrites.

---

## ADR 0006. Pillar routing scheme

**Context.** Apollo receives natural-language user intent and must pick one or more Leads to dispatch to. apollo.md Soft Guidance says "Routing rules default: Builder pillar primary (hero), fallback Marketplace / Banking / Registry / Protocol based on user intent keyword match." NarasiGhaisan Section 4 cost awareness: avoid an extra Opus call per turn just for intent classification.

**Decision.** Keyword heuristic routing via `makeKeywordIntentParser` and `matchPillar` in apollo.ts. Keywords per pillar live in apollo.config.json `routing_keywords`. Routing returns `{primary: PillarId, secondaries: PillarId[]}`. Fanout enabled by default, capped at three pillars per turn per config `routing_rules.fanout_max_pillars`.

**Rationale.** Keyword heuristic is near-free di token cost dan deterministic. Opus assist is opt-in through injected `UserIntentParser` for callers who want NLP depth. Three-pillar fanout cap prevents unbounded dispatch fan-out when a user issues a "bikin aplikasi dengan marketplace dan payment" kind of turn.

**Consequence.** Builder is the default pillar when no keywords match per `routing_rules.default_pillar`. Adding vocab is a config edit, no code change.

---

## ADR 0007. Lead rejection handling

**Context.** pillar_lead_handoff.contract.md Section 8: Lead returns `status: 'rejected'` with a reason. advisor_interaction.contract.md Section 8: "Lead rejection: Advisor appends a system turn with brief summary (max 2 sentences) and continues the session; never fails hard."

**Decision.** On rejection Apollo emits a `system` role AdvisorTurn via `emitSystemRejectTurn` with a forced max-2-sentence brevity cap (tighter than the 3-sentence default for user-facing turns). No automatic retry. No deferred-retry scheduling.

**Rationale.** Deterministic rejections (invalid_params, unknown_lead) do not become valid on retry; automatic retry burns tokens. If a user wants to retry, they ask Apollo again and Apollo re-dispatches fresh. Deferred response (status: `deferred`) is treated as a non-error and Apollo may re-dispatch on the deferred event fire (future work).

**Consequence.** `dispatchInternal` catches rejection and appends system turn. `dispatchToLead` public method wraps any thrown error in `emitSystemRejectTurn` rather than letting it bubble, preserving the "never fails hard" contract guarantee.

---

## ADR 0008. Schema file location

**Context.** advisor_interaction.contract.md Section 6 File Path Convention says schema lives at `app/advisor/schema/advisor_interaction.ts`. Apollo output spec lists exactly four artifacts (apollo.ts, apollo.prompts.ts, apollo.config.json, apollo.decisions.md). Creating the schema file would exceed scope.

**Decision.** Ship schema types inline in apollo.ts and export them. Downstream consumers (Erato, Helios, Urania, Lead implementations) import from apollo.ts for the hackathon. Post-hackathon a small refactor PR moves the types to the canonical location and apollo.ts re-exports them for backwards compatibility.

**Rationale.** Respect the Apollo output-scope lock. The refactor is mechanical and changes no call sites.

**Consequence.** Imports in downstream files read from `@/advisor/apollo` rather than `@/advisor/schema/advisor_interaction` during the hackathon. The refactor note is captured in the apollo.ts header so the next agent reading the file sees the plan.

---

## ADR 0009. Intent parsing default strategy

**Context.** UserIntent type in advisor_interaction.contract.md Section 3 supports rich extraction (app_type, target_locale, constraints). Richer extraction is useful but a per-turn Opus call for classification doubles token burn for a small routing gain.

**Decision.** Default to `makeKeywordIntentParser` (pure-function keyword heuristic). Accept an injected `UserIntentParser` at AdvisorAgent construction so callers can wire in an Opus-backed parser (using `APOLLO_INTENT_PARSE_SYSTEM` from apollo.prompts.ts plus the Anthropic SDK) when they want NLP depth.

**Rationale.** Cost discipline per NarasiGhaisan Section 4. Extensibility preserved via dependency injection.

**Consequence.** Hackathon demo runs the keyword parser. Post-hackathon a GenericOpusIntentParser can ship without touching the AdvisorAgent class.

---

## ADR 0010. AdvisorEventPublisher decoupled from PipelineEvent bus

**Context.** event_bus.contract.md is explicitly scoped to Builder pipeline events (`pipeline.*` topics). advisor_interaction.contract.md Section 5 lists advisor-namespace topics (`advisor.session.started` etc). The concrete `EventBus.publish<T>(event: PipelineEvent<T>)` has a `PipelineEventTopic` literal type on the envelope; advisor topics do not fit this union.

**Decision.** Define `AdvisorEventPublisher` interface in apollo.ts with its own envelope type `AdvisorEvent<T>`. Accept the publisher at AdvisorAgent construction. Integration layer (Erato mount, Lumio runner) provides a concrete publisher that may route to the same underlying bus via an unsafe cast or to a separate bus.

**Rationale.** Preserves type safety on the advisor side. Mirrors the post-hackathon refactor note in event_bus.contract.md Section 11 which plans namespace extensions. Separating the two publishers means when the bus is unified post-hackathon, only the integration layer changes.

**Consequence.** apollo.ts has two publisher dependencies at construction (`eventPublisher` for advisor.*, `handoffPublisher` for pipeline.handoff). Helios subscribes via the pipeline bus for handoff visibility; Erato subscribes via the advisor publisher for chat surface updates.

---

## Open loops

- ADR-0002 awaiting V3 lock on multi-vendor surface posture.
- ADR-0003 awaiting V3 ferry of copy variant sample ke Ghaisan for voice sign-off.
- Long-form user intent (10-page spec with contradictory requirements): halt trigger per apollo.md; not encountered in this session but post-hackathon needs an intent-segmentation flow per advisor_interaction.contract.md Section 11.
- Voice input (speech-to-text turn entry) deferred per advisor_interaction.contract.md Section 11; no Apollo-side change required when it lands on the UI side.

---

## Cross-references

- `_meta/NarasiGhaisan.md` Sections 2, 3, 4, 13, 15, 16 and the meta-narrative thread.
- `CLAUDE.md` locked decisions and anti-patterns 1, 2, 7.
- `docs/phase_0/NERIUM_AGENT_STRUCTURE.md` Section 5.1 Apollo spec.
- `docs/contracts/advisor_interaction.contract.md` v0.1.0.
- `docs/contracts/pillar_lead_handoff.contract.md` v0.1.0.
- `docs/contracts/prediction_layer_surface.contract.md` v0.1.0.
- `docs/contracts/advisor_ui.contract.md` v0.1.0 (Erato consumes apollo.ts via AdvisorChatProps).
- `docs/contracts/blueprint_moment.contract.md` v0.1.0 (Urania consumes via presentBlueprintMoment).
- `docs/contracts/event_bus.contract.md` v0.1.0 (handoff publisher maps to this bus).

End of Apollo decisions log.
