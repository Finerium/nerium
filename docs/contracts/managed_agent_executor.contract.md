# Managed Agent Executor

**Contract Version:** 0.1.0
**Owner Agent(s):** Heracles (implements `AnthropicManagedExecutor`)
**Consumer Agent(s):** Apollo (may dispatch integration-class specialist tasks via this lane), Athena (pipeline topology references MA-lane steps), Helios (subscribes to SSE bridge for live trace), Nemea (QA validates MA flow end-to-end)
**Stability:** draft
**Last Updated:** 2026-04-22 (Day 1, post-kickoff)

## 1. Purpose

Defines the specialization of `BuilderSpecialistExecutor` that routes specialist tasks through Anthropic Managed Agents, including session lifecycle (spawn via `POST /v1/sessions`), SSE event bridging to the NERIUM event bus, Files API artifact retrieval, Console trace deep-linking, and Task Budget enforcement, positioned as the flagship Best Managed Agents Use prize lane.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor, Section 2 recursive thesis central)
- `CLAUDE.md` (root)
- `docs/contracts/builder_specialist_executor.contract.md` (parent interface this contract specializes)
- `docs/contracts/event_bus.contract.md` (SSE republish target)
- `docs/phase_0/MANAGED_AGENTS_RESEARCH.md` (M1 research: API semantics, beta headers, networking tiers)

## 3. Schema Definition

```typescript
// app/builder/executor/managed_agent.ts

export interface ManagedAgentDefinition {
  agent_id: string;                            // e.g., 'nerium-integration-engineer'
  model: 'claude-opus-4-7' | 'claude-sonnet-4-6';
  system_prompt: string;
  toolset_version: 'agent_toolset_20260401';   // pin per M1 research, beta stability
  skills: string[];                            // e.g., ['git', 'test_runner']
  networking: 'none' | 'limited' | 'open';
  networking_allowlist?: string[];             // required when networking === 'limited'
  vault_secret_keys: string[];                 // e.g., ['github_token_scoped']
}

export interface ManagedAgentEnvironment {
  environment_id: string;                       // human-readable, e.g., 'nerium-integ-env'
  agent_definition_id: string;
  vault_secrets: Record<string, string>;        // never persisted client-side; server-provisioned
  file_scope_prefix: string;                    // for Files API scope_id binding
}

export interface ManagedSessionSpawnRequest {
  environment_id: string;
  user_prompt: string;
  initial_context_files?: Array<{ path: string; content: string }>;
  task_budget: {
    max_tokens: number;                         // default 200_000
    max_wallclock_seconds: number;              // default 1800 (30 min)
  };
}

export interface ManagedSessionHandle {
  session_id: string;
  console_trace_url: string;                    // anthropic.com/console/sessions/{session_id}
  started_at: string;
  budget: { max_tokens: number; max_wallclock_seconds: number };
}

export interface ManagedSessionEvent {
  session_id: string;
  sequence: number;
  kind: 'step' | 'tool_use' | 'message' | 'artifact' | 'error' | 'completed';
  occurred_at: string;
  payload: Record<string, unknown>;
}
```

## 4. Interface / API Contract

```typescript
export class AnthropicManagedExecutor extends BuilderSpecialistExecutor {
  readonly lane: 'anthropic_managed' = 'anthropic_managed';
  constructor(config: { api_key_env: string; beta_headers: string[] });
  spawnSession(req: ManagedSessionSpawnRequest): Promise<ManagedSessionHandle>;
  subscribeSSE(session_id: string, handler: (event: ManagedSessionEvent) => void): () => void;
  pullArtifacts(session_id: string): Promise<Array<{ path: string; content: string }>>;
  getConsoleTraceUrl(session_id: string): string;
  execute(input: SpecialistInput): Promise<SpecialistOutput>;
  supportsRole(role: SpecialistRole): boolean;  // 'integration_engineer' true, others false for hackathon
  estimateCost(input: SpecialistInput): number;
}
```

- `execute()` internally calls `spawnSession`, `subscribeSSE` (republishing events to the global event bus per `event_bus.contract.md`), waits for `kind: 'completed'`, then `pullArtifacts`, then composes and returns `SpecialistOutput`.
- Default Task Budget per session: 200K tokens, 1800s (30 min) wallclock, per Metis Day-1 lock. Overridable per spawn.
- Console trace URL format follows Anthropic Console convention; used by Helios for judge-visible deep link.

