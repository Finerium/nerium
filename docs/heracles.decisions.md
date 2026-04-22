# Heracles decisions log

**Author:** Heracles (Builder Worker, MA Integration Engineer, P2).
**Contract version in scope:** `managed_agent_executor.contract.md` v0.1.0.
**Last updated:** 2026-04-22.

ADR log captures each non-obvious choice Heracles made while implementing the Managed Agents lane. Format per ADR: decision, why, alternatives considered, status. Cross-referenced from agent definition JSON, environment JSON, and code comments so future maintainers find the rationale without archaeology.

---

## ADR-001: Default Task Budget per MA session (200K tokens, 30 minutes)

**Decision:** `AnthropicManagedExecutor` defaults to 200,000 input-plus-output tokens and 1,800 seconds wallclock per MA session via the Task Budgets beta header. Exposed as `HERACLES_DEFAULT_TASK_BUDGET`; overridable per call by `SpecialistInput.budget_tokens` and `budget_wallclock_seconds`.

**Why:** Metis Day-1 lock per `docs/contracts/managed_agent_executor.contract.md` Section 4. Matches the single-integration-task footprint sized in `MANAGED_AGENTS_RESEARCH.md` Section B worked example (80K input plus 20K output for a 40-minute run at roughly $1 per session). 30 minutes is a safety ceiling on "minutes or hours" behavior undocumented beyond that range (research Section F hard unknown).

**Alternatives considered:** 500K tokens, 60 minutes. Rejected because the Heracles halt trigger caps single-task cost at $30 (30 percent of the $150 MA exposure cap) and larger budgets blow through the cap. A lower 100K budget was considered for safety margin but rejected because M1 worked examples show integration tasks hit 100K routinely and we would halt too early.

**Status:** Accepted. Requires Ghaisan explicit sign-off before live on-stage demo spawn per `strategic_decision_hard_stop` in the Heracles prompt; default is shipped but not committed to a live run without confirmation.

---

## ADR-002: Beta headers pinned via configuration, not hardcoded

**Decision:** `ManagedSessionSpawner` takes `beta_headers: string[]` as config rather than baking header values into the spawner. `RECOMMENDED_BETA_HEADERS` is exported as a convenience constant containing `agent_toolset_20260401`, `managed-agents-2026-04-08`, and `task-budgets-20260401`.

**Why:** MA is in public beta since 2026-04-08 and MANAGED_AGENTS_RESEARCH.md Section F explicitly warns "Behaviors may be refined between releases. Expect occasional breaking SDK or beta-header changes. Pin versions." Config-driven headers let us swap a pin in one place without touching transport code if the toolset version rev happens mid-hackathon.

**Alternatives considered:** Hardcode the three headers into `ma_session_spawner.ts`. Rejected because a toolset version bump would require a code change plus a redeploy. Parameterising keeps the change surface flat.

**Status:** Accepted.

---

## ADR-003: Networking tier `limited` with curated allow-list

**Decision:** `nerium-integration-engineer` agent definition sets `networking: limited` and an allow-list containing only GitHub code/API, npm registry, and PyPI hosts. No wildcards.

**Why:** Per Heracles prompt Soft Guidance: "networking `limited` with GitHub + npm + pypi allow-list." Principle of least privilege aligned with the MA sandboxed-container model in M1 research Section C5. Limits blast radius if the integration engineer agent misbehaves; prevents exfiltration to arbitrary hosts during autonomous runs.

**Alternatives considered:**
- `none`: rejected because git pull and package install are core to the integration engineer role.
- `open`: rejected because the broader attack surface is unnecessary for the hackathon integration use case and would expand judge concerns about sandbox discipline.

**Status:** Accepted. Post-hackathon may expand allow-list (Docker Hub, container registries) per post-hackathon refactor notes in the agent definition JSON.

---

## ADR-004: Vault secret management via vault refs, never plaintext in JSON

**Decision:** `ma_environment.nerium_integration_engineer.json` stores vault references (e.g., `"github_token_scoped": "vault:nerium/github-pat-scoped"`), not token values. Setup instructions guide the human operator through secret creation in the Anthropic Console or via the `ant` CLI; the plaintext never transits our backend or git history.

**Why:** Per Heracles prompt Soft Guidance: "GitHub PAT via vault ref (no token in plaintext)." MA advertises a server-side credential vault (M1 research Section A capability matrix) specifically to keep secrets off caller-side storage. Git-history exposure of a PAT would force immediate rotation and would leak from a public MIT-licensed repo (CLAUDE.md Submission section).

