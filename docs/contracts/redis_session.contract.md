# Redis Session + Cache + Rate Limit + Pub/Sub

**Contract Version:** 0.1.0
**Owner Agent(s):** Aether (Redis 7 pool owner, ACL partitioning, Lua script registry). Nike co-owner for pub/sub fanout (`realtime_bus.contract.md`).
**Consumer Agent(s):** ALL NP agents. Khronos for MCP rate limit. Kratos for MA session cache. Nike for WebSocket connection registry. Plutus for idempotency store. Hemera for flag value cache. Moros for budget cap flag. Selene for metric buffering. Eunomia for admin impersonation sessions.
**Stability:** draft
**Last Updated:** 2026-04-24 (NP Wave 1, Pythia-v3 round 3)

## 1. Purpose

Defines the Redis 7 namespace, ACL partitioning, key conventions, TTL policies, Lua script registry, and pub/sub channel taxonomy for NERIUM. Redis is self-hosted on the same Hetzner CX32 box as FastAPI (sub-millisecond latency, no network egress). AOF `appendfsync everysec` + daily RDB for durability. Portable Lua scripts allow migration to Upstash if ever needed.

No Memcached, no KeyDB, no DragonflyDB. Redis 7 native only.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor)
- `CLAUDE.md` (root)
- `docs/phase_np/RV_NP_RESEARCH.md` (Section A.7 Redis, A.8 Arq, A.9 WebSocket, D.25 rate limit)
- `docs/phase_np/RV_NP_AGENT_STRUCTURE.md` (Section 4.3 Aether, 4.7 Nike, 4.18 Moros)
- `docs/contracts/rest_api_base.contract.md` (rate limit headers)
- `docs/contracts/realtime_bus.contract.md` (pub/sub channel usage)

## 3. Schema Definition

### 3.1 ACL partitioning

Three service users, each scoped to a key prefix subset:

```
USER app      on >nerium_app_pw      ~api:*  ~sess:*  ~rl:*  ~idemp:*  +@all
USER worker   on >nerium_worker_pw   ~jobs:* ~arq:*                     +@all
USER mcp      on >nerium_mcp_pw      ~mcp:*  ~rl:mcp:*                  +@read +@write
```

- `app` user: API pods (read/write everywhere except `jobs:*`/`arq:*`).
- `worker` user: Arq background workers (read/write `jobs:*`/`arq:*`).
- `mcp` user: MCP server if run as separate process (not used at submission since FastMCP is mounted; reserved for Khronos fallback standalone process).

Default user disabled: `ACL SETUSER default off`.

### 3.2 Key namespace conventions

| Prefix | Purpose | TTL default |
|---|---|---|
| `sess:<token>` | NERIUM session cookie data | 30 d |
| `cache:<entity>:<id>` | Application cache layer | 60 s to 1 h per entity |
| `rl:<bucket>:<identity>` | Rate limit token bucket state | bucket size seconds |
| `idemp:<user_id>:<key>` | Idempotency result cache | 24 h |
| `oauth:code:<code>` | Authorization code short-lived | 60 s |
| `oauth:refresh:<hash>` | Refresh token family lookup | 30 d |
| `mcp:session:<id>:cursor` | MCP session resume cursor | 15 min |
| `flag:<name>` | Hemera flag value cache | 10 s |
| `chronos:ma_capped` | Budget daemon cap flag | no TTL (explicit set/unset) |
| `chronos:tenant:<id>:usd_today` | Per-tenant daily spend counter | rollover at UTC 00:00 |
| `jobs:arq:*` | Arq job queue (library-managed) | Arq-owned |
| `ws:conn:<user_id>` | WebSocket connection registry | no TTL (explicit cleanup on disconnect) |
| `stream:ma:<session_id>` | Redis Stream for MA event replay | 1 h, `MAXLEN ~ 10000` |
| `stream:notify:<user_id>` | Notification delivery stream | 24 h |

### 3.3 Persistence

- AOF mode: `appendonly yes`, `appendfsync everysec` (1-second durability window).
- Daily RDB snapshot via `save 86400 1` + cron `redis-cli BGSAVE` at 02:00 UTC.
- Snapshot to Cloudflare R2 via rclone nightly.

### 3.4 Memory limit

