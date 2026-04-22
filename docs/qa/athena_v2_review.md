---
name: athena_v2_review
description: Athena-v2 audit report for Athena v1 P1 Builder Lead outputs
type: qa_report
owner: athena-v2
version: 0.1.0
date: 2026-04-22
last_updated: 2026-04-22
---

# Athena-v2 Debug Review

## Scope

Audit Athena v1 outputs against:

- `.claude/agents/athena.md` prompt spec (hard constraints, task specification, output files expected)
- `docs/contracts/builder_specialist_executor.contract.md` v0.1.0
- `docs/contracts/event_bus.contract.md` v0.1.0
- NarasiGhaisan voice anchor (no em dash, no emoji, honest-claim filter)

## Files Audited

| File | Lines (v1) | Lines (post-fix) |
| --- | --- | --- |
| `app/builder/executor/BuilderSpecialistExecutor.ts` | 353 | 412 |
| `app/builder/executor/handoff_events.ts` | 167 | 167 |
| `app/builder/executor/pipeline_topology.lumio.json` | 254 | 254 |
| `app/builder/leads/athena.output.md` | 96 | 96 |
| `docs/athena.decisions.md` | 122 | 122 |
| `app/shared/events/pipeline_event.ts` | absent | 86 (new) |

## Critical Findings (2)

### C1. Missing canonical event types file `app/shared/events/pipeline_event.ts`

**Issue.** BuilderSpecialistExecutor.ts line 18 to 22 and handoff_events.ts line 17 to 24 both import from `'../../shared/events/pipeline_event'`. That file did not exist at v1 time. TypeScript compilation would fail for any P2 consumer that tried to resolve the import.

**Ownership.** `event_bus.contract.md` v0.1.0 frontmatter lists "Owner Agent(s): Athena (emits pipeline events via BuilderSpecialistExecutor), Heracles (republishes MA SSE events into the bus)". Section 4 says "Default in-memory implementation ships Day 1". Athena is the Day 1 co-owner and the file should have shipped in v1.

**Fix.** Created `app/shared/events/pipeline_event.ts` with the canonical shapes from contract Section 3: `PipelineEventTopic` enum, `PipelineEvent<TPayload>` envelope, `StepStartedPayload`, `ToolUsePayload`, `StepCompletedPayload`, `HandoffPayload`, plus the `EventBus` interface from Section 4 and `EventHandler` and `Unsubscribe` convenience types. File is 86 lines. No `InMemoryEventBus` implementation was created, since the abstract `EventBus` interface plus Athena prompt's output list do not require it; Heracles P2 or a dedicated bus worker owns the in-memory implementation.

**Post-fix state.** Imports in both Athena v1 files now resolve. No edits to the v1 import statements were required because the new file sits exactly at the imported path.

### C2. Incomplete event emission per contract Section 5 in all 4 executor implementations

**Issue.** `builder_specialist_executor.contract.md` v0.1.0 Section 5 specifies "Executors publish at minimum: `pipeline.step.started` at execution entry, `pipeline.step.tool_use` per tool call (if any), `pipeline.step.completed` at success, or `pipeline.step.failed` at error". v1 only partially honored this:

- `AnthropicDirectExecutor.execute` emitted `pipeline.step.started` then returned `status: 'error'` without emitting `pipeline.step.failed`. Dangling open step in the bus.
- `AnthropicManagedExecutor.execute` emitted nothing and returned `status: 'error'`. Missing both `pipeline.step.started` and `pipeline.step.failed`.
- `GeminiStubExecutor.execute` emitted nothing and returned `status: 'success'` with a canned artifact. Missing both `pipeline.step.started` and `pipeline.step.completed`.
- `HiggsfieldStubExecutor.execute` same shape as Gemini stub.

Consequence: Helios visualizer and Ananke audit tap receive an inconsistent event stream where some steps never close. Cassandra's re-simulation trigger on `pipeline.step.completed` never fires for stub lanes. Tyche's cost meter never increments for stub outputs.

**Fix.** Added the missing emissions in all four executors. Each error-returning executor now emits `pipeline.step.started` on entry plus `pipeline.step.failed` before returning, with a `StepFailedPayload` shape carrying `specialist_id`, `error_message`, and `retry_count`. Each success-returning stub now emits `pipeline.step.started` on entry plus `pipeline.step.completed` before returning, with a `StepCompletedPayload` shape carrying `specialist_id`, `tokens_consumed`, `cost_usd`, `wallclock_ms`, `artifact_count`. All emissions use the protected `emit` helper on the base class.

