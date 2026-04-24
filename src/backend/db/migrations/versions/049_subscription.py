"""subscription + subscription_event + double-entry ledger (Plutus W2 NP P4 S1).

Revision ID: 049_subscription
Revises: 048_trust_score_snapshot
Create Date: 2026-04-24 12:00:00.000000

Author: Plutus (W2 NP P4 Session 1).
Contract refs:
    - docs/contracts/payment_stripe.contract.md Section 3.1 billing_subscription
      + billing_webhook_event + ledger_account + ledger_transaction +
      ledger_entry.
    - docs/contracts/postgres_multi_tenant.contract.md Section 3.2 RLS.

Scope (Session 1 only; Session 2 CUT per V4 budget lock)
-------------------------------------------------------
1. ``subscription`` table. Ties an ``app_user`` to a Stripe Customer +
   Subscription with a 4-tier plan enum (free/starter/pro/team) and the
   Stripe lifecycle status mirror. Single source of truth for "what plan
   is this user on right now" so the UI (Marshall P6) does not need to
   hit Stripe on every page load.
2. ``subscription_event`` table. Idempotency anchor for Stripe webhook
   processing per contract Section 4.8. ``stripe_event_id UNIQUE`` so a
   webhook replay (Stripe retries up to 3 days on 5xx) is a no-op.
3. ``billing_ledger_account`` + ``billing_ledger_transaction`` +
   ``billing_ledger_entry`` for the double-entry ledger per contract
   Section 3.1 + Section 4.9. Every Stripe monetary event posts two
   entries (DEBIT + CREDIT) that sum to zero per transaction. BIGINT
   minor units (cents for USD), never FLOAT. Idempotency key =
   ``stripe:evt:<event_id>`` so replays collapse onto the same row.

Name-space note
---------------
The Aether W1 scaffold at ``035_transaction_ledger`` shipped a
``transaction_ledger`` header table. That row scaffold is preserved; the
Plutus ledger lands under a distinct ``billing_ledger_*`` namespace so
the two surfaces coexist without an ALTER TABLE RENAME dance. The
contract name ``ledger_transaction`` maps to our
``billing_ledger_transaction``. This keeps Iapetus (Connect Express) +
Moros (reconciliation) aligned on one canonical billing ledger while
leaving the generic transaction header available for non-Stripe rails
(credit grants, usage debits) should a future rail want it.

Chain placement
---------------
Chains off ``048_trust_score_snapshot`` which is the single head at
author time. No head collision. Downstream migrations (050+) may revise
off this rev.

Design notes
------------
- ``subscription.user_id`` is the authoritative owner; ``tenant_id``
  mirrors ``app_user.tenant_id`` for RLS reach.
- ``plan`` enum: free/starter/pro/team. Contract lists
  free/solo/team/enterprise in Section 3.2; the prompt's 4-tier spec
  (free/starter/pro/team) is authoritative per V4 re-naming. The seed
  config + ``/v1/billing/plans`` endpoint mirror the prompt names so the
  UI contract stays consistent.
- ``status`` enum mirrors Stripe Subscription status values per contract
  Section 3.1 so webhook sync is a direct string copy.
- ``cancel_at_period_end`` bool + ``current_period_end`` timestamptz
  support the "cancel" + "resume" UX without an immediate Stripe API
  call on every tick.
- ``deleted_at`` nullable for soft-delete on ``customer.subscription.deleted``.
  Hard delete would lose audit trail.
- ``subscription_event.stripe_event_id UNIQUE`` is the idempotency
  anchor. Webhook handler ``INSERT ... ON CONFLICT DO NOTHING``; a zero
  row-count tells us the event was a replay.
- Ledger tables are tenant-scoped via ``tenant_id`` nullable; platform
  accounts (shared Stripe balance asset) stay with ``tenant_id IS NULL``
  and an API-level scope gate prevents cross-tenant read. The CHECK
  constraint on ``amount_minor_units > 0`` forbids negative amounts so
  reversals are new transactions (immutable history) not column flips.
- ``billing_ledger_entry.direction`` is ``D`` / ``C`` char(1) per
  contract Section 7. Debits + credits for a single transaction MUST
  sum to zero in minor units; enforced by a deferred trigger that runs
  at transaction-commit so an INSERT of the paired rows inside a single
  tx is atomic.
- RLS applied on ``subscription`` + ``subscription_event`` so a caller
  can only read their tenant's rows. ``billing_ledger_*`` gets a softer
  treatment: platform-scope rows (``tenant_id IS NULL``) remain
  visible to the migration role but filtered at the app layer via an
  admin scope gate. The RLS policy USING expression treats
  ``tenant_id IS NULL`` as always-visible so the admin-reconcile path
  from Moros can read the global Stripe balance without a side-channel.
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

from src.backend.db.rls import (
    disable_tenant_rls,
    enable_tenant_rls,
    grant_app_role_crud,
)


# revision identifiers, used by Alembic.
revision: str = "049_subscription"
down_revision: Union[str, Sequence[str], None] = "048_trust_score_snapshot"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ---------------------------------------------------------------------------
# SQL fragments (inlined for visibility; kept short to fit the migration log).
# ---------------------------------------------------------------------------


_SUBSCRIPTION_DDL = """
CREATE TABLE subscription (
    id                     uuid PRIMARY KEY,
    tenant_id              uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    user_id                uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    stripe_customer_id     text NOT NULL,
    stripe_subscription_id text UNIQUE,
    tier                   text NOT NULL
                           CHECK (tier IN ('free','starter','pro','team')),
    status                 text NOT NULL
                           CHECK (status IN (
                               'incomplete','incomplete_expired','trialing',
                               'active','past_due','canceled','unpaid'
                           )),
    current_period_start   timestamptz,
    current_period_end     timestamptz,
    cancel_at_period_end   boolean NOT NULL DEFAULT false,
    metadata               jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    deleted_at             timestamptz
)
"""


_SUBSCRIPTION_EVENT_DDL = """
CREATE TABLE subscription_event (
    id                uuid PRIMARY KEY,
    tenant_id         uuid REFERENCES tenant(id) ON DELETE CASCADE,
    subscription_id   uuid REFERENCES subscription(id) ON DELETE CASCADE,
    event_type        text NOT NULL,
    stripe_event_id   text UNIQUE NOT NULL,
    payload           jsonb NOT NULL DEFAULT '{}'::jsonb,
    processed_at      timestamptz,
    processing_error  text,
    created_at        timestamptz NOT NULL DEFAULT now()
)
"""


_LEDGER_ACCOUNT_DDL = """
CREATE TABLE billing_ledger_account (
    id          bigserial PRIMARY KEY,
    tenant_id   uuid REFERENCES tenant(id) ON DELETE CASCADE,
    code        text NOT NULL,
    name        text NOT NULL,
    type        text NOT NULL
                CHECK (type IN ('asset','liability','equity','revenue','expense')),
    currency    char(3) NOT NULL DEFAULT 'USD',
    is_system   boolean NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (code)
)
"""


_LEDGER_TRANSACTION_DDL = """
CREATE TABLE billing_ledger_transaction (
    id               uuid PRIMARY KEY,
    tenant_id        uuid REFERENCES tenant(id) ON DELETE CASCADE,
    idempotency_key  text UNIQUE NOT NULL,
    reference_type   text,
    reference_id     text,
    description      text,
    posted_at        timestamptz NOT NULL DEFAULT now(),
    metadata         jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at       timestamptz NOT NULL DEFAULT now()
)
"""


_LEDGER_ENTRY_DDL = """
CREATE TABLE billing_ledger_entry (
    id                  bigserial PRIMARY KEY,
    transaction_id      uuid NOT NULL
                        REFERENCES billing_ledger_transaction(id)
                        ON DELETE CASCADE,
    account_id          bigint NOT NULL
                        REFERENCES billing_ledger_account(id),
    direction           char(1) NOT NULL
                        CHECK (direction IN ('D','C')),
    amount_minor_units  bigint NOT NULL
                        CHECK (amount_minor_units > 0),
    currency            char(3) NOT NULL DEFAULT 'USD',
    created_at          timestamptz NOT NULL DEFAULT now()
)
"""


# Ledger sum-to-zero invariant. Enforced as a CONSTRAINT TRIGGER deferred
# to transaction commit so a paired INSERT inside a single tx is atomic.
# The body sums signed minor units per transaction: + for DEBIT, - for
# CREDIT (accounting convention: debits increase assets + expenses,
# credits increase liabilities + revenue + equity; a balanced posting
# has signed sum zero).
_LEDGER_SUM_TO_ZERO_FN = """
CREATE OR REPLACE FUNCTION billing_ledger_check_sum_to_zero()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    tx_id  uuid := COALESCE(NEW.transaction_id, OLD.transaction_id);
    signed_sum bigint;
