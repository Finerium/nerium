//
// simulation_event.ts
//
// Conforms to: docs/contracts/simulation_event.contract.md v0.1.0 Section 3
// Owner Agent(s) per contract: Cassandra
//
// Granular simulation-internal event stream. Supplements the coarser-grained
// warnings in prediction_layer_surface.contract.md. Every simulation pass,
// aggregation, scan start, scan completion, and re-simulation trigger flows
// through this typed envelope so Helios can animate simulation activity and
// Ananke can audit behavior without accessing simulation internals.
//

import type {
  EventBus,
  PipelineEvent,
  PipelineEventTopic,
} from '../../shared/events/pipeline_event';

// ---------- Simulation event kinds ----------

export type SimulationEventKind =
  | 'simulation.scan.started'
  | 'simulation.pass.executed'
  | 'simulation.pass.failed'
  | 'simulation.scan.aggregated'
  | 'simulation.scan.completed'
  | 'simulation.resimulation.triggered';

// ---------- Payload shapes ----------

export interface SimulationScanStartedEvent {
  readonly kind: 'simulation.scan.started';
  readonly scan_id: string;
  readonly pipeline_run_id: string;
  readonly scan_kind: 'pre_execution' | 're_simulation' | 'final';
  readonly planned_passes: number;
  readonly target_specialist_ids: ReadonlyArray<string>;
  readonly occurred_at: string;
}

export interface SimulationPassEvent {
  readonly kind: 'simulation.pass.executed';
  readonly scan_id: string;
  readonly pipeline_run_id: string;
  readonly pass_number: number; // 1..N
  readonly total_passes: number;
  readonly target_specialist_id: string;
  readonly sampled_confidence: number; // 0.0 to 1.0
  readonly tokens_spent: number;
  readonly wallclock_ms: number;
  readonly occurred_at: string;
}

export interface SimulationPassFailedEvent {
  readonly kind: 'simulation.pass.failed';
  readonly scan_id: string;
  readonly pipeline_run_id: string;
  readonly pass_number: number;
  readonly target_specialist_id: string;
  readonly reason: 'rate_limit' | 'network' | 'model_error' | 'timeout';
  readonly occurred_at: string;
}

export interface SimulationScanAggregatedEvent {
  readonly kind: 'simulation.scan.aggregated';
  readonly scan_id: string;
  readonly pipeline_run_id: string;
  readonly per_specialist_average: Readonly<Record<string, number>>;
  readonly per_specialist_variance: Readonly<Record<string, number>>;
  readonly aggregate_confidence: number;
  readonly occurred_at: string;
}

export interface SimulationScanCompletedEvent {
  readonly kind: 'simulation.scan.completed';
  readonly scan_id: string;
  readonly pipeline_run_id: string;
  readonly executed_passes: number;
  readonly failed_passes: number;
  readonly occurred_at: string;
}

export interface SimulationReSimulationTriggeredEvent {
  readonly kind: 'simulation.resimulation.triggered';
  readonly new_scan_id: string;
  readonly previous_scan_id: string;
  readonly pipeline_run_id: string;
  readonly triggering_completed_specialist_id: string;
  readonly occurred_at: string;
}

export type SimulationEvent =
  | SimulationScanStartedEvent
  | SimulationPassEvent
  | SimulationPassFailedEvent
  | SimulationScanAggregatedEvent
  | SimulationScanCompletedEvent
  | SimulationReSimulationTriggeredEvent;

// ---------- Extended topic union for Cassandra emissions ----------
//
// event_bus.contract.md v0.1.0 Section 5 narrows PipelineEventTopic to the
// Builder-canonical 11 topics. simulation_event.contract.md v0.1.0 Section 5
// adds 6 simulation.* topics that also ride the canonical bus. Until the
// event_bus contract bumps version to include simulation.*, Cassandra widens
// locally via CassandraTopic and casts at the EventBus boundary. Documented
// in docs/cassandra.decisions.md ADR-003. No runtime effect, pure TS typing.

export type CassandraTopic = PipelineEventTopic | SimulationEventKind;

// ---------- Publisher helper ----------
//
// Wraps EventBus.publish with a Cassandra-specific envelope builder so the
// rest of cassandra.ts does not repeat envelope construction or topic casts.

export interface CassandraBusPublisherDeps {
  readonly event_bus: EventBus;
  readonly uuid: () => string;
}

export class CassandraBusPublisher {
  private readonly event_bus: EventBus;
  private readonly uuid: () => string;

  constructor(deps: CassandraBusPublisherDeps) {
    this.event_bus = deps.event_bus;
    this.uuid = deps.uuid;
  }

  async emit<T>(
    topic: CassandraTopic,
    pipeline_run_id: string,
    payload: T,
    step_index?: number,
  ): Promise<void> {
    const envelope: PipelineEvent<T> = {
      event_id: this.uuid(),
      topic: topic as PipelineEventTopic,
      pipeline_run_id,
      occurred_at: new Date().toISOString(),
      source_agent: 'cassandra',
      step_index,
      payload,
    };
    await this.event_bus.publish(envelope);
  }

  async emitScanStarted(
    pipeline_run_id: string,
    event: SimulationScanStartedEvent,
  ): Promise<void> {
    await this.emit('simulation.scan.started', pipeline_run_id, event);
  }

  async emitPassExecuted(
    pipeline_run_id: string,
    event: SimulationPassEvent,
  ): Promise<void> {
    await this.emit('simulation.pass.executed', pipeline_run_id, event);
  }

  async emitPassFailed(
    pipeline_run_id: string,
    event: SimulationPassFailedEvent,
  ): Promise<void> {
    await this.emit('simulation.pass.failed', pipeline_run_id, event);
  }

  async emitScanAggregated(
    pipeline_run_id: string,
    event: SimulationScanAggregatedEvent,
  ): Promise<void> {
    await this.emit('simulation.scan.aggregated', pipeline_run_id, event);
  }

  async emitScanCompleted(
    pipeline_run_id: string,
    event: SimulationScanCompletedEvent,
  ): Promise<void> {
    await this.emit('simulation.scan.completed', pipeline_run_id, event);
  }

  async emitReSimulationTriggered(
    pipeline_run_id: string,
    event: SimulationReSimulationTriggeredEvent,
  ): Promise<void> {
    await this.emit('simulation.resimulation.triggered', pipeline_run_id, event);
  }
}
