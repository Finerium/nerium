---
title: Cassandra Decisions (ADR Log)
agent: cassandra
pillar: builder
tier: worker
phase: P2
model_authoring: claude-opus-4-7
model_runtime: claude-sonnet-4-6
version: 0.1.0
status: draft
last_updated: 2026-04-22
---

# Cassandra Decisions

Architecture decision log for the NERIUM Prediction Layer, authored in the P2 worker session. Scope is strictly limited to decisions that affect cross-agent interfaces, honest-claim filter language, or post-hackathon refactor direction. Implementation details that do not propagate beyond `app/builder/prediction/` live in code comments, not here.

Each ADR follows a compact format: context, decision, rationale, consequences, status.

---

## ADR-001: Deterministic feature-based heuristic sampler for hackathon, swappable for Sonnet-backed sampler in production

**Context.** The Cassandra prompt (`.claude/agents/cassandra.md`) lists `Strategic_decision_hard_stop` item: "Whether to implement true stochastic sampling (more novel) or deterministic confidence estimation (cheaper). Recommendation: deterministic for hackathon, stochastic post-hackathon upgrade." The contract `prediction_layer_surface.contract.md` Section 10 notes this choice does not affect schema. NarasiGhaisan Section 4 token-cost awareness explicitly justifies the Sonnet exception on budget grounds. The honest-claim filter requires that no surface claim "true Monte Carlo stochastic sampling" if the implementation is deterministic.

**Decision.** Ship a deterministic feature-based heuristic sampler as the default, implemented in `HeuristicSampler` (see `cassandra.ts`). The engine accepts an injected `SimulationSampler` so a Sonnet-backed sampler can swap in without engine refactor. All NERIUM surfacing language uses "Monte Carlo-inspired" rather than "true Monte Carlo". The prompt template `prompt_template.ts` is shipped regardless so the Sonnet swap is a drop-in replacement, not a rewrite.

**Rationale.**

1. Budget preservation. A true Sonnet-per-pass stochastic sampler at 100 passes times 500 input plus 100 output tokens amortized over ~11 specialists per Lumio topology consumes roughly 0.15 to 0.20 USD per scan. Demo iteration across Day 3 to Day 5 plus live submission run would cumulatively burn 10 to 20 USD. The deterministic path is zero-cost at runtime and frees that budget for higher-value usage (Heracles MA lane, integration tests).
2. Demo determinism. The Day 5 recorded demo benefits from reproducibility. A deterministic sampler with seeded per-pass noise yields identical confidence maps across reruns, supporting predictable screen-record timing for the 3-minute video window.
3. Honesty. Labeling the approach "Monte Carlo-inspired" across README, demo narration, and UI banner language matches the implementation. Judges reading the code can verify. No overclaim risk per NarasiGhaisan Section 20 origin-credential pattern.
4. Production path preserved. The `SimulationSampler` interface is the seam. Post-hackathon, a `SonnetSampler` wraps the Anthropic Messages API and the prompt template runs verbatim. No engine change required.

**Consequences.**

- `HeuristicSampler` is a formula, not a model call. Future calibration against real pipeline outcome data (Registry trust scores, past run telemetry) is a post-hackathon refactor noted in `prediction_layer_surface.contract.md` Section 11.
- Variance across passes comes from seeded noise, not stochastic inference. The variance magnitude (amplitude 0.04) was tuned to yield realistic stddev (approximately 0.02 to 0.03) without swamping the feature signal. If future product tuning needs wider variance, increase the amplitude constant in `cassandra.ts`.
- The approach is flagged for V3 review at session end. Recommendation: keep deterministic for hackathon, revisit post-submission.

**Status.** Accepted for hackathon scope. Flagged for V3 confirmation per strategic_decision_hard_stop protocol.

---

## ADR-002: Simulation pass count default locked at 100 per Metis Monte Carlo convention

**Context.** The Cassandra prompt calls out simulation pass count as a strategic_decision_hard_stop with surfaced options 50, 100, 200, 500. The `prediction_layer_surface.contract.md` Section 4 already specifies `passes` parameter defaults to 100 per Metis Monte Carlo convention lock, callable up to 500 per high-stakes scan. The `NERIUM_AGENT_STRUCTURE.md` Section 5.7 rationale block also references 100 to 500 pass range with cost math anchored on 100.