BEGIN
    SELECT COALESCE(
        SUM(CASE direction WHEN 'D' THEN amount_minor_units
                           WHEN 'C' THEN -amount_minor_units
                           ELSE 0 END),
        0
    )
    INTO signed_sum
    FROM billing_ledger_entry
    WHERE transaction_id = tx_id;

    IF signed_sum <> 0 THEN
        RAISE EXCEPTION
            'billing_ledger: sum-to-zero violation on transaction % (signed=%)',
            tx_id, signed_sum;
    END IF;
    RETURN NULL;
END;
$$
"""


_LEDGER_SUM_TO_ZERO_TRG = """
CREATE CONSTRAINT TRIGGER trg_billing_ledger_sum_to_zero
AFTER INSERT OR UPDATE OR DELETE ON billing_ledger_entry
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION billing_ledger_check_sum_to_zero()
"""


# Seed the canonical platform accounts used by the webhook ledger
# posting path. Tenant-scoped accounts are created lazily on first
# subscription paid event; the two platform-level rows below cover the
# simple "Stripe balance in + subscription revenue out" pair that the
# hackathon demo exercises. Codes follow contract Section 7 naming:
# ``asset:stripe_balance_usd`` + ``revenue:subscription_usd``.
_LEDGER_SEED_ACCOUNTS = """
INSERT INTO billing_ledger_account (tenant_id, code, name, type, currency, is_system) VALUES
    (NULL, 'asset:stripe_balance_usd',
     'Stripe Platform Balance (USD)', 'asset', 'USD', true),
    (NULL, 'revenue:subscription_usd',
     'Subscription Revenue (USD)', 'revenue', 'USD', true),
    (NULL, 'revenue:marketplace_fee_usd',
     'Marketplace Fee Revenue (USD)', 'revenue', 'USD', true),
    (NULL, 'liability:stripe_refunds_usd',
     'Stripe Refunds Payable (USD)', 'liability', 'USD', true)
