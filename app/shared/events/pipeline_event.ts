//
// pipeline_event.ts
//
// Conforms to: docs/contracts/event_bus.contract.md v0.1.0 Section 3
// Owner Agent(s) per contract: Athena, Heracles
//
// Canonical pipeline event type definitions. Shipped Day 1 per contract
// Section 4 "Default in-memory implementation ships Day 1". This file is
// the single source of truth for topics, envelope shape, and canonical
// payload interfaces. Builder-specific payload extensions (RunStarted,
// RunCompleted, StepFailed, BudgetWarning, Prediction*) live in
// app/builder/executor/handoff_events.ts as additive types.
//
// Additive evolution only: new topics require a contract version bump.
//

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
  readonly event_id: string; // uuid v4
  readonly topic: PipelineEventTopic;
  readonly pipeline_run_id: string;
  readonly occurred_at: string; // ISO-8601 UTC
  readonly source_agent: string;
  readonly step_index?: number;
  readonly payload: TPayload;
}

export interface StepStartedPayload {
  readonly specialist_id: string;
  readonly role: string;
  readonly vendor_lane:
    | 'anthropic_direct'
    | 'anthropic_managed'
    | 'gemini_stub'
    | 'higgsfield_stub'
    | 'auto';
  readonly budget_tokens: number;
  readonly budget_wallclock_seconds: number;
}

export interface ToolUsePayload {
  readonly specialist_id: string;
  readonly tool_name: string;
  readonly tool_input_preview: string; // truncated to 200 chars for UI
}

export interface StepCompletedPayload {
  readonly specialist_id: string;
  readonly tokens_consumed: { input: number; output: number };
  readonly cost_usd: number;
  readonly wallclock_ms: number;
  readonly artifact_count: number;
}

export interface HandoffPayload {
  readonly from_specialist: string;
  readonly to_specialist: string;
  readonly artifact_paths: ReadonlyArray<string>;
}

// Subscriber handler signature per contract Section 4.
export type EventHandler<T = unknown> = (event: PipelineEvent<T>) => void;

// Unsubscribe function returned by `subscribe`.
export type Unsubscribe = () => void;

export interface EventBus {
  publish<T>(event: PipelineEvent<T>): Promise<void>;
  subscribe<T>(
    topic: PipelineEventTopic | '*',
    handler: EventHandler<T>,
  ): Unsubscribe;
}
