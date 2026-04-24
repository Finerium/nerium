"""baseline: extensions, roles, tenant, app_user, RLS scaffolding

Revision ID: 000_baseline
Revises:
Create Date: 2026-04-24 15:55:00.000000

Author: Aether (W1 FastAPI core, NP phase Session 1)
Contract refs:
    - docs/contracts/postgres_multi_tenant.contract.md Section 3.1 tenant + app_user
    - docs/contracts/postgres_multi_tenant.contract.md Section 3.4 shared enums
    - docs/contracts/postgres_multi_tenant.contract.md Section 4.3 roles

Scope
-----
Installs the foundation that every downstream migration relies on:

1. ``CREATE EXTENSION`` for ``pgcrypto`` (gen_random_uuid), ``citext``
   (case-insensitive email), ``pg_trgm`` (trigram index for search).
2. Three NERIUM roles via :func:`bootstrap_roles_sql` helper.
3. Shared enum types (``tenant_plan``, ``user_status``, ``key_status``,
   ``direction``, ``ledger_entry_type``, ``ma_session_status``).
4. Global ``tenant`` table (not RLS-scoped per contract Section 3.3).
5. Tenant-scoped ``app_user`` table with the canonical RLS policy.

Downstream tables (quest_progress, inventory, marketplace_listing, ...) are
shipped in later revisions. This baseline is the single source of truth for
the role hierarchy and the tenant column convention.
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

from src.backend.db.rls import (
    bootstrap_roles_sql,
    enable_tenant_rls,
    grant_app_role_crud,
)

# revision identifiers, used by Alembic.
revision: str = "000_baseline"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ---- Extensions -----------------------------------------------------
    # pgcrypto provides gen_random_uuid(); we still generate UUID v7 in
    # application code, but migrations may use gen_random_uuid() as a
    # temporary default until a trigger is installed in later sessions.
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")
    op.execute("CREATE EXTENSION IF NOT EXISTS citext")
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    # ---- Roles ----------------------------------------------------------
    for ddl in bootstrap_roles_sql():
        op.execute(ddl)

    # ---- Shared enums ---------------------------------------------------
    op.execute(
        """
        DO $$ BEGIN
          CREATE TYPE tenant_plan AS ENUM ('free', 'solo', 'team', 'enterprise');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$
        """
    )
    op.execute(
        """
        DO $$ BEGIN
          CREATE TYPE user_status AS ENUM ('active', 'suspended', 'deleted');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$
        """
    )
    op.execute(
        """
        DO $$ BEGIN
          CREATE TYPE key_status AS ENUM ('active', 'retiring', 'revoked');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$
        """
    )
    op.execute(
        """
        DO $$ BEGIN
          CREATE TYPE direction AS ENUM ('D', 'C');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$
        """
    )
    op.execute(
        """
        DO $$ BEGIN
          CREATE TYPE ledger_entry_type AS ENUM ('asset', 'liability', 'equity', 'revenue', 'expense');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$
        """
    )
    op.execute(
        """
        DO $$ BEGIN
          CREATE TYPE ma_session_status AS ENUM (
            'queued', 'running', 'streaming', 'completed', 'cancelled', 'failed', 'budget_capped'
          );
        EXCEPTION WHEN duplicate_object THEN null;
        END $$
        """
    )

    # ---- tenant table (GLOBAL, no RLS) ----------------------------------
    # GLOBAL (non-tenant-scoped) per postgres_multi_tenant.contract.md Section 3.3
    op.execute(
        """
        CREATE TABLE tenant (
            id         uuid PRIMARY KEY,
            name       text NOT NULL,
            slug       text UNIQUE NOT NULL,
            plan       text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'solo', 'team', 'enterprise')),
            status     text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
            metadata   jsonb NOT NULL DEFAULT '{}'::jsonb,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX idx_tenant_slug ON tenant(slug)")
    op.execute("CREATE INDEX idx_tenant_status ON tenant(status)")
    # App role may read tenant to resolve slugs; write is admin-only but we
    # grant SELECT+INSERT here and let migrations clamp later if needed.
    op.execute("GRANT SELECT, INSERT, UPDATE ON TABLE tenant TO nerium_api")

    # ---- app_user table (tenant-scoped, RLS enforced) -------------------
    op.execute(
        """
        CREATE TABLE app_user (
            id                uuid PRIMARY KEY,
            tenant_id         uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
            email             citext NOT NULL,
            display_name      text NOT NULL,
            password_hash     text,
            is_superuser      boolean NOT NULL DEFAULT false,
            email_verified_at timestamptz,
            created_at        timestamptz NOT NULL DEFAULT now(),
            updated_at        timestamptz NOT NULL DEFAULT now(),
            deleted_at        timestamptz,
            purge_at          timestamptz
        )
        """
    )
    op.execute("CREATE UNIQUE INDEX idx_app_user_email ON app_user(email)")
    op.execute("CREATE INDEX idx_app_user_tenant_id ON app_user(tenant_id)")
    op.execute(
        "CREATE INDEX idx_app_user_tenant_created ON app_user(tenant_id, created_at DESC)"
    )
    op.execute(
        "CREATE INDEX idx_app_user_purge_at ON app_user(purge_at) WHERE purge_at IS NOT NULL"
    )

    for stmt in enable_tenant_rls("app_user"):
        op.execute(stmt)
    for stmt in grant_app_role_crud("app_user"):
        op.execute(stmt)


def downgrade() -> None:
    # Drop in reverse dependency order. Do NOT drop extensions or roles in
    # downgrade: those are shared infra and removing them would break other
    # schemas that might coexist on the same cluster.
    op.execute("DROP TABLE IF EXISTS app_user CASCADE")
    op.execute("DROP TABLE IF EXISTS tenant CASCADE")
    op.execute("DROP TYPE IF EXISTS ma_session_status")
    op.execute("DROP TYPE IF EXISTS ledger_entry_type")
    op.execute("DROP TYPE IF EXISTS direction")
    op.execute("DROP TYPE IF EXISTS key_status")
    op.execute("DROP TYPE IF EXISTS user_status")
    op.execute("DROP TYPE IF EXISTS tenant_plan")
