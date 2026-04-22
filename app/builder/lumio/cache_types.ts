//
// cache_types.ts
//
// Conforms to: docs/contracts/lumio_demo_cache.contract.md v0.1.0 Section 3
// Owner Agent: Dionysus (Builder Worker, Lumio Demo Executor, P3b)
//
// Purpose: canonical typed shape for the Lumio demo cache that LumioReplay
// consumes. The trace on disk at cache/lumio_run_2026_04_24.json is expected
// to parse into LumioRunTrace without migration under replay_compatibility
// version 0.1.0.
//

import type { PipelineEvent } from '../../shared/events/pipeline_event';

// SpecialistOutput mirrors the shipped shape from BuilderSpecialistExecutor.
// Redeclared here so the cache module is importable without the executor
// surface being wired up on the replay-only consumer path.
export type VendorLaneCached =
  | 'anthropic_direct'
  | 'anthropic_managed'
  | 'gemini_stub'
  | 'higgsfield_stub'
  | 'auto';

export type SpecialistStatusCached = 'success' | 'halt' | 'error';

export interface CachedSpecialistArtifact {
  readonly path: string;
  readonly content: string;
}

export interface CachedSpecialistOutput {
  readonly specialist_id: string;
  readonly pipeline_run_id: string;
  readonly step_index: number;
  readonly status: SpecialistStatusCached;
  readonly artifacts: ReadonlyArray<CachedSpecialistArtifact>;
  readonly tokens_consumed: { readonly input: number; readonly output: number };
  readonly cost_usd: number;
  readonly wallclock_ms: number;
  readonly vendor_lane_used: VendorLaneCached;
  readonly halt_reason?: string;
  readonly error_message?: string;
}

export interface LumioSpecialistStep {
  readonly step_index: number;
  readonly specialist_id: string;
  readonly role: string;
  readonly vendor_lane: 'anthropic_direct' | 'anthropic_managed';
  readonly input_preview: string;
  readonly output: CachedSpecialistOutput;
  readonly duration_ms: number;
  readonly started_at: string;
  readonly ended_at: string;
}

export type LumioArtifactKind = 'html' | 'tsx' | 'css' | 'json' | 'md';

export interface LumioArtifact {
  readonly path: string;
  readonly content_kind: LumioArtifactKind;
  readonly bytes: number;
  readonly content: string;
}

export interface LumioRunTrace {
  readonly trace_id: string;
  readonly recorded_at: string;
  readonly total_duration_ms: number;
  readonly total_cost_usd: number;
  readonly specialist_count: number;
  readonly bake_mode: 'opus_session_synthesis' | 'live_pipeline';
  readonly bake_mode_note: string;
  readonly steps: ReadonlyArray<LumioSpecialistStep>;
  readonly event_stream: ReadonlyArray<PipelineEvent>;
  readonly final_artifacts: ReadonlyArray<LumioArtifact>;
  readonly replay_compatibility_version: string;
}

export interface LumioReplayPlayerOptions {
  readonly speed_multiplier?: number;
  readonly onStep?: (step: LumioSpecialistStep) => void;
  readonly onEvent?: (event: PipelineEvent) => void;
}

export interface LumioReplayPlayer {
  loadTrace(trace_id: string): Promise<LumioRunTrace>;
  play(trace: LumioRunTrace, options?: LumioReplayPlayerOptions): Promise<void>;
  pause(): void;
  reset(): void;
  seekTo(step_index: number): void;
}

export class TraceNotFoundError extends Error {
  constructor(public readonly trace_id: string, public readonly attempted_path: string) {
    super(`Lumio trace not found at ${attempted_path} for trace_id ${trace_id}`);
    this.name = 'TraceNotFoundError';
  }
}

export class TraceSchemaIncompatibleError extends Error {
  constructor(public readonly found_version: string, public readonly required_version: string) {
    super(
      `Lumio trace schema version ${found_version} cannot be migrated to required ${required_version}`,
    );
    this.name = 'TraceSchemaIncompatibleError';
  }
}

export const LUMIO_REPLAY_COMPAT_VERSION = '0.1.0' as const;
