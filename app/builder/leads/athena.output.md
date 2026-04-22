---
name: athena.output
description: Builder pillar orchestration spec for Apollo consumption, P1 delivery
type: lead_output
owner: athena
version: 0.1.0
status: draft
contract_ref:
  - docs/contracts/builder_specialist_executor.contract.md v0.1.0
  - docs/contracts/event_bus.contract.md v0.1.0
last_updated: 2026-04-22
---

# Builder Pillar Orchestration Spec

## 1. Executor abstraction summary

Builder dispatches every specialist through the `BuilderSpecialistExecutor` abstract class in `app/builder/executor/BuilderSpecialistExecutor.ts`. The class exposes `execute`, `supportsRole`, and `estimateCost`, plus a `lane` discriminator. Four concrete classes ship for the hackathon:

- `AnthropicDirectExecutor`: default path for every specialist role. Calls Anthropic Messages API directly. Skeleton only in P1, real call lands in P2.
- `AnthropicManagedExecutor`: routes one specialist (`integration_engineer`) through a Managed Agents session per M1 Section D3. Heracles owns implementation in P2.
- `GeminiStubExecutor` and `HiggsfieldStubExecutor`: type-level stubs that return a canned "simulated" artifact. Surface multi-vendor UI without making non-Anthropic calls per CLAUDE.md anti-pattern 7.
- `AutoExecutor`: wraps an inner executor and relabels the output lane to `auto`. Hackathon heuristic routes to `anthropic_direct`.

Apollo picks a lane per step via `supportsRole` plus the `preferred_lane` field in `pipeline_topology.lumio.json`. If the preferred lane returns `supportsRole: false` for a role, Apollo falls back to `anthropic_direct`. If both fail, Apollo emits `pipeline.step.failed` with `reason: 'no_lane_available'` and halts the run.

Interface is intentionally vendor-neutral in signatures (no Anthropic SDK types in the abstract class). Post-hackathon Gemini or Higgsfield lanes require zero call-site edits per NarasiGhaisan Section 3.

## 2. Pipeline topology spec (Lumio demo)

Eleven specialist steps, indexed 0 to 10, defined in `app/builder/executor/pipeline_topology.lumio.json`. Shape conforms to `builder_specialist_executor.contract.md` v0.1.0 Section 5.

Step summary:

| idx | specialist_id | role | preferred_lane | preferred_model |
| --- | --- | --- | --- | --- |
| 0 | lumio_strategist | strategist | anthropic_direct | opus-4-7 |
| 1 | lumio_architect | architect | anthropic_direct | opus-4-7 |
| 2 | lumio_db_schema | db_schema_builder | anthropic_direct | sonnet-4-6 |
| 3 | lumio_ui_builder | ui_builder | anthropic_direct | opus-4-7 |
| 4 | lumio_api_builder | api_builder | anthropic_direct | sonnet-4-6 |
| 5 | lumio_copywriter | copywriter | anthropic_direct | sonnet-4-6 |
| 6 | lumio_asset_designer | asset_designer | anthropic_direct | opus-4-7 |
| 7 | lumio_qa_reviewer | qa_reviewer | anthropic_direct | opus-4-7 |
| 8 | lumio_integration_engineer | integration_engineer | anthropic_managed | opus-4-7 |
| 9 | lumio_deployer | deployer | anthropic_direct | sonnet-4-6 |
| 10 | lumio_final_strategist | strategist | anthropic_direct | opus-4-7 |

Budget cap: $25 USD, 800K input tokens, 400K output tokens, 2400s wallclock. Fits inside the $500 hackathon envelope with headroom for six to eight full Lumio runs during demo rehearsals.

Dependency graph is a DAG (not a chain): step 0 fans out to 1 and 5; step 1 fans out to 2, 3, 4; 5 and 6 feed 3; 2 and 3 and 4 converge at 8; 7 and 8 converge at 9; 9 feeds 10. Apollo can run 2 and 5 in parallel, 3 and 4 and 6 in parallel, 7 and 8 in parallel, sharply reducing wallclock.

Strategy routing: default is `collaborative_anthropic` (Opus for strategist and architect and ui_builder and asset_designer and qa_reviewer and final_strategist, Sonnet for the rest). `opus_all` strategy substitutes every Sonnet slot with Opus. `multi_vendor` and `auto` strategies are UI-visible but not wired for hackathon execution.

## 3. Handoff event taxonomy

