# Feature Flag (Hemera)

**Contract Version:** 0.1.0
**Owner Agent(s):** Hemera (flag service authority, Postgres-backed, Redis 10 s cache, APScheduler TTL sweep, audit trigger)
**Consumer Agent(s):** Kratos (`builder.live` whitelist gate), Moros (auto-disable on budget cap), Crius (`vendor.<vendor>.disabled` + `vendor.chat.fallback_allowed`), Khronos (`mcp.rate_limit_override`), Plutus (`billing.live_mode_enabled`, `billing.price_id_map`), Eunomia (admin flag UI CRUD), Selene (flag value change emission), Phanes (`commerce.verified_take_rate`), Iapetus (`commerce.verified_take_rate`), ALL NP agents (any gated feature).
**Stability:** draft
**Last Updated:** 2026-04-24 (NP Wave 1, Pythia-v3 round 3)

## 1. Purpose

Defines the feature flag service powering NERIUM's critical-path gating: `builder.live` whitelist for judges + Ghaisan + demo account (per submission whitelist gate directive), cost cap auto-disable (Moros integration), vendor kill switches, pricing Stripe ID swap post-Atlas, circuit-breaker overrides, rate limit overrides. Custom Postgres-backed with audit trigger + Redis 10 s cache + APScheduler TTL sweep per M1 Section E.34 zero-dependency decision.

No LaunchDarkly, Unleash, PostHog flags, split.io, or Flagsmith. Single service for full audit control.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor, Section 3 Builder model flexibility demands user-side toggles)
- `CLAUDE.md` (root)
- `docs/phase_np/RV_NP_RESEARCH.md` (Section E.34 custom Postgres flag)
- `docs/phase_np/RV_NP_AGENT_STRUCTURE.md` (Section 4.15 Hemera)
- `docs/contracts/postgres_multi_tenant.contract.md` (tenant + user scoping)
- `docs/contracts/redis_session.contract.md` (flag cache key convention)

## 3. Schema Definition

### 3.1 Database tables

```sql
CREATE TABLE hemera_flag (
  flag_name     text PRIMARY KEY,
  default_value jsonb NOT NULL,                          -- `true|false|number|string|object|array`
  kind          text NOT NULL CHECK (kind IN ('boolean', 'number', 'string', 'object', 'array')),
  description   text,
  owner_agent   text,                                    -- informational: agent responsible
  tags          text[] NOT NULL DEFAULT '{}',            -- e.g., {'billing', 'budget', 'demo'}
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES app_user(id)
);

CREATE TABLE hemera_override (
  id            bigserial PRIMARY KEY,
  flag_name     text NOT NULL REFERENCES hemera_flag(flag_name) ON DELETE CASCADE,
  scope_kind    text NOT NULL CHECK (scope_kind IN ('user', 'tenant', 'global')),
  scope_id      uuid,                                    -- user_id or tenant_id; NULL for global
  value         jsonb NOT NULL,
  expires_at    timestamptz,
  reason        text,
  created_by    uuid REFERENCES app_user(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (flag_name, scope_kind, scope_id)
);
CREATE INDEX idx_override_expires ON hemera_override(expires_at) WHERE expires_at IS NOT NULL;

CREATE TABLE hemera_audit (
  id            bigserial PRIMARY KEY,
  actor_user_id uuid,
  flag_name     text NOT NULL,
  scope_kind    text,
  scope_id      uuid,
  action        text NOT NULL CHECK (action IN ('flag_created', 'flag_updated', 'flag_deleted', 'override_created', 'override_updated', 'override_deleted', 'override_expired')),
  old_value     jsonb,
  new_value     jsonb,
  reason        text,
  at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_flag_at ON hemera_audit(flag_name, at DESC);
```

Tables are GLOBAL (not tenant-scoped) since flags affect platform-wide behavior. `hemera_override.scope_id` + `scope_kind` encode per-user / per-tenant overrides.

### 3.2 Audit trigger

