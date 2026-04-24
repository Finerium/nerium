"""inventory table: per-user item instance ledger.

Revision ID: 033_inventory
Revises: 032_quest_progress
Create Date: 2026-04-24 19:45:00.000000

Author: Aether (W1 FastAPI core, NP phase Session 3)
Contract refs:
    - docs/contracts/item_schema.contract.md (item_type taxonomy).
    - docs/contracts/quest_schema.contract.md (quest effects grant items).
    - docs/contracts/postgres_multi_tenant.contract.md Section 3.2 RLS.

Scope
-----
Tracks items a user holds. Items can be agent instances purchased from
the marketplace, static game assets awarded by quest effects, token
bundles from the banking pillar, or cosmetic badges. Each row is a
position in the user's inventory, not a catalogue entry. Catalogue
lives in ``marketplace_listing`` + game-side ``item_definitions``.

Design notes
------------
- ``item_ref`` is a free-form text because the reference target varies
  by ``item_type``: a marketplace listing uuid when ``item_type =
  'agent_instance'``, a static slug like ``'datapad_cyberpunk'`` when
  ``item_type = 'asset'``, a payout id when ``item_type = 'token'``.
  Downstream consumers resolve the reference based on ``item_type``.
- ``quantity`` NON-negative CHECK guards against double-spend bugs; a
  zero row denotes consumed-but-retained audit trail and is filtered
  out by the UI by default.
- No UNIQUE on ``(user_id, item_ref)``: users may hold multiple
  instances of the same asset slug, each with distinct metadata
  (different agent instances with different prompts). Fungible tokens
  use a single row and bump ``quantity``; consumers decide semantics
  per ``item_type``.
- ``expires_at`` supports time-limited entitlements (subscription
  bundles, trial access). NULL means never expires.
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

from src.backend.db.rls import enable_tenant_rls, grant_app_role_crud, disable_tenant_rls


# revision identifiers, used by Alembic.
revision: str = "033_inventory"
down_revision: Union[str, Sequence[str], None] = "032_quest_progress"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create inventory with indexes, grants, RLS, and updated_at trigger."""

    op.execute(
        """
        CREATE TABLE inventory (
            id            uuid PRIMARY KEY,
            tenant_id     uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
            user_id       uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
            item_type     text NOT NULL
                          CHECK (item_type IN (
                            'agent_instance', 'asset', 'token',
                            'badge', 'bundle', 'subscription'
                          )),
            item_ref      text NOT NULL,
            quantity      int NOT NULL DEFAULT 1 CHECK (quantity >= 0),
            metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
            acquired_at   timestamptz NOT NULL DEFAULT now(),
            expires_at    timestamptz,
            created_at    timestamptz NOT NULL DEFAULT now(),
            updated_at    timestamptz NOT NULL DEFAULT now()
        )
        """
    )

    op.execute(
        "CREATE INDEX idx_inventory_tenant_user_type "
        "ON inventory(tenant_id, user_id, item_type)"
    )
    op.execute(
        "CREATE INDEX idx_inventory_tenant_item_ref "
        "ON inventory(tenant_id, item_ref)"
    )
    op.execute(
        "CREATE INDEX idx_inventory_tenant_acquired "
        "ON inventory(tenant_id, acquired_at DESC)"
    )
    op.execute(
        "CREATE INDEX idx_inventory_expires "
        "ON inventory(expires_at) WHERE expires_at IS NOT NULL"
    )
    # Partial index for UI that hides zero-quantity rows by default.
    op.execute(
        "CREATE INDEX idx_inventory_active "
        "ON inventory(tenant_id, user_id) WHERE quantity > 0"
    )

    for sql in enable_tenant_rls("inventory"):
        op.execute(sql)
    for sql in grant_app_role_crud("inventory"):
        op.execute(sql)

    op.execute(
        """
        DROP TRIGGER IF EXISTS trg_inventory_set_updated_at ON inventory;
        CREATE TRIGGER trg_inventory_set_updated_at
          BEFORE UPDATE ON inventory
          FOR EACH ROW
          EXECUTE FUNCTION set_updated_at()
        """
    )


def downgrade() -> None:
    """Reverse upgrade in strict reverse dependency order."""

    op.execute(
        "DROP TRIGGER IF EXISTS trg_inventory_set_updated_at ON inventory"
    )
    for sql in disable_tenant_rls("inventory"):
        op.execute(sql)
    op.execute("DROP INDEX IF EXISTS idx_inventory_active")
    op.execute("DROP INDEX IF EXISTS idx_inventory_expires")
    op.execute("DROP INDEX IF EXISTS idx_inventory_tenant_acquired")
    op.execute("DROP INDEX IF EXISTS idx_inventory_tenant_item_ref")
    op.execute("DROP INDEX IF EXISTS idx_inventory_tenant_user_type")
    op.execute("DROP TABLE IF EXISTS inventory")
