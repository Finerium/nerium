# Realtime Bus (WebSocket + SSE)

**Contract Version:** 0.1.0
**Owner Agent(s):** Nike (WebSocket server authority, SSE endpoint template, ConnectionManager, heartbeat, reconnection with Last-Event-ID). Aether co-owner for FastAPI native WebSocket mount.
**Consumer Agent(s):** Kratos (publishes MA session events to SSE + WS per-user channels), Boreas (chat UIScene subscribes to SSE), Frontend Builder UI (WebSocket client), Moros (budget alert broadcasts), Pheme (email queue status if UI needs live feedback), Eunomia (admin broadcast channel for maintenance toggles), Selene (connection lifecycle trace).
**Stability:** draft
**Last Updated:** 2026-04-24 (NP Wave 1, Pythia-v3 round 3)

## 1. Purpose

Defines the client-server realtime transport protocol for NERIUM. Two transports: WebSocket for bidirectional persistent channels (chat, notifications), SSE for unidirectional server-push streams (MA session tokens, agent orchestration events). Both share a common wire event envelope, auth ticket flow, heartbeat cadence, and Last-Event-ID resume semantics. Redis pub/sub + Streams provide cross-worker fanout + durable replay per `redis_session.contract.md`.

Scope boundary with `game_event_bus.contract.md`: that contract governs Phaser `game.events` in-process; this contract governs cross-network protocol. Chat-specific UI mechanics live in `chat_ui.contract.md`. MA session-specific state machine lives in `ma_session_lifecycle.contract.md`.

Technology lock: FastAPI native WebSocket + httpx-sse compatible response. No Socket.io, no STOMP, no GraphQL subscriptions.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor)
- `CLAUDE.md` (root)
- `docs/phase_np/RV_NP_RESEARCH.md` (Section A.9 WebSocket, B.13 streaming token-level)
- `docs/phase_np/RV_NP_AGENT_STRUCTURE.md` (Section 4.7 Nike, 4.6 Kratos, 4.20 Boreas)
- `docs/contracts/rest_api_base.contract.md` (shared middleware, CORS)
- `docs/contracts/redis_session.contract.md` (pub/sub channels + stream namespaces)
- `docs/contracts/oauth_dcr.contract.md` (JWT ticket shape)
- `docs/contracts/ma_session_lifecycle.contract.md` (event payload details)

## 3. Schema Definition

### 3.1 Wire event envelope (SSE + WebSocket)

```python
# src/backend/realtime/events.py

from pydantic import BaseModel
from typing import Any, Literal
from datetime import datetime

class RealtimeEvent(BaseModel):
    id: int                                               # server-side monotonic (Redis Stream entry id mapping)
    type: str                                             # dotted namespace (e.g., nerium.ma.delta)
    data: dict[str, Any]                                  # payload; JSON-serialized on wire
    occurred_at: datetime                                 # ISO-8601 UTC
    version: Literal[1] = 1                               # envelope schema version
```

SSE wire format:

```
id: 12345
event: nerium.ma.delta
data: {"session_id":"01926f..","delta":"Hello","model":"claude-opus-4-7"}

```

Trailing blank line terminates the event per SSE spec. Comments for heartbeat: `: ping\n\n`.

WebSocket wire format (text frames):

```json
{
  "id": 12345,
  "type": "nerium.ma.delta",
  "data": {"session_id":"01926f..","delta":"Hello","model":"claude-opus-4-7"},
  "occurred_at": "2026-04-27T06:00:00Z",
  "version": 1
}
```

Binary frames reserved for future asset streaming; not used at submission.

### 3.2 Event type namespace

```
nerium.ma.<subtype>          MA session lifecycle + tokens
nerium.notification.<kind>   User-facing notifications
nerium.marketplace.<action>  Listing published, sold, reviewed
nerium.billing.<action>      Subscription updated, payment succeeded/failed
nerium.system.<action>       Maintenance, flag changes, budget alerts
nerium.presence.<action>     Future: multi-user presence
```

Full subtype registry (initial):

| Type | Payload shape (see Section 3.3) |
|---|---|
| `nerium.ma.queued` | `MaQueuedPayload` |
| `nerium.ma.started` | `MaStartedPayload` |
| `nerium.ma.delta` | `MaDeltaPayload` |
| `nerium.ma.tool_call` | `MaToolCallPayload` |
| `nerium.ma.thinking` | `MaThinkingPayload` |
| `nerium.ma.usage` | `MaUsagePayload` |
| `nerium.ma.done` | `MaDonePayload` |
| `nerium.ma.cancelled` | `MaCancelledPayload` |
| `nerium.ma.errored` | `MaErroredPayload` |
| `nerium.notification.created` | `NotificationPayload` |
| `nerium.marketplace.listing_published` | `ListingEventPayload` |
| `nerium.marketplace.purchase_completed` | `PurchaseEventPayload` |
| `nerium.billing.subscription_updated` | `SubscriptionEventPayload` |
| `nerium.system.maintenance_scheduled` | `MaintenancePayload` |
| `nerium.system.budget_alert` | `BudgetAlertPayload` |
| `nerium.system.flag_updated` | `FlagUpdatedPayload` |

