# Postgres Multi-Tenant

**Contract Version:** 0.1.0
**Owner Agent(s):** Aether (schema authority, RLS policy owner, asyncpg pool owner, Alembic migration framework)
**Consumer Agent(s):** ALL NP agents writing database tables (Phanes, Hyperion, Kratos, Nike, Plutus, Iapetus, Tethys, Crius, Astraea, Chione, Pheme, Hemera, Eunomia, Moros, Marshall). Selene for slow query capture. Nemea-RV-v2 for tenant-isolation E2E.
**Stability:** draft
**Last Updated:** 2026-04-24 (NP Wave 1, Pythia-v3 round 3)

## 1. Purpose

Defines the multi-tenant isolation strategy for NERIUM's Postgres 16 database. Pattern is shared schema + `tenant_id` column + Row-Level Security (RLS) as defense-in-depth. Application code filters by `tenant_id` at the query layer; RLS policies enforce isolation as a safety net if app code forgets. All tenant-scoped tables MUST follow the conventions here. Out-of-scope tables (public configuration, global registries) are explicitly flagged.

asyncpg raw + SQL queries + Pydantic v2 response models. No SQLAlchemy ORM. Alembic async for migrations. pgbouncer intentionally deferred post-hackathon.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor)
- `CLAUDE.md` (root)
- `docs/phase_np/RV_NP_RESEARCH.md` (Section A.5 FastAPI, A.6 multi-tenant)
- `docs/phase_np/RV_NP_AGENT_STRUCTURE.md` (Section 4.3 Aether)
- `docs/contracts/rest_api_base.contract.md` (TenantBindingMiddleware)
- `docs/contracts/redis_session.contract.md` (session ties to tenant_id)
- `docs/contracts/feature_flag.contract.md` (Hemera override per-tenant)

## 3. Schema Definition

### 3.1 Tenant + user

```sql
CREATE TABLE tenant (
  id            uuid PRIMARY KEY,
  name          text NOT NULL,
  slug          text UNIQUE NOT NULL,
  plan          text NOT NULL CHECK (plan IN ('free', 'solo', 'team', 'enterprise')),
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE app_user (
  id            uuid PRIMARY KEY,
  tenant_id     uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  email         citext UNIQUE NOT NULL,
  display_name  text NOT NULL,
  password_hash text,                                      -- NULL if OAuth-only
  is_superuser  boolean NOT NULL DEFAULT false,
  email_verified_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,                               -- soft delete
  purge_at      timestamptz                                -- 30 d post deletion
);

CREATE INDEX idx_app_user_tenant_id ON app_user(tenant_id);
CREATE INDEX idx_app_user_purge_at ON app_user(purge_at) WHERE purge_at IS NOT NULL;
```

`app_user` named instead of `user` to avoid the Postgres reserved word collision.

### 3.2 Tenant-scoped table convention

Every tenant-scoped table includes:

```sql
CREATE TABLE <entity> (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  ...
);

CREATE INDEX idx_<entity>_tenant_id ON <entity>(tenant_id);
CREATE INDEX idx_<entity>_tenant_created ON <entity>(tenant_id, created_at DESC);

ALTER TABLE <entity> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <entity> FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON <entity>
  USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
```

`FORCE ROW LEVEL SECURITY` applies RLS even to table owners (defense against service accounts with owner rights).

### 3.3 Global (non-tenant) tables

Explicit opt-out; these tables do NOT have `tenant_id`:

- `tenant` (root)
- `hemera_flag` (global default values per `feature_flag.contract.md`)
- `vendor_adapter_config` (global registry per `vendor_adapter.contract.md`)
- `oauth_client` (registered clients are global by DCR design)
- `system_event` (append-only audit log)

Each global table documents in a top-of-file comment: `-- GLOBAL (non-tenant-scoped) per postgres_multi_tenant.contract.md Section 3.3`.

### 3.4 Shared enums

