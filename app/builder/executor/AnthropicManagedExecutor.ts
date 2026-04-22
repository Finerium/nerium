//
// AnthropicManagedExecutor.ts
//
// Conforms to: docs/contracts/managed_agent_executor.contract.md v0.1.0
// Parent interface: docs/contracts/builder_specialist_executor.contract.md v0.1.0
// Companion event contract: docs/contracts/event_bus.contract.md v0.1.0
// Companion meter contract: docs/contracts/billing_meter.contract.md v0.1.0
// Companion identity contract: docs/contracts/agent_identity.contract.md v0.1.0
// Owner Agent: Heracles (Builder Worker, MA Integration Engineer, P2)
//
// Purpose: the flagship Managed Agents lane for NERIUM Builder. Implements
// BuilderSpecialistExecutor using POST /v1/sessions plus session SSE bridge
// plus Files API. Emits canonical pipeline events for Helios visualisation
// and Tyche metering. Surfaces the Anthropic Console trace URL for judge
// receipt per M1 MANAGED_AGENTS_RESEARCH.md Section D3.
//
// Scope boundary: this executor is wired ONLY to the 'integration_engineer'
// specialist role per Section 5.10 and the Best Managed Agents Use prize
// framing. Apollo routes other roles through AnthropicDirectExecutor. Post-
// hackathon, supportsRole may widen once session-duration and concurrency
// limits are charted (see docs/heracles.decisions.md ADR-006).
//
// Error-to-status mapping per contract Section 8:
//   403 MaAccessDenied              -> status 'halt',  halt_reason 'ma_access_denied'
//   429 MaRateLimited after retries -> status 'error', MA-attributed message
//   5xx MaServerError after retries -> status 'error', MA-attributed message
//   Network MaNetworkError          -> status 'error', network-attributed message
//   SSE 'error' kind                -> status 'error', SSE-attributed message
//   Task budget exceeded (server)   -> status 'halt',  halt_reason 'budget_exceeded'
//   Cost projection > $30 pre-run   -> emits pipeline.budget.warning, continues unless caller halts
//

import {
  BuilderSpecialistExecutor,
  type ExecutorDeps,
  type SpecialistInput,
  type SpecialistOutput,
  type SpecialistRole,
  type VendorLane,
} from './BuilderSpecialistExecutor';
import {
  ManagedSessionSpawner,
  MaAccessDeniedError,
  MaNetworkError,
  MaRateLimitedError,
  MaServerError,
  RECOMMENDED_BETA_HEADERS,
  type ManagedSessionHandle,
  type ManagedSessionSpawnRequest,
  type ManagedSessionTaskBudget,
} from './ma_session_spawner';
import {
  MaSseBridge,
  type ManagedSessionEvent,
  type ManagedSessionEventKind,
} from './ma_sse_bridge';
import { MaFilesApiClient, type MaArtifact } from './ma_files_api_client';

// Re-export shared MA types from the dedicated helper files so callers can
// import directly from this executor module without traversing helper paths.
export type {
  ManagedAgentDefinition,
  ManagedAgentEnvironment,
  ManagedSessionSpawnRequest,
  ManagedSessionHandle,
  ManagedSessionTaskBudget,
} from './ma_session_spawner';
export type {
  ManagedSessionEvent,
  ManagedSessionEventKind,
} from './ma_sse_bridge';

// ---------- Configuration ----------

export interface AnthropicManagedConfig {
  readonly api_key: string;
  readonly api_base_url?: string;
  readonly console_base_url?: string;
  readonly agent_definition_id: string;
  readonly environment_id: string;
  readonly beta_headers?: ReadonlyArray<string>;
  readonly default_task_budget?: ManagedSessionTaskBudget;
  readonly max_retries?: number;
  readonly anthropic_version?: string;
  readonly single_task_cost_cap_usd?: number;
  readonly session_hour_rate_usd?: number;
  readonly input_token_rate_usd_per_mtok?: number;
  readonly output_token_rate_usd_per_mtok?: number;
}