### 3.3 Payload shapes (selected)

```python
class MaDeltaPayload(BaseModel):
    session_id: str
    delta: str                                            # token text (may be empty on tool_use blocks)
    block_index: int
    model: str

class MaToolCallPayload(BaseModel):
    session_id: str
    tool_name: str
    tool_input_partial: str | None                        # aggregated input_json_delta chunks
    tool_use_id: str

class MaUsagePayload(BaseModel):
    session_id: str
    input_tokens: int
    output_tokens: int
    cache_read_tokens: int
    cache_write_tokens: int
    cost_usd: float

class MaDonePayload(BaseModel):
    session_id: str
    stop_reason: Literal["end_turn", "max_tokens", "stop_sequence", "tool_use"]
    total_duration_ms: int

class BudgetAlertPayload(BaseModel):
    tenant_id: str
    threshold_pct: Literal[50, 75, 90, 100]
    spent_usd_today: float
    cap_usd_today: float
    builder_disabled: bool
```

Remaining payload schemas defined in the agents that own the emit site (Kratos, Iapetus, Plutus, Moros, Hemera).

## 4. Interface / API Contract

### 4.1 WebSocket endpoint

```
GET wss://nerium.com/ws/realtime?ticket=<60s_jwt>
```

- Client obtains `ticket` via `POST /v1/realtime/ticket` (returns short-lived 60 s JWT EdDSA-signed with scope `realtime:*`). Browser cannot set Authorization header on WS, so query-param ticket is the only auth option.
- Server verifies ticket, binds connection to `user_id` derived from `sub` claim.
- Rooms subscription: client sends `{"op": "subscribe", "room": "<room>"}`. Rooms: `user:<user_id>` (auto-subscribed on connect), `session:<session_id>` (explicit subscribe), `tenant:<tenant_id>` (auto if role permits).
- Unsubscribe: `{"op": "unsubscribe", "room": "<room>"}`.
- Ping: server sends `{"op": "ping"}` every 25 s; client replies `{"op": "pong"}`. Missed pong > 60 s triggers server-side close 1001.

### 4.2 SSE endpoint template

```
GET /v1/<resource>/<id>/stream
Authorization: Bearer <jwt>
Accept: text/event-stream
Last-Event-ID: <last_seen_id>       # optional, for resume
```

Server responds `text/event-stream` + `Cache-Control: no-cache, no-transform` + `X-Accel-Buffering: no` (Caddy flush_interval -1). Per-resource endpoint defined in that resource's contract. MA stream at `/v1/ma/sessions/{id}/stream` per `ma_session_lifecycle.contract.md`.

### 4.3 Reconnection + resume

Client behavior:

1. On disconnect, wait exponential backoff: 1 s, 2 s, 4 s, ..., max 30 s, with ±25% jitter.
2. On reconnect, include `Last-Event-ID: <id>` header (SSE) or send `{"op": "resume", "last_event_id": <id>}` frame (WebSocket).
3. Server replays from Redis Stream `stream:ma:<session_id>` or `stream:notify:<user_id>` starting after `last_event_id`.
4. If `last_event_id` is before stream trim window (1 h MA, 24 h notify), server sends `nerium.system.stream_truncated` event + HTTP 410 on SSE; client must refetch state via GET `/v1/ma/sessions/{id}`.

### 4.4 Connection limits

- Per-user concurrent WebSocket connections: 5 default, raisable via Hemera flag `realtime.max_ws_per_user`.
- Per-user concurrent SSE streams: 3 default (MA session + notifications + admin).
- Connect attempt rate limit: 30 per minute per IP via Redis token bucket `rl:realtime:ip:<cidr24>`.
- Idle disconnect: 5 min no client message on WebSocket; SSE has no client-side messages so idle timeout replaced by 5-min heartbeat comment silence.

### 4.5 Ticket endpoint

```
POST /v1/realtime/ticket
Authorization: Bearer <jwt>  (full scope, not realtime ticket)

Response 200:
{
  "ticket": "<jwt_ed25519_60s>",
  "expires_in": 60,
  "ws_url": "wss://nerium.com/ws/realtime"
}
```

Ticket JWT claims: `iss=nerium.com`, `aud=wss://nerium.com/ws/realtime`, `sub=<user_id>`, `tenant_id`, `exp=now+60`, `scope="realtime:*"`. EdDSA signed by same key rotation as `oauth_dcr.contract.md` Section 3.2 (SEPARATE key pair optional post-hackathon).

## 5. Event Signatures

Connection lifecycle emitted to Selene:

| Event | Fields |
|---|---|
| `realtime.ws.connected` | `conn_id`, `user_id`, `ip`, `ua` |
| `realtime.ws.disconnected` | `conn_id`, `reason` (`client`, `server`, `timeout`, `error`), `duration_s` |
| `realtime.ws.message_received` | `conn_id`, `op`, `size_bytes` |
| `realtime.sse.connected` | `conn_id`, `user_id`, `resource`, `last_event_id` |
| `realtime.sse.completed` | `conn_id`, `duration_s`, `events_sent` |
| `realtime.resume.replayed` | `conn_id`, `from_event_id`, `events_replayed` |
| `realtime.resume.truncated` | `conn_id`, `requested_id`, `earliest_id` |
| `realtime.ticket.issued` | `user_id`, `ip` |
| `realtime.ticket.rejected` | `reason` |

