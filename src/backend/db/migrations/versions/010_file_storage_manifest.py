"""file_storage_manifest table (NP Wave 1).

Revision ID: 010_file_storage_manifest
Revises: 000_baseline
Create Date: 2026-04-24 16:00:00.000000

Author: Chione (W1 File Storage, NP phase)
Contract refs:
    - docs/contracts/file_storage.contract.md Section 3.1 schema
    - docs/contracts/postgres_multi_tenant.contract.md Section 3.2 RLS

Scope
-----
Ships the manifest table that tracks every R2 upload through its
virus-scan lifecycle. Columns mirror ``file_storage.contract.md``
Section 3.1 verbatim. RLS is applied via the shared
``src.backend.db.rls.enable_tenant_rls`` helper so the policy name and
body stay consistent across every tenant-scoped table.

Design notes
------------
- ``down_revision`` points at ``000_baseline`` rather than an
  intermediate users/sessions revision because Aether's session 3
  baseline migrations (001-004 users/sessions/quest_progress/inventory)
  have not yet landed at the time this file was authored. The FK
  targets ``app_user(id)`` which DOES exist in baseline, so the
  migration is safe to apply directly on top of the baseline.
- If Aether's session 3 migrations ship with revision IDs in the
  001-009 range, Harmonia-v3 reconciles by rebasing this revision's
  ``down_revision`` pointer during the Wave 1 handoff audit. No
  schema change is required for the rebase; only the metadata header.
- ``updated_at`` is maintained by application code (``UPDATE ... SET
  updated_at = now()`` inside each write handler). A shared trigger
  helper may land later; this migration does NOT install one to avoid
  coupling to a function that may not exist yet at apply time.
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

from src.backend.db.rls import enable_tenant_rls, grant_app_role_crud, disable_tenant_rls


# revision identifiers, used by Alembic.
revision: str = "010_file_storage_manifest"
down_revision: Union[str, Sequence[str], None] = "000_baseline"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create ``file_storage_manifest`` with indexes, grants, and RLS."""

    op.execute(
        """
        CREATE TABLE file_storage_manifest (
            id                uuid PRIMARY KEY,
            tenant_id         uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
            owner_user_id     uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
            r2_bucket         text NOT NULL,
            r2_key            text NOT NULL,
            original_filename text NOT NULL,
            content_type      text NOT NULL,
            size_bytes        bigint NOT NULL,
            sha256            text NOT NULL,
            virus_scan_status text NOT NULL DEFAULT 'pending'
                CHECK (virus_scan_status IN ('pending', 'clean', 'infected', 'error')),
            virus_scan_at     timestamptz,
            virus_scan_result jsonb,
            visibility        text NOT NULL DEFAULT 'private'
                CHECK (visibility IN ('public', 'private', 'tenant_shared')),
            reference_type    text,
            reference_id      text,
            expires_at        timestamptz,
            metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
            created_at        timestamptz NOT NULL DEFAULT now(),
            updated_at        timestamptz NOT NULL DEFAULT now(),
            deleted_at        timestamptz,
            UNIQUE (r2_bucket, r2_key)
        )
        """
    )

    # Indexes per file_storage.contract Section 3.1.
    op.execute(
        "CREATE INDEX idx_manifest_tenant_reference "
        "ON file_storage_manifest(tenant_id, reference_type, reference_id)"
    )
    op.execute(
        "CREATE INDEX idx_manifest_scan_pending "
        "ON file_storage_manifest(virus_scan_status) "
        "WHERE virus_scan_status = 'pending'"
    )
    op.execute(
        "CREATE INDEX idx_manifest_expires "
        "ON file_storage_manifest(expires_at) "
        "WHERE expires_at IS NOT NULL"
    )
    # Tenant + created_at covering index per
    # postgres_multi_tenant.contract Section 3.2 convention.
    op.execute(
        "CREATE INDEX idx_manifest_tenant_created "
        "ON file_storage_manifest(tenant_id, created_at DESC)"
    )
    # Owner index for per-user listings (GDPR export + dashboard).
    op.execute(
        "CREATE INDEX idx_manifest_owner_user "
        "ON file_storage_manifest(owner_user_id)"
    )
    # Deleted_at sparse index for GDPR soft-delete sweeps (contract 4.5).
    op.execute(
        "CREATE INDEX idx_manifest_deleted_at "
        "ON file_storage_manifest(deleted_at) "
        "WHERE deleted_at IS NOT NULL"
    )

    # RLS via shared helper: ENABLE + FORCE + CREATE POLICY tenant_isolation
    for sql in enable_tenant_rls("file_storage_manifest"):
        op.execute(sql)
    for sql in grant_app_role_crud("file_storage_manifest"):
        op.execute(sql)


def downgrade() -> None:
    """Reverse upgrade: drop policy, indexes, table. No role or extension drops."""

    for sql in disable_tenant_rls("file_storage_manifest"):
        op.execute(sql)
    op.execute("DROP INDEX IF EXISTS idx_manifest_deleted_at")
    op.execute("DROP INDEX IF EXISTS idx_manifest_owner_user")
    op.execute("DROP INDEX IF EXISTS idx_manifest_tenant_created")
    op.execute("DROP INDEX IF EXISTS idx_manifest_expires")
    op.execute("DROP INDEX IF EXISTS idx_manifest_scan_pending")
    op.execute("DROP INDEX IF EXISTS idx_manifest_tenant_reference")
    op.execute("DROP TABLE IF EXISTS file_storage_manifest")