// Defaults per Metis Day-1 lock and MANAGED_AGENTS_RESEARCH.md Section B.
// Single-task cost cap $30 is the Heracles halt trigger (30 percent of $150
// MA exposure cap). session-hour rate and token rates per M1 cost model.
export const HERACLES_DEFAULT_TASK_BUDGET: ManagedSessionTaskBudget = {
  max_tokens: 200_000,
  max_wallclock_seconds: 1800,
};

export const HERACLES_DEFAULT_COST_PARAMETERS = {
  single_task_cost_cap_usd: 30,
  session_hour_rate_usd: 0.08,
  input_token_rate_usd_per_mtok: 5,
  output_token_rate_usd_per_mtok: 25,
} as const;

// ---------- Executor implementation ----------

export class AnthropicManagedExecutor extends BuilderSpecialistExecutor {
  readonly lane: VendorLane = 'anthropic_managed';
  private readonly config: Required<
    Pick<
      AnthropicManagedConfig,
      | 'api_base_url'
      | 'console_base_url'
      | 'beta_headers'
      | 'default_task_budget'
      | 'max_retries'
      | 'anthropic_version'
      | 'single_task_cost_cap_usd'
      | 'session_hour_rate_usd'
      | 'input_token_rate_usd_per_mtok'
      | 'output_token_rate_usd_per_mtok'
    >
  > &
    Pick<AnthropicManagedConfig, 'api_key' | 'agent_definition_id' | 'environment_id'>;
  private readonly spawner: ManagedSessionSpawner;
  private readonly sse_bridge: MaSseBridge;
  private readonly files_client: MaFilesApiClient;

  constructor(deps: ExecutorDeps, config: AnthropicManagedConfig) {
    super(deps);
    this.config = {
      api_key: config.api_key,
      api_base_url: config.api_base_url ?? 'https://api.anthropic.com',
      console_base_url: config.console_base_url ?? 'https://console.anthropic.com',
      agent_definition_id: config.agent_definition_id,
      environment_id: config.environment_id,
      beta_headers: config.beta_headers ?? RECOMMENDED_BETA_HEADERS,
      default_task_budget: config.default_task_budget ?? HERACLES_DEFAULT_TASK_BUDGET,
      max_retries: config.max_retries ?? 2,
      anthropic_version: config.anthropic_version ?? '2023-06-01',
      single_task_cost_cap_usd:
        config.single_task_cost_cap_usd ??
        HERACLES_DEFAULT_COST_PARAMETERS.single_task_cost_cap_usd,
      session_hour_rate_usd:
        config.session_hour_rate_usd ??
        HERACLES_DEFAULT_COST_PARAMETERS.session_hour_rate_usd,
      input_token_rate_usd_per_mtok:
        config.input_token_rate_usd_per_mtok ??
        HERACLES_DEFAULT_COST_PARAMETERS.input_token_rate_usd_per_mtok,
      output_token_rate_usd_per_mtok:
        config.output_token_rate_usd_per_mtok ??
        HERACLES_DEFAULT_COST_PARAMETERS.output_token_rate_usd_per_mtok,
    };
    this.spawner = new ManagedSessionSpawner({
      api_key: this.config.api_key,
      api_base_url: this.config.api_base_url,
      console_base_url: this.config.console_base_url,
      beta_headers: this.config.beta_headers,
      max_retries: this.config.max_retries,
      anthropic_version: this.config.anthropic_version,
    });
    this.sse_bridge = new MaSseBridge({ spawner: this.spawner });
    this.files_client = new MaFilesApiClient({
      spawner: this.spawner,
      api_base_url: this.config.api_base_url,
      max_retries: this.config.max_retries,
    });
  }

  // ---------- Contract-facing primitives ----------

  async spawnSession(request: ManagedSessionSpawnRequest): Promise<ManagedSessionHandle> {
    return this.spawner.spawn(request);
  }

  subscribeSSE(
    session_id: string,
    handler: (event: ManagedSessionEvent) => void,
  ): () => void {
    return this.sse_bridge.subscribe(session_id, handler);
  }

  async pullArtifacts(session_id: string): Promise<ReadonlyArray<MaArtifact>> {
    return this.files_client.pullArtifacts(session_id);
  }

  getConsoleTraceUrl(session_id: string): string {
    return this.spawner.consoleTraceUrl(session_id);
  }

