//
// cassandra.ts
//
// Conforms to: docs/contracts/prediction_layer_surface.contract.md v0.1.0
//              docs/contracts/simulation_event.contract.md v0.1.0
// Consumer upstream: Athena pipeline topology plus BuilderSpecialistExecutor
// Consumer downstream: Apollo (UI surfacing), Erato (warning banner), Helios
//                      (confidence overlay on pipeline viz)
//
// Runtime model lock: claude-sonnet-4-6 per docs/phase_0/NERIUM_AGENT_STRUCTURE.md
// Section 5.7 and per CLAUDE.md budget section. Authoring session is Opus 4.7.
//
// The Prediction Layer implements a Monte Carlo-inspired confidence estimation
// engine. Per ADR-001 in docs/cassandra.decisions.md, the hackathon ships a
// deterministic feature-based heuristic sampler with per-pass seeded noise so
// aggregation produces realistic variance without incurring per-pass Sonnet
// cost during demo. The SimulationSampler interface is dependency-injected so
// a Sonnet-backed sampler swaps in for production without touching engine
// orchestration. Honest-claim filter: this is Monte Carlo-inspired, not true
// stochastic Monte Carlo. Labeling preserved across surfacing docs.
//

import type { EventBus } from '../../shared/events/pipeline_event';
import type {
  ConfidenceMap,
  EarlyWarning,
  PipelineTopology,
  ScanKind,
  SpecialistConfidence,
  SpecialistOutputView,
  TopologyStepView,
  WarningSeverity,
} from './schema';
import { scoreToBand } from './schema';
import {
  DEFAULT_WARNING_THRESHOLD,
  buildSpecialistConfidence,
  evaluateThreshold,
  overallPipelineConfidence,
} from './confidence_formula';
import {
  CassandraBusPublisher,
  type SimulationPassEvent,
  type SimulationPassFailedEvent,
} from './simulation_event';
import {
  SIMULATION_PERSPECTIVES,
  type SimulationPassPromptInput,
  type SimulationPassResponse,
  type SimulationPerspective,
} from './prompt_template';

// ---------- Public engine interface ----------

export interface PredictionEngine {
  runPreExecutionScan(
    pipeline_run_id: string,
    topology: PipelineTopology,
    passes?: number,
  ): Promise<ConfidenceMap>;
  reSimulate(
    pipeline_run_id: string,
    completed_specialist_id: string,
    actual_output: SpecialistOutputView,
    passes?: number,
  ): Promise<ConfidenceMap>;
  emitEarlyWarning(warning: EarlyWarning): Promise<void>;
  getWarningHistory(pipeline_run_id: string): Promise<ReadonlyArray<EarlyWarning>>;
}

// ---------- Sampler interface (dependency-injected) ----------

export interface SimulationSampler {
  sample(input: SimulationPassPromptInput): Promise<SimulationPassResponse>;
}

export class UnknownSpecialistError extends Error {
  constructor(specialist_id: string) {
    super(`Unknown specialist_id in topology: ${specialist_id}`);
    this.name = 'UnknownSpecialistError';
  }
}

// ---------- Heuristic sampler (default, zero API cost) ----------
//
// Produces a confidence score from topology features plus a deterministic
// per-pass noise term so aggregation across N passes yields a realistic mean
// and stddev without calling Sonnet. Swap for SonnetSampler in production.
// Formula documented in docs/cassandra.decisions.md ADR-001.

const ROLE_PRIORS: Record<string, number> = {
  strategist: 0.82,
  architect: 0.85,
  ui_builder: 0.76,
  api_builder: 0.82,
  db_schema_builder: 0.88,
  copywriter: 0.84,
  asset_designer: 0.74,
  qa_reviewer: 0.88,
  integration_engineer: 0.7,
  deployer: 0.78,
};

const MODEL_MULTIPLIERS: Record<string, number> = {
  'claude-opus-4-7': 1.0,
  'claude-sonnet-4-6': 0.95,
  'claude-haiku-4-5-20251001': 0.88,
};

const LANE_MULTIPLIERS: Record<string, number> = {
  anthropic_direct: 1.0,
  anthropic_managed: 0.92,
  auto: 0.96,
  gemini_stub: 0.7,
  higgsfield_stub: 0.65,
};

const PERSPECTIVE_WEIGHTS: Record<
  SimulationPerspective,
  {
    readonly role: number;
    readonly budget: number;
    readonly downstream: number;
    readonly input: number;
  }
