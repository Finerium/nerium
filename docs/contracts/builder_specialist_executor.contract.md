# Builder Specialist Executor

**Contract Version:** 0.1.0
**Owner Agent(s):** Athena (defines interface), Heracles (implements `AnthropicManagedExecutor` variant)
**Consumer Agent(s):** Apollo (dispatches work), Dionysus (runs Lumio via executor), Cassandra (reads topology for simulation), Helios (visualizes executor activity), Heracles (implements MA variant)
**Stability:** draft
**Last Updated:** 2026-04-22 (Day 1, post-kickoff)

## 1. Purpose

Defines the abstract `BuilderSpecialistExecutor` interface that all Builder execution lanes (direct Anthropic SDK, Managed Agents via Heracles, future Gemini/Higgsfield stubs) conform to, so the hero Builder pipeline remains vendor-swappable without refactor per NarasiGhaisan Section 3 multi-vendor thesis.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor, especially Section 2 recursive thesis and Section 3 model flexibility)
- `CLAUDE.md` (root)
- `docs/contracts/event_bus.contract.md` (pipeline event schema emitted during execution)
- `docs/contracts/managed_agent_executor.contract.md` (MA-variant specialization, Heracles lane)
- `docs/phase_0/MANAGED_AGENTS_RESEARCH.md` (M1 reference for MA execution semantics)

## 3. Schema Definition

```typescript
// app/builder/executor/BuilderSpecialistExecutor.ts

export type SpecialistRole =
  | 'strategist'
  | 'architect'
  | 'ui_builder'
  | 'api_builder'
  | 'db_schema_builder'
  | 'copywriter'
  | 'asset_designer'
  | 'qa_reviewer'
  | 'integration_engineer'
  | 'deployer';

export type VendorLane =
  | 'anthropic_direct'
  | 'anthropic_managed'
  | 'gemini_stub'
  | 'higgsfield_stub'
  | 'auto';

export interface SpecialistInput {
  specialist_id: string;
  role: SpecialistRole;
  pipeline_run_id: string;
  step_index: number;
  system_prompt: string;
  user_prompt: string;
  context_files: Array<{ path: string; content: string }>;
  budget_tokens: number;
  budget_wallclock_seconds: number;
}

export interface SpecialistOutput {
  specialist_id: string;
  pipeline_run_id: string;
  step_index: number;
  status: 'success' | 'halt' | 'error';
  artifacts: Array<{ path: string; content: string }>;
  tokens_consumed: { input: number; output: number };
  cost_usd: number;
  wallclock_ms: number;
  vendor_lane_used: VendorLane;
  halt_reason?: string;
  error_message?: string;
}

export abstract class BuilderSpecialistExecutor {
  abstract readonly lane: VendorLane;
  abstract execute(input: SpecialistInput): Promise<SpecialistOutput>;
  abstract supportsRole(role: SpecialistRole): boolean;
  abstract estimateCost(input: SpecialistInput): number;
}
```

## 4. Interface / API Contract

- `execute(input)` returns a Promise resolving to `SpecialistOutput` regardless of underlying lane. Must not throw for expected failure modes; set `status: 'error'` and populate `error_message` instead.
- `supportsRole(role)` is a pure synchronous predicate used by Apollo to pick a lane per specialist role.
- `estimateCost(input)` returns USD estimate before execution, consumed by Tyche meter contract.
- All executors emit events through the event bus during execution; direct callers do not subscribe to executor-internal streams.

## 5. Event Signatures

All events published on the pipeline event bus during `execute()` runtime conform to `PipelineEvent` in `event_bus.contract.md`. Executors publish at minimum:

- `pipeline.step.started` at execution entry
- `pipeline.step.tool_use` per tool call (if any)
- `pipeline.step.completed` at success, or `pipeline.step.failed` at error

## 6. File Path Convention

- Interface: `app/builder/executor/BuilderSpecialistExecutor.ts`
- Direct Anthropic implementation: `app/builder/executor/AnthropicDirectExecutor.ts`
- MA implementation: `app/builder/executor/AnthropicManagedExecutor.ts`
- Stub implementations: `app/builder/executor/{vendor}_executor.stub.ts`
- Pipeline topology: `app/builder/executor/pipeline_topology.{demo_name}.json`

## 7. Naming Convention

- Class names: `PascalCase`, suffix `Executor` for all implementations.
- Enum members: `snake_case` string literals (`anthropic_direct`, etc.).
- TypeScript type aliases: `PascalCase`.
- JSON pipeline topology keys: `snake_case`.

## 8. Error Handling

- Transient errors (429, 503, network): executor retries up to 2 times with exponential backoff (1s, 4s) before surfacing `status: 'error'`.
- Budget exceeded (tokens or wallclock): executor halts with `status: 'halt'` and `halt_reason: 'budget_exceeded'`.
- Vendor-specific authentication or permission errors: `status: 'error'`, no retry.
- All errors surface through event bus via `pipeline.step.failed` before returning.

## 9. Testing Surface

- Contract conformance test per implementation: feed a fixed `SpecialistInput`, assert the returned `SpecialistOutput` shape matches the interface and `vendor_lane_used` matches the executor's `lane` field.
- Budget test: call `execute` with `budget_tokens: 100` on a task known to need more, assert `status: 'halt'` and `halt_reason: 'budget_exceeded'`.
- Stub test: `GeminiStubExecutor.execute()` must return deterministic canned `SpecialistOutput` with `vendor_lane_used: 'gemini_stub'` and a visible note that the response is simulated.

## 10. Open Questions

- None at contract draft. Framework commit (Next.js 15 locked per Metis) removes prior ambiguity. Stub vendor set for UI display pending Morpheus implementation detail.

## 11. Post-Hackathon Refactor Notes

- `GeminiStubExecutor` and `HiggsfieldStubExecutor` are hackathon-only demo surfaces; post-hackathon they become real integrations with respective SDKs.
- `estimateCost` currently returns a heuristic; post-hackathon it should query live pricing via a centralized `CostOracle` service and support per-tier pricing for NERIUM Builder's Cheap/Mid/Premium tiers per NarasiGhaisan Section 4.
- The `auto` lane is hackathon-stubbed to route to `anthropic_direct` with annotation; post-hackathon it invokes a routing model that evaluates cost/capability trade-offs per user budget.
- Interface intentionally avoids Anthropic-specific types in signatures so multi-vendor migration requires no call-site edits. Preserve this boundary across all revisions.