**Diff stat.** 75 insertions 17 deletions, BuilderSpecialistExecutor.ts grew from 353 to 412 lines.

## Minor Observations (4, no fix)

### M1. Single-file bundling vs contract Section 6 canonical paths

`builder_specialist_executor.contract.md` Section 6 prescribes separate files: `AnthropicDirectExecutor.ts`, `AnthropicManagedExecutor.ts`, `{vendor}_executor.stub.ts`. v1 bundled all five concrete classes into `BuilderSpecialistExecutor.ts`. The `athena.md` prompt Task Specification item 2 explicitly listed all classes as "Exports" of that one file, so v1 followed prompt spec. The contract paths remain the canonical split targets for P2 when real implementations land; Heracles should follow them for `AnthropicManagedExecutor.ts` in particular, and the direct executor can split at the same time without call-site breakage.

### M2. Constructor requires `ExecutorDeps`

Contract Section 3 shows a minimal abstract class with no constructor. v1 added a constructor that takes `{ event_bus: EventBus }` and stores it as a protected readonly field. Additive, enforces dependency injection at construction, and is the natural mechanism for emit helpers. No contract violation; simply more opinionated than the minimal shape in Section 3.

### M3. Prose drift in `athena.output.md` line 25

The fallback behavior described reads "Apollo emits `pipeline.step.failed` with `reason: 'no_lane_available'`". `StepFailedPayload` in `handoff_events.ts` uses `error_message`, not `reason`. `reason` is the field name in `RunFailedPayload` for `pipeline.run.failed`. The prose is not machine-readable contract, so this is a naming-slip annotation only. Future edits should standardize on `error_message` when describing `pipeline.step.failed` emissions.

### M4. `BUILDER_PIPELINE_TOPICS` ordering is display-ordered, not lexical

`handoff_events.ts` line 155 exposes a topic array in UI-visual order rather than lexical. The code comment flags this explicitly. No action needed; the inline comment is adequate.

## Clean Confirmations

- All 5 Athena output files exist at paths specified in `athena.md` Output Files Produced list.
- No em dash, no emoji anywhere in v1 or v2 artifacts (grep-verified).
- `VendorLane` enum, `SpecialistRole` enum, `SpecialistInput`, `SpecialistOutput` shapes match contract Section 3 including readonly hardening.
- `PipelineEventTopic` enum in v1 `handoff_events.ts` matches the 11-topic list in `event_bus.contract.md` Section 3.
- Lumio topology invariants hold: 11 specialists inside the 10-to-12 prompt bound, dense monotonic step_index 0 to 10, all handoff_to_step_indices reference valid steps, budget token sum 665K fits inside 1.2M cap, all preferred_lane values are either `anthropic_direct` or `anthropic_managed`, all roles are valid `SpecialistRole` members, DAG is acyclic (topological sort succeeds), all JSON keys are snake_case.
- Cross-references in `athena.output.md` Section 4 (Tyche, Cassandra, Helios, Heracles, Dionysus, Urania) all resolve to M2-defined agents.
- 6 ADRs in `athena.decisions.md` follow date plus decision plus alternatives plus tradeoff plus rationale structure; open items section surfaces deploy platform, multi-vendor UI chip policy, and event bus replacement.
- Honest-claim filter section 6 in `athena.output.md` explicitly refuses shipped-production language for Builder.
- Vendor-neutral signatures on the abstract base class (no Anthropic SDK types leak into public interface), per ADR-001.
- `AutoExecutor` relabels `vendor_lane_used` to `auto` on output without duplicating inner emissions, consistent with ADR-005.

## Verdict

**FIXED**

Two critical findings surfaced and resolved in place. Four minor observations documented, no code changes required. No halt to V3 is needed. Athena v1 plus the v2 fix set now conforms to `builder_specialist_executor.contract.md` v0.1.0 and `event_bus.contract.md` v0.1.0. P2 consumers (Apollo routing, Heracles MA body, Helios visualizer, Cassandra simulation trigger, Tyche cost meter, Ananke audit tap) can import the canonical types from `app/shared/events/pipeline_event.ts` and subscribe to a well-formed event stream.

## Attribution Note

v1 Athena artifacts co-committed inside Proteus commit `01c8e8f` due to shared worktree race during P1 parallel execution. V3 accepted non-destructive surface in TokenManager row 6. v2 fix commits run on a clean separate commit that credits Athena-v2 directly.
