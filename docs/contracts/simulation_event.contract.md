# Simulation Event

**Contract Version:** 0.1.0
**Owner Agent(s):** Cassandra (simulation event publisher)
**Consumer Agent(s):** Helios (visualizes per-agent confidence over time), Apollo (aggregates into user-visible warnings via Erato), Ananke (audit logs simulation history)
**Stability:** draft
**Last Updated:** 2026-04-22 (Day 1, post-kickoff)

## 1. Purpose

Defines the granular simulation-internal event stream Cassandra emits for each individual pass and aggregation step, supplementing the coarser-grained warnings in `prediction_layer_surface.contract.md`, so visualization components can animate simulation activity and QA can audit simulation behavior without accessing simulation internals.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor)
- `CLAUDE.md` (root)
- `docs/contracts/prediction_layer_surface.contract.md` (higher-level confidence and warning schema)
- `docs/contracts/event_bus.contract.md` (event bus transport)

## 3. Schema Definition

```typescript
// app/builder/prediction/simulation_event.ts

export type SimulationEventKind =
  | 'simulation.scan.started'
  | 'simulation.pass.executed'
  | 'simulation.pass.failed'
  | 'simulation.scan.aggregated'
  | 'simulation.scan.completed'
  | 'simulation.resimulation.triggered';

export interface SimulationPassEvent {
  kind: 'simulation.pass.executed';
  scan_id: string;
  pipeline_run_id: string;
  pass_number: number;            // 1..N
  total_passes: number;           // default 100
  target_specialist_id: string;
  sampled_confidence: number;     // 0.0 to 1.0
  tokens_spent: number;
  wallclock_ms: number;
  occurred_at: string;
}

export interface SimulationPassFailedEvent {
  kind: 'simulation.pass.failed';
  scan_id: string;
  pipeline_run_id: string;
  pass_number: number;
  target_specialist_id: string;
  reason: 'rate_limit' | 'network' | 'model_error' | 'timeout';
  occurred_at: string;
}

export interface SimulationScanStartedEvent {
  kind: 'simulation.scan.started';
  scan_id: string;
  pipeline_run_id: string;
  scan_kind: 'pre_execution' | 're_simulation' | 'final';
  planned_passes: number;
  target_specialist_ids: string[];
  occurred_at: string;
}

export interface SimulationScanAggregatedEvent {
  kind: 'simulation.scan.aggregated';
  scan_id: string;
  pipeline_run_id: string;
  per_specialist_average: Record<string, number>;
  per_specialist_variance: Record<string, number>;
  aggregate_confidence: number;
  occurred_at: string;
}

export interface SimulationScanCompletedEvent {
  kind: 'simulation.scan.completed';
  scan_id: string;
  pipeline_run_id: string;
  executed_passes: number;
  failed_passes: number;
  occurred_at: string;
}

export interface SimulationReSimulationTriggeredEvent {
  kind: 'simulation.resimulation.triggered';
  new_scan_id: string;
  previous_scan_id: string;
  pipeline_run_id: string;
  triggering_completed_specialist_id: string;
  occurred_at: string;
}

export type SimulationEvent =
  | SimulationScanStartedEvent
  | SimulationPassEvent
  | SimulationPassFailedEvent
  | SimulationScanAggregatedEvent
  | SimulationScanCompletedEvent
  | SimulationReSimulationTriggeredEvent;
```

## 4. Interface / API Contract

Simulation events are published through the canonical event bus per `event_bus.contract.md`, wrapped in a `PipelineEvent` envelope with topic derived from `SimulationEvent.kind`. The `simulation.*` namespace is reserved for Cassandra exclusively.

## 5. Event Signatures

Each `SimulationEventKind` maps 1:1 to a `PipelineEvent.topic`:

- `simulation.scan.started` (payload: `SimulationScanStartedEvent`)
- `simulation.pass.executed` (payload: `SimulationPassEvent`)
- `simulation.pass.failed` (payload: `SimulationPassFailedEvent`)
- `simulation.scan.aggregated` (payload: `SimulationScanAggregatedEvent`)
- `simulation.scan.completed` (payload: `SimulationScanCompletedEvent`)
- `simulation.resimulation.triggered` (payload: `SimulationReSimulationTriggeredEvent`)

## 6. File Path Convention

- Schema: `app/builder/prediction/simulation_event.ts`
- Publisher integration: `app/builder/prediction/cassandra.ts` (uses event bus)
- Subscriber consumption: arbitrary; Helios example at `app/builder/viz/confidence_overlay.ts`

## 7. Naming Convention

- Event kind strings: lowercase, dot-separated, `simulation.{subject}.{action}`.
- Scan ID format: `scan_{pipeline_run_id}_{scan_kind}_{sequence}`.
- Pass numbers are 1-indexed.

## 8. Error Handling

- `simulation.pass.failed` is itself an event and never throws; consumers receive the failure as data.
- Publishing failure (bus down): Cassandra retains events in a bounded in-memory buffer (max 500), drops oldest on overflow, and re-attempts publish on next scan start.
- Listener-side handler errors are caught by the bus per `event_bus.contract.md`.

## 9. Testing Surface

- Scan lifecycle: start a scan, observe `started -> N x executed -> aggregated -> completed` event order.
- Pass failure resilience: inject 10 failed passes in 100, assert `completed.failed_passes: 10` and `completed.executed_passes: 90`.
- Re-simulation trigger: complete a specialist, assert `resimulation.triggered` event includes `previous_scan_id` matching the prior completed scan.
- Event envelope shape: assert every emitted `PipelineEvent.topic` matches one of the 6 simulation kinds and `source_agent: 'cassandra'`.

## 10. Open Questions

- None at contract draft.

## 11. Post-Hackathon Refactor Notes

- Add cost and token totals per event for finer-grained metering; currently aggregated only at scan-completion level.
- Support streaming partial aggregation: emit `simulation.scan.aggregated` every N passes rather than only at scan end, enabling live-updating confidence bars during long scans.
- Consider a `simulation.scan.cancelled` event when the upstream pipeline aborts mid-scan.
- Persist event stream to SQLite for replay-based demo determinism and post-hackathon observability research.