ON CONFLICT (code) DO NOTHING
"""


def upgrade() -> None:
    """Create subscription + event + ledger triple; seed platform accounts."""

    # ---------------------------------------------------------------
    # 1. subscription table + indexes + RLS + updated_at trigger.
    # ---------------------------------------------------------------
    op.execute(_SUBSCRIPTION_DDL)
    op.execute(
        "CREATE INDEX idx_subscription_user_active "
        "ON subscription(user_id, status) "
        "WHERE deleted_at IS NULL"
    )
    op.execute(
        "CREATE INDEX idx_subscription_tenant_active "
        "ON subscription(tenant_id, status) "
        "WHERE deleted_at IS NULL"
    )
    op.execute(
        "CREATE INDEX idx_subscription_stripe_customer "
        "ON subscription(stripe_customer_id)"
    )
    op.execute(
        "CREATE INDEX idx_subscription_stripe_subscription "
        "ON subscription(stripe_subscription_id) "
        "WHERE stripe_subscription_id IS NOT NULL"
    )
    op.execute(
        "CREATE INDEX idx_subscription_period_end "
        "ON subscription(current_period_end) "
        "WHERE status = 'active' AND deleted_at IS NULL"
    )

    for sql in enable_tenant_rls("subscription"):
        op.execute(sql)
    for sql in grant_app_role_crud("subscription"):
        op.execute(sql)
    op.execute(
        """
        DROP TRIGGER IF EXISTS trg_subscription_set_updated_at
          ON subscription;
        CREATE TRIGGER trg_subscription_set_updated_at
          BEFORE UPDATE ON subscription
          FOR EACH ROW
          EXECUTE FUNCTION set_updated_at()
        """
    )

    # ---------------------------------------------------------------
    # 2. subscription_event table + indexes + RLS.
    # ---------------------------------------------------------------
    op.execute(_SUBSCRIPTION_EVENT_DDL)
    op.execute(
        "CREATE INDEX idx_subscription_event_subscription "
        "ON subscription_event(subscription_id, created_at DESC) "
        "WHERE subscription_id IS NOT NULL"
    )
    op.execute(
        "CREATE INDEX idx_subscription_event_type "
        "ON subscription_event(event_type, created_at DESC)"
    )
    op.execute(
        "CREATE INDEX idx_subscription_event_unprocessed "
        "ON subscription_event(created_at) "
        "WHERE processed_at IS NULL"
    )
    # RLS on subscription_event. ``tenant_id`` is nullable because the
    # event row may arrive before we have resolved the target
    # subscription + tenant (first ``checkout.session.completed`` where
    # the subscription row is being created inside the same tx). The
    # canonical policy treats NULL tenant as "always visible" via the
    # coalesce pattern below; we hand-roll the policy SQL to avoid the
    # uniform helper's NULL-reject default.
    op.execute("ALTER TABLE subscription_event ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE subscription_event FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY tenant_isolation ON subscription_event
          USING (
              tenant_id IS NULL
              OR tenant_id = current_setting('app.tenant_id', true)::uuid
          )
          WITH CHECK (
              tenant_id IS NULL
              OR tenant_id = current_setting('app.tenant_id', true)::uuid
          )
        """
    )
    op.execute(
        "GRANT SELECT, INSERT, UPDATE, DELETE "
        "ON TABLE subscription_event TO nerium_api"
    )

    # ---------------------------------------------------------------
    # 3. Ledger triple (account + transaction + entry) + sum-to-zero.
    # ---------------------------------------------------------------
    op.execute(_LEDGER_ACCOUNT_DDL)
    op.execute(
        "CREATE INDEX idx_billing_ledger_account_tenant "
        "ON billing_ledger_account(tenant_id, type) "
        "WHERE tenant_id IS NOT NULL"
    )
    op.execute(
        "CREATE INDEX idx_billing_ledger_account_type "
        "ON billing_ledger_account(type, currency)"
    )
    op.execute(
        "GRANT SELECT ON TABLE billing_ledger_account TO nerium_api"
    )
    op.execute(
        "GRANT USAGE, SELECT "
        "ON SEQUENCE billing_ledger_account_id_seq TO nerium_api"
    )

    op.execute(_LEDGER_TRANSACTION_DDL)
    op.execute(
        "CREATE INDEX idx_billing_ledger_tx_posted "
        "ON billing_ledger_transaction(posted_at DESC)"
    )
    op.execute(
        "CREATE INDEX idx_billing_ledger_tx_tenant_posted "
        "ON billing_ledger_transaction(tenant_id, posted_at DESC) "
        "WHERE tenant_id IS NOT NULL"
    )
    op.execute(
        "CREATE INDEX idx_billing_ledger_tx_reference "
        "ON billing_ledger_transaction(reference_type, reference_id) "
        "WHERE reference_type IS NOT NULL"
    )
    # Immutable + tenant-visible read. The webhook handler runs as the
    # app role and needs INSERT; we grant SELECT + INSERT but deny
    # UPDATE + DELETE so the ledger history is append-only at the
    # grant level (the invariant trigger would still catch silent
    # mutations but the grant lock is clearer for auditors).
    op.execute(
        "GRANT SELECT, INSERT ON TABLE billing_ledger_transaction "
        "TO nerium_api"
    )
    # Ledger transactions are platform-scoped (tenant_id nullable) with
    # the same NULL-visible policy as subscription_event.
    op.execute("ALTER TABLE billing_ledger_transaction ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE billing_ledger_transaction FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY tenant_isolation ON billing_ledger_transaction
          USING (
              tenant_id IS NULL
              OR tenant_id = current_setting('app.tenant_id', true)::uuid
          )
          WITH CHECK (
              tenant_id IS NULL
              OR tenant_id = current_setting('app.tenant_id', true)::uuid
          )
        """
    )

    op.execute(_LEDGER_ENTRY_DDL)
    op.execute(
        "CREATE INDEX idx_billing_ledger_entry_tx "
        "ON billing_ledger_entry(transaction_id)"
    )
    op.execute(
        "CREATE INDEX idx_billing_ledger_entry_account "
        "ON billing_ledger_entry(account_id, created_at DESC)"
    )
    op.execute(
        "GRANT SELECT, INSERT ON TABLE billing_ledger_entry TO nerium_api"
    )
    op.execute(
        "GRANT USAGE, SELECT "
        "ON SEQUENCE billing_ledger_entry_id_seq TO nerium_api"
    )

    # ---------------------------------------------------------------
    # 4. Sum-to-zero invariant trigger.
    # ---------------------------------------------------------------
    op.execute(_LEDGER_SUM_TO_ZERO_FN)
    op.execute(_LEDGER_SUM_TO_ZERO_TRG)

    # ---------------------------------------------------------------
    # 5. Platform-account seed rows.
    # ---------------------------------------------------------------
    op.execute(_LEDGER_SEED_ACCOUNTS)


def downgrade() -> None:
    """Strict reverse order: entries, accounts, events, subscriptions."""

    op.execute(
        "DROP TRIGGER IF EXISTS trg_billing_ledger_sum_to_zero "
        "ON billing_ledger_entry"
    )
    op.execute(
        "DROP FUNCTION IF EXISTS billing_ledger_check_sum_to_zero()"
    )

    op.execute("DROP TABLE IF EXISTS billing_ledger_entry")
    op.execute("DROP TABLE IF EXISTS billing_ledger_transaction")
    op.execute("DROP TABLE IF EXISTS billing_ledger_account")

    op.execute("DROP POLICY IF EXISTS tenant_isolation ON subscription_event")
    op.execute("ALTER TABLE subscription_event NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE subscription_event DISABLE ROW LEVEL SECURITY")
    op.execute("DROP INDEX IF EXISTS idx_subscription_event_unprocessed")
    op.execute("DROP INDEX IF EXISTS idx_subscription_event_type")
    op.execute("DROP INDEX IF EXISTS idx_subscription_event_subscription")
    op.execute("DROP TABLE IF EXISTS subscription_event")

    op.execute(
        "DROP TRIGGER IF EXISTS trg_subscription_set_updated_at "
        "ON subscription"
    )
    for sql in disable_tenant_rls("subscription"):
        op.execute(sql)
    op.execute("DROP INDEX IF EXISTS idx_subscription_period_end")
    op.execute("DROP INDEX IF EXISTS idx_subscription_stripe_subscription")
    op.execute("DROP INDEX IF EXISTS idx_subscription_stripe_customer")
    op.execute("DROP INDEX IF EXISTS idx_subscription_tenant_active")
    op.execute("DROP INDEX IF EXISTS idx_subscription_user_active")
    op.execute("DROP TABLE IF EXISTS subscription")