```sql
CREATE OR REPLACE FUNCTION hemera_audit_trigger() RETURNS trigger AS $$
DECLARE
  actor uuid := NULLIF(current_setting('hemera.actor_id', true), '')::uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO hemera_audit(actor_user_id, flag_name, scope_kind, scope_id, action, new_value)
    VALUES (actor, NEW.flag_name, NEW.scope_kind, NEW.scope_id, 'override_created', NEW.value);
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO hemera_audit(actor_user_id, flag_name, scope_kind, scope_id, action, old_value, new_value)
    VALUES (actor, NEW.flag_name, NEW.scope_kind, NEW.scope_id, 'override_updated', OLD.value, NEW.value);
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO hemera_audit(actor_user_id, flag_name, scope_kind, scope_id, action, old_value)
    VALUES (actor, OLD.flag_name, OLD.scope_kind, OLD.scope_id, 'override_deleted', OLD.value);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER hemera_override_audit
  AFTER INSERT OR UPDATE OR DELETE ON hemera_override
  FOR EACH ROW EXECUTE FUNCTION hemera_audit_trigger();
```

Similar trigger on `hemera_flag` for flag create/update/delete.

Caller writes `SET LOCAL hemera.actor_id = '<user_uuid>'` before flag mutations so audit captures the actor.

### 3.3 Default flags (seed)

Seed via `src/backend/db/seed/default_flags.sql`:

```sql
INSERT INTO hemera_flag(flag_name, default_value, kind, description, owner_agent, tags) VALUES
('builder.live', 'false'::jsonb, 'boolean', 'Gate for live Builder MA sessions. Whitelist judges + Ghaisan + demo.', 'kratos', '{demo, gate}'),
('ma.daily_budget_usd', '100'::jsonb, 'number', 'Per-tenant daily MA spend cap USD.', 'moros', '{budget}'),
('ma.max_concurrent_per_user', '3'::jsonb, 'number', 'Concurrent running/streaming sessions per user.', 'kratos', '{quota}'),
('ma.thinking_budget_default', '10000'::jsonb, 'number', 'Extended thinking budget tokens default.', 'kratos', '{quality}'),
('mcp.rate_limit_override', 'null'::jsonb, 'object', 'Override MCP per-token + per-IP rate limits. JSON {per_token_per_min, per_ip_per_min}.', 'khronos', '{demo}'),
('mcp.edge_allowlist_disabled', 'false'::jsonb, 'boolean', 'Bypass Cloudflare WAF allowlist for /mcp.', 'khronos', '{demo, security}'),
('oauth.dcr_enabled', 'true'::jsonb, 'boolean', 'Allow Dynamic Client Registration.', 'khronos', '{security}'),
('oauth.fallback_client_id', 'null'::jsonb, 'string', 'Pre-registered fallback client_id for Claude.ai.', 'khronos', '{fallback}'),
('vendor.openai.disabled', 'false'::jsonb, 'boolean', 'Disable OpenAI fallback.', 'crius', '{vendor}'),
('vendor.voyage.disabled', 'false'::jsonb, 'boolean', 'Disable Voyage embedding.', 'crius', '{vendor}'),
('vendor.chat.fallback_allowed', 'false'::jsonb, 'boolean', 'Permit cross-vendor chat fallback beyond Anthropic.', 'crius', '{anti_pattern_7}'),
('billing.live_mode_enabled', 'false'::jsonb, 'boolean', 'Enable Stripe live mode (pre-Atlas=false).', 'plutus', '{billing}'),
('billing.midtrans.production_enabled', 'false'::jsonb, 'boolean', 'Enable Midtrans production.', 'plutus', '{billing}'),
('billing.price_id_map', '{}'::jsonb, 'object', 'Stripe Price ID map per plan x interval.', 'plutus', '{billing}'),
('commerce.verified_take_rate', '0.15'::jsonb, 'number', 'Take rate for Verified creators.', 'iapetus', '{commerce}'),
('cors.allow_localhost', 'true'::jsonb, 'boolean', 'Allow localhost origin in dev.', 'aether', '{dev}'),
('docs.public', 'true'::jsonb, 'boolean', 'Expose /docs + /docs-swagger endpoints publicly.', 'aether', '{dev}'),
('search.pgvector_enabled', 'true'::jsonb, 'boolean', 'Enable semantic search branch.', 'hyperion', '{search}'),
('realtime.max_ws_per_user', '5'::jsonb, 'number', 'Max WebSocket connections per user.', 'nike', '{quota}'),
('system.maintenance_mode', 'false'::jsonb, 'boolean', 'Platform-wide maintenance.', 'eunomia', '{ops}');
```

Additional flags added per-feature via Alembic migration + seed insert.

## 4. Interface / API Contract

### 4.1 Evaluation semantics