**Decision.** Default pass count is 100, matching the contract. Minimum enforced at 10 (guards against degenerate call sites), maximum enforced at 500 (guards against budget accidents). Callers who need higher or lower values adjust the `passes` argument. The engine clamps out-of-range values rather than throwing so orchestrators can pass raw user input without pre-validating.

**Rationale.** The contract already locked this value. Re-litigating would conflict with the Pythia strict-blocker discipline in NarasiGhaisan Section 9. The 100-pass number yields stable aggregation statistics with the 5-perspective rotation (20 passes per perspective) and fits inside the 0.20 USD per-scan ceiling when migrated to the real Sonnet sampler post-hackathon.

**Consequences.**

- No halt needed on this item.
- Adjustments surface through the `passes` parameter, not through reconfiguration of the engine.
- Post-hackathon tuning can explore 200 and 500 at high-stakes scans only, keeping the default bounded.

**Status.** Accepted. Inherited from contract, no debate.

---

## ADR-003: Local widening of `PipelineEventTopic` union to carry simulation.* topics until event_bus contract bumps version

**Context.** The `event_bus.contract.md` v0.1.0 Section 3 defines `PipelineEventTopic` as a narrow union of 11 Builder pipeline topics. It does not include the 6 simulation.* topics defined in `simulation_event.contract.md` v0.1.0 Section 3. The event_bus contract Section 5 explicitly states "Additional topics require a contract version bump." The simulation_event contract Section 4 states "Simulation events are published through the canonical event bus per `event_bus.contract.md`, wrapped in a `PipelineEvent` envelope with topic derived from `SimulationEvent.kind`. The `simulation.*` namespace is reserved for Cassandra exclusively." The two contracts, both authored by Pythia, have an unresolved version-bump obligation.

**Decision.** In `simulation_event.ts`, define a local `CassandraTopic = PipelineEventTopic | SimulationEventKind` union. The `CassandraBusPublisher.emit` method accepts `CassandraTopic` at the call site and forwards to `EventBus.publish` with a single type assertion at the boundary (`topic as PipelineEventTopic`). Runtime behavior is identical because topics are strings. TypeScript narrowness is preserved inside Cassandra code, and the bus still accepts the payload since envelope construction is otherwise conformant.

**Rationale.**

