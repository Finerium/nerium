"""marketplace commerce triple (Iapetus W2 NP P4 S1).

Revision ID: 050_marketplace_commerce
Revises: 049_subscription
Create Date: 2026-04-24 14:00:00.000000

Author: Iapetus (W2 NP P4 Session 1).
Contract refs:
    - docs/contracts/marketplace_commerce.contract.md Sections 3.1
      (connect_account + marketplace_purchase + marketplace_review +
      creator_payout DDL), 3.2 (platform fee policy), 3.3 (payout
      schedule), 4.4 (webhook integration).
    - docs/contracts/postgres_multi_tenant.contract.md Section 3.2 RLS.
    - docs/contracts/trust_score.contract.md Section 3.3 (review data
      feeds Astraea trust recompute; stopgap flip from P1 to P2).

Scope (Session 1 only; Session 2 CUT per V4 budget lock)
-------------------------------------------------------
1. ``creator_connect_account`` table. One row per creator who started
   Stripe Connect Express onboarding. Mirrors the live Stripe Account
   id + the four readiness flags (charges_enabled, payouts_enabled,
   details_submitted, requirements hash). A separate table (rather
   than columns on ``app_user``) keeps the Aether user scaffold lean
   and lets us drop the commerce stack cleanly if we ever back it out.
2. ``marketplace_purchase`` table. One row per buyer-initiated purchase
   intent. Records the gross + platform_fee + creator_net split in
   BIGINT minor units (USD cents; never FLOAT). Carries the Stripe
   PaymentIntent id for webhook reconciliation plus a buyer-scoped
   idempotency key so double-clicks on "Buy" do not create double rows.
3. ``marketplace_review`` table. One row per (listing, reviewer) pair
   with rating 1-5 + optional body. Unique partial index excludes
   soft-deleted rows so a buyer can re-review after delete. This
   table is the blocker that Astraea P1 left a stopgap marker for:
   once this migration lands, the recompute path pulls real review
   data and flips ``iapetus_p2_pending`` to false.
4. ``creator_payout`` table. One row per scheduled/paid payout batch.
   Session 2 (CUT) owns the cron wiring; the table lands now so the
   webhook + future payout writer can reference the FK columns
   without a schema churn.

Name-space note
---------------
Plutus landed ``billing_ledger_*`` (migration 049). Iapetus posts
marketplace fee + creator payable legs into that same ledger via
``post_double_entry`` so we do NOT fork a parallel ledger. The
``revenue:marketplace_fee_usd`` account seeded by 049 is the platform
fee credit; creator payable uses a per-creator liability code created
lazily on first purchase (``liability:creator_payable_usd:<creator_id>``).

Chain placement
---------------
Chains off ``049_subscription`` which is the single head at authoring
time. No branch, no merge revision.

Design notes
------------
- Every amount column is BIGINT + ``CHECK (amount >= 0)`` so refunds
  flow as separate reversing rows (immutable audit trail), NOT as
  negative values on the original row.
- ``currency char(3)`` (ISO 4217) on every amount-bearing row so FX
  math has a concrete anchor even though submission scope is USD only.
- ``status`` enums are ``text`` with CHECK constraints for easy alter
  without a type migration dance.
- RLS applied to all four tables per the contract: tenant isolation on
  ``creator_connect_account`` + ``marketplace_purchase`` +
  ``marketplace_review`` + ``creator_payout``. Cross-tenant reads
  return empty set rather than 403.
- Indexes tuned for the read patterns the router runs:
  * connect_account: lookup by user_id (router status endpoint).
  * purchase: lookup by buyer_id (my orders), creator_id (sales),
    payment_intent_id (webhook reconcile), listing_id (verified-
    purchase check for review gate).
  * review: lookup by listing_id (public review feed), reviewer_id
    (duplicate review 409), rating-desc sort for the helpful/recent
    toggle.
  * payout: lookup by creator_id + status (Session 2 payout cron).
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
revision: str = "050_marketplace_commerce"
down_revision: Union[str, Sequence[str], None] = "049_subscription"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ---------------------------------------------------------------------------
# creator_connect_account
# ---------------------------------------------------------------------------

_CONNECT_ACCOUNT_DDL = """
CREATE TABLE creator_connect_account (
    id                  uuid PRIMARY KEY,
    tenant_id           uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    user_id             uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    stripe_account_id   text UNIQUE NOT NULL,
    onboarding_status   text NOT NULL DEFAULT 'pending'
                        CHECK (onboarding_status IN (
                            'pending', 'incomplete', 'verified', 'suspended'
                        )),
    charges_enabled     boolean NOT NULL DEFAULT false,
    payouts_enabled     boolean NOT NULL DEFAULT false,
    details_submitted   boolean NOT NULL DEFAULT false,
    requirements        jsonb NOT NULL DEFAULT '{}'::jsonb,
    country             char(2),
    default_currency    char(3),
    last_synced_at      timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id)
)
"""


# ---------------------------------------------------------------------------
# marketplace_purchase
# ---------------------------------------------------------------------------

_PURCHASE_DDL = """
CREATE TABLE marketplace_purchase (
    id                       uuid PRIMARY KEY,
    tenant_id                uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    listing_id               uuid NOT NULL REFERENCES marketplace_listing(id),
    buyer_user_id            uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    creator_user_id          uuid NOT NULL REFERENCES app_user(id),
    connect_account_id       uuid REFERENCES creator_connect_account(id),
    gross_amount_cents       bigint NOT NULL CHECK (gross_amount_cents >= 0),
    platform_fee_cents       bigint NOT NULL CHECK (platform_fee_cents >= 0),
    creator_net_cents        bigint NOT NULL CHECK (creator_net_cents >= 0),
    refunded_amount_cents    bigint NOT NULL DEFAULT 0
                             CHECK (refunded_amount_cents >= 0),
    currency                 char(3) NOT NULL DEFAULT 'USD',
    rail                     text NOT NULL DEFAULT 'stripe'
                             CHECK (rail IN ('stripe', 'midtrans')),
    status                   text NOT NULL DEFAULT 'pending'
                             CHECK (status IN (
                                 'pending', 'completed', 'refunded',
                                 'disputed', 'cancelled', 'failed'
                             )),
    payment_intent_id        text UNIQUE,
    stripe_checkout_session_id text,
    stripe_charge_id         text,
    midtrans_order_id        text,
    idempotency_key          text,
    client_reference_id      text,
    metadata                 jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    completed_at             timestamptz,
    UNIQUE (buyer_user_id, idempotency_key),
    CHECK (platform_fee_cents + creator_net_cents = gross_amount_cents)
)
"""


# ---------------------------------------------------------------------------
# marketplace_review
# ---------------------------------------------------------------------------

_REVIEW_DDL = """
CREATE TABLE marketplace_review (
    id                  uuid PRIMARY KEY,
    tenant_id           uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    listing_id          uuid NOT NULL REFERENCES marketplace_listing(id) ON DELETE CASCADE,
    reviewer_user_id    uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    purchase_id         uuid REFERENCES marketplace_purchase(id),
    rating              smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
    title               text,
    body                text,
    helpful_count       int NOT NULL DEFAULT 0 CHECK (helpful_count >= 0),
    flag_count          int NOT NULL DEFAULT 0 CHECK (flag_count >= 0),
    status              text NOT NULL DEFAULT 'visible'
                        CHECK (status IN ('visible', 'hidden', 'removed')),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    deleted_at          timestamptz
)
"""


# ---------------------------------------------------------------------------
# creator_payout (Session 2 cron fills this; schema lands now)
# ---------------------------------------------------------------------------

_PAYOUT_DDL = """
CREATE TABLE creator_payout (
    id                       uuid PRIMARY KEY,
    tenant_id                uuid REFERENCES tenant(id) ON DELETE CASCADE,
    creator_user_id          uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    connect_account_id       uuid NOT NULL REFERENCES creator_connect_account(id),
    amount_cents             bigint NOT NULL CHECK (amount_cents >= 0),
    currency                 char(3) NOT NULL DEFAULT 'USD',
    period_start             timestamptz NOT NULL,
    period_end               timestamptz NOT NULL,
    status                   text NOT NULL DEFAULT 'scheduled'
                             CHECK (status IN (
                                 'scheduled', 'paid', 'failed', 'reversed'
                             )),
    stripe_payout_id         text,
    stripe_transfer_id       text,
    purchases_included       uuid[] NOT NULL DEFAULT '{}',
    scheduled_at             timestamptz NOT NULL DEFAULT now(),
    paid_at                  timestamptz,
    error                    jsonb,
    metadata                 jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now()
)
"""


def upgrade() -> None:
    """Create commerce triple + payout + RLS + indexes."""

    # ------------------------------------------------------------------
    # 1. creator_connect_account
    # ------------------------------------------------------------------
    op.execute(_CONNECT_ACCOUNT_DDL)
    op.execute(
        "CREATE INDEX idx_connect_account_tenant_user "
        "ON creator_connect_account(tenant_id, user_id)"
    )
    op.execute(
        "CREATE INDEX idx_connect_account_stripe "
        "ON creator_connect_account(stripe_account_id)"
    )
    op.execute(
        "CREATE INDEX idx_connect_account_status "
        "ON creator_connect_account(onboarding_status) "
        "WHERE onboarding_status IN ('pending', 'incomplete')"
    )
    for sql in enable_tenant_rls("creator_connect_account"):
        op.execute(sql)
    for sql in grant_app_role_crud("creator_connect_account"):
        op.execute(sql)
    op.execute(
        """
        DROP TRIGGER IF EXISTS trg_connect_account_set_updated_at
          ON creator_connect_account;
        CREATE TRIGGER trg_connect_account_set_updated_at
          BEFORE UPDATE ON creator_connect_account
          FOR EACH ROW
          EXECUTE FUNCTION set_updated_at()
        """
    )

    # ------------------------------------------------------------------
    # 2. marketplace_purchase
    # ------------------------------------------------------------------
    op.execute(_PURCHASE_DDL)
    op.execute(
        "CREATE INDEX idx_purchase_buyer "
        "ON marketplace_purchase(buyer_user_id, created_at DESC)"
    )
    op.execute(
        "CREATE INDEX idx_purchase_creator "
        "ON marketplace_purchase(creator_user_id, completed_at DESC) "
        "WHERE status = 'completed'"
    )
    op.execute(
        "CREATE INDEX idx_purchase_listing "
        "ON marketplace_purchase(listing_id)"
    )
    op.execute(
        "CREATE INDEX idx_purchase_payment_intent "
        "ON marketplace_purchase(payment_intent_id) "
        "WHERE payment_intent_id IS NOT NULL"
    )
    op.execute(
        "CREATE INDEX idx_purchase_status "
        "ON marketplace_purchase(status, created_at DESC)"
    )
    for sql in enable_tenant_rls("marketplace_purchase"):
        op.execute(sql)
    for sql in grant_app_role_crud("marketplace_purchase"):
        op.execute(sql)
    op.execute(
        """
        DROP TRIGGER IF EXISTS trg_purchase_set_updated_at
          ON marketplace_purchase;
        CREATE TRIGGER trg_purchase_set_updated_at
          BEFORE UPDATE ON marketplace_purchase
          FOR EACH ROW
          EXECUTE FUNCTION set_updated_at()
        """
    )

    # ------------------------------------------------------------------
    # 3. marketplace_review
    # ------------------------------------------------------------------
    op.execute(_REVIEW_DDL)
    op.execute(
        "CREATE UNIQUE INDEX idx_review_listing_reviewer_unique "
        "ON marketplace_review(listing_id, reviewer_user_id) "
        "WHERE deleted_at IS NULL"
    )
    op.execute(
        "CREATE INDEX idx_review_listing_visible "
        "ON marketplace_review(listing_id, created_at DESC) "
        "WHERE deleted_at IS NULL AND status = 'visible'"
    )
    op.execute(
        "CREATE INDEX idx_review_listing_helpful "
        "ON marketplace_review(listing_id, helpful_count DESC, created_at DESC) "
        "WHERE deleted_at IS NULL AND status = 'visible'"
    )
    op.execute(
        "CREATE INDEX idx_review_reviewer "
        "ON marketplace_review(reviewer_user_id, created_at DESC) "
        "WHERE deleted_at IS NULL"
    )
    for sql in enable_tenant_rls("marketplace_review"):
        op.execute(sql)
    for sql in grant_app_role_crud("marketplace_review"):
        op.execute(sql)
    op.execute(
        """
        DROP TRIGGER IF EXISTS trg_review_set_updated_at
          ON marketplace_review;
        CREATE TRIGGER trg_review_set_updated_at
          BEFORE UPDATE ON marketplace_review
          FOR EACH ROW
          EXECUTE FUNCTION set_updated_at()
        """
    )

    # ------------------------------------------------------------------
    # 4. creator_payout
    # ------------------------------------------------------------------
    op.execute(_PAYOUT_DDL)
    op.execute(
        "CREATE INDEX idx_payout_creator_status "
        "ON creator_payout(creator_user_id, status, scheduled_at DESC)"
    )
    op.execute(
        "CREATE INDEX idx_payout_stripe_transfer "
        "ON creator_payout(stripe_transfer_id) "
        "WHERE stripe_transfer_id IS NOT NULL"
    )
    # Unique transfer id guards against double-submit in the payout cron.
    op.execute(
        "CREATE UNIQUE INDEX idx_payout_stripe_transfer_unique "
        "ON creator_payout(stripe_transfer_id) "
        "WHERE stripe_transfer_id IS NOT NULL"
    )
    # Tenant scope can be NULL for cross-tenant platform payouts; mirror
    # the subscription_event policy so NULL tenant is always visible and
    # non-NULL is isolated.
    op.execute("ALTER TABLE creator_payout ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE creator_payout FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY tenant_isolation ON creator_payout
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
        "ON TABLE creator_payout TO nerium_api"
    )
    op.execute(
        """
        DROP TRIGGER IF EXISTS trg_payout_set_updated_at
          ON creator_payout;
        CREATE TRIGGER trg_payout_set_updated_at
          BEFORE UPDATE ON creator_payout
          FOR EACH ROW
          EXECUTE FUNCTION set_updated_at()
        """
    )


def downgrade() -> None:
    """Strict reverse order: payout, review, purchase, connect_account."""

    # 4. creator_payout
    op.execute(
        "DROP TRIGGER IF EXISTS trg_payout_set_updated_at ON creator_payout"
    )
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON creator_payout")
    op.execute("ALTER TABLE creator_payout NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE creator_payout DISABLE ROW LEVEL SECURITY")
    op.execute("DROP INDEX IF EXISTS idx_payout_stripe_transfer_unique")
    op.execute("DROP INDEX IF EXISTS idx_payout_stripe_transfer")
    op.execute("DROP INDEX IF EXISTS idx_payout_creator_status")
    op.execute("DROP TABLE IF EXISTS creator_payout")

    # 3. marketplace_review
    op.execute(
        "DROP TRIGGER IF EXISTS trg_review_set_updated_at ON marketplace_review"
    )
    for sql in disable_tenant_rls("marketplace_review"):
        op.execute(sql)
    op.execute("DROP INDEX IF EXISTS idx_review_reviewer")
    op.execute("DROP INDEX IF EXISTS idx_review_listing_helpful")
    op.execute("DROP INDEX IF EXISTS idx_review_listing_visible")
    op.execute("DROP INDEX IF EXISTS idx_review_listing_reviewer_unique")
    op.execute("DROP TABLE IF EXISTS marketplace_review")

    # 2. marketplace_purchase
    op.execute(
        "DROP TRIGGER IF EXISTS trg_purchase_set_updated_at ON marketplace_purchase"
    )
    for sql in disable_tenant_rls("marketplace_purchase"):
        op.execute(sql)
    op.execute("DROP INDEX IF EXISTS idx_purchase_status")
    op.execute("DROP INDEX IF EXISTS idx_purchase_payment_intent")
    op.execute("DROP INDEX IF EXISTS idx_purchase_listing")
    op.execute("DROP INDEX IF EXISTS idx_purchase_creator")
    op.execute("DROP INDEX IF EXISTS idx_purchase_buyer")
    op.execute("DROP TABLE IF EXISTS marketplace_purchase")

    # 1. creator_connect_account
    op.execute(
        "DROP TRIGGER IF EXISTS trg_connect_account_set_updated_at "
        "ON creator_connect_account"
    )
    for sql in disable_tenant_rls("creator_connect_account"):
        op.execute(sql)
    op.execute("DROP INDEX IF EXISTS idx_connect_account_status")
    op.execute("DROP INDEX IF EXISTS idx_connect_account_stripe")
    op.execute("DROP INDEX IF EXISTS idx_connect_account_tenant_user")
    op.execute("DROP TABLE IF EXISTS creator_connect_account")