  supportsRole(role: SpecialistRole): boolean {
    // Hackathon scope: strictly integration_engineer per Section 5.10. Apollo
    // routes all other roles through AnthropicDirectExecutor.
    return role === 'integration_engineer';
  }

  estimateCost(input: SpecialistInput): number {
    // MA cost model from MANAGED_AGENTS_RESEARCH.md Section B: token cost
    // (input and output at Opus rates) plus session-hour fee at the
    // millisecond-metered rate applied only while session status is running.
    const session_hours = input.budget_wallclock_seconds / 3600;
    const session_fee = this.config.session_hour_rate_usd * session_hours;

    const projected_input_tokens = Math.max(
      Math.floor((input.system_prompt.length + input.user_prompt.length) / 4),
      1000,
    );
    const projected_output_tokens = input.budget_tokens;
    const input_cost =
      (projected_input_tokens / 1_000_000) * this.config.input_token_rate_usd_per_mtok;
    const output_cost =
      (projected_output_tokens / 1_000_000) * this.config.output_token_rate_usd_per_mtok;

    return session_fee + input_cost + output_cost;
  }

  // ---------- Main execution ----------

  async execute(input: SpecialistInput): Promise<SpecialistOutput> {
    const started_wallclock = Date.now();

    // Pre-emptive cost cap warning per contract Section 8 final bullet and
    // Heracles halt trigger: cost projection greater than $30 emits a
    // pipeline.budget.warning before starting. Apollo subscribers decide
    // whether to continue or switch lane; the executor itself still runs
    // because the user-controller may have explicitly accepted the cost.
    const projected_cost = this.estimateCost(input);
    if (projected_cost > this.config.single_task_cost_cap_usd) {
      await this.emit(
        'pipeline.budget.warning',
        input,
        {
          pipeline_run_id: input.pipeline_run_id,
          dimension: 'usd' as const,
          consumed: 0,
          cap: this.config.single_task_cost_cap_usd,
          percent_consumed: projected_cost / this.config.single_task_cost_cap_usd,
        },
        'heracles',
      );
    }

    // Emit pipeline.step.started BEFORE spawn so Helios renders the MA lane
    // node lit even while the POST /v1/sessions is in flight (MA spawn can
    // take 1 to 3 seconds in region; better to show intent immediately).
    await this.emit(
      'pipeline.step.started',
      input,
      {
        specialist_id: input.specialist_id,
        role: input.role,
        vendor_lane: this.lane,
        budget_tokens: input.budget_tokens,
        budget_wallclock_seconds: input.budget_wallclock_seconds,
      },
      'heracles',
    );

    // ---------- Step 1: spawn session ----------

    const spawn_request: ManagedSessionSpawnRequest = {
      environment_id: this.config.environment_id,
      user_prompt: this.composeUserPrompt(input),
      initial_context_files: input.context_files.map((f) => ({ path: f.path, content: f.content })),
      task_budget: this.resolveTaskBudget(input),
    };

    let handle: ManagedSessionHandle;
    try {
      handle = await this.spawnSession(spawn_request);
    } catch (error) {
      return this.handleSpawnFailure(input, started_wallclock, error);
    }

    // ---------- Step 2: subscribe SSE, track state, await completion ----------

    const tracker = new SessionTracker(input, this.config, this.spawner);
    try {
      await this.drainSession(handle, tracker);
    } catch (error) {
      const final_wallclock = Date.now() - started_wallclock;
      const message = error instanceof Error ? error.message : String(error);
      await this.emit(
        'pipeline.step.failed',
        input,
        {
          specialist_id: input.specialist_id,
          error_message: message,
          retry_count: 0,
        },
        'heracles',
      );
      return {
        specialist_id: input.specialist_id,
        pipeline_run_id: input.pipeline_run_id,
        step_index: input.step_index,
        status: 'error',
        artifacts: [],
        tokens_consumed: tracker.tokens,
        cost_usd: tracker.computeRunningCostUsd(final_wallclock),
        wallclock_ms: final_wallclock,
        vendor_lane_used: this.lane,
        error_message: `sse_drain_unexpected: ${message}`,
      };
    }

    const wallclock_ms = Date.now() - started_wallclock;

    // ---------- Step 3: handle terminal state ----------

    if (tracker.terminalKind === 'error') {
      await this.spawner.terminate(handle.session_id);
      const error_message = tracker.terminalErrorMessage ?? 'ma_session_error';
      await this.emit(
        'pipeline.step.failed',
        input,
        {
          specialist_id: input.specialist_id,
          error_message,
          retry_count: 0,
        },
        'heracles',
      );
      if (tracker.isBudgetExceeded()) {
        return {
          specialist_id: input.specialist_id,
          pipeline_run_id: input.pipeline_run_id,
          step_index: input.step_index,
          status: 'halt',
          artifacts: [],
          tokens_consumed: tracker.tokens,
          cost_usd: tracker.computeRunningCostUsd(wallclock_ms),
          wallclock_ms,
          vendor_lane_used: this.lane,
          halt_reason: 'budget_exceeded',
        };
      }
      return {
        specialist_id: input.specialist_id,
        pipeline_run_id: input.pipeline_run_id,
        step_index: input.step_index,
        status: 'error',
        artifacts: [],
        tokens_consumed: tracker.tokens,
        cost_usd: tracker.computeRunningCostUsd(wallclock_ms),
        wallclock_ms,
        vendor_lane_used: this.lane,
        error_message,
      };
    }

    // ---------- Step 4: pull artifacts on success ----------

    let artifacts: ReadonlyArray<MaArtifact> = [];
    try {
      artifacts = await this.pullArtifacts(handle.session_id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.emit(
        'pipeline.step.failed',
        input,
        {
          specialist_id: input.specialist_id,
          error_message: `files_api_pull_failed: ${message}`,
          retry_count: 0,
        },
        'heracles',
      );
      return {
        specialist_id: input.specialist_id,
        pipeline_run_id: input.pipeline_run_id,
        step_index: input.step_index,
        status: 'error',
        artifacts: [],
        tokens_consumed: tracker.tokens,
        cost_usd: tracker.computeRunningCostUsd(wallclock_ms),
        wallclock_ms,
        vendor_lane_used: this.lane,
        error_message: `files_api_pull_failed: ${message}`,
      };
    }

    const cost_usd = tracker.computeRunningCostUsd(wallclock_ms);
    await this.emit(
      'pipeline.step.completed',
      input,
      {
        specialist_id: input.specialist_id,
        tokens_consumed: tracker.tokens,
        cost_usd,
        wallclock_ms,
        artifact_count: artifacts.length,
      },
      'heracles',
    );

    return {
      specialist_id: input.specialist_id,
      pipeline_run_id: input.pipeline_run_id,
      step_index: input.step_index,
      status: 'success',
      artifacts: artifacts.map((a) => ({ path: a.path, content: a.content })),
      tokens_consumed: tracker.tokens,
      cost_usd,
      wallclock_ms,
      vendor_lane_used: this.lane,
    };
  }

  // ---------- Helpers ----------

  private composeUserPrompt(input: SpecialistInput): string {
    // MA sessions take a single text input prompt. The system prompt lives
    // on the agent definition, not the session, so we fold role-specific
    // framing from SpecialistInput.system_prompt into the user message with
    // a visible separator. This keeps the agent definition stable across
    // specialist tasks and makes the per-run prompt auditable in Console.
    const header = `# NERIUM Builder specialist task\n\nSpecialist: ${input.specialist_id} (${input.role})\nPipeline run: ${input.pipeline_run_id}\nStep index: ${input.step_index}\n\n## Task-specific framing\n\n${input.system_prompt}\n\n## User prompt\n\n${input.user_prompt}`;
    return header;
  }

  private resolveTaskBudget(input: SpecialistInput): ManagedSessionTaskBudget {
    // Honour SpecialistInput budgets when provided; fall back to Heracles
    // defaults otherwise. Both enforced server-side via the Task Budgets
    // beta header.
    return {
      max_tokens: input.budget_tokens > 0
        ? input.budget_tokens
        : this.config.default_task_budget.max_tokens,
      max_wallclock_seconds: input.budget_wallclock_seconds > 0
        ? input.budget_wallclock_seconds
        : this.config.default_task_budget.max_wallclock_seconds,
    };
  }

  private async drainSession(
    handle: ManagedSessionHandle,
    tracker: SessionTracker,
  ): Promise<void> {
    await new Promise<void>((resolve) => {
      const unsubscribe = this.sse_bridge.subscribe(handle.session_id, async (event) => {
        await this.handleSessionEvent(handle, event, tracker);
        if (event.kind === 'completed' || event.kind === 'error') {
          unsubscribe();
          resolve();
        }
      });
    });
  }

  private async handleSessionEvent(
    handle: ManagedSessionHandle,
    event: ManagedSessionEvent,
    tracker: SessionTracker,
  ): Promise<void> {
    tracker.ingest(event);

    // Map MA kind to NERIUM pipeline topic per contract Section 5.
    switch (event.kind) {
      case 'tool_use': {
        const tool_name =
          typeof event.payload.tool_name === 'string'
            ? event.payload.tool_name
            : 'unknown_tool';
        const tool_input_preview = previewToolInput(event.payload);
        await this.emit(
          'pipeline.step.tool_use',
          tracker.input,
          {
            specialist_id: tracker.input.specialist_id,
            tool_name,
            tool_input_preview,
          },
          'heracles',
        );
        return;
      }
      case 'artifact': {
        // Artifacts surface via Files API pull at end. Accumulate count only.
        return;
      }
      case 'step': {
        // Intermediate span/step events are informational. We do not republish
        // fine-grained spans to the pipeline bus per contract to keep Helios
        // rendering focused on the 5 canonical topics.
        return;
      }
      case 'message': {
        // Assistant message content stays inside the Console trace; no bus
        // republish to keep Helios visual clean. Tyche sees no message
        // events; tokens are reconciled at completion.
        return;
      }
      case 'error': {
        // Terminal error handled by the caller after drain completes.
        return;
      }
      case 'completed': {
        // Terminal completion handled by the caller after drain completes.
        const _trace = this.getConsoleTraceUrl(handle.session_id);
        // No separate emit here; the caller emits pipeline.step.completed
        // with the aggregated StepCompletedPayload after pullArtifacts.
        return;
      }
      default: {
        const _exhaustive: never = event.kind;
        void _exhaustive;
      }
    }
  }

  private async handleSpawnFailure(
    input: SpecialistInput,
    started_wallclock: number,
    error: unknown,
  ): Promise<SpecialistOutput> {
    const wallclock_ms = Date.now() - started_wallclock;

    if (error instanceof MaAccessDeniedError) {
      await this.emit(
        'pipeline.step.failed',
        input,
        {
          specialist_id: input.specialist_id,
          error_message: `ma_access_denied: ${error.message}`,
          retry_count: 0,
        },
        'heracles',
      );
      return {
        specialist_id: input.specialist_id,
        pipeline_run_id: input.pipeline_run_id,
        step_index: input.step_index,
        status: 'halt',
        artifacts: [],
        tokens_consumed: { input: 0, output: 0 },
        cost_usd: 0,
        wallclock_ms,
        vendor_lane_used: this.lane,
        halt_reason: 'ma_access_denied',
      };
    }

    const error_message = errorMessageFor(error);
    await this.emit(
      'pipeline.step.failed',
      input,
      {
        specialist_id: input.specialist_id,
        error_message,
        retry_count: 0,
      },
      'heracles',
    );
    return {
      specialist_id: input.specialist_id,
      pipeline_run_id: input.pipeline_run_id,
      step_index: input.step_index,
      status: 'error',
      artifacts: [],
      tokens_consumed: { input: 0, output: 0 },
      cost_usd: 0,
      wallclock_ms,
      vendor_lane_used: this.lane,
      error_message,
    };
  }
}

// ---------- SessionTracker ----------
//
// Accumulates tokens, tools, artifacts, and terminal state across SSE events.
// Extracted so handleSessionEvent stays short and so tests can feed synthetic
// ManagedSessionEvent streams without instantiating the full executor.

class SessionTracker {
  tokens: { input: number; output: number } = { input: 0, output: 0 };
  tool_calls = 0;
  artifact_events = 0;
  terminalKind: ManagedSessionEventKind | null = null;
  terminalErrorMessage: string | null = null;

