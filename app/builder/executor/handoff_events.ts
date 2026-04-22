//
// handoff_events.ts
//
// Conforms to: docs/contracts/event_bus.contract.md v0.1.0
// Companion interface: docs/contracts/builder_specialist_executor.contract.md v0.1.0
//
// Builder-pipeline event type definitions emitted during a run and consumed
// by Helios visualizer, Cassandra simulation trigger, Apollo status pane,
// Tyche cost meter, and Ananke audit tap. Types here mirror the canonical
// payload shapes in app/shared/events/pipeline_event.ts. This file is the
// Builder-facing convenience export and adds handoff-specific helpers.
//
// Additive evolution only per event_bus.contract.md soft guidance. Breaking
// existing payload shape requires contract version bump.
//

import type {
  PipelineEvent,
  PipelineEventTopic,
  StepStartedPayload,
  ToolUsePayload,
  StepCompletedPayload,
  HandoffPayload,
} from '../../shared/events/pipeline_event';
import type { ConfidenceMap, EarlyWarning } from '../prediction/schema';

export type {
  PipelineEvent,
  PipelineEventTopic,
  StepStartedPayload,
  ToolUsePayload,
  StepCompletedPayload,
  HandoffPayload,
};

// ---------- Additional Builder-internal payload shapes ----------
//
// Shapes here are Builder-pipeline specific. Cross-pillar events (Marketplace,
// Banking, Registry, Protocol) live in their own contracts per
// event_bus.contract.md Section 5.

export interface RunStartedPayload {
  readonly pipeline_id: string; // e.g. 'lumio'
  readonly total_steps: number;
  readonly strategy: 'opus_all' | 'collaborative_anthropic' | 'multi_vendor' | 'auto';
  readonly budget_usd_cap: number;
  readonly budget_tokens_cap: number;
  readonly started_at: string; // ISO-8601 UTC
}

export interface RunCompletedPayload {
  readonly pipeline_id: string;
  readonly completed_steps: number;
  readonly total_cost_usd: number;
  readonly total_tokens: { input: number; output: number };
  readonly total_wallclock_ms: number;
  readonly final_artifact_paths: ReadonlyArray<string>;
}

export interface RunFailedPayload {
  readonly pipeline_id: string;
  readonly failed_step_index: number;
  readonly reason: string;
}

export interface StepFailedPayload {
  readonly specialist_id: string;
  readonly error_message: string;
  readonly retry_count: number;
}

export interface BudgetWarningPayload {
  readonly pipeline_run_id: string;
  readonly dimension: 'tokens' | 'wallclock' | 'usd';
  readonly consumed: number;
  readonly cap: number;
  readonly percent_consumed: number;
}

// Emitted by Cassandra onto the same bus so Helios and Apollo see predictions
// inline with pipeline events. Payload shape conforms to
// prediction_layer_surface.contract.md v0.1.0 Section 5, which is Owner-of-
// topic authoritative (Cassandra). Reconciled per Cassandra ADR-004 and
// Helios ADR-05 addendum: the earlier speculative flat shape (p50/p90 cost
// and wallclock percentile forecast) was never wired and is deferred to a
// future `pipeline.prediction.cost_forecast` topic.
export interface PredictionEmittedPayload {
  readonly confidence_map: ConfidenceMap;
}

export interface PredictionWarningPayload {
  readonly warning: EarlyWarning;
}

// ---------- Discriminated union for ergonomic subscriber switch ----------

export type BuilderPipelineEvent =
  | PipelineEvent<RunStartedPayload> & { topic: 'pipeline.run.started' }
  | PipelineEvent<RunCompletedPayload> & { topic: 'pipeline.run.completed' }
  | PipelineEvent<RunFailedPayload> & { topic: 'pipeline.run.failed' }
  | PipelineEvent<StepStartedPayload> & { topic: 'pipeline.step.started' }
  | PipelineEvent<ToolUsePayload> & { topic: 'pipeline.step.tool_use' }
  | PipelineEvent<StepCompletedPayload> & { topic: 'pipeline.step.completed' }
  | PipelineEvent<StepFailedPayload> & { topic: 'pipeline.step.failed' }
  | PipelineEvent<HandoffPayload> & { topic: 'pipeline.handoff' }
  | PipelineEvent<BudgetWarningPayload> & { topic: 'pipeline.budget.warning' }
  | PipelineEvent<PredictionEmittedPayload> & { topic: 'pipeline.prediction.emitted' }
  | PipelineEvent<PredictionWarningPayload> & { topic: 'pipeline.prediction.warning' };

// ---------- Type guards for subscribers ----------

export function isStepStarted(
  ev: BuilderPipelineEvent,
): ev is PipelineEvent<StepStartedPayload> & { topic: 'pipeline.step.started' } {
  return ev.topic === 'pipeline.step.started';
}

export function isStepCompleted(
  ev: BuilderPipelineEvent,
): ev is PipelineEvent<StepCompletedPayload> & { topic: 'pipeline.step.completed' } {
  return ev.topic === 'pipeline.step.completed';
}

export function isHandoff(
  ev: BuilderPipelineEvent,
): ev is PipelineEvent<HandoffPayload> & { topic: 'pipeline.handoff' } {
  return ev.topic === 'pipeline.handoff';
}

export function isBudgetWarning(
  ev: BuilderPipelineEvent,
): ev is PipelineEvent<BudgetWarningPayload> & { topic: 'pipeline.budget.warning' } {
  return ev.topic === 'pipeline.budget.warning';
}

export function isPredictionWarning(
  ev: BuilderPipelineEvent,
): ev is PipelineEvent<PredictionWarningPayload> & { topic: 'pipeline.prediction.warning' } {
  return ev.topic === 'pipeline.prediction.warning';
}

// ---------- Topic registry for UI filter chips ----------
//
// Helios uses this to render subscriber-filter chips. Ordering here is the
// visual ordering in the UI, not lexical.

export const BUILDER_PIPELINE_TOPICS: ReadonlyArray<PipelineEventTopic> = [
  'pipeline.run.started',
  'pipeline.step.started',
  'pipeline.step.tool_use',
  'pipeline.step.completed',
  'pipeline.handoff',
  'pipeline.step.failed',
  'pipeline.budget.warning',
  'pipeline.prediction.emitted',
  'pipeline.prediction.warning',
  'pipeline.run.completed',
  'pipeline.run.failed',
];