> = {
  input_quality: { role: 0.2, budget: 0.15, downstream: 0.15, input: 0.5 },
  role_competence: { role: 0.55, budget: 0.15, downstream: 0.15, input: 0.15 },
  budget_tension: { role: 0.2, budget: 0.5, downstream: 0.15, input: 0.15 },
  downstream_coupling: { role: 0.2, budget: 0.15, downstream: 0.5, input: 0.15 },
  context_completeness: { role: 0.25, budget: 0.25, downstream: 0.25, input: 0.25 },
};

function djb2(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) + hash + str.charCodeAt(i);
    hash = hash & 0xffffffff;
  }
  return hash >>> 0;
}

function seededNoise(seed: string, amplitude = 0.04): number {
  const h = djb2(seed);
  const normalized = (h % 10_000) / 10_000;
  return (normalized - 0.5) * 2 * amplitude;
}

function clamp(x: number, lo: number, hi: number): number {
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}

export class HeuristicSampler implements SimulationSampler {
  async sample(input: SimulationPassPromptInput): Promise<SimulationPassResponse> {
    const role_score =
      ROLE_PRIORS[input.role] ?? 0.75;
    const model_mult =
      MODEL_MULTIPLIERS[input.preferred_model] ?? 0.85;
    const lane_mult =
      LANE_MULTIPLIERS[input.preferred_lane] ?? 0.85;

    const role_component = role_score * model_mult * lane_mult;

    const expected_tokens_per_artifact = 10_000;
    const target_tokens = Math.max(
      1,
      input.output_artifact_count * expected_tokens_per_artifact,
    );
    let budget_component: number;
    if (input.budget_tokens >= target_tokens * 1.2) {
      budget_component = 0.95;
    } else if (input.budget_tokens >= target_tokens) {
      budget_component = 0.85;
    } else if (input.budget_tokens >= target_tokens * 0.7) {
      budget_component = 0.7;
    } else {
      budget_component = 0.55;
    }

    const coupling_raw = input.downstream_consumer_count * 0.02;
    const downstream_component = clamp(1.0 - coupling_raw, 0.6, 1.0);

    let input_component: number;
    if (input.input_artifact_count === 0) {
      input_component = input.role === 'strategist' ? 0.85 : 0.65;
    } else if (input.input_artifact_count === 1) {
      input_component = 0.82;
    } else if (input.input_artifact_count <= 3) {
      input_component = 0.88;
    } else {
      input_component = 0.84;
    }

    if (input.upstream_actual_output_summary) {
      const summary = input.upstream_actual_output_summary.toLowerCase();
      if (summary.includes('status:error') || summary.includes('status:halt')) {
        input_component = clamp(input_component - 0.2, 0.2, 1.0);
      } else if (summary.includes('status:success')) {
        input_component = clamp(input_component + 0.05, 0.2, 1.0);
      }
    }

    const weights = PERSPECTIVE_WEIGHTS[input.perspective];
    const base =
      weights.role * role_component +
      weights.budget * budget_component +
      weights.downstream * downstream_component +
      weights.input * input_component;

    const noise_seed =
      `${input.specialist_id}:${input.pass_number}:${input.perspective}`;
    const noise = seededNoise(noise_seed);

    const confidence = clamp(base + noise, 0.0, 1.0);

    return {
      confidence: Math.round(confidence * 100) / 100,
      reasoning: `heuristic:${input.perspective}:role=${role_component.toFixed(2)}:budget=${budget_component.toFixed(2)}:downstream=${downstream_component.toFixed(2)}:input=${input_component.toFixed(2)}`,
    };
  }
}

// ---------- Engine configuration ----------

export interface CassandraEngineDeps {
  readonly event_bus: EventBus;
  readonly sampler?: SimulationSampler;
  readonly uuid?: () => string;
  readonly warning_threshold?: number;
  readonly logger?: (msg: string) => void;
}

const DEFAULT_PASSES = 100;
const MAX_PASSES = 500;
const MIN_PASSES = 10;

function defaultUuid(): string {
  if (typeof globalThis !== 'undefined') {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  }
  const rand = Math.random().toString(16).slice(2, 10);
  const time = Date.now().toString(16);
  return `cassandra-${time}-${rand}`;
}

// ---------- Engine implementation ----------

export class CassandraPredictionEngine implements PredictionEngine {
  private readonly publisher: CassandraBusPublisher;
  private readonly sampler: SimulationSampler;
  private readonly uuid: () => string;
  private readonly warning_threshold: number;
  private readonly logger: (msg: string) => void;

