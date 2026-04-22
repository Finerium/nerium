//
// BuilderSpecialistExecutor
//
// Conforms to: docs/contracts/builder_specialist_executor.contract.md v0.1.0
// Related contract: docs/contracts/event_bus.contract.md v0.1.0
//
// Purpose: abstract execution lane for Builder pipeline specialists. Apollo
// dispatches work through this interface. Heracles implements the MA variant.
// Per NarasiGhaisan Section 3 model flexibility thesis and Section 2 recursive
// orchestration thesis, vendor lanes are swappable without call-site refactor.
//
// Hackathon scope: anthropic_direct is the default lane, anthropic_managed is
// a Heracles-owned skeleton scheduled to fill in P2, gemini_stub and
// higgsfield_stub are type-level demo surfaces only. No real Gemini or
// Higgsfield calls ship in the hackathon build.
//

import type {
  PipelineEvent,
  PipelineEventTopic,
  EventBus,
} from '../../shared/events/pipeline_event';

// ---------- Roles and lanes ----------

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

// ---------- Input and output shapes ----------

export interface SpecialistContextFile {
  readonly path: string;
  readonly content: string;
}

export interface SpecialistInput {
  readonly specialist_id: string;
  readonly role: SpecialistRole;
  readonly pipeline_run_id: string;
  readonly step_index: number;
  readonly system_prompt: string;
  readonly user_prompt: string;
  readonly context_files: ReadonlyArray<SpecialistContextFile>;
  readonly budget_tokens: number;
  readonly budget_wallclock_seconds: number;
}

export interface SpecialistArtifact {
  readonly path: string;
  readonly content: string;
}

export type SpecialistStatus = 'success' | 'halt' | 'error';

export interface SpecialistOutput {
  readonly specialist_id: string;
  readonly pipeline_run_id: string;
  readonly step_index: number;
  readonly status: SpecialistStatus;
  readonly artifacts: ReadonlyArray<SpecialistArtifact>;
  readonly tokens_consumed: { input: number; output: number };
  readonly cost_usd: number;
  readonly wallclock_ms: number;
  readonly vendor_lane_used: VendorLane;
  readonly halt_reason?: string;
  readonly error_message?: string;
}

// ---------- Executor abstract base ----------

export interface ExecutorDeps {
  readonly event_bus: EventBus;
}

export abstract class BuilderSpecialistExecutor {
  abstract readonly lane: VendorLane;
  protected readonly event_bus: EventBus;

  constructor(deps: ExecutorDeps) {
    this.event_bus = deps.event_bus;
  }

  abstract execute(input: SpecialistInput): Promise<SpecialistOutput>;
  abstract supportsRole(role: SpecialistRole): boolean;
  abstract estimateCost(input: SpecialistInput): number;

  // Helpers used by all implementations. Kept protected so implementations
  // can emit canonical events without duplicating envelope construction.

  protected async emit<T>(
    topic: PipelineEventTopic,
    input: SpecialistInput,
    payload: T,
    source_agent: string,
  ): Promise<void> {
    const event: PipelineEvent<T> = {
      event_id: cryptoRandomUuid(),
      topic,
      pipeline_run_id: input.pipeline_run_id,
      occurred_at: new Date().toISOString(),
      source_agent,
      step_index: input.step_index,
      payload,
    };
    await this.event_bus.publish(event);
  }

  protected overBudget(
    tokens_used: number,
    wallclock_ms: number,
    input: SpecialistInput,
  ): boolean {
    if (tokens_used >= input.budget_tokens) return true;
    if (wallclock_ms >= input.budget_wallclock_seconds * 1000) return true;
    return false;
  }
}

// crypto.randomUUID is Node 19 plus Browser native. Typed locally to avoid
// pulling a DOM or Node lib import into the interface file.
declare const crypto: { randomUUID(): string };
function cryptoRandomUuid(): string {
  return crypto.randomUUID();
}

