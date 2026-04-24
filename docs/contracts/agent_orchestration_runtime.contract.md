# Agent Orchestration Runtime

**Contract Version:** 0.1.0
**Owner Agent(s):** Kratos (orchestration authority, state machine, Claude Agent SDK inner loop, streaming proxy)
**Consumer Agent(s):** Nike (SSE/WS transport for tool-level events), Moros (budget cap flag consumer at dispatch + post-call accountant), Hemera (`builder.live` whitelist gate), Tethys (agent identity verify for `tool_use` blocks), Crius (vendor adapter fallback chain if Anthropic unavailable), Plutus (post-session cost write to ledger via Arq worker), Selene (OTel trace per session + per tool call), Khronos (MCP `create_ma_session` tool dispatches here), Boreas (chat UIScene streams tokens via Nike from Kratos)
**Stability:** draft
**Last Updated:** 2026-04-24 (NP Wave 1, Pythia-v3 round 3)

## 1. Purpose

Defines the hybrid agent orchestration runtime: Claude Agent SDK inner loop (tool-calling + message event normalization) wrapped in a custom Python state machine (outer DAG, cancellation, resume, budget integration). Runtime is synchronous Anthropic-only for reasoning per `CLAUDE.md` anti-pattern 7. `vendor_adapter.contract.md` fallback chain is exception slot for explicit user-visible model selection. Extended thinking supported. Parallel tool_use aggregation supported.

Implementation outer DAG is asyncio + Postgres `ma_step` table. No Temporal. No Restate. No Celery workflow. Arq background worker consumes post-session ledger write + retry-on-failure side effects. Tool schema lives in `mcp_tool_registry.contract.md`; MA session lifecycle wire endpoints live in `ma_session_lifecycle.contract.md`.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor, Section 2 Builder thesis, Section 3 flexibility)
- `CLAUDE.md` (root, anti-pattern 7 Anthropic-only runtime)
- `docs/phase_np/RV_NP_RESEARCH.md` (Sections B.11-B.15 full)
- `docs/phase_np/RV_NP_AGENT_STRUCTURE.md` (Section 4.6 Kratos)
- `docs/contracts/ma_session_lifecycle.contract.md` (session state + endpoints)
- `docs/contracts/budget_monitor.contract.md` (cap flag + usage accounting)
- `docs/contracts/feature_flag.contract.md` (`builder.live` whitelist gate)
- `docs/contracts/vendor_adapter.contract.md` (fallback chain, user-visible only)
- `docs/contracts/agent_identity.contract.md` (Ed25519 verify pattern)
- `docs/contracts/realtime_bus.contract.md` (stream envelope + resume)

## 3. Schema Definition

### 3.1 Runtime primitives

```python
# src/backend/ma/types.py

from pydantic import BaseModel
from typing import Literal, Any
from uuid import UUID

MaModel = Literal["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5"]

MaStopReason = Literal["end_turn", "max_tokens", "stop_sequence", "tool_use", "pause_turn", "refusal"]

class MaStepRecord(BaseModel):
    id: UUID
    session_id: UUID
    name: str                                             # e.g., "plan", "tool_search_marketplace", "synthesize"
    depends_on: list[UUID] = []
    status: Literal["pending", "running", "completed", "failed", "skipped"]
    attempts: int = 0
    max_attempts: int = 3
    result: dict[str, Any] | None = None
    error: dict | None = None
    started_at: str | None = None
    ended_at: str | None = None

class MaContentBlock(BaseModel):
    kind: Literal["text", "tool_use", "tool_result", "thinking", "server_tool_use", "redacted_thinking"]
    text: str | None = None
    tool_use_id: str | None = None
    tool_name: str | None = None
    tool_input: dict | None = None
    tool_result_content: str | list[dict] | None = None
    thinking: str | None = None
    signature: str | None = None                          # thinking block signature for multi-turn continuity
```

### 3.2 Anthropic Messages API event normalization

Inbound Anthropic stream events are normalized to `RealtimeEvent` per `realtime_bus.contract.md`. Mapping:

| Anthropic event | NERIUM wire event |
|---|---|
| `message_start` | `nerium.ma.started` |
| `content_block_start` (text) | (internal; buffered) |
| `content_block_delta` (text_delta) | `nerium.ma.delta` (token accumulation) |
| `content_block_start` (tool_use) | `nerium.ma.tool_call` (with `tool_input_partial: null`) |
| `content_block_delta` (input_json_delta) | `nerium.ma.tool_call` (accumulated `tool_input_partial`) |
| `content_block_stop` (tool_use) | `nerium.ma.tool_call` (final, complete `tool_input`) |
| `content_block_start` (thinking) | (internal; buffered) |
| `content_block_delta` (thinking_delta) | `nerium.ma.thinking` (if `thinking: true` on session) |
| `content_block_delta` (signature_delta) | (internal; captured for continuity) |
| `content_block_stop` (thinking) | (internal; finalized) |
| `message_delta` (usage + stop_reason) | `nerium.ma.usage` |
| `message_stop` | `nerium.ma.done` |
| `ping` (interleaved) | swallowed; emitted as heartbeat only if > 15 s since last event |
| HTTP error from Anthropic | `nerium.ma.errored` with sanitized error |

Redacted thinking blocks (`redacted_thinking`) pass through as `nerium.ma.thinking` with `data: "[redacted]"` preserved for continuity.

### 3.3 Tool routing

Tool names registered in `mcp_tool_registry.contract.md` Section 3.2 are callable. Custom tools defined per-session via `CreateMaSessionInput.tools` (subset). Tool dispatcher calls the Python handler co-located with the tool module; handler returns `dict` serialized as `tool_result_content`.

Parallel `tool_use` blocks are returned together to Anthropic in the next user message per Messages API contract. Dispatcher awaits all tool calls in `asyncio.gather`; partial failures return `tool_result` with `is_error: true` per block.

### 3.4 Model routing heuristic

```python
def pick_model(task_kind: str, user_preference: MaModel | None) -> MaModel:
    if user_preference is not None:
        return user_preference
    if task_kind in ("plan", "synthesize", "hard_code", "agent_headline"):
        return "claude-opus-4-7"
    if task_kind in ("tool_call", "rag_answer", "code_edit", "compose"):
        return "claude-sonnet-4-6"
    return "claude-haiku-4-5"
```

Defaults per M1 Section B.15. User preference from `CreateMaSessionInput.model` (per `mcp_tool_registry.contract.md` Section 4.6) wins. 95%+ Opus 4.7 preserved by routing `plan` + `synthesize` + `hard_code` to Opus.

## 4. Interface / API Contract

### 4.1 State machine

```
queued
  | (pre-call gates: builder.live flag? chronos:ma_capped? budget_usd_cap within remaining?)
  v
running
  | (Claude Agent SDK loop begins)
  v
streaming                                        (cancel requested at any point -> cancelled)
  | (Anthropic stream events flow through normalization)
  v
completed | failed | budget_capped | cancelled
```

State transitions written to `ma_session.status` column atomically. Invalid transitions (e.g., `completed -> running`) rejected at DB layer via CHECK constraint.

### 4.2 Session dispatch

```python
# src/backend/ma/dispatcher.py

async def dispatch(session_id: UUID) -> None:
    session = await load_session(session_id)

    # Pre-call gates
    await enforce_whitelist_gate(session.user_id, flag="builder.live")
    await enforce_budget_cap(session.tenant_id, session.budget_usd_cap)

    await set_status(session_id, "running")
    client = ClaudeSDKClient()
    try:
        async for event in client.query(
            model=session.model,
            system=session.system_prompt,
            messages=[{"role": "user", "content": session.prompt}],
            max_tokens=session.max_tokens,
            tools=tools_for(session.tools),
            thinking={"type": "enabled", "budget_tokens": 10000} if session.thinking else None,
        ):
            await normalize_and_publish(session_id, event)
    except asyncio.CancelledError:
        await set_status(session_id, "cancelled")
        raise
    except BudgetCapTripped:
        await set_status(session_id, "budget_capped")
    except Exception as e:
        await set_status(session_id, "failed", error=sanitize(e))
    else:
        await set_status(session_id, "completed")
        await enqueue_ledger_write(session_id)
```

`normalize_and_publish` writes event to Postgres `ma_event` table (for audit + resume) AND publishes to Redis Stream `stream:ma:<session_id>` AND fans out to Redis pub/sub channel `ma:event:<session_id>` (for Nike SSE proxy).

