"""Tethys W2 NP P5 Session 1: agent_identity Ed25519 owner + display + PEM extension.

Revision ID: 052_tethys_agent_identity_ed25519
Revises: 051_eunomia_admin_moderation_gdpr
Create Date: 2026-04-25 09:00:00.000000

Author: Tethys (W2 NP P5 Session 1).

Contract refs
-------------
- docs/contracts/agent_identity.contract.md Sections 3.1 schema, 4 endpoints.
- docs/contracts/postgres_multi_tenant.contract.md Section 3.2 RLS (already
  applied on agent_identity by 037).

Scope
-----
Aether scaffolded the table at 037 with the minimal columns
(``id``, ``tenant_id``, ``agent_slug``, ``public_key bytea(32)``,
``status``, ``retires_at``, ``revoked_at``, ``metadata``). Tethys
extends that scaffold with three additive columns required by the
P5 Session 1 CRUD surface:

1. ``display_name TEXT NOT NULL``  human-readable identity name shown on
   the IdentityCard UI + every audit row. Backfilled from
   ``agent_slug`` for existing rows so the NOT NULL constraint can be
   added in a single migration.
2. ``owner_user_id UUID``  per-user binding inside a tenant. Tethys
   uses this to enforce cross-user 404s in the CRUD GET path even
   though tenant RLS already filters at the DB layer. Nullable to
   keep platform identities (created without an owner) compatible.
3. ``public_key_pem TEXT``  PEM (SubjectPublicKeyInfo) projection of
   ``public_key bytea``. The bytea form remains the canonical store
   (used for signature verification after PEM-decoding); the PEM is
   served on the API surface so downstream agents can verify JWTs
   without re-encoding. Nullable for existing rows; new rows always
   populate both representations.

Additive only. Does not rename, drop, or re-type the existing
``public_key bytea(32)`` column. The `retiring_public_key` +
`retiring_fingerprint` + `artifact_manifest` columns documented in
the agent_identity contract Section 3.1 remain ferry-deferred to a
later S2 (rotation grace beyond what 037 + 052 carry); Session 1 ships
the active + revoked surface only. The contract's ``key_status`` enum
maps onto the existing ``status`` text column (CHECK-bounded to the
same three values).

Indexes
-------
- ``idx_agent_identity_owner_status (owner_user_id, status)`` so the
  ``GET /v1/identity/agents`` list endpoint can scan only rows owned
  by the authenticated user without a sequential scan. RLS still
  filters by tenant; this index is the inner-loop filter.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "052_tethys_agent_identity_ed25519"
down_revision: str | Sequence[str] | None = "051_eunomia_admin_moderation_gdpr"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add display_name + owner_user_id + public_key_pem columns + index."""

    # ``display_name`` lands nullable + backfilled + then NOT NULL so the
    # migration is safe against any pre-existing rows from 037 scaffold
    # use during dev. The default-on-add keeps the constraint cheap.
    op.execute(
        "ALTER TABLE agent_identity "
        "ADD COLUMN IF NOT EXISTS display_name text"
    )
    op.execute(
        "UPDATE agent_identity SET display_name = agent_slug "
        "WHERE display_name IS NULL"
    )
    op.execute(
        "ALTER TABLE agent_identity "
        "ALTER COLUMN display_name SET NOT NULL"
    )

    # owner_user_id is nullable to preserve compatibility with platform
    # identities that may exist without an owning user. The CRUD path
    # always sets it from the authenticated principal, so production
    # rows will have non-null owner_user_id.
    op.execute(
        "ALTER TABLE agent_identity "
        "ADD COLUMN IF NOT EXISTS owner_user_id uuid "
        "REFERENCES app_user(id) ON DELETE CASCADE"
    )

    # public_key_pem nullable so 037-era rows (raw bytea only) keep
    # passing the contract surface. New rows populate it from the
    # cryptography PEM serialization.
    op.execute(
        "ALTER TABLE agent_identity "
        "ADD COLUMN IF NOT EXISTS public_key_pem text"
    )

    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_agent_identity_owner_status "
        "ON agent_identity(owner_user_id, status)"
    )


def downgrade() -> None:
    """Reverse upgrade in strict reverse dependency order."""

    op.execute("DROP INDEX IF EXISTS idx_agent_identity_owner_status")
    op.execute(
        "ALTER TABLE agent_identity DROP COLUMN IF EXISTS public_key_pem"
    )
    op.execute(
        "ALTER TABLE agent_identity DROP COLUMN IF EXISTS owner_user_id"
    )
    op.execute(
        "ALTER TABLE agent_identity DROP COLUMN IF EXISTS display_name"
    )
