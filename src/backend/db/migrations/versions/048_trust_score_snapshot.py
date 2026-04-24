"""trust_score_snapshot + formula_weights + audit columns (Astraea W2 NP P1 S1).

Revision ID: 048_trust_score_snapshot
Revises: 047_marketplace_search
Create Date: 2026-04-26 09:00:00.000000

Author: Astraea (W2 NP P1 Session 1).
Contract refs:
    - docs/contracts/trust_score.contract.md Section 3.3 DDL (snapshot +
      formula_weights tables).
    - docs/contracts/marketplace_listing.contract.md Section 3.3 (the
      ``trust_score_cached`` column already landed via 046; this
      migration adds the audit-trail jsonb + cached-at timestamp).
    - docs/contracts/postgres_multi_tenant.contract.md Section 3.2 RLS.

Chain placement
---------------
Chains off ``047_marketplace_search`` (Hyperion W2 NP P1 S1) which is
the single head at author time. No new head collision expected: this
pack runs serially after Phanes (046) + Hyperion (047).

Scope
-----
1. ``trust_score_snapshot`` table per contract Section 3.3.
   Replaces the naive ``trust_score`` table (still present, shipped by
   036) with the full Bayesian + Wilson audit surface. We keep the 036
   scaffold in place so existing readers (identity card, MCP tool) do
   not break; the snapshot table is the new authority for Astraea's
   writes and will be denormalised into ``trust_score`` on every
   refresh so the old readers see a fresh value.
2. ``trust_formula_weights`` table per contract Section 3.3. Seeds the
   ``bayesian_wilson_v1`` active row so the first compute call has a
   weights bundle to load.
3. Audit / cache columns on ``marketplace_listing``:
     - ``trust_score_components_cached jsonb``  boost + input breakdown
     - ``trust_score_cached_at timestamptz``    last refresh stamp
     - ``trust_score_formula_version text``     formula tag snapshot
   (The ``trust_score_cached numeric(4,3)`` column itself landed via 046
   and is NOT re-added here.)
4. ``creator_trust_score_cached*`` columns on ``app_user`` so the
   creator-level aggregate surfaces without a snapshot-table join at
   read time.
5. ``creator_verified_badge`` boolean on ``app_user`` (default false)
   for the Verified-badge grant surface. Grant logic (auto pg_cron or
   manual admin) lands in the S2 pack that was CUT per V4 lock #5;
   the column is present now so the router can carry the field through
   without a schema change when the grant worker ships.

pg_cron
-------
NOT installed here. The contract's pg_cron schedule (Section 4.1) and
the Arq fallback worker are deferred to S2 which is CUT. The refresh
column + snapshot table + formula_weights row are all present so a
follow-up revision installs the cron schedule without re-authoring the
substrate. Document the skip explicitly so operators do not wonder.

Design notes
------------
- ``trust_score_snapshot`` reuses the polymorphic (subject_kind,
  subject_id) pattern of the 036 scaffold so both identity-level and
  listing-level scores fit in one table.
- The ``computed_inputs`` jsonb is the durable audit trail:
  ``{R, v, pos, neg, age_days, ...}`` so a future reviewer can
  reproduce the score bitwise given the snapshotted inputs + formula
  version.
- ``UNIQUE (identity_id, listing_id, computed_at)`` preserves the
  contract's dedup rule; a single refresh run emits at most one row
  per subject per tick.
- Indexes: subject-first lookup + latest-per-subject (DESC on
  computed_at) mirror the contract's read pattern.
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "048_trust_score_snapshot"
down_revision: Union[str, Sequence[str], None] = "047_marketplace_search"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create snapshot + weights tables, extend listing + user caches."""

    # ------------------------------------------------------------------
    # 1. trust_score_snapshot
    # ------------------------------------------------------------------
    op.execute(
        """
        CREATE TABLE trust_score_snapshot (
            id                 bigserial PRIMARY KEY,
            tenant_id          uuid REFERENCES tenant(id) ON DELETE CASCADE,
            subject_kind       text NOT NULL
                               CHECK (subject_kind IN ('identity', 'listing', 'user')),
            identity_id        uuid REFERENCES agent_identity(id) ON DELETE CASCADE,
            listing_id         uuid REFERENCES marketplace_listing(id) ON DELETE CASCADE,
            user_id            uuid REFERENCES app_user(id) ON DELETE CASCADE,
            category           text,
            score              numeric(5, 4) NOT NULL
                               CHECK (score >= 0 AND score <= 1),
            band               text NOT NULL
                               CHECK (band IN (
                                   'unverified', 'emerging', 'established',
                                   'trusted', 'elite'
                               )),
            stability          text NOT NULL
                               CHECK (stability IN ('provisional', 'stable')),
            computed_inputs    jsonb NOT NULL DEFAULT '{}'::jsonb,
            boost_components   jsonb NOT NULL DEFAULT '{}'::jsonb,
            components         jsonb NOT NULL DEFAULT '{}'::jsonb,
            formula_version    text NOT NULL,
            event_type         text NOT NULL DEFAULT 'manual_recompute'
                               CHECK (event_type IN (
                                   'manual_recompute', 'pg_cron_refresh',
                                   'arq_refresh', 'initial_seed',
                                   'on_demand', 'review_trigger',
                                   'listing_published', 'listing_archived',
                                   'admin_adjustment'
                               )),
            actor_user_id      uuid,
            score_before       numeric(5, 4),
            computed_at        timestamptz NOT NULL DEFAULT now(),
            CHECK (
                (identity_id IS NOT NULL)
                OR (listing_id IS NOT NULL)
                OR (user_id IS NOT NULL)
            )
        )
        """
    )
    op.execute(
        "CREATE INDEX idx_trust_snapshot_listing_latest "
        "ON trust_score_snapshot(listing_id, computed_at DESC) "
        "WHERE listing_id IS NOT NULL"
    )
    op.execute(
        "CREATE INDEX idx_trust_snapshot_identity_latest "
        "ON trust_score_snapshot(identity_id, computed_at DESC) "
        "WHERE identity_id IS NOT NULL"
    )
    op.execute(
        "CREATE INDEX idx_trust_snapshot_user_latest "
        "ON trust_score_snapshot(user_id, computed_at DESC) "
        "WHERE user_id IS NOT NULL"
    )
    op.execute(
        "CREATE INDEX idx_trust_snapshot_event_type "
        "ON trust_score_snapshot(event_type, computed_at DESC)"
    )
    op.execute(
        "CREATE INDEX idx_trust_snapshot_tenant "
        "ON trust_score_snapshot(tenant_id, computed_at DESC) "
        "WHERE tenant_id IS NOT NULL"
    )

    # Grants: app role needs to read + insert snapshots.
    op.execute(
        "GRANT SELECT, INSERT ON TABLE trust_score_snapshot TO nerium_api"
    )
    op.execute(
        "GRANT USAGE, SELECT ON SEQUENCE trust_score_snapshot_id_seq TO nerium_api"
    )

    # ------------------------------------------------------------------
    # 2. trust_formula_weights + bayesian_wilson_v1 seed row
    # ------------------------------------------------------------------
    op.execute(
        """
        CREATE TABLE trust_formula_weights (
            id               bigserial PRIMARY KEY,
            formula_version  text UNIQUE NOT NULL,
            weights          jsonb NOT NULL,
            active           boolean NOT NULL DEFAULT false,
            description      text,
            created_at       timestamptz NOT NULL DEFAULT now(),
            retired_at       timestamptz
        )
        """
    )
    op.execute(
        "CREATE UNIQUE INDEX idx_trust_formula_weights_active "
        "ON trust_formula_weights(active) WHERE active = true"
    )
    op.execute(
        """
        INSERT INTO trust_formula_weights
            (formula_version, weights, active, description)
        VALUES
            ('bayesian_wilson_v1',
             '{"m": 15, "C": 0.7, "z": 1.96, '
             '"new_agent_max_boost": 0.2, "new_agent_tau_days": 3.0, '
             '"new_agent_cutoff_days": 7.0, "verified_boost_amount": 0.05, '
             '"category_weights": {'
             '"core_agent": {"primary": 0.4, "review": 0.4, "wilson": 0.2}, '
             '"content": {"primary": 0.3, "review": 0.5, "wilson": 0.2}, '
             '"infrastructure": {"primary": 0.4, "review": 0.4, "wilson": 0.2}, '
             '"assets": {"primary": 0.3, "review": 0.5, "wilson": 0.2}, '
             '"services": {"primary": 0.4, "review": 0.4, "wilson": 0.2}, '
             '"data": {"primary": 0.3, "review": 0.5, "wilson": 0.2}, '
             '"premium": {"primary": 1.0, "review": 0.0, "wilson": 0.0}'
             '}}'::jsonb,
             true,
             'Initial Astraea formula: Bayesian smoothed mean + Wilson '
             'lower bound + per-category blend + new-agent exp decay boost.')
        ON CONFLICT (formula_version) DO NOTHING
        """
    )
    op.execute(
        "GRANT SELECT ON TABLE trust_formula_weights TO nerium_api"
    )

    # ------------------------------------------------------------------
    # 3. marketplace_listing audit / cache extensions
    #    (trust_score_cached numeric(4,3) already exists from 046.)
    # ------------------------------------------------------------------
    op.execute(
        """
        ALTER TABLE marketplace_listing
            ADD COLUMN IF NOT EXISTS trust_score_components_cached jsonb
                NOT NULL DEFAULT '{}'::jsonb,
            ADD COLUMN IF NOT EXISTS trust_score_cached_at timestamptz,
            ADD COLUMN IF NOT EXISTS trust_score_formula_version text,
            ADD COLUMN IF NOT EXISTS trust_score_band text,
            ADD COLUMN IF NOT EXISTS trust_score_stability text
        """
    )
    op.execute(
        """
        ALTER TABLE marketplace_listing
            DROP CONSTRAINT IF EXISTS marketplace_listing_trust_band_chk,
            ADD  CONSTRAINT marketplace_listing_trust_band_chk
                 CHECK (trust_score_band IS NULL
                        OR trust_score_band IN (
                            'unverified', 'emerging', 'established',
                            'trusted', 'elite'
                        ))
        """
    )
    op.execute(
        """
        ALTER TABLE marketplace_listing
            DROP CONSTRAINT IF EXISTS marketplace_listing_trust_stability_chk,
            ADD  CONSTRAINT marketplace_listing_trust_stability_chk
                 CHECK (trust_score_stability IS NULL
                        OR trust_score_stability IN ('provisional', 'stable'))
        """
    )
    # Index on trust_score_cached_at so "needs-refresh" queries
    # (cached older than 24h) run without a seq scan. Partial on
    # non-null so rows that have never been scored do not bloat it.
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_listing_trust_stale "
        "ON marketplace_listing(trust_score_cached_at) "
        "WHERE trust_score_cached_at IS NOT NULL"
    )

    # ------------------------------------------------------------------
    # 4. app_user creator-level cache + verified badge
    # ------------------------------------------------------------------
    op.execute(
        """
        ALTER TABLE app_user
            ADD COLUMN IF NOT EXISTS creator_trust_score_cached numeric(5, 4),
            ADD COLUMN IF NOT EXISTS creator_trust_score_components_cached jsonb
                NOT NULL DEFAULT '{}'::jsonb,
            ADD COLUMN IF NOT EXISTS creator_trust_score_cached_at timestamptz,
            ADD COLUMN IF NOT EXISTS creator_trust_score_band text,
            ADD COLUMN IF NOT EXISTS creator_verified_badge boolean
                NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS creator_verified_badge_granted_at timestamptz
        """
    )
    op.execute(
        """
        ALTER TABLE app_user
            DROP CONSTRAINT IF EXISTS app_user_creator_trust_range_chk,
            ADD  CONSTRAINT app_user_creator_trust_range_chk
                 CHECK (creator_trust_score_cached IS NULL
                        OR (creator_trust_score_cached >= 0
                            AND creator_trust_score_cached <= 1))
        """
    )
    op.execute(
        """
        ALTER TABLE app_user
            DROP CONSTRAINT IF EXISTS app_user_creator_trust_band_chk,
            ADD  CONSTRAINT app_user_creator_trust_band_chk
                 CHECK (creator_trust_score_band IS NULL
                        OR creator_trust_score_band IN (
                            'unverified', 'emerging', 'established',
                            'trusted', 'elite'
                        ))
        """
    )