```sql
CREATE TYPE user_status AS ENUM ('active', 'suspended', 'deleted');
CREATE TYPE tenant_plan AS ENUM ('free', 'solo', 'team', 'enterprise');
CREATE TYPE ledger_entry_type AS ENUM ('asset', 'liability', 'equity', 'revenue', 'expense');
CREATE TYPE direction AS ENUM ('D', 'C');                  -- debit / credit
CREATE TYPE key_status AS ENUM ('active', 'retiring', 'revoked');
CREATE TYPE ma_session_status AS ENUM (
  'queued', 'running', 'streaming', 'completed', 'cancelled', 'failed', 'budget_capped'
);
```

Per-pillar enum types are declared in the pillar's migration.

## 4. Interface / API Contract

### 4.1 Connection pool

```python
# src/backend/db/pool.py (Aether)

import asyncpg

async def create_pool(dsn: str) -> asyncpg.Pool:
    return await asyncpg.create_pool(
        dsn=dsn,
        min_size=2,
        max_size=20,
        command_timeout=30.0,
        statement_cache_size=100,
        server_settings={"application_name": "nerium-api"},
    )
```

- No pgbouncer at submission. If added post-submit, `statement_cache_size=0` required for transaction-mode pooling compatibility.
- Connection lifespan bound to FastAPI `lifespan` context.

### 4.2 Tenant binding helper

```python
# src/backend/db/tenant.py

from contextlib import asynccontextmanager

@asynccontextmanager
async def tenant_scoped(pool: asyncpg.Pool, tenant_id: UUID):
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute("SET LOCAL app.tenant_id = $1", str(tenant_id))
            yield conn
```

- `SET LOCAL` scopes the setting to the transaction; no connection bleed between requests.
- Called by `TenantBindingMiddleware` on every authenticated request.
- `current_setting('app.tenant_id', true)` returns empty string if unset; RLS policies treat empty as no-match (deny-by-default).

### 4.3 Superuser escape hatch

Migrations + admin tools need to bypass RLS. Pattern:

```sql
-- Connection as postgres or migration user (BYPASSRLS granted):
SET ROLE nerium_migration;                                 -- has BYPASSRLS
-- execute schema change
```

Created roles:

- `nerium_api` (app user, NO BYPASSRLS, LOGIN)
- `nerium_migration` (BYPASSRLS, LOGIN, used only by Alembic)
- `nerium_admin` (NO BYPASSRLS, admin panel uses regular RLS but may switch `app.tenant_id` per impersonation session)

### 4.4 Migration conventions

- Alembic async. Revision IDs `XXX_snake_case_description.py` with zero-padded 3-digit index.
- Schema changes only in migrations; no runtime `CREATE TABLE`.
- RLS policy added in same migration as the table (atomic).
- Down-revision MUST be complete and tested. Irreversible migrations require `raise NotImplementedError("irreversible, restore from backup")` with a README note.
- No `DROP COLUMN` without 2-phase (deprecate release → drop release).

## 5. Event Signatures

Handled via Selene `db.*` structured log channel:

| Event | Fields |
|---|---|
| `db.query.slow` | `query_hash`, `duration_ms`, `tenant_id`, `rows_returned` (emitted when > 500 ms) |
| `db.rls.violation_attempted` | `tenant_id_session`, `tenant_id_target`, `table_name`, `user_id` (emitted on RLS deny) |
| `db.migration.applied` | `revision_id`, `direction` (up/down), `duration_s` |
| `db.pool.saturated` | `pool_name`, `max_size`, `acquire_wait_ms` (emitted when acquire waits > 100 ms) |

OTel trace spans per query via `opentelemetry-instrumentation-asyncpg`.

## 6. File Path Convention

- Pool factory: `src/backend/db/pool.py`
- Tenant binding: `src/backend/db/tenant.py`
- RLS helper: `src/backend/db/rls.py`
- Migrations: `src/backend/db/migrations/versions/XXX_*.py`
- Alembic env: `src/backend/db/migrations/env.py`
- Seed data: `src/backend/db/seed/<domain>.sql`
- Per-pillar query modules: `src/backend/<pillar>/queries.py`
- Tests: `tests/db/test_rls_isolation.py`, `test_tenant_binding.py`, `test_migration_up_down.py`

