"""vendor_adapter table: scaffold for Crius' provider routing registry.

Revision ID: 038_vendor_adapter
Revises: 037_agent_identity
Create Date: 2026-04-24 20:10:00.000000

Author: Aether (W1 FastAPI core, NP phase Session 3)
Contract refs:
    - docs/contracts/vendor_adapter.contract.md Section 3.1 schema.
    - docs/contracts/postgres_multi_tenant.contract.md Section 3.2 RLS.

Scope
-----
Scaffold the ``vendor_adapter`` table Crius' Wave 2 work extends with
the full envelope-encryption key management (KEK rotation audit, DEK
rewrap scheduler, per-record nonce, circuit breaker audit). Aether
ships the columns that are cross-cutting and stable: tenant scoping,
vendor + request-type routing tuple, priority ordering for fallback,
status flag, and the encrypted config BYTEA placeholder so Crius can
populate real DEK-wrapped API keys post-Wave-2 handoff.

Design notes
------------
- ``vendor_adapter_config`` (Crius' canonical name) deliberately NOT
  used here. Contract Section 3.3 lists ``vendor_adapter_config`` as a
  GLOBAL (non-tenant-scoped) table with tenant_id NULLable for
  platform defaults. Aether's scaffold is tenant-scoped (tenant_id
  NOT NULL) so Crius will MIGRATE the platform default rows to a new
  global table in Wave 2. Until then, per-tenant overrides live here.
- ``config_encrypted`` + ``dek_wrapped`` are BYTEA placeholders; Crius
  seeds actual AES-256-GCM ciphertext + wrapped DEKs. Aether leaves
  them NOT NULL so any INSERT from Crius' Wave 2 code fails loudly if
  envelope encryption is skipped (fail-closed).
- ``kill_switch_flag`` is a pointer to a Hemera flag name that Moros
  reads when he needs emergency circuit-open; scaffold keeps it TEXT
  rather than FK because Hemera's flag table lives in a separate
  migration authored by Hemera herself.
- ``priority`` integer (lower = earlier); Crius uses this to build the
  ordered fallback chain at request time.
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

from src.backend.db.rls import enable_tenant_rls, grant_app_role_crud, disable_tenant_rls


# revision identifiers, used by Alembic.
revision: str = "038_vendor_adapter"
down_revision: Union[str, Sequence[str], None] = "037_agent_identity"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create vendor_adapter with indexes, grants, RLS, trigger."""

    op.execute(
        """
        CREATE TABLE vendor_adapter (
            id                uuid PRIMARY KEY,
            tenant_id         uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
            vendor            text NOT NULL
                              CHECK (vendor IN (
                                'anthropic', 'openai', 'voyage',
                                'vllm_local', 'other'
                              )),
            request_type      text NOT NULL
                              CHECK (request_type IN (
                                'chat', 'embedding', 'image_gen',
                                'tts', 'vision'
                              )),
            priority          int NOT NULL DEFAULT 100,
            config_encrypted  bytea NOT NULL,
            dek_wrapped       bytea NOT NULL,
            status            text NOT NULL DEFAULT 'active'
                              CHECK (status IN (
                                'active', 'disabled', 'circuit_open'
                              )),
            kill_switch_flag  text,
            metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
            created_at        timestamptz NOT NULL DEFAULT now(),
            updated_at        timestamptz NOT NULL DEFAULT now(),
            UNIQUE (tenant_id, vendor, request_type)
        )
        """
    )

    op.execute(
        "CREATE INDEX idx_vendor_adapter_tenant_req_priority "
        "ON vendor_adapter(tenant_id, request_type, priority)"
    )
    op.execute(
        "CREATE INDEX idx_vendor_adapter_tenant_created "
        "ON vendor_adapter(tenant_id, created_at DESC)"
    )
    op.execute(
        "CREATE INDEX idx_vendor_adapter_active "
        "ON vendor_adapter(tenant_id, vendor, request_type) "
        "WHERE status = 'active'"
    )

    for sql in enable_tenant_rls("vendor_adapter"):
        op.execute(sql)
    for sql in grant_app_role_crud("vendor_adapter"):
        op.execute(sql)

    op.execute(
        """
        DROP TRIGGER IF EXISTS trg_vendor_adapter_set_updated_at ON vendor_adapter;
        CREATE TRIGGER trg_vendor_adapter_set_updated_at
          BEFORE UPDATE ON vendor_adapter
          FOR EACH ROW
          EXECUTE FUNCTION set_updated_at()
        """
    )


def downgrade() -> None:
    """Reverse upgrade in strict reverse dependency order."""

    op.execute(
        "DROP TRIGGER IF EXISTS trg_vendor_adapter_set_updated_at "
        "ON vendor_adapter"
    )
    for sql in disable_tenant_rls("vendor_adapter"):
        op.execute(sql)
    op.execute("DROP INDEX IF EXISTS idx_vendor_adapter_active")
    op.execute("DROP INDEX IF EXISTS idx_vendor_adapter_tenant_created")
    op.execute("DROP INDEX IF EXISTS idx_vendor_adapter_tenant_req_priority")
    op.execute("DROP TABLE IF EXISTS vendor_adapter")