**Alternatives considered:** Environment variables injected at spawn time. Rejected because that puts the PAT into the NERIUM backend process memory, losing MA's server-side vault advantage.

**Status:** Accepted.

---

## ADR-005: Strict one-level delegation for hackathon

**Decision:** `nerium-integration-engineer` does not sub-delegate inside its own MA session. Recursion lives in the NERIUM backend (Apollo spawns per-specialist MA sessions), not inside the agent. `callable_agents` research preview is not adopted even if approval lands before submission.

**Why:** Demo reliability. `callable_agents` is research-preview beta per M1 research Section F and has unknown failure modes under time pressure. Recommendation in M1 Section D1 is to orchestrate recursion from the backend; this keeps the multi-vendor roadmap open (post-hackathon Gemini or Higgsfield lanes cannot use `callable_agents` since that is Anthropic-only).

**Alternatives considered:** Request `callable_agents` in the research-preview form and adopt on approval. Rejected for hackathon window; deferred to post-hackathon per `scripts/submit_ma_research_preview_form.md` post-submit flow.

**Status:** Accepted. Ferry to V3 if approval lands and V3 explicitly requests adoption during Day 4-5 polish phase; otherwise strict one-level stands.

---

## ADR-006: `supportsRole` returns true only for `integration_engineer`

**Decision:** `AnthropicManagedExecutor.supportsRole(role)` returns true only when `role === 'integration_engineer'`. All other SpecialistRole values are rejected so Apollo routes them through `AnthropicDirectExecutor`.

**Why:** Section 5.10 of `NERIUM_AGENT_STRUCTURE.md` scopes Heracles strictly to the MA-routed integration lane, not the full Builder pipeline. M1 research Section D3 specifically recommends MA for "autonomy and sandboxed tool use" (integration engineering) and direct SDK for "streaming latency" (UI, copy, schema specialists). Narrowing the supported role surface reduces risk of Apollo accidentally routing a latency-sensitive specialist through MA and incurring session-hour fees for no benefit.

**Alternatives considered:** Return true for all roles (let Apollo decide). Rejected because it misaligns with the single-lane scoping in Section 5.10.

**Status:** Accepted. Post-hackathon may widen to `deployer` and `qa_reviewer` once session-duration and concurrency limits are charted via live production data.

---

## ADR-007: Error-to-status mapping per contract Section 8

**Decision:** Mapping codified inside `AnthropicManagedExecutor.execute()` and `handleSpawnFailure`:

| Failure class | SpecialistOutput status | halt_reason or error_message prefix |
|---|---|---|
| `MaAccessDeniedError` (403 on spawn or SSE) | `halt` | `ma_access_denied` |
| `MaRateLimitedError` after 2 retries | `error` | `ma_rate_limited` |
| `MaServerError` after 2 retries | `error` | `ma_server_error_{code}` |
| `MaNetworkError` after 2 retries | `error` | `ma_network_error` |
| SSE terminal `error` event, budget-class | `halt` | `budget_exceeded` |
| SSE terminal `error` event, other | `error` | pass-through reason |
| Files API pull failure post-completion | `error` | `files_api_pull_failed` |

**Why:** `managed_agent_executor.contract.md` Section 8 enumerates the required error-to-status surfaces. Halt signals "retry via fallback lane" to Apollo, error signals "terminal". The two classes drive very different downstream routing decisions, so they must be distinct.

**Alternatives considered:** Merge all failures into `error`. Rejected because `ma_access_denied` specifically should trigger an Apollo fallback to `AnthropicDirectExecutor` per contract Section 8; merging loses that signal.

**Status:** Accepted.

---

## ADR-008: Single-task cost cap $30 via pre-emptive budget warning

**Decision:** Before spawning, `execute()` calls `estimateCost(input)` and if the projection exceeds `single_task_cost_cap_usd` (default $30), emits `pipeline.budget.warning` with `dimension: 'usd'` and continues. Apollo subscribers may choose to halt; the executor does not self-halt because the user or controller may have already accepted the projected cost.

**Why:** Heracles prompt halt trigger: "MA session cost exceeds $30 for single Builder integration task (30 percent of $150 MA budget)." Contract Section 8 final bullet mandates the pre-emptive emission. Leaving the halt decision to Apollo keeps policy centralised in the orchestrator, not per-lane.

**Alternatives considered:** Hard-halt inside the executor when projection exceeds $30. Rejected because Apollo is the policy owner; the executor's job is emission and enforcement of transport-level constraints only.

**Status:** Accepted.