// ---------- Anthropic direct lane (skeleton, fills in P2) ----------

export interface AnthropicDirectConfig {
  readonly api_key: string;
  readonly model_id: 'claude-opus-4-7' | 'claude-sonnet-4-6' | 'claude-haiku-4-5-20251001';
  readonly max_retries: number;
}

export class AnthropicDirectExecutor extends BuilderSpecialistExecutor {
  readonly lane: VendorLane = 'anthropic_direct';
  private readonly config: AnthropicDirectConfig;

  constructor(deps: ExecutorDeps, config: AnthropicDirectConfig) {
    super(deps);
    this.config = config;
  }

  supportsRole(_role: SpecialistRole): boolean {
    return true;
  }

  estimateCost(input: SpecialistInput): number {
    // Heuristic only for hackathon. See contract Section 11 post-hackathon note.
    const input_cost_per_mtok = this.config.model_id === 'claude-opus-4-7' ? 15 : 3;
    const output_cost_per_mtok = this.config.model_id === 'claude-opus-4-7' ? 75 : 15;
    const projected_input = Math.max(input.system_prompt.length + input.user_prompt.length, 1000) / 4;
    const projected_output = input.budget_tokens;
    return (
      (projected_input / 1_000_000) * input_cost_per_mtok +
      (projected_output / 1_000_000) * output_cost_per_mtok
    );
  }

  async execute(input: SpecialistInput): Promise<SpecialistOutput> {
    // Skeleton. Actual Anthropic Messages API call lands in P2 when Heracles
    // and Apollo integrate. Contract requires success, halt, or error return,
    // never a thrown exception for expected failure modes.
    await this.emit('pipeline.step.started', input, {
      specialist_id: input.specialist_id,
      role: input.role,
      vendor_lane: this.lane,
      budget_tokens: input.budget_tokens,
      budget_wallclock_seconds: input.budget_wallclock_seconds,
    }, input.specialist_id);

    return {
      specialist_id: input.specialist_id,
      pipeline_run_id: input.pipeline_run_id,
      step_index: input.step_index,
      status: 'error',
      artifacts: [],
      tokens_consumed: { input: 0, output: 0 },
      cost_usd: 0,
      wallclock_ms: 0,
      vendor_lane_used: this.lane,
      error_message: 'AnthropicDirectExecutor.execute not implemented yet (P2)',
    };
  }
}

// ---------- Anthropic Managed Agents lane (Heracles owns implementation) ----------
//
// Per MANAGED_AGENTS_RESEARCH.md Section D1 and D3, MA is one lane, not the
// substrate. Heracles fills POST /v1/sessions plus SSE bridge plus Files API
// artifact fetch behind this class. Per Athena decisions ADR-003, this stays
// a stub in P1 and Heracles owns functional implementation in P2.

export interface AnthropicManagedConfig {
  readonly api_key: string;
  readonly agent_definition_id: string; // e.g. 'nerium-integration-engineer'
  readonly environment_template_id: string;
  readonly max_session_hours: number;
  readonly beta_header: string; // MA beta header pinned
}

export class AnthropicManagedExecutor extends BuilderSpecialistExecutor {
  readonly lane: VendorLane = 'anthropic_managed';
  private readonly config: AnthropicManagedConfig;

  constructor(deps: ExecutorDeps, config: AnthropicManagedConfig) {
    super(deps);
    this.config = config;
  }

  supportsRole(role: SpecialistRole): boolean {
    // Demo lean: MA shines on long-horizon autonomous coding tasks. Restrict
    // to integration_engineer per M1 D3 recommendation. Apollo may widen this
    // post-hackathon once session-duration and concurrency limits are charted.
    return role === 'integration_engineer';
  }

