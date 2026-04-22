# Event Bus

**Contract Version:** 0.1.0
**Owner Agent(s):** Athena (emits pipeline events via BuilderSpecialistExecutor), Heracles (republishes MA SSE events into the bus)
**Consumer Agent(s):** Helios (live visualizer subscriber), Cassandra (re-simulation trigger on `pipeline.step.completed`), Apollo (cross-pillar status awareness), Tyche (cost event subscription for meter), Ananke (orchestration log via audit tap)
**Stability:** draft
**Last Updated:** 2026-04-22 (Day 1, post-kickoff)

## 1. Purpose

Defines the canonical pub/sub event schema that all Builder pipeline activity flows through, so any number of visualizer, meter, simulation, or logging subscribers can observe a running pipeline without coupling to the executor implementation.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor)
- `CLAUDE.md` (root)
- `docs/contracts/builder_specialist_executor.contract.md` (primary upstream publisher)
- `docs/contracts/simulation_event.contract.md` (Cassandra-emitted subset that rides this bus)

## 3. Schema Definition

```typescript
// app/shared/events/pipeline_event.ts

export type PipelineEventTopic =
  | 'pipeline.run.started'
  | 'pipeline.run.completed'
  | 'pipeline.run.failed'
  | 'pipeline.step.started'
  | 'pipeline.step.tool_use'
  | 'pipeline.step.completed'
  | 'pipeline.step.failed'
  | 'pipeline.handoff'
  | 'pipeline.budget.warning'
  | 'pipeline.prediction.emitted'
  | 'pipeline.prediction.warning';

export interface PipelineEvent<TPayload = unknown> {
  event_id: string;                 // uuid v4
  topic: PipelineEventTopic;
  pipeline_run_id: string;
  occurred_at: string;              // ISO-8601 UTC
  source_agent: string;             // 'athena' | 'apollo' | specialist_id | ...
  step_index?: number;
  payload: TPayload;
}

export interface StepStartedPayload {
  specialist_id: string;
  role: string;
  vendor_lane: 'anthropic_direct' | 'anthropic_managed' | 'gemini_stub' | 'higgsfield_stub' | 'auto';
  budget_tokens: number;
  budget_wallclock_seconds: number;
}

export interface ToolUsePayload {
  specialist_id: string;
  tool_name: string;
  tool_input_preview: string;       // truncated to 200 chars for UI
}

export interface StepCompletedPayload {
  specialist_id: string;
  tokens_consumed: { input: number; output: number };
  cost_usd: number;
  wallclock_ms: number;
  artifact_count: number;
}

export interface HandoffPayload {
  from_specialist: string;
  to_specialist: string;
  artifact_paths: string[];
}
```

## 4. Interface / API Contract

```typescript
export interface EventBus {
  publish<T>(event: PipelineEvent<T>): Promise<void>;
  subscribe<T>(topic: PipelineEventTopic | '*', handler: (event: PipelineEvent<T>) => void): () => void;
}
```

- Publishing is fire-and-forget from the caller's perspective. Implementations may buffer for at-most-once delivery, never at-least-once (no deduplication required downstream).
- Subscription returns an unsubscribe function.
- `'*'` subscription receives every topic. Used by Ananke audit tap.
- Default in-memory implementation ships Day 1; SSE bridge for client-side subscribers ships with Helios.

## 5. Event Signatures

All topics enumerated in `PipelineEventTopic`. Additional topics require a contract version bump. Namespace convention: `pipeline.{subject}.{action}`. Cross-pillar (Marketplace, Banking, Registry, Protocol) may define parallel namespaces in their own contracts; this contract governs Builder pipeline events only.

## 6. File Path Convention

- Type definitions: `app/shared/events/pipeline_event.ts`
- In-memory bus: `app/shared/events/InMemoryEventBus.ts`
- SSE bridge: `app/shared/events/sse_bridge.ts` (client-side subscriber setup)
- Redis-backed replacement (post-hackathon): `app/shared/events/RedisEventBus.ts` (not hackathon scope)

## 7. Naming Convention

- Topic strings: lowercase, dot-separated, `subject.action` format.
- Payload interface names: `{Topic}Payload` in `PascalCase` (e.g., `StepStartedPayload`).
- Event field names: `snake_case` to match JSON wire format.

## 8. Error Handling

- Subscriber handler exceptions are caught by the bus, logged via `console.error`, and do not propagate to the publisher.
- If a handler throws more than 3 times in a 60-second window, the bus auto-unsubscribes it and emits `pipeline.run.failed` with `reason: 'subscriber_failure_cascade'`.
- Publishing never fails; if serialization fails, the bus logs and drops the event rather than blocking the pipeline.

## 9. Testing Surface

- Publish-subscribe round trip: publish a `pipeline.step.started` event, assert subscriber handler receives identical event with same `event_id`.
- Wildcard subscription: subscribe `'*'`, publish 3 events of different topics, assert handler called 3 times.
- Unsubscribe: subscribe, unsubscribe, publish, assert handler not called.
- Handler failure isolation: subscribe a handler that throws, publish, assert pipeline continues and other subscribers still receive the event.

## 10. Open Questions

- None at contract draft. In-memory implementation is sufficient for hackathon single-process scope.

## 11. Post-Hackathon Refactor Notes

- Replace `InMemoryEventBus` with Redis pub/sub or NATS when NERIUM runtime is split into multiple processes (backend orchestrator plus frontend subscribers plus MA bridge worker).
- Add event schema versioning header (`schema_version: 1`) on every envelope so multi-version subscribers can coexist during staged rollouts.
- Extend topic namespace to cover Marketplace (`marketplace.listing.*`), Banking (`banking.transaction.*`), Registry (`registry.identity.*`), Protocol (`protocol.translation.*`) via separate contracts.
- Consider at-least-once delivery with idempotency keys if downstream analytics pipelines need durability guarantees.