  private readonly topology_by_run = new Map<string, PipelineTopology>();
  private readonly latest_map_by_run = new Map<string, ConfidenceMap>();
  private readonly warnings_by_run = new Map<string, EarlyWarning[]>();
  private readonly scan_sequence_by_run = new Map<string, number>();
  private readonly warning_sequence_by_run = new Map<string, number>();
  private readonly completed_specialist_ids_by_run = new Map<string, Set<string>>();

  constructor(deps: CassandraEngineDeps) {
    const uuid = deps.uuid ?? defaultUuid;
    this.uuid = uuid;
    this.publisher = new CassandraBusPublisher({
      event_bus: deps.event_bus,
      uuid,
    });
    this.sampler = deps.sampler ?? new HeuristicSampler();
    this.warning_threshold = deps.warning_threshold ?? DEFAULT_WARNING_THRESHOLD;
    this.logger = deps.logger ?? (() => {});
  }

  async runPreExecutionScan(
    pipeline_run_id: string,
    topology: PipelineTopology,
    passes: number = DEFAULT_PASSES,
  ): Promise<ConfidenceMap> {
    const pass_count = this.normalizePassCount(passes);
    this.topology_by_run.set(pipeline_run_id, topology);
    this.completed_specialist_ids_by_run.set(pipeline_run_id, new Set());
    const target_steps = topology.specialist_steps;
    const scan_id = this.nextScanId(pipeline_run_id, 'pre_execution');

    return this.runScan({
      pipeline_run_id,
      topology,
      target_steps,
      scan_id,
      scan_kind: 'pre_execution',
      pass_count,
    });
  }

  async reSimulate(
    pipeline_run_id: string,
    completed_specialist_id: string,
    actual_output: SpecialistOutputView,
    passes: number = DEFAULT_PASSES,
  ): Promise<ConfidenceMap> {
    const pass_count = this.normalizePassCount(passes);
    const topology = this.topology_by_run.get(pipeline_run_id);
    if (!topology) {
      throw new Error(
        `reSimulate called before runPreExecutionScan for run ${pipeline_run_id}`,
      );
    }

    const completed_step = topology.specialist_steps.find(
      (s) => s.specialist_id === completed_specialist_id,
    );
    if (!completed_step) {
      throw new UnknownSpecialistError(completed_specialist_id);
    }

    const completed_set =
      this.completed_specialist_ids_by_run.get(pipeline_run_id) ?? new Set();
    completed_set.add(completed_specialist_id);
    this.completed_specialist_ids_by_run.set(pipeline_run_id, completed_set);

    const remaining_steps = topology.specialist_steps.filter(
      (s) => !completed_set.has(s.specialist_id),
    );

    const scan_kind: ScanKind =
      remaining_steps.length === 0 ? 'final' : 're_simulation';
    const scan_id = this.nextScanId(pipeline_run_id, scan_kind);

    const latest = this.latest_map_by_run.get(pipeline_run_id);
    if (latest) {
      await this.publisher.emitReSimulationTriggered(pipeline_run_id, {
        kind: 'simulation.resimulation.triggered',
        new_scan_id: scan_id,
        previous_scan_id: latest.scan_id,
        pipeline_run_id,
        triggering_completed_specialist_id: completed_specialist_id,
        occurred_at: new Date().toISOString(),
      });
    }

    const target_steps = remaining_steps.length > 0 ? remaining_steps : topology.specialist_steps;

    return this.runScan({
      pipeline_run_id,
      topology,
      target_steps,
      scan_id,
      scan_kind,
      pass_count,
      upstream_actual: {
        specialist_id: completed_specialist_id,
        output: actual_output,
      },
    });
  }

  async emitEarlyWarning(warning: EarlyWarning): Promise<void> {
    const bucket = this.warnings_by_run.get(warning.pipeline_run_id) ?? [];
    bucket.push(warning);
    this.warnings_by_run.set(warning.pipeline_run_id, bucket);
    await this.publisher.emit(
      'pipeline.prediction.warning',
      warning.pipeline_run_id,
      { warning },
      warning.triggered_step_index,
    );
  }

  async getWarningHistory(
    pipeline_run_id: string,
  ): Promise<ReadonlyArray<EarlyWarning>> {
    const bucket = this.warnings_by_run.get(pipeline_run_id) ?? [];
    return bucket.slice();
  }

  // ---------- Internal orchestration ----------