## 5. Event Signatures

MA SSE events are transformed to the pipeline event bus with topic mapping:

- MA `step` -> `pipeline.step.started` or `pipeline.step.completed` depending on sub-kind
- MA `tool_use` -> `pipeline.step.tool_use`
- MA `artifact` -> appended to `StepCompletedPayload.artifact_count` and surfaced via handoff event
- MA `error` -> `pipeline.step.failed`
- MA `completed` -> `pipeline.step.completed`

Every republished event includes `source_agent: 'heracles'` and `step_index` corresponding to the originating `SpecialistInput.step_index`.

## 6. File Path Convention

- Executor implementation: `app/builder/executor/AnthropicManagedExecutor.ts`
- Helper modules: `app/builder/executor/ma_session_spawner.ts`, `ma_sse_bridge.ts`, `ma_files_api_client.ts`
- Agent definition JSON: `app/builder/executor/ma_agent_definition.{agent_id}.json`
- Environment JSON: `app/builder/executor/ma_environment.{environment_id}.json`
- Research preview form submission reminder: `scripts/submit_ma_research_preview_form.md`

## 7. Naming Convention

- Agent IDs: kebab-case with `nerium-` prefix (e.g., `nerium-integration-engineer`).
- Environment IDs: kebab-case, suffix `-env`.
- Beta header values follow Anthropic official conventions (do not invent).
- TypeScript class name: `AnthropicManagedExecutor`, method names `camelCase`.

## 8. Error Handling

- 403 on session spawn (research-preview access not granted): `SpecialistOutput.status = 'halt'`, `halt_reason: 'ma_access_denied'`. Caller (Apollo) routes to `AnthropicDirectExecutor` as fallback.
- 429 rate limit: retry up to 2 times with backoff; on third failure, `status: 'error'`.
- SSE connection drops mid-session: reconnect with `Last-Event-ID` header up to 3 times; if still failing, terminate session via DELETE and return `status: 'error'`.
- Task Budget exceeded: server-side MA should terminate; `AnthropicManagedExecutor` surfaces `status: 'halt'`, `halt_reason: 'budget_exceeded'`.
- Cost projection exceeds $30 for a single integration task (per Heracles halt trigger): executor emits `pipeline.budget.warning` before starting.

## 9. Testing Surface

- Smoke test from Indonesia IP: spawn a session, assert `console_trace_url` is reachable.
- SSE bridge: spawn a session that emits at least one `tool_use`, assert the pipeline event bus receives a `pipeline.step.tool_use` event with matching `step_index` and `source_agent: 'heracles'`.
- Files API artifact retrieval: after `kind: 'completed'`, assert `pullArtifacts` returns a non-empty array and every artifact path is prefixed by `environment.file_scope_prefix`.
- Budget enforcement: spawn with `max_tokens: 100`, assert `SpecialistOutput.status: 'halt'` with `halt_reason: 'budget_exceeded'`.
- Fallback routing: simulate 403 on spawn, assert `SpecialistOutput.status: 'halt'` with `halt_reason: 'ma_access_denied'`.

## 10. Open Questions

- None at contract draft. Task Budget defaults (200K tokens, 30 min) locked per Metis Day-1 direction. Research-preview access form submission reminder tracked outside contract.

## 11. Post-Hackathon Refactor Notes

- Enable `callable_agents` research preview support when approved so `nerium-integration-engineer` can sub-delegate to pillar-specialist MAs (currently strict one-level).
- Adopt MA networking `open` tier carefully: hackathon uses `limited` with GitHub allow-list; production may require broader external network access (npm registry, PyPI, Docker Hub) tracked via allow-list expansion.
- Introduce per-tenant MA quota management when NERIUM multi-tenant onboards; current contract assumes single-tenant.
- The `AnthropicDirectExecutor` fallback on MA access denial is hackathon-pragmatic; production should surface a user-actionable prompt rather than silent lane swap.
- Cost projection heuristic currently uses static model pricing from M1 research; migrate to a live `CostOracle` lookup post-hackathon.
