# NERIUM Database Layer

Owner: Aether (W1 FastAPI production core). Consumers: every NP agent that
writes or reads Postgres. This README is the authoritative how-to for
applying the shared schema plus Row-Level Security pattern declared in
`docs/contracts/postgres_multi_tenant.contract.md`.

## Stack lock

- Postgres 16, self-hosted on Hetzner CX32 for submission.
- asyncpg raw. No SQLAlchemy ORM. SQLAlchemy Core is allowed only for
  complex joins and only after the FastAPI endpoint already uses
  asyncpg-style row access. See `CLAUDE.md` anti-pattern 7 spirit.
- Alembic async for schema migrations. Revision files live under
  `src/backend/db/migrations/versions/` with zero-padded three-digit
  prefixes and snake_case descriptions.
- pgbouncer deferred post-hackathon per M1 Section A.6.

## Roles

Three roles are created by migration `000_baseline` and referenced by
every downstream migration:

| Role              | Login  | BYPASSRLS | Purpose                                                   |
| ----------------- | ------ | --------- | --------------------------------------------------------- |
| nerium_api        | yes    | no        | FastAPI connection pool, subject to RLS enforcement.      |
| nerium_migration  | yes    | yes       | Alembic runs. Used ONLY by the migration script.          |
| nerium_admin      | yes    | no        | SQLAdmin dashboard. RLS still applies, impersonation uses `SET LOCAL app.tenant_id` per session. |

Password hashes live outside the repo. Production credentials are
provisioned manually via the CX32 setup script documented in
`ops/` (Selene + Eunomia own that track).

## Multi-tenant isolation pattern

Every tenant-scoped table MUST include:

```sql
CREATE TABLE <entity> (
    id         uuid PRIMARY KEY,
    tenant_id  uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    -- entity-specific columns
);
CREATE INDEX idx_<entity>_tenant_id ON <entity>(tenant_id);
CREATE INDEX idx_<entity>_tenant_created ON <entity>(tenant_id, created_at DESC);
```

Then apply the canonical RLS policy via the helper in
`src/backend/db/rls.py`:

```python
from alembic import op
from src.backend.db.rls import enable_tenant_rls, grant_app_role_crud

def upgrade() -> None:
    op.execute("""
        CREATE TABLE <entity> (
            id uuid PRIMARY KEY,
            tenant_id uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
            -- ...
        );
    """)
    op.execute("CREATE INDEX idx_<entity>_tenant_id ON <entity>(tenant_id)")
    op.execute("CREATE INDEX idx_<entity>_tenant_created ON <entity>(tenant_id, created_at DESC)")
    for stmt in enable_tenant_rls("<entity>"):
        op.execute(stmt)
    for stmt in grant_app_role_crud("<entity>"):
        op.execute(stmt)
```

The policy body is always identical. Do NOT hand-roll a different policy
name or USING clause. The helper enforces:

- Policy name: `tenant_isolation`.
- USING + WITH CHECK clauses both read
  `current_setting('app.tenant_id', true)::uuid`.
- FORCE ROW LEVEL SECURITY so table owners are also subject to the
  policy.

### Global (non-tenant) tables

A small set of tables are platform-wide and opt out of RLS. Per the
contract Section 3.3:

- `tenant`
- `hemera_flag`
- `vendor_adapter_config`
- `oauth_client`
- `system_event`

Each such table declares a top-of-file comment:
`-- GLOBAL (non-tenant-scoped) per postgres_multi_tenant.contract.md Section 3.3`.

Do NOT apply `enable_tenant_rls` to these tables.

## Runtime tenant binding

The app binds `app.tenant_id` on every authenticated request. Session 2
will land `TenantBindingMiddleware`; in the meantime consumer code uses
the helper directly:

```python
from uuid import UUID
from src.backend.db import get_pool, tenant_scoped

async def list_listings(tenant_id: UUID):
    async with tenant_scoped(get_pool(), tenant_id) as conn:
        rows = await conn.fetch(
            "SELECT id, title, created_at FROM marketplace_listing "
            "ORDER BY created_at DESC LIMIT 20"
        )
        return [dict(row) for row in rows]
```

`SET LOCAL` scopes the binding to the wrapping transaction. No bleed
between requests because the transaction ends when the `async with`
block exits.

### Superuser impersonation

Admin tools use the `nerium_admin` role but still need to see rows
across tenants. The pattern (consumed by Eunomia, W2) is:

```python
async with nerium_admin_pool.acquire() as conn:
    async with conn.transaction():
        await conn.execute("SET LOCAL app.tenant_id = $1", str(target_tenant))
        # RLS now treats this session as the target tenant
        ...
```

Never use the `nerium_migration` BYPASSRLS role for runtime queries.

## Migrations

Conventions:

- Filename: `NNN_snake_case_description.py`, zero-padded three digits.
- Every migration has a complete `downgrade()`. Irreversible exceptions
  document themselves and raise `NotImplementedError`.
- RLS policy ships in the same migration as the table.
- No `DROP COLUMN` without a two-phase deprecation (Phase 1: ignore the
  column; Phase 2: drop in a later release).

Commands:

```bash
# Apply all pending migrations
alembic -c src/backend/db/migrations/alembic.ini upgrade head

# Create a new revision
alembic -c src/backend/db/migrations/alembic.ini revision -m "descriptive name"

# Roll back one
alembic -c src/backend/db/migrations/alembic.ini downgrade -1
```

Aether ships the baseline migration and the four core tables
(`tenant`, `app_user`, `quest_progress`, `inventory`) in Session 3.
Every other table is owned by its respective agent:

- `marketplace_listing`, `marketplace_*` : Phanes, Hyperion, Iapetus.
- `ma_session`, `ma_event`, `ma_step` : Kratos.
- `ledger_*` : Plutus.
- `trust_score_*` : Astraea.
- `agent_identity` : Tethys.
- `vendor_adapter_config` : Crius.
- `file_storage_manifest` : Chione.
- `hemera_*` : Hemera.
- `ws_*` : Nike.

## Testing

See `tests/backend/` for the pytest suite. Session 1 ships:

- `test_lifespan.py` app factory starts and stops cleanly.
- `test_uuid7.py` version bits, variant bits, monotonicity.

Session 2 adds:

- `test_rls_isolation.py` cross-tenant read + write rejected.
- `test_cursor_pagination.py` round-trip cursor stable.
- `test_problem_json.py` error envelope shape.

Consumer agents that author migrations MUST also add:

- An insert + select round trip under `tenant_scoped`.
- A cross-tenant read returning zero rows.
- An `alembic upgrade head && alembic downgrade -1 && alembic upgrade head`
  cycle.