  private async runScan(input: {
    readonly pipeline_run_id: string;
    readonly topology: PipelineTopology;
    readonly target_steps: ReadonlyArray<TopologyStepView>;
    readonly scan_id: string;
    readonly scan_kind: ScanKind;
    readonly pass_count: number;
    readonly upstream_actual?: {
      readonly specialist_id: string;
      readonly output: SpecialistOutputView;
    };
  }): Promise<ConfidenceMap> {
    const {
      pipeline_run_id,
      topology,
      target_steps,
      scan_id,
      scan_kind,
      pass_count,
      upstream_actual,
    } = input;

    await this.publisher.emitScanStarted(pipeline_run_id, {
      kind: 'simulation.scan.started',
      scan_id,
      pipeline_run_id,
      scan_kind,
      planned_passes: pass_count,
      target_specialist_ids: target_steps.map((s) => s.specialist_id),
      occurred_at: new Date().toISOString(),
    });

    let executed_total = 0;
    let failed_total = 0;

    const per_specialist: SpecialistConfidence[] = [];
    const per_specialist_average: Record<string, number> = {};
    const per_specialist_variance: Record<string, number> = {};

    for (const step of target_steps) {
      const pass_result = await this.runPassesForSpecialist({
        pipeline_run_id,
        scan_id,
        step,
        topology,
        pass_count,
        upstream_actual,
      });
      executed_total += pass_result.executed;
      failed_total += pass_result.failed;

      if (pass_result.samples.length === 0) {
        this.logger(
          `Cassandra: all passes failed for ${step.specialist_id}, emitting degraded advisory.`,
        );
        const warning = this.buildWarning({
          pipeline_run_id,
          step,
          confidence: 0,
          severity: 'advisory',
          underlying_reason: 'simulation_degraded',
        });
        await this.emitEarlyWarning(warning);
        continue;
      }

      const sc = buildSpecialistConfidence({
        specialist_id: step.specialist_id,
        role: step.role,
        step_index: step.step_index,
        samples: pass_result.samples,
      });
      per_specialist.push(sc);
      per_specialist_average[step.specialist_id] = sc.confidence_score;
      per_specialist_variance[step.specialist_id] = sc.variance;

      if (pass_result.failed / (pass_result.executed + pass_result.failed) > 0.5) {
        const warning = this.buildWarning({
          pipeline_run_id,
          step,
          confidence: sc.confidence_score,
          severity: 'advisory',
          underlying_reason: 'simulation_degraded',
        });
        await this.emitEarlyWarning(warning);
      }
    }

    const overall = overallPipelineConfidence(per_specialist);

    await this.publisher.emitScanAggregated(pipeline_run_id, {
      kind: 'simulation.scan.aggregated',
      scan_id,
      pipeline_run_id,
      per_specialist_average,
      per_specialist_variance,
      aggregate_confidence: overall,
      occurred_at: new Date().toISOString(),
    });

    const confidence_map: ConfidenceMap = {
      pipeline_run_id,
      scan_id,
      scan_kind,
      per_specialist,
      overall_pipeline_confidence: overall,
      generated_at: new Date().toISOString(),
    };
    this.latest_map_by_run.set(pipeline_run_id, confidence_map);

    await this.publisher.emit(
      'pipeline.prediction.emitted',
      pipeline_run_id,
      { confidence_map },
    );

    await this.publisher.emitScanCompleted(pipeline_run_id, {
      kind: 'simulation.scan.completed',
      scan_id,
      pipeline_run_id,
      executed_passes: executed_total,
      failed_passes: failed_total,
      occurred_at: new Date().toISOString(),
    });

    await this.issueThresholdWarnings(pipeline_run_id, topology, per_specialist);

    return confidence_map;
  }