```python
# src/backend/flags/service.py

async def get_flag(flag_name: str, user_id: UUID | None = None, tenant_id: UUID | None = None) -> Any:
    # Precedence (most specific first):
    # 1. User override (scope_kind='user', scope_id=user_id)
    # 2. Tenant override (scope_kind='tenant', scope_id=tenant_id)
    # 3. Global override (scope_kind='global', scope_id=NULL)
    # 4. Flag default_value

    cache_key = f"flag:{flag_name}:{user_id or 'none'}:{tenant_id or 'none'}"
    cached = await redis.get(cache_key)
    if cached is not None:
        return json.loads(cached)

    value = await _resolve_flag(flag_name, user_id, tenant_id)
    await redis.set(cache_key, json.dumps(value), ex=10)   # 10 s TTL
    return value
```

Cache TTL 10 s keeps flag change latency bounded. Urgent changes (e.g., `system.maintenance_mode`) publish to `flag:invalidate` Redis pub/sub for immediate cross-worker invalidation.

### 4.2 Endpoints

- `GET /v1/admin/flags`: list all flags with current effective values.
- `GET /v1/admin/flags/{flag_name}`: flag detail + override list.
- `POST /v1/admin/flags`: create flag (admin only).
- `PATCH /v1/admin/flags/{flag_name}`: update default_value / description / tags.
- `DELETE /v1/admin/flags/{flag_name}`: delete (cascades overrides).
- `POST /v1/admin/flags/{flag_name}/overrides`: create override. Body `{scope_kind, scope_id, value, expires_at, reason}`.
- `DELETE /v1/admin/flags/{flag_name}/overrides/{id}`: remove override.
- `GET /v1/admin/flags/{flag_name}/audit`: paginated audit trail.

Non-admin users may read their own effective flag values via `GET /v1/me/flags` (filtered to non-sensitive subset based on `hemera_flag.tags` includes `exposed_to_user`).

### 4.3 TTL sweep

Arq cron nightly at 00:00 UTC runs `hemera_ttl_sweep`:

```python
@arq_worker.cron("0 0 * * *")
async def hemera_ttl_sweep():
    async with tenant_scoped(pool, tenant_id=None) as conn:
        rows = await conn.fetch(
            "DELETE FROM hemera_override WHERE expires_at IS NOT NULL AND expires_at < now() RETURNING *"
        )
        for row in rows:
            await emit_audit('override_expired', row)
        await publish_cache_invalidation(distinct_flags_from(rows))
```

### 4.4 Cache invalidation broadcast

On any mutation via admin API, server publishes:

```
PUBLISH flag:invalidate '{"flag_names": ["builder.live", "ma.daily_budget_usd"]}'
```

All API pods subscribe and purge their Redis cache entries matching these flag names.

### 4.5 Submission whitelist seed

Pre-submission, admin bulk-inserts overrides:

```sql
INSERT INTO hemera_override(flag_name, scope_kind, scope_id, value, reason)
SELECT 'builder.live', 'user', u.id, 'true'::jsonb, 'whitelist_submission'
FROM app_user u WHERE u.email IN ('ghaisan@nerium.com', 'demo@nerium.com', /* judge emails */);
```

## 5. Event Signatures

Wire events:

| Event | Payload | Consumer |
|---|---|---|
| `nerium.system.flag_updated` | `{flag_name, scope_kind, scope_id, new_value, actor_user_id}` | Eunomia admin UI live view |
| `nerium.system.maintenance_mode_changed` | `{enabled, starts_at, message}` | All connected clients (broadcast via `system:maintenance` channel) |

Log:

| Event | Fields |
|---|---|
| `flag.evaluated` | `flag_name`, `user_id`, `tenant_id`, `value`, `cache_hit` (DEBUG only; high-volume) |
| `flag.updated` | `flag_name`, `actor_user_id`, `change_type` |
| `flag.override.created` | `flag_name`, `scope_kind`, `scope_id`, `expires_at` |
| `flag.override.expired` | `flag_name`, `scope_kind`, `scope_id`, `auto_expired_at` |
| `flag.cache.invalidated` | `flag_names`, `source` |

## 6. File Path Convention