Pipeline lifecycle emits events on the bus defined in `event_bus.contract.md` v0.1.0. Builder-specific extensions live in `app/builder/executor/handoff_events.ts`.

Core topics in emission order for a healthy run:

1. `pipeline.run.started`: Apollo emits once, payload `RunStartedPayload`.
2. `pipeline.step.started`: executor emits on entry, payload `StepStartedPayload`.
3. `pipeline.step.tool_use`: zero or more per step, payload `ToolUsePayload`.
4. `pipeline.step.completed`: executor emits on success, payload `StepCompletedPayload`.
5. `pipeline.handoff`: Apollo emits at each DAG edge, payload `HandoffPayload`.
6. `pipeline.run.completed`: Apollo emits once at terminal step, payload `RunCompletedPayload`.

Exception topics:

- `pipeline.step.failed`: executor emits on `status: 'error'` or unrecovered retry.
- `pipeline.run.failed`: Apollo emits on unrecoverable pipeline abort.
- `pipeline.budget.warning`: Tyche or executor emits when any dimension (tokens, wallclock, usd) passes 80% of cap.
- `pipeline.prediction.emitted`: Cassandra emits after every `pipeline.step.completed` with forward projection.
- `pipeline.prediction.warning`: Cassandra emits when projection exceeds cap, with a recommendation tag.

Subscriber roster: Helios (all topics, visualizer), Tyche (cost-related topics, meter), Cassandra (completion topics, re-simulation trigger), Apollo (all topics, status pane), Ananke (`'*'` wildcard, audit log). Subscriber handler exceptions are isolated per contract Section 8.

## 4. Cross-pillar integration points

- **Banking (Tyche):** subscribes to `pipeline.step.completed` and `pipeline.run.completed`, increments meter with `cost_usd`. Renders in the cost meter UI per `cost_meter.contract.md`. `estimateCost` on each executor feeds the pre-run estimate Tyche surfaces to users for consent.
- **Prediction Layer (Cassandra):** consumes `pipeline_topology.lumio.json` to build the Monte Carlo input graph. Emits `pipeline.prediction.emitted` onto the same bus after each step completes. Subscribes to `pipeline.step.completed` to update priors.
- **Visualizer (Helios):** consumes `handoff_events.ts` type exports and the `BUILDER_PIPELINE_TOPICS` registry to render filter chips, live agent pipeline pane, and handoff arrows.
- **MA lane (Heracles):** implements `AnthropicManagedExecutor.execute` behind a stable signature. Athena does not dictate the internal session-to-SSE bridge shape; Heracles is free to restructure inside as long as the outer `SpecialistOutput` contract holds.
- **Lumio runner (Dionysus):** consumes the topology JSON, executes steps end to end using Apollo routing, produces the artifacts referenced in the step `output_artifact_paths`.
- **Blueprint Moment (Urania):** reads Ananke's `'*'` audit log of a Lumio run to produce the narrated blueprint slide. No new event type required.

## 5. Open decisions surfaced

- **Deployment platform:** deployer step 9 emits `deploy_plan.md` plus `env_requirements.md`, but does not provision. Ghaisan flagged Vercel as unlikely. Apollo halts for explicit Ghaisan lock before real deploy. No Vercel-specific assumptions encoded in the topology.
- **Managed Agents functional seed in P1:** decided to keep `AnthropicManagedExecutor` as a P1 skeleton that returns `status: 'error'`. Heracles P2 replaces with real MA session orchestration. Rationale in ADR-003 of `docs/athena.decisions.md`. If V3 wants a functional stub earlier to unblock Helios UI dev, swap trivially by returning a deterministic canned `SpecialistOutput`.
- **Auto lane routing policy:** hackathon routes to `anthropic_direct`. Post-hackathon the auto lane consults a router model per user budget. Behavior guarded by the `AutoExecutor` wrapper so the rest of the pipeline does not care.
- **Estimate-cost heuristic:** simple price-per-million-tokens math. Contract Section 11 flags this as acceptable hackathon debt; post-hackathon a `CostOracle` service replaces the inline math.

## 6. Honest-claim filter

Athena shipped the P1 interface and the Lumio topology. Athena did not ship a production Builder. The hackathon demo runs on this interface; the production NERIUM Builder that Ghaisan plans to ship post-hackathon will inherit the interface but require real executor bodies, a live event bus, and a real cost oracle per the post-hackathon refactor notes in each contract. No mention of Builder shipped state in any public surface until those are real.