- `maxmemory 4gb` on CX32 (8 GB RAM, leave headroom for Postgres + FastAPI + Caddy + GlitchTip).
- `maxmemory-policy allkeys-lru` for non-critical keys; critical keys (`sess:*`, `oauth:*`, `chronos:*`) persist-first via `noeviction` on specific keys (enforced by NOT exceeding their TTL budget).

## 4. Interface / API Contract

### 4.1 Connection

```python
# src/backend/redis/pool.py

import redis.asyncio as redis

def create_client() -> redis.Redis:
    return redis.from_url(
        settings.redis_url,
        decode_responses=True,
        max_connections=50,
        socket_keepalive=True,
        health_check_interval=30,
    )
```

- Connection URL: `redis://:nerium_app_pw@localhost:6379/0` (local) or `rediss://` on remote TLS if ever offloaded.
- decode_responses=True: strings returned as `str`, not `bytes`. Exception: Stream entries with binary payloads (`decode_responses=False` for the dedicated stream client).

### 4.2 Rate limit Lua script

```lua
-- src/backend/rate_limit/token_bucket.lua
-- KEYS[1] = bucket key
-- ARGV[1] = max tokens, ARGV[2] = refill per sec, ARGV[3] = now (ms), ARGV[4] = cost

local max = tonumber(ARGV[1])
local refill = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local cost = tonumber(ARGV[4])

local state = redis.call('HMGET', KEYS[1], 'tokens', 'last_refill_ms')
local tokens = tonumber(state[1]) or max
local last = tonumber(state[2]) or now

local elapsed = (now - last) / 1000.0
tokens = math.min(max, tokens + elapsed * refill)

if tokens < cost then
  redis.call('HSET', KEYS[1], 'tokens', tokens, 'last_refill_ms', now)
  redis.call('EXPIRE', KEYS[1], math.ceil(max / refill) + 60)
  return {0, tokens, math.ceil((cost - tokens) / refill)}
end

tokens = tokens - cost
redis.call('HSET', KEYS[1], 'tokens', tokens, 'last_refill_ms', now)
redis.call('EXPIRE', KEYS[1], math.ceil(max / refill) + 60)
return {1, tokens, 0}
```

Return: `[allowed 0|1, remaining_tokens, retry_after_seconds]`. Atomic, single round trip. Used by Khronos (`rl:mcp:*`), general API middleware (`rl:api:*`), and Moros (`rl:tenant:*`).

### 4.3 Session store

```python
# src/backend/auth/session.py

async def create_session(user_id: UUID, ttl_seconds: int = 30 * 24 * 3600) -> str:
    token = secrets.token_urlsafe(48)
    key = f"sess:{token}"
    await redis.hset(key, mapping={
        "user_id": str(user_id),
        "created_at": datetime.utcnow().isoformat(),
        "ip": request.client.host,
        "ua": request.headers.get("user-agent", "")[:200],
    })
    await redis.expire(key, ttl_seconds)
    return token
```

Session cookie: `nerium_session=<token>`, `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age=2592000`. Cookie name `nerium_session` (not `session` to avoid framework collision).

### 4.4 Pub/Sub channels

| Channel | Publisher | Subscriber | Purpose |
|---|---|---|---|
| `notify:user:<user_id>` | Kratos, Iapetus, Pheme | Nike WebSocket ConnectionManager | Per-user realtime notifications |
| `ws:broadcast:<room>` | Nike | Nike (fanout across ConnectionManager instances) | Cross-worker broadcast |
| `ma:event:<session_id>` | Kratos | Nike SSE proxy | MA session streaming events |
| `flag:invalidate` | Hemera | All API pods | Flag cache invalidation |
| `system:maintenance` | Eunomia | All pods | Maintenance mode toggle |

Redis Streams supplement pub/sub for durable replay (`stream:ma:<session_id>`).

## 5. Event Signatures

Structured log via Selene:

| Event | Fields |
|---|---|
| `redis.command.slow` | `command`, `key_prefix`, `duration_ms` (emitted when > 50 ms) |
| `redis.eviction.triggered` | `evicted_keys`, `policy` |
| `redis.conn.saturated` | `pool_name`, `max_connections`, `wait_ms` |
| `redis.pub.delivered` | `channel`, `subscriber_count`, `payload_bytes` |
| `rate_limit.denied` | `bucket`, `identity`, `retry_after_s` |