  private async runPassesForSpecialist(input: {
    readonly pipeline_run_id: string;
    readonly scan_id: string;
    readonly step: TopologyStepView;
    readonly topology: PipelineTopology;
    readonly pass_count: number;
    readonly upstream_actual?: {
      readonly specialist_id: string;
      readonly output: SpecialistOutputView;
    };
  }): Promise<{
    readonly samples: ReadonlyArray<number>;
    readonly executed: number;
    readonly failed: number;
  }> {
    const { pipeline_run_id, scan_id, step, topology, pass_count, upstream_actual } =
      input;

    const downstream_consumer_count =
      step.handoff_to_step_indices.length;
    const upstream_summary =
      upstream_actual && this.isDownstream(step, upstream_actual.specialist_id, topology)
        ? this.summarizeUpstream(upstream_actual.output)
        : undefined;

    const samples: number[] = [];
    let executed = 0;
    let failed = 0;

    for (let i = 0; i < pass_count; i++) {
      const perspective = this.pickPerspective(i);
      const pass_input: SimulationPassPromptInput = {
        pass_number: i + 1,
        total_passes: pass_count,
        perspective,
        specialist_id: step.specialist_id,
        role: step.role,
        step_index: step.step_index,
        preferred_model: step.preferred_model,
        preferred_lane: step.preferred_lane,
        budget_tokens: step.budget_tokens,
        budget_wallclock_seconds: step.budget_wallclock_seconds,
        input_artifact_count: step.input_artifact_refs.length,
        output_artifact_count: step.output_artifact_paths.length,
        downstream_consumer_count,
        upstream_actual_output_summary: upstream_summary,
      };

      const pass_start = Date.now();
      let response: SimulationPassResponse | null = null;
      let failure_reason: SimulationPassFailedEvent['reason'] | null = null;
      let attempts = 0;
      while (attempts < 3 && response === null) {
        try {
          response = await this.sampler.sample(pass_input);
        } catch (err) {
          attempts++;
          failure_reason = classifyFailure(err);
          if (attempts >= 3) break;
        }
      }
      const wallclock_ms = Date.now() - pass_start;

      if (response !== null) {
        samples.push(response.confidence);
        executed++;
        const pass_event: SimulationPassEvent = {
          kind: 'simulation.pass.executed',
          scan_id,
          pipeline_run_id,
          pass_number: i + 1,
          total_passes: pass_count,
          target_specialist_id: step.specialist_id,
          sampled_confidence: response.confidence,
          tokens_spent: 0,
          wallclock_ms,
          occurred_at: new Date().toISOString(),
        };
        await this.publisher.emitPassExecuted(pipeline_run_id, pass_event);
      } else {
        failed++;
        const failure: SimulationPassFailedEvent = {
          kind: 'simulation.pass.failed',
          scan_id,
          pipeline_run_id,
          pass_number: i + 1,
          target_specialist_id: step.specialist_id,
          reason: failure_reason ?? 'model_error',
          occurred_at: new Date().toISOString(),
        };
        await this.publisher.emitPassFailed(pipeline_run_id, failure);
      }
    }

    return { samples, executed, failed };
  }

  private async issueThresholdWarnings(
    pipeline_run_id: string,
    topology: PipelineTopology,
    per_specialist: ReadonlyArray<SpecialistConfidence>,
  ): Promise<void> {
    for (const sc of per_specialist) {
      const evaluation = evaluateThreshold(sc.confidence_score, this.warning_threshold);
      if (!evaluation.crossed) continue;
      const step = topology.specialist_steps.find(
        (s) => s.specialist_id === sc.specialist_id,
      );
      if (!step) continue;
      const warning = this.buildWarning({
        pipeline_run_id,
        step,
        confidence: sc.confidence_score,
        severity: evaluation.severity,
        underlying_reason: this.describeReason(step, sc),
      });
      await this.emitEarlyWarning(warning);
    }
  }

  private buildWarning(input: {
    readonly pipeline_run_id: string;
    readonly step: TopologyStepView;
    readonly confidence: number;
    readonly severity: WarningSeverity;
    readonly underlying_reason: string;
  }): EarlyWarning {
    const { pipeline_run_id, step, confidence, severity, underlying_reason } = input;
    const seq = this.nextWarningSeq(pipeline_run_id);
    const warning_id = `warn_${pipeline_run_id}_${seq}`;
    return {
      warning_id,
      pipeline_run_id,
      triggered_by_specialist_id: step.specialist_id,
      triggered_step_index: step.step_index,
      gamified_message: gamifiedMessage(step, confidence, severity),
      underlying_reason,
      severity,
      confidence_threshold_violated: this.warning_threshold,
      issued_at: new Date().toISOString(),
    };
  }

  private describeReason(
    step: TopologyStepView,
    sc: SpecialistConfidence,
  ): string {
    const band = scoreToBand(sc.confidence_score);
    return `Specialist ${step.specialist_id} (${step.role}) projected confidence ${sc.confidence_score.toFixed(2)} band=${band} variance=${sc.variance.toFixed(3)}; budget_tokens=${step.budget_tokens}, downstream_consumers=${step.handoff_to_step_indices.length}, preferred_lane=${step.preferred_lane}.`;
  }

  private pickPerspective(pass_index: number): SimulationPerspective {
    return SIMULATION_PERSPECTIVES[
      pass_index % SIMULATION_PERSPECTIVES.length
    ];
  }

