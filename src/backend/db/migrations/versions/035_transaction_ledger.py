"""transaction_ledger table: scaffold for Plutus' banking core.

Revision ID: 035_transaction_ledger
Revises: 034_marketplace_listing
Create Date: 2026-04-24 19:55:00.000000

Author: Aether (W1 FastAPI core, NP phase Session 3)
Contract refs:
    - docs/contracts/payment_stripe.contract.md Section 3.1 ledger_transaction
      + ledger_entry double-entry pair.
    - docs/contracts/postgres_multi_tenant.contract.md Section 3.2 RLS.

Scope
-----
Plutus' contract calls for a proper double-entry ledger (header
``ledger_transaction`` plus per-entry ``ledger_entry`` sum-to-zero rows).
Session 3 ships only the aggregate header row the rest of the schema
needs to reference; Plutus extends with the per-entry breakdown in Wave
2. Writing the single-row scaffold here lets other Wave 1 migrations
(file_storage_manifest refs, email receipt links) take an FK hop
through a stable id without waiting on Plutus.

Design notes
------------
- Name kept as ``transaction_ledger`` (spec) rather than Plutus'
  ``ledger_transaction`` (contract 3.1) to avoid renaming references
  from the NP agent structure. Plutus may migrate to the contract name
  via ``ALTER TABLE RENAME`` in Wave 2 if the pillar leadership decides.
- ``amount_cents`` is BIGINT signed to keep a single row able to carry
  the net direction; full double-entry splits go in Plutus' follow-up
  ``ledger_entry`` table where direction becomes the CHAR(1) D/C flag.
- ``transaction_ref`` UNIQUE per tenant so Stripe webhook deduplication
  (via ``charge_id``) is cheap at insert time.
- Indexes support the two dominant admin queries: "all my transactions
  this month" (user_id + posted_at) and "all tenant revenue last 30d"
  (tenant_id + posted_at).
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

from src.backend.db.rls import enable_tenant_rls, grant_app_role_crud, disable_tenant_rls


# revision identifiers, used by Alembic.
revision: str = "035_transaction_ledger"
down_revision: Union[str, Sequence[str], None] = "034_marketplace_listing"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create transaction_ledger with indexes, grants, RLS, trigger."""

    op.execute(
        """
        CREATE TABLE transaction_ledger (
            id                uuid PRIMARY KEY,
            tenant_id         uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
            user_id           uuid REFERENCES app_user(id) ON DELETE SET NULL,
            transaction_ref   text NOT NULL,
            transaction_type  text NOT NULL
                              CHECK (transaction_type IN (
                                'purchase', 'refund', 'payout',
                                'subscription_charge', 'credit_grant',
                                'usage_debit', 'adjustment'
                              )),
            amount_cents      bigint NOT NULL,
            currency          char(3) NOT NULL DEFAULT 'USD',
            status            text NOT NULL DEFAULT 'pending'
                              CHECK (status IN (
                                'pending', 'posted', 'reversed', 'failed'
                              )),
            metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
            posted_at         timestamptz,
            created_at        timestamptz NOT NULL DEFAULT now(),
            updated_at        timestamptz NOT NULL DEFAULT now(),
            UNIQUE (tenant_id, transaction_ref)
        )
        """
    )

    op.execute(
        "CREATE INDEX idx_tx_ledger_tenant_posted "
        "ON transaction_ledger(tenant_id, posted_at DESC) "
        "WHERE posted_at IS NOT NULL"
    )
    op.execute(
        "CREATE INDEX idx_tx_ledger_tenant_user_posted "
        "ON transaction_ledger(tenant_id, user_id, posted_at DESC)"
    )
    op.execute(
        "CREATE INDEX idx_tx_ledger_tenant_type_status "
        "ON transaction_ledger(tenant_id, transaction_type, status)"
    )
    op.execute(
        "CREATE INDEX idx_tx_ledger_pending "
        "ON transaction_ledger(tenant_id, created_at) "
        "WHERE status = 'pending'"
    )

    for sql in enable_tenant_rls("transaction_ledger"):
        op.execute(sql)
    for sql in grant_app_role_crud("transaction_ledger"):
        op.execute(sql)

    op.execute(
        """
        DROP TRIGGER IF EXISTS trg_transaction_ledger_set_updated_at
          ON transaction_ledger;
        CREATE TRIGGER trg_transaction_ledger_set_updated_at
          BEFORE UPDATE ON transaction_ledger
          FOR EACH ROW
          EXECUTE FUNCTION set_updated_at()
        """
    )


def downgrade() -> None:
    """Reverse upgrade in strict reverse dependency order."""

    op.execute(
        "DROP TRIGGER IF EXISTS trg_transaction_ledger_set_updated_at "
        "ON transaction_ledger"
    )
    for sql in disable_tenant_rls("transaction_ledger"):
        op.execute(sql)
    op.execute("DROP INDEX IF EXISTS idx_tx_ledger_pending")
    op.execute("DROP INDEX IF EXISTS idx_tx_ledger_tenant_type_status")
    op.execute("DROP INDEX IF EXISTS idx_tx_ledger_tenant_user_posted")
    op.execute("DROP INDEX IF EXISTS idx_tx_ledger_tenant_posted")
    op.execute("DROP TABLE IF EXISTS transaction_ledger")