- Flag service: `src/backend/flags/service.py`
- Override store: `src/backend/flags/override.py`
- Audit helper: `src/backend/flags/audit.py`
- TTL sweep: `src/backend/flags/ttl_sweep.py` (Arq task)
- Pub/sub invalidation: `src/backend/flags/invalidator.py`
- Admin router: `src/backend/routers/v1/admin/flags.py`
- User-facing router: `src/backend/routers/v1/me/flags.py`
- Migrations: `src/backend/db/migrations/XXX_hemera_flag.py`, `XXX_hemera_override.py`, `XXX_hemera_audit.py`, `XXX_hemera_audit_trigger.sql`
- Seed: `src/backend/db/seed/default_flags.sql`, `submission_whitelist_overrides.sql`
- Tests: `tests/flags/test_evaluation_precedence.py`, `test_cache_ttl.py`, `test_audit_trigger.py`, `test_ttl_sweep_cron.py`, `test_pubsub_invalidation.py`

## 7. Naming Convention

- Flag names: `<domain>.<subject>[.<modifier>]` dot-separated lowercase (`builder.live`, `vendor.openai.disabled`, `ma.daily_budget_usd`).
- Scope literals: `user`, `tenant`, `global`.
- Redis cache key: `flag:<name>:<user_id_or_none>:<tenant_id_or_none>`.
- Pub/sub channel: `flag:invalidate`.
- Audit actions: `<noun>_<verb>` snake lowercase.
- Tag values: single words, lowercase.

## 8. Error Handling

- Unknown flag: return Postgres miss; service returns `None`. Caller should treat `None` as flag-not-defined + use own default. Tests ensure all consumers pass a safe default.
- Cache miss + DB unavailable: return flag default_value if known from in-process map (bootstrapped at boot from Postgres); else return `None`.
- Override without expiry edit to set expiry in past: immediately swept on next cron; no special handling.
- Concurrent update race: last-write-wins via UPSERT; audit captures both via trigger.
- Evaluation high-volume (1000 rps+): cache hit ratio > 95% keeps DB load minimal. If ratio drops, increase TTL temporarily via Hemera `flag.cache_ttl_seconds` (meta-flag, default 10).
- Audit trigger failure (shouldn't happen but protection): override write fails with logged ERROR; explicit fix via `SET LOCAL hemera.skip_audit = true` + backfill manually (never use in prod).
- Actor id missing on mutation: audit records `actor_user_id=NULL`; API middleware sets from authenticated session cookie / JWT sub claim.

## 9. Testing Surface

- Precedence: user override 'true', tenant override 'false', global 'false', default 'false' → returns 'true'.
- Precedence fallthrough: no user override, tenant override 'true', global 'false' → returns 'true'.
- Fallback to default: no overrides → returns flag.default_value.
- Cache 10 s TTL: value changed in DB, get within 10 s returns stale, after 10 s returns fresh.
- Pub/sub invalidation: update override, all workers clear cache within 100 ms (measured).
- TTL sweep: override with `expires_at < now()` deleted, audit logs `override_expired`.
- Audit on create: actor_id captured, new_value recorded.
- Audit on update: old + new recorded.
- Audit on delete: old recorded.
- Submission whitelist seed: `builder.live` for whitelisted user returns 'true'.
- Non-whitelisted user: returns default 'false'.
- Concurrent eval 1000 rps: DB query rate < 100 rps (cache hit > 90%).
- Maintenance mode broadcast: change flag, all connected WS receive `nerium.system.maintenance_mode_changed` within 200 ms.

## 10. Open Questions

- Flag evaluation in frontend (Next.js RSC vs client hook): fetch via `GET /v1/me/flags` server-side + propagate via provider. Exposed flags subset tagged `exposed_to_user`.
- Flag rollout percentages (e.g., 10% of users see variant): post-hackathon; current system is all-or-nothing per override.
- Flag dependencies (flag A depends on flag B): out of scope; implement via override chain manually if needed.

## 11. Post-Hackathon Refactor Notes

- Percentage-based rollout (`rollout_percentage` column + deterministic hash of user_id → variant).
- A/B testing telemetry (emit `flag.variant_exposed` events to PostHog).
- Flag dependency graph with cycle detection.
- Flag lifecycle management (pending → active → deprecated → archived).
- Scheduled flag flips (activate at time T via Arq cron).
- Flag value schema validation (JSON Schema per flag kind).
- Approval workflow for production flag changes (two-person rule for sensitive flags like `billing.live_mode_enabled`).
- Metrics: flag eval latency per flag, cache hit ratio dashboard in Grafana.
- Integration with feature_flag SDKs on frontend (React hook `useFlag("builder.live")`).