### 4.3 Cancellation

```
POST /v1/ma/sessions/{id}/cancel
```

Sets `chronos:ma_cancel:<session_id> = 1` in Redis. Dispatcher loop checks on each Anthropic event arrival; on set, raises `asyncio.CancelledError`. Anthropic API supports mid-stream cancel via `client.cancel()` but semantics vary; worst case we drop local accumulator and return `cancelled`.

### 4.4 Pre-call gates

- **Hemera whitelist**: `HEMERA.get_flag_for_user("builder.live", user_id)` returns `true` for judges + Ghaisan + demo account; `false` for others. False returns HTTP 403 `builder_not_enabled`.
- **Budget cap**: `redis.get("chronos:ma_capped")` returns `"1"` if global cap tripped. HTTP 429 `budget_capped`.
- **Per-tenant budget**: `budget_monitor.contract.md` check `remaining_budget_usd >= budget_usd_cap`. HTTP 429 `budget_capped`.
- **Max session count per user**: 3 concurrent `running|streaming` sessions per user default (Hemera `ma.max_concurrent_per_user`). HTTP 429 `too_many_active_sessions`.
- **Prompt content filter**: text ≥20000 chars rejected at Pydantic (per `mcp_tool_registry.contract.md` Section 4.6). No deep content moderation at submission (Anthropic's own safety layer suffices).

### 4.5 Post-call cost write

```python
@arq_worker.task
async def write_ledger_cost(session_id: UUID):
    session = await load_session(session_id)
    if session.cost_usd == 0.0:
        return
    await plutus.ledger_post({
        "idempotency_key": f"ma:{session_id}",
        "debit": [{"account": f"expense:ma_compute:{session.tenant_id}", "amount": session.cost_usd_cents, "currency": "USD"}],
        "credit": [{"account": "liability:anthropic_api", "amount": session.cost_usd_cents, "currency": "USD"}],
        "reference_type": "ma_session",
        "reference_id": str(session_id),
    })
```

Decoupled via Arq so streaming path is not blocked by ledger write. Idempotency key `ma:<session_id>` ensures ledger posting once even on retry.

### 4.6 Thinking block continuity

When `thinking: true`, the session may span multiple Anthropic calls if tool_use chains require multi-turn. Thinking blocks including `signature` are passed back in subsequent `messages[].content` unchanged so Anthropic's server can decrypt and resume reasoning. Dispatcher maintains per-session content accumulator keyed by turn index.

## 5. Event Signatures

Publishes `nerium.ma.*` events per Section 3.2 mapping. Additionally:

| Internal event | Fields | Consumer |
|---|---|---|
| `ma.state.transitioned` | `session_id`, `from_status`, `to_status`, `reason` | Selene (structured log), Moros (budget reconciliation on completion) |
| `ma.tool.dispatched` | `session_id`, `tool_name`, `tool_use_id`, `duration_ms`, `is_error` | Selene, Moros |
| `ma.budget.check_tripped` | `session_id`, `spent_so_far_usd`, `cap_usd` | Moros |
| `ma.cancellation.requested` | `session_id`, `requested_by` | Selene |

OTel span hierarchy: `POST /v1/ma/sessions` → `ma.dispatch` → `ma.claude.stream` → per-tool `ma.tool.<tool_name>` child spans.

## 6. File Path Convention

- Dispatcher: `src/backend/ma/dispatcher.py`
- State machine: `src/backend/ma/state_machine.py`
- Claude SDK runner: `src/backend/ma/claude_sdk_runner.py`
- Event normalizer: `src/backend/ma/normalizer.py`
- Tool dispatcher: `src/backend/ma/tool_dispatcher.py`
- Whitelist gate: `src/backend/ma/whitelist_gate.py`
- Budget guard: `src/backend/ma/budget_guard.py`
- Model router: `src/backend/ma/model_router.py`
- Ledger writer (Arq task): `src/backend/workers/ma_ledger_writer.py`
- Tests: `tests/ma/test_state_machine.py`, `test_normalizer.py`, `test_whitelist_gate.py`, `test_budget_cap_short_circuit.py`, `test_parallel_tool_use.py`, `test_thinking_continuity.py`

## 7. Naming Convention

- Tool call status enum values: `snake_case`.
- Wire event types: `nerium.ma.<subtype>` per `realtime_bus.contract.md`.
- Internal log events: `ma.<subject>.<action>` snake.
- Redis keys: `ma:cancel:<session_id>`, `stream:ma:<session_id>`, `chronos:ma_capped`.
- Arq queue name: `ma_ledger`.
- Postgres enum: `ma_session_status` per `postgres_multi_tenant.contract.md` Section 3.4.

## 8. Error Handling

- Claude Agent SDK version mismatch (< v0.2.111 for Opus 4.7): halt dispatch, HTTP 500 `internal_error`, Selene log at ERROR.
- Anthropic API 429 rate limit: dispatcher re-raises to caller-side, session transitions `failed` with error kind `rate_limited`. UI can retry via new session.
- Anthropic API 5xx: retry 3x with Tenacity exponential backoff (initial 1 s, max 16 s). Exhausted → `failed` with `upstream_5xx`.
- Tool handler raises: tool_result content includes `is_error: true` + redacted message. Anthropic continues reasoning with error result.
- Tool handler times out (> 30 s): dispatcher cancels, tool_result `is_error: true` with `timeout`.
- Parallel tool_use with >5 concurrent: cap via `asyncio.Semaphore(5)`; sequential queueing for overflow.
- `thinking` enabled but model doesn't support: Anthropic API returns error, session `failed` with `thinking_not_supported`.
- Budget cap tripped mid-stream: dispatcher detects on next event, finalizes current block, sets status `budget_capped`, emits `nerium.ma.done` with `stop_reason: "budget_capped"`.
- Cancel requested after `completed`: idempotent no-op, HTTP 200.
- Resume attempt on `completed|failed|cancelled` session: HTTP 410 `gone`; client must GET session state.

## 9. Testing Surface

- State machine all transitions: `queued → running → streaming → completed`; invalid `completed → running` rejected.
- Whitelist gate blocks non-whitelisted user: HTTP 403 `builder_not_enabled`.
- Budget cap short-circuit: `chronos:ma_capped = 1` causes dispatch to skip Anthropic call, session `budget_capped`.
- Cancel mid-stream: set cancel flag, dispatcher terminates within 2 s, session `cancelled`.
- Parallel tool_use aggregation: Anthropic returns 3 tool_use blocks, dispatcher executes concurrently, returns 3 tool_result blocks in correct order.
- Tool handler error: tool_result `is_error: true`, Anthropic continues reasoning.
- Thinking continuity: multi-turn session preserves thinking block signatures; second turn succeeds.
- Cost accounting: completed session enqueues ledger write with correct idempotency key; replay returns cached outcome.
- Redis Stream replay on SSE reconnect: disconnect mid-stream, reconnect with `Last-Event-ID`, receive missing events.
- OTel trace: parent span has `ma.session_id` + `ma.model` + `ma.tenant_id` attributes.
- Model routing: `task_kind="plan"` returns Opus 4.7 even if user passes `sonnet-4-6` (user pref still wins; test covers both paths).
- Vendor fallback: Hemera flag `vendor.anthropic.disabled=true` routes to `vendor_adapter.contract.md` chain; session runs on fallback vendor, event stream still normalized.

## 10. Open Questions

- Claude Agent SDK `ClaudeSDKClient` vs `query` helper: both exposed; dispatcher uses `ClaudeSDKClient` for finer control. Confirm API stable at v0.2.111+.
- Extended thinking token budget default: 10000. Raise for demo headline runs? Hemera flag `ma.thinking_budget_default`.
- Interleaved `ping` events: swallowed vs forwarded? Swallowed to reduce wire noise; heartbeat handled at WS/SSE layer per `realtime_bus.contract.md`.

## 11. Post-Hackathon Refactor Notes

- Temporal/Restate adoption for DAG orchestration when multi-hour workflows land.
- Checkpointing: persist `content_block` accumulator per step so resume after pod restart does not replay from scratch.
- Web Search + Code Execution server tool support (Anthropic server-side tools) once enabled on production accounts.
- MCP client-side: Kratos as MCP client consuming external MCP servers (customer-provided tools).
- Batch API integration: multi-prompt bulk submissions at reduced per-token cost.
- Files API: attach PDF + images to session prompt.
- Agent-to-agent handoff: explicit `spawn_subagent` tool that creates a child session bound to parent budget.