  constructor(
    readonly input: SpecialistInput,
    private readonly config: {
      readonly session_hour_rate_usd: number;
      readonly input_token_rate_usd_per_mtok: number;
      readonly output_token_rate_usd_per_mtok: number;
    },
    private readonly _spawner: ManagedSessionSpawner,
  ) {
    void this._spawner;
  }

  ingest(event: ManagedSessionEvent): void {
    const payload = event.payload;
    const tokens_used = extractUsage(payload);
    if (tokens_used) {
      this.tokens = {
        input: this.tokens.input + tokens_used.input,
        output: this.tokens.output + tokens_used.output,
      };
    }
    if (event.kind === 'tool_use') this.tool_calls += 1;
    if (event.kind === 'artifact') this.artifact_events += 1;
    if (event.kind === 'completed') {
      this.terminalKind = 'completed';
    }
    if (event.kind === 'error') {
      this.terminalKind = 'error';
      this.terminalErrorMessage = extractErrorMessage(payload);
    }
  }

  isBudgetExceeded(): boolean {
    if (!this.terminalErrorMessage) return false;
    const lowered = this.terminalErrorMessage.toLowerCase();
    return (
      lowered.includes('budget_exceeded') ||
      lowered.includes('max_tokens_exceeded') ||
      lowered.includes('wallclock_exceeded') ||
      lowered.includes('task_budget')
    );
  }

