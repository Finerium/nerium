//
// ma_session_spawner.ts
//
// Conforms to: docs/contracts/managed_agent_executor.contract.md v0.1.0
// Companion interface: docs/contracts/builder_specialist_executor.contract.md v0.1.0
// Owner Agent: Heracles (Builder Worker, MA Integration Engineer, P2)
//
// Purpose: thin typed helper over Anthropic Managed Agents
// `POST /v1/sessions` plus shared session-scoped type definitions used by the
// rest of the MA lane (SSE bridge, Files API client, executor).
//
// Per MANAGED_AGENTS_RESEARCH.md (M1) Section A and C, MA exposes a REST
// session endpoint with beta headers pinning the toolset version and task
// budgets. This helper centralises those header details so the executor file
// stays free of transport code.
//
// Types defined here are the canonical source for downstream helpers; the SSE
// bridge and Files API client import from this file. This avoids a separate
// managed_agent.ts types module and keeps the 8-artifact output spec intact.
//

// ---------- Shared types (per contract Section 3) ----------

export type ManagedModelId = 'claude-opus-4-7' | 'claude-sonnet-4-6';

export type ManagedToolsetVersion = 'agent_toolset_20260401';

export type ManagedNetworkingTier = 'none' | 'limited' | 'open';

export interface ManagedAgentDefinition {
  readonly agent_id: string;
  readonly model: ManagedModelId;
  readonly system_prompt: string;
  readonly toolset_version: ManagedToolsetVersion;
  readonly skills: ReadonlyArray<string>;
  readonly networking: ManagedNetworkingTier;
  readonly networking_allowlist?: ReadonlyArray<string>;
  readonly vault_secret_keys: ReadonlyArray<string>;
}

export interface ManagedAgentEnvironment {
  readonly environment_id: string;
  readonly agent_definition_id: string;
  readonly vault_secret_refs: Readonly<Record<string, string>>;
  readonly file_scope_prefix: string;
}

export interface ManagedSessionContextFile {
  readonly path: string;
  readonly content: string;
}

export interface ManagedSessionTaskBudget {
  readonly max_tokens: number;
  readonly max_wallclock_seconds: number;
}

export interface ManagedSessionSpawnRequest {
  readonly environment_id: string;
  readonly user_prompt: string;
  readonly initial_context_files?: ReadonlyArray<ManagedSessionContextFile>;
  readonly task_budget: ManagedSessionTaskBudget;
}

export interface ManagedSessionHandle {
  readonly session_id: string;
  readonly console_trace_url: string;
  readonly started_at: string;
  readonly budget: ManagedSessionTaskBudget;
}

// ---------- Error taxonomy ----------
//
// Callers distinguish these to choose between halt ('ma_access_denied' halt
// reason) versus retriable error versus terminal error per contract Section 8.

export class MaAccessDeniedError extends Error {
  readonly status_code = 403;
  constructor(message: string) {
    super(message);
    this.name = 'MaAccessDeniedError';
  }
}

export class MaRateLimitedError extends Error {
  readonly status_code = 429;
  constructor(message: string, readonly retry_after_seconds?: number) {
    super(message);
    this.name = 'MaRateLimitedError';
  }
}

export class MaServerError extends Error {
  constructor(message: string, readonly status_code: number) {
    super(message);
    this.name = 'MaServerError';
  }
}

export class MaNetworkError extends Error {
  constructor(message: string, readonly cause_reason: string) {
    super(message);
    this.name = 'MaNetworkError';
  }
}

// ---------- Spawner configuration ----------

export interface SpawnerConfig {
  readonly api_key: string;
  readonly api_base_url: string;
  readonly beta_headers: ReadonlyArray<string>;
  readonly console_base_url: string;
  readonly max_retries: number;
  readonly anthropic_version: string;
}

export const DEFAULT_SPAWNER_CONFIG: Omit<SpawnerConfig, 'api_key' | 'beta_headers'> = {
  api_base_url: 'https://api.anthropic.com',
  console_base_url: 'https://console.anthropic.com',
  max_retries: 2,
  anthropic_version: '2023-06-01',
};

// Beta header recommendations per MANAGED_AGENTS_RESEARCH.md Section A. The
// executor config passes these in; the spawner does not hardcode them so the
// beta-header lifecycle stays config-driven per ADR-002.
export const RECOMMENDED_BETA_HEADERS: ReadonlyArray<string> = [
  'agent_toolset_20260401',
  'managed-agents-2026-04-08',
  'task-budgets-20260401',
];

// ---------- Retryable fetch primitive ----------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffDelayMs(attempt: number): number {
  // 1s, 4s per builder_specialist_executor.contract.md Section 8.
  if (attempt === 0) return 1000;
  if (attempt === 1) return 4000;
  return 10_000;
}

interface RawFetchOptions {
  readonly method: 'POST' | 'GET' | 'DELETE';
  readonly headers: Record<string, string>;
  readonly body?: string;
  readonly signal?: AbortSignal;
}