## 6. File Path Convention

- WebSocket server: `src/backend/realtime/ws_server.py`
- SSE server helpers: `src/backend/realtime/sse_server.py`
- ConnectionManager: `src/backend/realtime/connection_manager.py`
- Ticket issuer: `src/backend/realtime/ticket.py`
- Resume replay: `src/backend/realtime/resume.py`
- Heartbeat tasks: `src/backend/realtime/heartbeat.py`
- Event envelope + payloads: `src/backend/realtime/events.py`, `payloads.py`
- Redis Stream wrappers: `src/backend/realtime/streams.py`
- Tests: `tests/realtime/test_ws_connect.py`, `test_sse_resume.py`, `test_heartbeat_timeout.py`, `test_connection_limits.py`

## 7. Naming Convention

- Event types: `nerium.<domain>.<action>` lowercase dot.
- WS operation names: `subscribe`, `unsubscribe`, `resume`, `ping`, `pong` lowercase.
- Room names: `<scope>:<id>` (`user:01926f..`, `session:01926f..`, `tenant:01926f..`).
- Redis stream keys: `stream:<domain>:<id>` matching `redis_session.contract.md` Section 3.2.
- SSE endpoint paths: `/v1/<resource>/<id>/stream` kebab plural resource.
- Payload interfaces: `<Domain><Action>Payload` PascalCase.

## 8. Error Handling

- Ticket expired: HTTP 401 `unauthorized` on ticket endpoint. WS server closes with code 4401 (custom) `"ticket_expired"`.
- Ticket wrong audience: WS close 4401 `"wrong_audience"`.
- Ticket reused after connect: WS close 4429 `"ticket_reused"` (server tracks used JTIs in Redis with TTL matching ticket expiry + 60 s).
- Room subscribe without permission: WS `{"op": "subscribe_error", "room": "<room>", "reason": "forbidden"}`; connection stays open.
- Unknown op: `{"op": "error", "reason": "unknown_op"}`.
- SSE resume with `Last-Event-ID` outside trim window: HTTP 410 `gone` with problem+json `stream_truncated`.
- Connection limit exceeded: HTTP 429 (SSE) or WS close 4429 (WebSocket) `"too_many_connections"`.
- Heartbeat timeout: server closes WebSocket 1001 (going away); client reconnects per Section 4.3.
- Redis pub/sub outage: degraded mode announced to all connected clients via `nerium.system.degraded_mode` event; new events buffered in memory per pod up to 1000 entries then dropped with `nerium.system.event_dropped` notification.

## 9. Testing Surface

- Ticket issuance + connect: `POST /v1/realtime/ticket` → WS connect succeeds within 60 s, auto-subscribed to `user:<user_id>` room.
- Ticket reuse blocked: second connect with same ticket returns close 4429.
- Ticket wrong audience: ticket issued for `wss://other.example.com/...`, WS reject.
- Heartbeat: client omits pong for 61 s, server closes.
- Reconnect resume: publish 5 events, disconnect, reconnect with `Last-Event-ID=2`, client receives events 3-5 from replay, then continues live.
- Stream trim: publish 11000 events, client reconnects with `Last-Event-ID=0`, server sends truncated event + HTTP 410.
- Connection limit: open 5 WS with same user, 6th rejected with 4429.
- Cross-pod fanout: publish from pod A, subscriber on pod B receives via Redis pub/sub `ws:broadcast:<room>`.
- Backpressure: slow client, server buffers up to 1 MB per connection, then disconnects with 4408 `"slow_consumer"`.
- CORS preflight on SSE: `OPTIONS /v1/ma/sessions/{id}/stream` returns allowed origins.

## 10. Open Questions

- WebSocket compression (permessage-deflate): enable or disable? Recommend enable, evaluate CPU trade-off post-launch.
- SSE vs WebSocket for MA streaming: both implemented; client choice. Tauri uses reqwest SSE (simpler); browser uses fetch-event-source SSE for POST streaming (WebSocket reserved for chat).
- Ticket key rotation: share `oauth_dcr.contract.md` key pair or independent? Recommend independent post-hackathon for blast radius isolation.

## 11. Post-Hackathon Refactor Notes

- Add WebSocket binary frame support for asset streaming (thumbnail uploads during typing).
- Client-side SharedWorker to dedupe WebSocket connections across tabs.
- Redis Streams consumer groups for exactly-once delivery on critical channels (billing events).
- Add typed TypeScript client SDK generated from Pydantic models via datamodel-code-generator.
- Multi-region presence: Redis Cluster or dedicated pub/sub broker (NATS JetStream) if cross-region latency matters.
- Replace 60 s ticket with short-lived (30 s) one-time password-like token to reduce replay window.
- Add `/metrics` Prometheus exposition for active connection count per room.