## 7. Naming Convention

- Table names: `snake_case` singular (`tenant`, `ma_session`, `marketplace_listing`). Exception: reserved words add `app_` prefix (`app_user`).
- Column names: `snake_case`.
- Index names: `idx_<table>_<columns>` or `idx_<table>_<columns>_partial` when conditional.
- Enum type names: `<entity>_<attribute>` (`ma_session_status`, `key_status`).
- Policy names: `tenant_isolation` (primary), `public_read` (if exposed), `owner_write`.
- Role names: `nerium_<role>`.
- Constraint names: `<table>_<column>_check`, `<table>_<column>_fk`.

## 8. Error Handling

- RLS policy denies a write: asyncpg raises `ForeignKeyViolationError` or `CheckViolationError` depending on path; app layer converts to HTTP 403 `tenant_isolation_violation` per `rest_api_base.contract.md` Section 3.2 slug registry.
- `tenant_id` missing from `SET LOCAL`: policy evaluates `false`, read returns 0 rows, write rejected. App layer converts to HTTP 500 `internal_error` (indicates TenantBindingMiddleware bug, not user error).
- Unique constraint violation on `slug` or `email`: HTTP 409 `conflict`.
- Pool saturation (acquire timeout > 30 s): HTTP 503 `service_unavailable`.
- Migration failure in prod: rollback via prior revision; committed README note instructs restore from `pg_dump` backup if migration corrupted schema.
- Connection lost mid-transaction: asyncpg raises `ConnectionDoesNotExistError`; request retried by client with exponential backoff.

## 9. Testing Surface

- RLS happy path: session bound `app.tenant_id = A`, query `SELECT * FROM marketplace_listing` returns only A's rows.
- RLS cross-tenant read: session bound A, query for known B listing id returns 0 rows.
- RLS cross-tenant write: session bound A, insert `tenant_id = B` rejected with CheckViolation.
- `app.tenant_id` unset: read returns 0 rows (deny-by-default).
- Superuser migration: role `nerium_migration` with BYPASSRLS applies `CREATE POLICY` and later `DROP POLICY` without session binding required.
- Connection bleed: request A completes, next request B on same connection `current_setting('app.tenant_id')` returns B's value (SET LOCAL scoped to transaction).
- Pool saturation: spawn 25 concurrent tenant-scoped queries, 5 wait, no deadlock, timeout at 30 s surfaces as `db.pool.saturated` log.
- Migration up + down: every committed revision survives `alembic upgrade head && alembic downgrade -1 && alembic upgrade head`.
- Soft delete cascade: `app_user.deleted_at` set, RLS policy still returns the row for admin queries (uses BYPASSRLS role), hidden from regular tenant queries.

## 10. Open Questions

- Tenant isolation on search indexes (GIN + pgvector ivfflat): RLS works at SELECT time but index vacuum must be aware. Recommend per-tenant partitioning if listing count exceeds 100k per tenant (post-hackathon).
- Connection pool size 20: sufficient for single-box CX32 submission scale. Monitor `db.pool.saturated` rate in first week post-launch.
- App-level tenant filter redundancy: every query includes `WHERE tenant_id = $1` even with RLS. Defense-in-depth per M1 recommendation.

## 11. Post-Hackathon Refactor Notes

- Add pgbouncer transaction mode with `statement_cache_size=0` when concurrency exceeds 100 rps.
- Partition large tables by `tenant_id` (hash) once a single tenant exceeds 10% of total row count.
- Add `pg_stat_statements` monitoring + slow query alerts via Grafana Cloud.
- Introduce schema-per-enterprise-tenant option for compliance-sensitive customers (defaults to shared, opt-in to schema isolation at plan tier).
- WAL archive to Cloudflare R2 for Point-in-Time Recovery; currently daily pg_dump suffices.
- Add read replicas on Hetzner side box for analytics query offload.
- Migrate to Postgres 17 when released and stable.
- Formalize tenant deletion workflow: cascade guarantees via explicit purge job to handle global tables that reference tenant artifacts.