  computeRunningCostUsd(wallclock_ms: number): number {
    const session_hours = wallclock_ms / 3_600_000;
    const session_fee = this.config.session_hour_rate_usd * session_hours;
    const input_cost = (this.tokens.input / 1_000_000) * this.config.input_token_rate_usd_per_mtok;
    const output_cost = (this.tokens.output / 1_000_000) * this.config.output_token_rate_usd_per_mtok;
    return session_fee + input_cost + output_cost;
  }
}

// ---------- Payload extraction helpers ----------

function extractUsage(
  payload: Record<string, unknown>,
): { input: number; output: number } | null {
  const usage = payload['usage'];
  if (usage && typeof usage === 'object') {
    const u = usage as Record<string, unknown>;
    const input_tokens = toNonNegativeNumber(u['input_tokens']);
    const output_tokens = toNonNegativeNumber(u['output_tokens']);
    if (input_tokens !== null || output_tokens !== null) {
      return {
        input: input_tokens ?? 0,
        output: output_tokens ?? 0,
      };
    }
  }
  // Some MA events surface a flat `tokens_used` map directly.
  const tokens_used = payload['tokens_used'];
  if (tokens_used && typeof tokens_used === 'object') {
    const t = tokens_used as Record<string, unknown>;
    return {
      input: toNonNegativeNumber(t['input']) ?? 0,
      output: toNonNegativeNumber(t['output']) ?? 0,
    };
  }
  return null;
}

function extractErrorMessage(payload: Record<string, unknown>): string {
  const reason = payload['reason'];
  if (typeof reason === 'string' && reason.length > 0) return reason;
  const err = payload['error'];
  if (typeof err === 'string' && err.length > 0) return err;
  if (err && typeof err === 'object') {
    const m = (err as Record<string, unknown>)['message'];
    if (typeof m === 'string' && m.length > 0) return m;
  }
  return 'ma_session_error_unspecified';
}

function toNonNegativeNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return value;
}

function previewToolInput(payload: Record<string, unknown>): string {
  const tool_input = payload['tool_input'] ?? payload['input'] ?? payload['arguments'];
  if (tool_input === undefined) return '';
  const serialized =
    typeof tool_input === 'string' ? tool_input : safeStringify(tool_input);
  return serialized.length > 200 ? `${serialized.slice(0, 200)}...` : serialized;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function errorMessageFor(error: unknown): string {
  if (error instanceof MaRateLimitedError) return `ma_rate_limited: ${error.message}`;
  if (error instanceof MaServerError) return `ma_server_error_${error.status_code}: ${error.message}`;
  if (error instanceof MaNetworkError) return `ma_network_error: ${error.message}`;
  if (error instanceof Error) return `ma_unexpected_error: ${error.message}`;
  return `ma_unexpected_error: ${String(error)}`;
}
