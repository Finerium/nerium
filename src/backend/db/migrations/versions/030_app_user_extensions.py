"""app_user column extensions + shared updated_at trigger (NP Wave 1 Session 3).

Revision ID: 030_app_user_extensions
Revises: 000_baseline
Create Date: 2026-04-24 19:30:00.000000

Author: Aether (W1 FastAPI core, NP phase Session 3)
Contract refs:
    - docs/contracts/postgres_multi_tenant.contract.md Section 3.1 app_user
    - docs/contracts/postgres_multi_tenant.contract.md Section 3.2 tenant-scoped convention

Scope
-----
Baseline already created ``app_user`` with the canonical columns required by
``postgres_multi_tenant.contract.md`` Section 3.1. Session 3 extends the
table with the four additional columns the NP Wave 2 agents depend on:

1. ``tier``      text (free|solo|team|enterprise). Mirrors ``tenant.plan`` but
   lives on the user so per-user overrides remain possible without touching
   the tenant row.
2. ``status``    text (active|suspended|deleted). Distinct from ``deleted_at``
   which is the tombstone timestamp; ``status`` is the human-toggleable flag
   that admin panels flip before the purge job runs.
3. ``avatar_url`` text. Populated by Chione's ``file_storage_manifest`` row
   URL once an upload completes. Optional.
4. ``email_verified`` boolean. Convenience shadow of ``email_verified_at IS
   NOT NULL`` so query plans can hit a single-column partial index without
   a ``COALESCE`` wrapper.

Session 3 ALSO installs the shared ``set_updated_at()`` trigger function
here (singleton) and attaches it to ``app_user``. Every subsequent Session
3 migration (031-038) attaches the same trigger to its own table without
redeclaring the function.

Design notes
------------
- Branch point: ``down_revision = '000_baseline'`` even though Chione's
  ``010_file_storage_manifest`` and Pheme's ``020_email_transactional``
  chain linearly off baseline. Aether's Session 3 migrations therefore
  produce a second Alembic head (``038_vendor_adapter``) that will be
  merged by V4 via ``alembic merge heads`` after all three agents land.
- Columns added with defaults to keep the migration idempotent against any
  existing rows (seed data + baseline tests). No backfill required because
  the defaults apply at ALTER COLUMN time.
- ``email_verified`` is intentionally a separate boolean rather than a
  generated column so SQL-level UPDATE triggers (the refresh endpoint) can
  toggle it atomically with the ``email_verified_at`` timestamp.
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "030_app_user_extensions"
down_revision: Union[str, Sequence[str], None] = "000_baseline"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Install shared trigger, extend app_user, attach trigger to app_user."""

    # ---- Shared updated_at trigger function -----------------------------
    # Declared once here (Session 3 root). Session 3 migrations 031-038
    # attach this function to their tables without redefining.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
          NEW.updated_at := now();
          RETURN NEW;
        END;
        $$
        """
    )

    # ---- app_user column extensions -------------------------------------
    op.execute(
        """
        ALTER TABLE app_user
          ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'free'
            CHECK (tier IN ('free', 'solo', 'team', 'enterprise')),
          ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
            CHECK (status IN ('active', 'suspended', 'deleted')),
          ADD COLUMN IF NOT EXISTS avatar_url text,
          ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false
        """
    )

    # Supporting indexes. Tier + status filters dominate admin panel
    # queries; both deserve partial indexes that skip soft-deleted rows.
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_app_user_tenant_tier "
        "ON app_user(tenant_id, tier) WHERE deleted_at IS NULL"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_app_user_tenant_status "
        "ON app_user(tenant_id, status) WHERE deleted_at IS NULL"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_app_user_email_verified "
        "ON app_user(email_verified) WHERE email_verified = true"
    )

    # ---- Attach updated_at trigger to app_user --------------------------
    op.execute(
        """
        DROP TRIGGER IF EXISTS trg_app_user_set_updated_at ON app_user;
        CREATE TRIGGER trg_app_user_set_updated_at
          BEFORE UPDATE ON app_user
          FOR EACH ROW
          EXECUTE FUNCTION set_updated_at()
        """
    )


def downgrade() -> None:
    """Reverse column adds + drop trigger + drop function.

    Trigger detached first, function last, because the function may be
    attached to tables from later migrations if the downgrade happens
    mid-chain.
    """

    op.execute(
        "DROP TRIGGER IF EXISTS trg_app_user_set_updated_at ON app_user"
    )
    op.execute("DROP INDEX IF EXISTS idx_app_user_email_verified")
    op.execute("DROP INDEX IF EXISTS idx_app_user_tenant_status")
    op.execute("DROP INDEX IF EXISTS idx_app_user_tenant_tier")
    op.execute(
        """
        ALTER TABLE app_user
          DROP COLUMN IF EXISTS email_verified,
          DROP COLUMN IF EXISTS avatar_url,
          DROP COLUMN IF EXISTS status,
          DROP COLUMN IF EXISTS tier
        """
    )
    # Drop the function last. If downgrade is partial (other Session 3
    # migrations already rolled back) the function has no remaining
    # dependents and the drop succeeds.
    op.execute("DROP FUNCTION IF EXISTS set_updated_at()")