  private isDownstream(
    step: TopologyStepView,
    upstream_specialist_id: string,
    topology: PipelineTopology,
  ): boolean {
    const upstream_step = topology.specialist_steps.find(
      (s) => s.specialist_id === upstream_specialist_id,
    );
    if (!upstream_step) return false;
    return upstream_step.handoff_to_step_indices.includes(step.step_index);
  }

  private summarizeUpstream(output: SpecialistOutputView): string {
    return `status:${output.status} artifacts:${output.artifact_paths.length} tokens_in:${output.tokens_consumed.input} tokens_out:${output.tokens_consumed.output} cost_usd:${output.cost_usd.toFixed(4)}`;
  }

  private normalizePassCount(passes: number): number {
    if (!Number.isFinite(passes)) return DEFAULT_PASSES;
    const rounded = Math.floor(passes);
    if (rounded < MIN_PASSES) return MIN_PASSES;
    if (rounded > MAX_PASSES) return MAX_PASSES;
    return rounded;
  }

  private nextScanId(pipeline_run_id: string, kind: ScanKind): string {
    const seq = (this.scan_sequence_by_run.get(pipeline_run_id) ?? 0) + 1;
    this.scan_sequence_by_run.set(pipeline_run_id, seq);
    return `scan_${pipeline_run_id}_${kind}_${seq}`;
  }

  private nextWarningSeq(pipeline_run_id: string): number {
    const seq = (this.warning_sequence_by_run.get(pipeline_run_id) ?? 0) + 1;
    this.warning_sequence_by_run.set(pipeline_run_id, seq);
    return seq;
  }
}

// ---------- Gamified message builder ----------
//
// Per NarasiGhaisan Section 13 tonal guidance, warnings prefer short
// Indonesian-flavored phrasings that feel like a game HUD line rather than a
// log message. Severity encodes the urgency.

function gamifiedMessage(
  step: TopologyStepView,
  confidence: number,
  severity: WarningSeverity,
): string {
  const floor = step.step_index + 1;
  const band = scoreToBand(confidence);
  const prefix = `Floor ${floor} ${step.role}`;
  const pct = `${Math.round(confidence * 100)}%`;
  if (severity === 'halt_recommended') {
    return `${prefix}: confidence ${pct} (${band}), halt and revisi sebelum lanjut.`;
  }
  if (severity === 'review_recommended') {
    return `${prefix}: confidence ${pct} (${band}), review direkomendasi.`;
  }
  return `${prefix}: advisory confidence ${pct} (${band}).`;
}

// ---------- Failure classification ----------

function classifyFailure(err: unknown): SimulationPassFailedEvent['reason'] {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes('rate') || msg.includes('429')) return 'rate_limit';
    if (msg.includes('network') || msg.includes('econn') || msg.includes('enotfound'))
      return 'network';
    if (msg.includes('timeout') || msg.includes('timed out')) return 'timeout';
  }
  return 'model_error';
}

// ---------- Convenience re-exports ----------

export {
  DEFAULT_WARNING_THRESHOLD,
} from './confidence_formula';
export type {
  ConfidenceMap,
  EarlyWarning,
  SpecialistConfidence,
  PipelineTopology,
  TopologyStepView,
  SpecialistOutputView,
} from './schema';
export { HeuristicSampler as DefaultHeuristicSampler };

// ---------- Contract-facing public functions ----------
//
// The prediction_layer_surface.contract.md Section 4 interface uses standalone
// function names (runPreExecutionScan, reSimulate, emitEarlyWarning). The
// class form above satisfies the contract via method dispatch. The bare
// functions below allow callers who hold an engine instance to pass it in
// without depending on the class symbol. They are thin adapters only.

export function runPreExecutionScan(
  engine: PredictionEngine,
  pipeline_run_id: string,
  topology: PipelineTopology,
  passes?: number,
): Promise<ConfidenceMap> {
  return engine.runPreExecutionScan(pipeline_run_id, topology, passes);
}

export function reSimulate(
  engine: PredictionEngine,
  pipeline_run_id: string,
  completed_specialist_id: string,
  actual_output: SpecialistOutputView,
  passes?: number,
): Promise<ConfidenceMap> {
  return engine.reSimulate(pipeline_run_id, completed_specialist_id, actual_output, passes);
}

export function emitEarlyWarning(
  engine: PredictionEngine,
  warning: EarlyWarning,
): Promise<void> {
  return engine.emitEarlyWarning(warning);
}