  estimateCost(input: SpecialistInput): number {
    // MA session-hour $0.08 plus token cost plus $10 per 1K web searches.
    const session_hours = input.budget_wallclock_seconds / 3600;
    const session_fee = 0.08 * session_hours;
    const token_cost =
      (input.budget_tokens / 1_000_000) * 75; // Opus output rate upper bound
    return session_fee + token_cost;
  }

  async execute(input: SpecialistInput): Promise<SpecialistOutput> {
    // Placeholder. Heracles P2 replaces with real MA session orchestration.
    return {
      specialist_id: input.specialist_id,
      pipeline_run_id: input.pipeline_run_id,
      step_index: input.step_index,
      status: 'error',
      artifacts: [],
      tokens_consumed: { input: 0, output: 0 },
      cost_usd: 0,
      wallclock_ms: 0,
      vendor_lane_used: this.lane,
      error_message:
        'AnthropicManagedExecutor.execute is a P1 skeleton. Heracles P2 owns implementation.',
    };
  }
}

// ---------- Stub lanes: Gemini and Higgsfield (type skeleton only) ----------
//
// These exist so the Builder UI can render a vendor-lane chip with a visible
// "simulated" tag per NarasiGhaisan Section 3 multi-vendor feature display.
// No real SDK calls ship in the hackathon build per CLAUDE.md anti-pattern 7.

export class GeminiStubExecutor extends BuilderSpecialistExecutor {
  readonly lane: VendorLane = 'gemini_stub';

  supportsRole(role: SpecialistRole): boolean {
    return role === 'asset_designer' || role === 'copywriter';
  }

  estimateCost(_input: SpecialistInput): number {
    return 0;
  }

  async execute(input: SpecialistInput): Promise<SpecialistOutput> {
    return {
      specialist_id: input.specialist_id,
      pipeline_run_id: input.pipeline_run_id,
      step_index: input.step_index,
      status: 'success',
      artifacts: [
        {
          path: `simulated/${input.specialist_id}.note.md`,
          content:
            'Simulated Gemini response. Multi-vendor lane is a post-hackathon feature surface.',
        },
      ],
      tokens_consumed: { input: 0, output: 0 },
      cost_usd: 0,
      wallclock_ms: 1,
      vendor_lane_used: this.lane,
    };
  }
}

export class HiggsfieldStubExecutor extends BuilderSpecialistExecutor {
  readonly lane: VendorLane = 'higgsfield_stub';

  supportsRole(role: SpecialistRole): boolean {
    return role === 'asset_designer';
  }

  estimateCost(_input: SpecialistInput): number {
    return 0;
  }

  async execute(input: SpecialistInput): Promise<SpecialistOutput> {
    return {
      specialist_id: input.specialist_id,
      pipeline_run_id: input.pipeline_run_id,
      step_index: input.step_index,
      status: 'success',
      artifacts: [
        {
          path: `simulated/${input.specialist_id}.note.md`,
          content:
            'Simulated Higgsfield response. Multi-vendor lane is a post-hackathon feature surface.',
        },
      ],
      tokens_consumed: { input: 0, output: 0 },
      cost_usd: 0,
      wallclock_ms: 1,
      vendor_lane_used: this.lane,
    };
  }
}

// ---------- Auto lane (routes to anthropic_direct for hackathon) ----------

export class AutoExecutor extends BuilderSpecialistExecutor {
  readonly lane: VendorLane = 'auto';
  private readonly inner: BuilderSpecialistExecutor;

  constructor(deps: ExecutorDeps, inner: BuilderSpecialistExecutor) {
    super(deps);
    this.inner = inner;
  }

  supportsRole(role: SpecialistRole): boolean {
    return this.inner.supportsRole(role);
  }

  estimateCost(input: SpecialistInput): number {
    return this.inner.estimateCost(input);
  }

  async execute(input: SpecialistInput): Promise<SpecialistOutput> {
    const inner_result = await this.inner.execute(input);
    return { ...inner_result, vendor_lane_used: this.lane };
  }
}