async function fetchWithRetry(
  url: string,
  options: RawFetchOptions,
  max_retries: number,
): Promise<Response> {
  let last_error: unknown = null;
  for (let attempt = 0; attempt <= max_retries; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (response.status === 403) {
        const body_text = await response.text().catch(() => '');
        throw new MaAccessDeniedError(
          `403 on ${options.method} ${url}: ${truncateText(body_text, 200)}`,
        );
      }
      if (response.status === 429) {
        const retry_after_raw = response.headers.get('retry-after');
        const retry_after = retry_after_raw ? Number.parseInt(retry_after_raw, 10) : undefined;
        if (attempt >= max_retries) {
          throw new MaRateLimitedError(
            `429 on ${options.method} ${url} after ${attempt + 1} attempts`,
            Number.isFinite(retry_after) ? retry_after : undefined,
          );
        }
        await sleep(
          retry_after && retry_after > 0 ? retry_after * 1000 : backoffDelayMs(attempt),
        );
        continue;
      }
      if (response.status >= 500 && response.status <= 599) {
        if (attempt >= max_retries) {
          const body_text = await response.text().catch(() => '');
          throw new MaServerError(
            `${response.status} on ${options.method} ${url}: ${truncateText(body_text, 200)}`,
            response.status,
          );
        }
        await sleep(backoffDelayMs(attempt));
        continue;
      }
      return response;
    } catch (error) {
      if (error instanceof MaAccessDeniedError) throw error;
      if (error instanceof MaRateLimitedError) throw error;
      if (error instanceof MaServerError) throw error;
      last_error = error;
      if (attempt >= max_retries) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new MaNetworkError(
          `Network failure after ${attempt + 1} attempts on ${options.method} ${url}`,
          reason,
        );
      }
      await sleep(backoffDelayMs(attempt));
    }
  }
  // Unreachable; typed for exhaustiveness.
  throw last_error ?? new MaNetworkError(`Retry loop exhausted for ${url}`, 'no_cause_captured');
}

function truncateText(value: string, max_len: number): string {
  if (value.length <= max_len) return value;
  return `${value.slice(0, max_len)}...(truncated)`;
}

// ---------- ManagedSessionSpawner class ----------

export class ManagedSessionSpawner {
  private readonly config: SpawnerConfig;

  constructor(config: Partial<SpawnerConfig> & Pick<SpawnerConfig, 'api_key' | 'beta_headers'>) {
    this.config = {
      ...DEFAULT_SPAWNER_CONFIG,
      ...config,
    };
  }

  async spawn(request: ManagedSessionSpawnRequest): Promise<ManagedSessionHandle> {
    this.assertRequestValid(request);
    const url = `${this.config.api_base_url}/v1/sessions`;
    const body = JSON.stringify({
      environment_id: request.environment_id,
      input: request.user_prompt,
      initial_context_files: request.initial_context_files ?? [],
      task_budget: {
        max_tokens: request.task_budget.max_tokens,
        max_wallclock_seconds: request.task_budget.max_wallclock_seconds,
      },
    });

    const response = await fetchWithRetry(
      url,
      {
        method: 'POST',
        headers: this.buildHeaders({ include_content_type: true }),
        body,
      },
      this.config.max_retries,
    );

    if (!response.ok) {
      const body_text = await response.text().catch(() => '');
      throw new MaServerError(
        `Unexpected status ${response.status} on spawn: ${truncateText(body_text, 200)}`,
        response.status,
      );
    }

    const payload = (await response.json()) as RawSessionSpawnResponse;
    if (!payload || typeof payload.session_id !== 'string') {
      throw new MaServerError(
        'Malformed session spawn response: missing session_id',
        response.status,
      );
    }
    const session_id = payload.session_id;
    const started_at = payload.created_at ?? new Date().toISOString();

    return {
      session_id,
      console_trace_url: this.consoleTraceUrl(session_id),
      started_at,
      budget: request.task_budget,
    };
  }

  async terminate(session_id: string): Promise<void> {
    // Contract Section 8: terminate session via DELETE on persistent SSE
    // failure. Best-effort, swallow errors.
    const url = `${this.config.api_base_url}/v1/sessions/${encodeURIComponent(session_id)}`;
    try {
      await fetchWithRetry(
        url,
        { method: 'DELETE', headers: this.buildHeaders({ include_content_type: false }) },
        0,
      );
    } catch {
      // Swallowed: termination is best-effort cleanup.
    }
  }

  consoleTraceUrl(session_id: string): string {
    // Contract Section 3: anthropic.com/console/sessions/{session_id}.
    return `${this.config.console_base_url}/sessions/${encodeURIComponent(session_id)}`;
  }

  sessionEventsUrl(session_id: string): string {
    return `${this.config.api_base_url}/v1/sessions/${encodeURIComponent(session_id)}/stream`;
  }

  headersForStream(last_event_id?: string): Record<string, string> {
    const headers = this.buildHeaders({ include_content_type: false });
    headers['accept'] = 'text/event-stream';
    if (last_event_id) {
      headers['last-event-id'] = last_event_id;
    }
    return headers;
  }

  headersForFilesApi(): Record<string, string> {
    return this.buildHeaders({ include_content_type: false });
  }

  private buildHeaders(opts: { include_content_type: boolean }): Record<string, string> {
    const headers: Record<string, string> = {
      'x-api-key': this.config.api_key,
      'anthropic-version': this.config.anthropic_version,
    };
    if (this.config.beta_headers.length > 0) {
      headers['anthropic-beta'] = this.config.beta_headers.join(',');
    }
    if (opts.include_content_type) {
      headers['content-type'] = 'application/json';
    }
    return headers;
  }

  private assertRequestValid(request: ManagedSessionSpawnRequest): void {
    if (!request.environment_id) {
      throw new MaServerError('environment_id is required', 0);
    }
    if (!request.user_prompt) {
      throw new MaServerError('user_prompt is required', 0);
    }
    if (request.task_budget.max_tokens <= 0) {
      throw new MaServerError('task_budget.max_tokens must be positive', 0);
    }
    if (request.task_budget.max_wallclock_seconds <= 0) {
      throw new MaServerError('task_budget.max_wallclock_seconds must be positive', 0);
    }
  }
}

// Locally narrow the Anthropic spawn response to the fields we read. A full
// response shape is not published and may evolve during beta; treat as open.
interface RawSessionSpawnResponse {
  readonly session_id: string;
  readonly created_at?: string;
  readonly status?: string;
  readonly environment_id?: string;
}