## 6. File Path Convention

- Pool factory: `src/backend/redis/pool.py`
- Session helper: `src/backend/auth/session.py`
- Rate limit wrapper: `src/backend/rate_limit/redis_limiter.py`
- Lua scripts: `src/backend/rate_limit/token_bucket.lua` (rate limit), `src/backend/redis/scripts/<name>.lua`
- Pub/sub helpers: `src/backend/redis/pubsub.py`
- Stream helpers: `src/backend/redis/streams.py`
- Idempotency store: `src/backend/middleware/idempotency.py`
- ACL setup: `ops/redis/acl.conf`
- Tests: `tests/redis/test_token_bucket.py`, `test_session_ttl.py`, `test_pubsub_fanout.py`, `test_stream_replay.py`

## 7. Naming Convention

- Key prefixes: lowercase kebab or snake (`rl:`, `sess:`, `oauth:code:`, `cache:listing:`).
- Lua script filenames: `snake_case.lua`.
- Pub/sub channels: `<domain>:<subject>:<id>` dotless lowercase.
- Stream names: `stream:<domain>:<id>`.
- ACL user names: `app`, `worker`, `mcp` (short).
- Hash field names inside keys: `snake_case`.

## 8. Error Handling

- Connection lost: redis-py auto-reconnects with exponential backoff. API request returns HTTP 503 `service_unavailable` if retry exhausted within 5 s.
- Memory full (OOM despite LRU): application degrades gracefully. Rate limit: fail open (allow request, log `redis.oom.fail_open`). Session: fail closed (force re-login).
- Lua script load failure: retry `EVAL` with inline script, log at ERROR.
- Stream `MAXLEN` trimming: silent. If consumer needs older entries than trimmed window, return HTTP 410 `gone` in `/v1/ma/sessions/{id}/stream` with resume hint.
- Pub/sub message lost (zero subscribers or subscriber disconnected mid-publish): no guarantee. Durable delivery uses Stream, not Pub/Sub.
- ACL permission denied: server-side NOPERM response, logged as security event.

## 9. Testing Surface

- ACL enforcement: `app` user attempts `SET jobs:test 1`: NOPERM error.
- Token bucket burst: 61 calls in 60 s against 60-token bucket returns 429 on call 61 with correct `Retry-After`.
- Token bucket refill: wait N seconds, remaining tokens increases proportionally up to max.
- Session TTL: create session, sleep 30 d simulated, key absent, cookie no longer authenticates.
- Pub/sub fanout: subscribe from two Python clients, publish one message, both receive.
- Stream replay: publish 20 entries, consume with `XREAD` from beginning, all 20 returned in order.
- Stream MAXLEN trim: write 11000 entries, `XLEN` returns approx 10000, oldest evicted.
- Cache invalidation: Hemera publishes `flag:invalidate` with flag name, downstream API pod clears its local cache within 1 s.
- Lua script atomicity: concurrent 100 calls race-condition safe, sum of allowed + denied equals call count.
- Pool exhaustion: 51 concurrent commands with pool of 50 returns 51st command waiting, no deadlock.

## 10. Open Questions

- Multi-AZ Redis: single-box submission. Replication via Redis Sentinel or Redis Cluster deferred post-hackathon.
- Upstash migration path: Lua script portability verified; connection URL swap is the only config change.
- `chronos:ma_capped` flag loss on Redis restart: pre-submit hypothetical. Moros re-derives state from Admin Usage API every 5 min so flag self-heals within 5 min. Acceptable.

## 11. Post-Hackathon Refactor Notes

- Add Redis Cluster once vertical scale on CX32 exhausts.
- Migrate pub/sub to Redis Streams with consumer groups for exactly-once semantics on critical channels (billing, MA completion).
- Add Bloom filter module (`RedisBloom`) for email deduplication + abuse detection on Marketplace publish.
- Rate limiter tiering per subscription plan (free: 30 rpm, solo: 120 rpm, team: 600 rpm, enterprise: custom).
- Client-side cache stamping with `CLIENT TRACKING` for high-read keys (Hemera flags).
- Formalize Redis ACL rotation cron (30-day password rotation matching JWT key rotation cadence per `oauth_dcr.contract.md`).
- Consider Redis module `RedisJSON` if MA session record volume exceeds hash-based patterns.
