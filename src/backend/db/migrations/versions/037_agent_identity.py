"""agent_identity table: scaffold for Tethys' identity registry.

Revision ID: 037_agent_identity
Revises: 036_trust_score
Create Date: 2026-04-24 20:05:00.000000

Author: Aether (W1 FastAPI core, NP phase Session 3)
Contract refs:
    - docs/contracts/agent_identity.contract.md Section 3.1 schema.
    - docs/contracts/postgres_multi_tenant.contract.md Section 3.2 RLS.

Scope
-----
Scaffold the ``agent_identity`` table so Wave 2 Tethys can extend it with
the full Ed25519 key-rotation columns (``retiring_public_key``,
``retiring_fingerprint``, ``artifact_manifest``, ``kind``) + the
``agent_identity_audit`` companion. Aether ships the minimal shape the
rest of the schema (``marketplace_listing`` FK, MCP get_agent_identity
tool, trust score subject pointer) needs to reference.

Design notes
------------
- ``agent_slug`` UNIQUE per tenant because a tenant may host multiple
  identities with namespaced handles. Tethys' full contract has a
  GLOBAL UNIQUE on ``handle``; Aether's per-tenant UNIQUE is a subset
  that Tethys can tighten in Wave 2 by dropping the tenant qualifier.
- ``public_key`` is bytea 32 bytes Ed25519; the uniqueness constraint
  enforces "one identity per key" across tenants (collision resistance
  backed by 256-bit security of Ed25519 keyspace).
- Key rotation columns deferred to Tethys. This scaffold only supports
  the ``active`` status path; ``retiring`` + ``revoked`` rows work but
  the rotation-specific columns (``retires_at``, ``retiring_public_key``)
  land in Wave 2.
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

from src.backend.db.rls import enable_tenant_rls, grant_app_role_crud, disable_tenant_rls


# revision identifiers, used by Alembic.
revision: str = "037_agent_identity"
down_revision: Union[str, Sequence[str], None] = "036_trust_score"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create agent_identity with indexes, grants, RLS, trigger."""

    op.execute(
        """
        CREATE TABLE agent_identity (
            id             uuid PRIMARY KEY,
            tenant_id      uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
            agent_slug     text NOT NULL,
            public_key     bytea NOT NULL,
            status         text NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active', 'retiring', 'revoked')),
            retires_at     timestamptz,
            revoked_at     timestamptz,
            metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
            created_at     timestamptz NOT NULL DEFAULT now(),
            updated_at     timestamptz NOT NULL DEFAULT now(),
            UNIQUE (tenant_id, agent_slug),
            UNIQUE (public_key),
            CHECK (octet_length(public_key) = 32)
        )
        """
    )

    op.execute(
        "CREATE INDEX idx_agent_identity_tenant_status "
        "ON agent_identity(tenant_id, status)"
    )
    op.execute(
        "CREATE INDEX idx_agent_identity_tenant_created "
        "ON agent_identity(tenant_id, created_at DESC)"
    )
    op.execute(
        "CREATE INDEX idx_agent_identity_retiring "
        "ON agent_identity(retires_at) WHERE status = 'retiring'"
    )
    op.execute(
        "CREATE INDEX idx_agent_identity_revoked "
        "ON agent_identity(revoked_at) WHERE revoked_at IS NOT NULL"
    )

    for sql in enable_tenant_rls("agent_identity"):
        op.execute(sql)
    for sql in grant_app_role_crud("agent_identity"):
        op.execute(sql)

    op.execute(
        """
        DROP TRIGGER IF EXISTS trg_agent_identity_set_updated_at ON agent_identity;
        CREATE TRIGGER trg_agent_identity_set_updated_at
          BEFORE UPDATE ON agent_identity
          FOR EACH ROW
          EXECUTE FUNCTION set_updated_at()
        """
    )


def downgrade() -> None:
    """Reverse upgrade in strict reverse dependency order."""

    op.execute(
        "DROP TRIGGER IF EXISTS trg_agent_identity_set_updated_at "
        "ON agent_identity"
    )
    for sql in disable_tenant_rls("agent_identity"):
        op.execute(sql)
    op.execute("DROP INDEX IF EXISTS idx_agent_identity_revoked")
    op.execute("DROP INDEX IF EXISTS idx_agent_identity_retiring")
    op.execute("DROP INDEX IF EXISTS idx_agent_identity_tenant_created")
    op.execute("DROP INDEX IF EXISTS idx_agent_identity_tenant_status")
    op.execute("DROP TABLE IF EXISTS agent_identity")