def downgrade() -> None:
    """Strict reverse order: user columns, listing columns, tables."""

    # 4. user columns
    op.execute(
        """
        ALTER TABLE app_user
            DROP CONSTRAINT IF EXISTS app_user_creator_trust_band_chk,
            DROP CONSTRAINT IF EXISTS app_user_creator_trust_range_chk
        """
    )
    op.execute(
        """
        ALTER TABLE app_user
            DROP COLUMN IF EXISTS creator_verified_badge_granted_at,
            DROP COLUMN IF EXISTS creator_verified_badge,
            DROP COLUMN IF EXISTS creator_trust_score_band,
            DROP COLUMN IF EXISTS creator_trust_score_cached_at,
            DROP COLUMN IF EXISTS creator_trust_score_components_cached,
            DROP COLUMN IF EXISTS creator_trust_score_cached
        """
    )

    # 3. listing columns
    op.execute("DROP INDEX IF EXISTS idx_listing_trust_stale")
    op.execute(
        """
        ALTER TABLE marketplace_listing
            DROP CONSTRAINT IF EXISTS marketplace_listing_trust_stability_chk,
            DROP CONSTRAINT IF EXISTS marketplace_listing_trust_band_chk
        """
    )
    op.execute(
        """
        ALTER TABLE marketplace_listing
            DROP COLUMN IF EXISTS trust_score_stability,
            DROP COLUMN IF EXISTS trust_score_band,
            DROP COLUMN IF EXISTS trust_score_formula_version,
            DROP COLUMN IF EXISTS trust_score_cached_at,
            DROP COLUMN IF EXISTS trust_score_components_cached
        """
    )

    # 2. formula_weights
    op.execute("DROP TABLE IF EXISTS trust_formula_weights")

    # 1. snapshot
    op.execute("DROP INDEX IF EXISTS idx_trust_snapshot_tenant")
    op.execute("DROP INDEX IF EXISTS idx_trust_snapshot_event_type")
    op.execute("DROP INDEX IF EXISTS idx_trust_snapshot_user_latest")
    op.execute("DROP INDEX IF EXISTS idx_trust_snapshot_identity_latest")
    op.execute("DROP INDEX IF EXISTS idx_trust_snapshot_listing_latest")
    op.execute("DROP TABLE IF EXISTS trust_score_snapshot")