1. Low blast radius. No modification to `app/shared/events/pipeline_event.ts` (Athena owns it). No modification to `event_bus.contract.md` (version bump is Athena's decision). Parallel Builder Worker sessions (Erato, Helios) are not affected.
2. Contract conformance preserved at the semantic level. Events flow through the canonical bus, subscribers keyed on `simulation.*` topics receive them, and Ananke's wildcard audit tap sees everything.
3. The version-bump obligation is flagged here so V3 can schedule an Athena follow-up to widen `PipelineEventTopic` properly, ideally alongside Marketplace, Banking, Registry, and Protocol extensions already noted in `event_bus.contract.md` Section 11.

**Consequences.**

- TypeScript strictness at the EventBus boundary is relaxed by one cast in one file. No user-facing effect.
- Subscribers in other pillars who import `PipelineEventTopic` see the narrow union. They cannot enumerate simulation.* topics from their own imports; they would import from `simulation_event.ts` if needed. Acceptable because cross-pillar simulation consumers are Helios (Builder) and Apollo (cross-pillar orchestrator) and Ananke (wildcard) only, all of whom already reach into `app/builder/prediction/`.
- Once event_bus contract bumps to v0.2.0, the cast is removed and `CassandraTopic` type alias is deprecated in favor of the widened canonical union.

**Status.** Accepted as an interim measure. Surface to V3 in end-of-session ferry as an Athena follow-up candidate, priority "do not block Builder P2 Workers, schedule in P3 or P4".

---

## ADR-004: Emission of `pipeline.prediction.emitted` follows prediction_layer_surface.contract.md authoritative payload shape, diverges from handoff_events.ts

**Context.** Two payload shapes exist for the same topic `pipeline.prediction.emitted`:

1. `prediction_layer_surface.contract.md` Section 5 defines payload as `{ confidence_map: ConfidenceMap }`.
2. `app/builder/executor/handoff_events.ts` (Athena output) defines `PredictionEmittedPayload` as `{ pipeline_run_id, forecast_horizon_step, p50_cost_usd, p90_cost_usd, p50_wallclock_ms, p90_wallclock_ms, confidence }`.

These two shapes model different concerns. The contract models a per-specialist confidence map for UI surfacing. The Athena handoff type models a cost/wallclock percentile forecast for budget planning. The contract explicitly designates Cassandra as Owner of the topic; the handoff_events.ts file internal comment says "Shape kept small here; full prediction shape lives in simulation_event.contract.md" which is technically a mis-citation (full shape lives in prediction_layer_surface.contract.md, not simulation_event.contract.md).

**Decision.** Cassandra emits `pipeline.prediction.emitted` with the contract-authoritative `{ confidence_map: ConfidenceMap }` payload. The handoff_events.ts `PredictionEmittedPayload` interface is not imported or satisfied by this worker session. The divergence is flagged here for V3 resolution.

**Rationale.**

1. Ownership precedence. `prediction_layer_surface.contract.md` Section 1 explicitly names Cassandra as Owner, and the contract is the single-source-of-truth per NarasiGhaisan Section 9 modular contract discipline.
2. Semantic fidelity. The confidence_map payload carries the full information set that Apollo, Erato, and Helios need for the Prediction Layer user-visible surface. A cost/wallclock percentile forecast is a distinct concern that belongs on a separate topic if it ships at all, not an alternate payload under the same topic.
3. Avoiding silent conformance. Implementing the Athena shape would ship a payload that cannot carry the confidence_map, breaking the core Prediction Layer feature.

**Consequences.**

- If Athena or Apollo wire `handoff_events.ts` `PredictionEmittedPayload` into a consumer, that consumer will not receive the actual payload Cassandra emits. Surface to V3 as a contract-reconciliation task so Athena can update `handoff_events.ts` to mirror `{ confidence_map: ConfidenceMap }` or so the cost/wallclock forecast moves to a new topic (e.g., `pipeline.prediction.cost_forecast`).
- Cassandra does not emit a cost/wallclock percentile forecast in this phase. That is a future enrichment cross-referenced with Tyche cost meter work.

**Status.** Accepted for the worker session. Flagged to V3 at handoff.

---

## ADR-005: Aggregation formula chosen as weighted mean with band penalty for single-weak-link sensitivity

**Context.** Soft guidance in the Cassandra prompt names three candidate aggregation formulas: mean, median, weighted. The `confidence_formula.ts` docstring is expected to document the pick. Pipeline confidence aggregation has a well-known failure mode: arithmetic mean over 10 specialists where 1 specialist has 0.3 confidence and 9 have 0.9 confidence yields 0.84 overall, which reads "high band" on the UI and obscures the broken link.

**Decision.** Per-specialist score is arithmetic mean of pass samples (straightforward, matches contract's variance field). Overall pipeline confidence is arithmetic mean of per-specialist scores minus a band penalty: 0.0 if no critical or low bands, 0.05 if any low band, 0.10 if any critical band. Result clamped to [0, 1].

**Rationale.**

1. Arithmetic mean at the pass level keeps variance computation honest and matches the public `variance` field on `SpecialistConfidence`.
2. Arithmetic mean at the pipeline level keeps the aggregate interpretable to non-technical users viewing the UI banner ("77% ready"). Users understand average; they do not understand harmonic mean.
3. The band penalty captures the "one broken link matters" semantics without overreaction. A 0.10 penalty bumps a mean of 0.84 down to 0.74, which is still "medium" but visibly less comfortable than "high". Harmonic mean would overshoot into "low" territory, prompting unnecessary user halts.
4. The penalty is thresholded on confidence bands already exposed publicly. No new concept introduced.

**Consequences.**

- Edge cases. If all specialists score in low or critical bands, the penalty still applies but the arithmetic mean is already below threshold, so the final value remains low or critical. No double-counting in practice because penalty is small relative to mean differences at that range.
- Future product tuning can expose the band penalty constants as configuration. Not in scope for hackathon.

**Status.** Accepted.

---

## ADR-006: Output file set extended beyond the 4 artifacts listed in the Task Specification to include schema.ts and simulation_event.ts

**Context.** The Cassandra prompt Task Specification lists 4 output files: `cassandra.ts`, `prompt_template.ts`, `confidence_formula.ts`, `docs/cassandra.decisions.md`. Both `prediction_layer_surface.contract.md` Section 6 and `simulation_event.contract.md` Section 6 specify file paths `app/builder/prediction/schema.ts` and `app/builder/prediction/simulation_event.ts` as canonical locations for their type definitions, with Cassandra as Owner.

**Decision.** Ship 6 files total: the 4 from the Task Specification plus `schema.ts` (data types from `prediction_layer_surface.contract.md` Section 3) and `simulation_event.ts` (event types from `simulation_event.contract.md` Section 3 plus the `CassandraBusPublisher` helper). These are prerequisite implementation files that both consumers (Apollo, Erato, Helios) import from and that the main engine depends on.

**Rationale.** Contracts explicitly designate these paths and name Cassandra as Owner. Not shipping them would leave the contracts pointing at non-existent files, breaking downstream Worker sessions (Erato, Helios) that need to import the types. The Task Specification listing 4 artifacts is a floor, not a ceiling; the contracts are authoritative on path inventory.

**Consequences.** Additional files increase the output surface this session produces. Token budget impact negligible (schema and event types are compact). Self-check item 3 (output files produced per spec) interprets "per spec" to mean "per both the Task Specification and the contracts", not just the Task Specification.

**Status.** Accepted. Documented to prevent a future auditor flagging the 6-file output as scope creep.

---

## ADR-007: `SimulationSampler` dependency injection pattern preserves hackathon budget and production upgrade path

**Context.** The engine needs to run N passes per specialist per scan. The hackathon build ships without live Sonnet calls per ADR-001. The production build needs live Sonnet calls with the prompt template in `prompt_template.ts`. The interface between "engine" and "inference source" must be stable so the swap is a one-line change at construction.

**Decision.** Introduce `SimulationSampler` interface with a single `sample(input: SimulationPassPromptInput): Promise<SimulationPassResponse>` method. Ship `HeuristicSampler` as the default. Future Sonnet sampler lives in a separate file (e.g., `SonnetSampler.ts` when wired) and is passed via `deps.sampler` at engine construction.

**Rationale.** Standard dependency injection. Makes testing trivial (mock sampler yields known confidence values). Makes the post-hackathon upgrade a new-file addition rather than engine refactor. Decouples engine orchestration from inference implementation, which aligns with NarasiGhaisan Section 3 model flexibility thesis at the code level.

**Consequences.** The heuristic formula now lives inside `HeuristicSampler`, not in a separate utility module. This concentrates the "what features predict confidence" logic in one readable place. Post-hackathon Registry trust score integration (noted in contract Section 11) becomes a new feature parameter on `HeuristicSampler`, not an engine change.

**Status.** Accepted.

---

## ADR-008: Gamified warning message template uses hybrid Indonesian register with game-HUD phrasing

**Context.** NarasiGhaisan Section 13 establishes the brevity-in-UX discipline and notes the Builder gamification thread through the 3-world visual treatment. The contract sample warning in Section 3 of `prediction_layer_surface.contract.md` is `"Blueprint scan alert, Floor 7 berisiko, revisi?"`, which mixes English and Indonesian. That register is intentional and maps to Ghaisan's own voice in NarasiGhaisan.

**Decision.** Gamified warning messages follow the template `Floor {N} {role}: confidence {pct}% ({band}), {severity-action}.` The `severity-action` is hard-coded per severity: "halt dan revisi sebelum lanjut" for halt_recommended, "review direkomendasi" for review_recommended, "advisory" for advisory. Floor number is `step_index + 1` so human-readable floor starts at 1, matching the game metaphor. The `gamified_message` field is the user-facing string; the parallel `underlying_reason` field carries the technical detail in English for logs and audit.

**Rationale.** Matches the sample in the contract. Preserves the Indonesian flavor without committing to pure Indonesian. Keeps messages under one line each so the UI banner can render without overflow. Separates user-voice (gamified_message) from technical-voice (underlying_reason), respecting NarasiGhaisan Section 13 "non-technical user attention budget".

**Consequences.** Localization can extend the template later with minor refactor. Erato's banner UI can render just the `gamified_message` without formatting work. Helios's overlay can use the `band` field directly for color coding.

**Status.** Accepted.

---

## ADR-009: Warning threshold default 0.6, severity ladder keyed on band thresholds

**Context.** The Cassandra prompt specifies confidence threshold for early warning at 0.6 (configurable). The contract `prediction_layer_surface.contract.md` Section 3 defines bands: >=0.8 high, 0.6 to 0.79 medium, 0.4 to 0.59 low, <0.4 critical. The severity enum is `advisory | review_recommended | halt_recommended`.

**Decision.** Default warning threshold is 0.6, exposed via `CassandraEngineDeps.warning_threshold`. Severity ladder:

- confidence >= 0.6: no warning, severity 'advisory' only if emitted manually.
- 0.4 <= confidence < 0.6: crossed, severity 'review_recommended'.
- confidence < 0.4: crossed, severity 'halt_recommended'.

Implemented in `evaluateThreshold` in `confidence_formula.ts`. The advisory-without-crossing path is reserved for simulation-degraded cases where the confidence number itself may be a placeholder.

**Rationale.** Aligns thresholds with the publicly-exposed band boundaries, so a user who reads the band on the UI can predict when a warning should appear. No new hidden threshold to explain in docs. Three severities map cleanly to three UI treatments (info tint, yellow tint, red tint).

**Consequences.** `review_recommended` fires whenever the score is "low" band; `halt_recommended` fires whenever the score is "critical" band. Users who tune the threshold above 0.6 accept more frequent advisory warnings. Users who tune below 0.6 accept a quieter but riskier pipeline.

**Status.** Accepted.

---

## Outstanding items surfaced for V3

The following are explicitly flagged for V3 end-of-session ferry:

1. Strategic_decision_hard_stop on stochastic vs deterministic sampling. Recommendation: deterministic per ADR-001. Request V3 confirmation before Day 5 polish pass so the demo narration language stays consistent with the implementation.
2. Contract conflict between `event_bus.contract.md` v0.1.0 and `simulation_event.contract.md` v0.1.0 on the topic union membership. Interim workaround in ADR-003. Request Athena follow-up to bump event_bus contract and widen canonical topic union, scheduling in P3 or P4, not blocking current P2 Workers.
3. Contract conflict between `prediction_layer_surface.contract.md` Section 5 and `app/builder/executor/handoff_events.ts` `PredictionEmittedPayload` shape. Interim workaround in ADR-004. Request Athena or Pythia follow-up to reconcile, ideally by splitting into two topics (`pipeline.prediction.confidence_map` for the map, new `pipeline.prediction.cost_forecast` for the forecast).

No other strategic_decision_hard_stop items remain open.

---

## Appendix A: Formula quick reference

Per-specialist confidence:

$$
\text{score}_i = \frac{1}{N}\sum_{j=1}^{N} s_{i,j}, \quad \text{variance}_i = \sqrt{\frac{1}{N}\sum_{j=1}^{N} (s_{i,j} - \text{score}_i)^2}
$$

Overall pipeline confidence:

$$
\text{overall} = \text{clip}\left(\frac{1}{M}\sum_{i=1}^{M} \text{score}_i - \text{penalty}, 0, 1\right)
$$

with penalty = 0.10 if any band is critical, 0.05 if any band is low, 0 otherwise.

Heuristic per-pass sampler:

$$
s_{i,j} = \text{clip}(w_r R_i + w_b B_i + w_d D_i + w_I I_i + \eta_{i,j}, 0, 1)
$$

where R, B, D, I are role-model-lane, budget-fit, downstream-coupling, input-artifact components; weights w depend on perspective; noise eta is seeded deterministic in [-0.04, 0.04].

---

## Appendix B: Runtime cost note

Heuristic sampler: zero per-pass API cost.

Future Sonnet sampler, estimated at list Sonnet 4.6 pricing (3 USD per million input tokens, 15 USD per million output tokens):

- Per-pass: approx 300 input tokens (system prompt amortized via prompt caching, user turn approx 200 tokens) plus approx 60 output tokens.
- Per-pass cost: approx 0.0009 USD input plus 0.0009 USD output equals approx 0.0018 USD.
- Per-scan (100 passes): approx 0.18 USD.
- Per-Lumio run (1 pre-execution scan plus approximately 10 re-simulation scans): approx 1.98 USD.

All within the 20 USD allocated in the Prediction Layer Tyche meter budget.