---

## ADR-009: Console trace URL preservation for judge receipt

**Decision:** `ManagedSessionHandle.console_trace_url` is derived from `console_base_url + /sessions/{session_id}` and surfaced by `getConsoleTraceUrl(session_id)`. Helios consumes this via the pipeline event stream and renders a deep-link in the visualiser per `docs/contracts/pipeline_visualizer.contract.md`. The URL is not stripped or anonymised before rendering; judges click through to the real trace.

**Why:** M1 research Section D3 frames "judges click through to the Console trace" as the single most visually compelling demo moment MA offers. Section E1 notes that named judges reward "good traces". Removing the URL would forfeit that signal.

**Alternatives considered:** Screenshot the trace and embed as an image. Rejected because screenshots are post-hoc and break the "live" framing judges value.

**Status:** Accepted.

---

## ADR-010: Research-preview form submission is reminder-doc only

**Decision:** `scripts/submit_ma_research_preview_form.md` is a human-reminder document. No curl commands, no auto-submitters, no credential handling. A human (Ghaisan) submits the form through the Anthropic Console or the public form URL.

**Why:** Heracles prompt hard_constraints: "Research-preview form submission is REMINDER-DOC only, no auto-submission." Form fields may require human judgment (which features to request) and a human account. Automation would add fragility for no benefit.

**Alternatives considered:** Skip the reminder entirely since the current implementation uses only GA features. Rejected because optionality for post-hackathon approval matters; the cost of the reminder is near zero while the optionality value is real.

**Status:** Accepted.

---

## ADR-011: Heracles MA lane hidden in "Multi-vendor" strategy mode

**Decision:** When NERIUM Builder's strategy selector is set to "Multi-vendor", Morpheus (vendor adapter UI owner) should NOT surface the MA lane as a selectable option. MA is Anthropic-only; showing it in a strategy labelled "Multi-vendor" would mislead users about what "multi-vendor" means.

**Why:** Heracles prompt `strategic_decision_hard_stop` third bullet explicitly raises this, with the recommendation to hide. NarasiGhaisan Section 3 stresses the honest framing: "multi-vendor 'choice' tampil di UI sebagai feature spec dengan annotation 'demo execution Anthropic only, multi-vendor unlock post-hackathon.' Ini honest framing, tidak mislead judges."

**Alternatives considered:** Show MA lane with a "Anthropic-only" tag. Rejected because the tag contradicts the strategy label. The cleaner mental model is: "Multi-vendor" strategy reveals Gemini and Higgsfield stubs with the "simulated" tag, and MA lane is only visible under "Opus all" and "Collaborative Anthropic" strategies.

**Status:** Accepted. Handoff to Morpheus for UI implementation of this visibility rule. Ferry to V3 if Morpheus pushes back with a different visibility model.

---

## ADR-012: Parent `BuilderSpecialistExecutor.ts` re-export is type-only

**Decision:** Athena's `BuilderSpecialistExecutor.ts` retains only type-level re-exports from `./AnthropicManagedExecutor`, not value re-exports. Callers that need the class import it directly from the implementation file.

**Why:** Avoids a circular import at runtime. `AnthropicManagedExecutor.ts` imports the parent class (value) from `BuilderSpecialistExecutor.ts` for its `extends` clause. If the parent also value-re-exported the child, module evaluation order would leave `BuilderSpecialistExecutor` temporarily undefined when the child tries to extend it, producing a runtime TypeError. Type-only re-exports are elided at compile time so they are safe.

**Alternatives considered:**
- Leave the P1 stub in `BuilderSpecialistExecutor.ts` and name the real class differently. Rejected because Section 5.10 explicitly lists `AnthropicManagedExecutor` as the class name and `app/builder/executor/AnthropicManagedExecutor.ts` as the file.
- Move `BuilderSpecialistExecutor` base class to a third file. Rejected because the refactor surface is larger than the problem warrants for hackathon scope, and Athena's file ownership stays intact with the narrower edit.

**Status:** Accepted. Cross-cutting edit to Athena's file is authorised by the explicit comment in that file: "Heracles owns functional implementation in P2." Self-check item 15 confirmed.

---

## Self-check rubric (for future revisions of this log)

When adding or revising an ADR, verify:
- Decision is stated in one sentence.
- Why references a specific contract section, M1 research section, or NarasiGhaisan section.
- At least one alternative is considered and explicitly rejected with reasoning.
- Status is Accepted, Proposed, or Superseded (with pointer to the superseding ADR).
- No em dash, no emoji.
