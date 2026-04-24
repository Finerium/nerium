"""marketplace_listing v0.2.0 schema expansion (Phanes W2 NP P1 Session 1).

Revision ID: 046_marketplace_listing_schema
Revises: 045_realtime_connection_audit
Create Date: 2026-04-25 09:00:00.000000

Author: Phanes (W2 NP P1 Session 1).
Contract refs:
    - docs/contracts/marketplace_listing.contract.md Section 3.3 DDL.
    - docs/contracts/feature_flag.contract.md (marketplace.live kill switch
      + marketplace.premium_issuance Premium-category gate).
    - docs/contracts/postgres_multi_tenant.contract.md Section 4.2 RLS
      policy shape (already attached to the table by 034_marketplace_listing).

Chain placement
---------------
Chains off ``045_realtime_connection_audit`` (Nike W2 NP P3 S1) which is
the single head at the time of authoring. We deliberately do NOT branch:
a new head would require a second merge revision and pollute the
history. If another migration lands head-adjacent during the same wave,
Phanes halts + ferries to V4 rather than silently re-parenting.

Scope
-----
Expands the ``marketplace_listing`` scaffold authored by Aether
(``034_marketplace_listing``) to the full v0.2.0 shape that the contract
nails down. We ADD columns only; the existing column set (id,
tenant_id, creator_user_id, category, subtype, title, description,
pricing, license, status, version, metadata, published_at, created_at,
updated_at) is preserved so the Aether projection still round-trips and
existing indexes remain valid.

Added columns
~~~~~~~~~~~~~
- ``slug``                kebab-case, unique. Auto-generated from title
                          at create time when omitted.
- ``short_description``   text, <= 280 chars. Card-sized summary.
- ``long_description``    text, markdown. Detail page body.
- ``capability_tags``     text[] free-form discovery tags.
- ``pricing_model``       text enum (Section 3.2 PricingModel).
                          Defaults to ``free`` so legacy rows validate.
- ``pricing_details``     jsonb, shape per pricing_model (Section 3.4).
- ``category_metadata``   jsonb, shape per category (Section 3.5).
- ``asset_refs``          uuid[] referencing file_storage_manifest(id).
                          Not an FK array (asyncpg limitation); join
                          enforced at read-time.
- ``thumbnail_r2_key``    text, R2 key of the public thumbnail.
- ``trust_score_cached``  numeric(4,3). Refreshed by Astraea post-hackathon.
- ``revenue_split_override`` numeric(4,3) creator-share override.
- ``version_history``     jsonb array of prior semver snapshots. Capped
                          at 20 entries per contract Open Question 1.
- ``archived_at``         timestamptz. Set by the archive endpoint.
- ``visibility``          derived shadow column with CHECK; we prefer
                          to reuse the existing ``status`` scaffold but
                          add CHECK on the v0.2.0 value set.

Added CHECK constraints
~~~~~~~~~~~~~~~~~~~~~~~
- Extended subtype CHECK to the full 23-value Subtype enum.
- License CHECK against the 8-value License enum.
- pricing_model CHECK against the 6-value PricingModel enum.

Added indexes
~~~~~~~~~~~~~
- ``idx_listing_slug``                  unique on ``slug``.
- ``idx_listing_creator_user``          (already partial by 034 but
                                         narrowed here).
- ``idx_listing_trust``                 DESC on cached trust when
                                         status = published.
- ``idx_listing_category_metadata_gin`` jsonb_path_ops containment.

Hemera flag registration
~~~~~~~~~~~~~~~~~~~~~~~~
Inserts the ``marketplace.live`` boolean flag (default ``false``) so
pre-GA the write endpoints stay gated. ``marketplace.premium_issuance``
is already registered via the default_flags seed; we skip re-inserting
to avoid stomping a curated default.

Design notes
~~~~~~~~~~~~
- We do NOT touch the ``description`` column shipped by 034; the new
  ``short_description`` + ``long_description`` land side-by-side and
  the service layer backfills them from ``description`` on update.
- The existing ``status`` column CHECK (``draft``, ``published``,
  ``suspended``, ``archived``) already covers the contract's ``draft``
  and ``archived`` values. We keep the Aether scaffold intact.
- Downgrade drops only the columns + indexes this migration added;
  the scaffold table survives so downstream data does not evaporate.
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "046_marketplace_listing_schema"
down_revision: Union[str, Sequence[str], None] = "045_realtime_connection_audit"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Subtype enum values per Section 3.1 ALLOWED_SUBTYPES. Kept as a Python
# tuple so we can interpolate into the CHECK once without string drift.
_SUBTYPES: tuple[str, ...] = (
    "agent",
    "agent_bundle",
    "agent_team",
    "prompt",
    "skill",
    "quest_template",
    "dialogue_tree",
    "context_pack",
    "mcp_config",
    "connector",
    "workflow",
    "eval_suite",
    "voice_profile",
    "visual_theme",
    "sprite_pack",
    "sound_pack",
    "custom_build_service",
    "consulting_hour",
    "verified_certification",
    "priority_listing",
    "custom_domain_agent",
    "dataset",
    "analytics_dashboard",
)

_LICENSES: tuple[str, ...] = (
    "MIT",
    "CC0",
    "CC_BY_4",
    "CC_BY_SA_4",
    "CC_BY_NC_4",
    "APACHE_2",
    "CUSTOM_COMMERCIAL",
    "PROPRIETARY",
)

_PRICING_MODELS: tuple[str, ...] = (
    "free",
    "one_time",
    "subscription_monthly",
    "subscription_yearly",
    "usage_based",
    "tiered",
)


def _quote_list(values: tuple[str, ...]) -> str:
    """Return a comma-joined SQL literal list: ('a','b','c')."""

    return ", ".join(f"'{v}'" for v in values)


def upgrade() -> None:
    """Add v0.2.0 columns, constraints, indexes, and flag row."""

    # ------------------------------------------------------------------
    # New columns. Each ADD COLUMN is idempotent via IF NOT EXISTS so a
    # partial re-run (e.g. a dev environment that already applied half
    # the statements) still converges to the target shape.
    # ------------------------------------------------------------------
    op.execute(
        """
        ALTER TABLE marketplace_listing
            ADD COLUMN IF NOT EXISTS slug text,
            ADD COLUMN IF NOT EXISTS short_description text,
            ADD COLUMN IF NOT EXISTS long_description text,
            ADD COLUMN IF NOT EXISTS capability_tags text[]
                NOT NULL DEFAULT '{}',
            ADD COLUMN IF NOT EXISTS pricing_model text
                NOT NULL DEFAULT 'free',
            ADD COLUMN IF NOT EXISTS pricing_details jsonb
                NOT NULL DEFAULT '{}'::jsonb,
            ADD COLUMN IF NOT EXISTS category_metadata jsonb
                NOT NULL DEFAULT '{}'::jsonb,
            ADD COLUMN IF NOT EXISTS asset_refs uuid[]
                NOT NULL DEFAULT '{}',
            ADD COLUMN IF NOT EXISTS thumbnail_r2_key text,
            ADD COLUMN IF NOT EXISTS trust_score_cached numeric(4, 3),
            ADD COLUMN IF NOT EXISTS revenue_split_override numeric(4, 3),
            ADD COLUMN IF NOT EXISTS version_history jsonb
                NOT NULL DEFAULT '[]'::jsonb,
            ADD COLUMN IF NOT EXISTS archived_at timestamptz
        """
    )

    # ------------------------------------------------------------------
    # CHECK constraints. Drop the narrow subtype-free check first (if it
    # exists from an earlier variant) so the broader CHECK slots in
    # cleanly. The 034 scaffold did not declare a subtype CHECK.
    # ------------------------------------------------------------------
    subtype_list = _quote_list(_SUBTYPES)
    license_list = _quote_list(_LICENSES)
    pricing_list = _quote_list(_PRICING_MODELS)

    op.execute(
        f"""
        ALTER TABLE marketplace_listing
            DROP CONSTRAINT IF EXISTS marketplace_listing_subtype_chk,
            ADD  CONSTRAINT marketplace_listing_subtype_chk
                 CHECK (subtype IN ({subtype_list}))
        """
    )
    op.execute(
        f"""
        ALTER TABLE marketplace_listing
            DROP CONSTRAINT IF EXISTS marketplace_listing_license_chk,
            ADD  CONSTRAINT marketplace_listing_license_chk
                 CHECK (license IN ({license_list}))
        """
    )
    op.execute(
        f"""
        ALTER TABLE marketplace_listing
            DROP CONSTRAINT IF EXISTS marketplace_listing_pricing_model_chk,
            ADD  CONSTRAINT marketplace_listing_pricing_model_chk
                 CHECK (pricing_model IN ({pricing_list}))
        """
    )
    # Short description length guard (card-sized).
    op.execute(
        """
        ALTER TABLE marketplace_listing
            DROP CONSTRAINT IF EXISTS marketplace_listing_short_desc_len_chk,
            ADD  CONSTRAINT marketplace_listing_short_desc_len_chk
                 CHECK (short_description IS NULL
                        OR char_length(short_description) <= 280)
        """
    )
    # Slug must be kebab-case: lowercase alnum plus hyphen, 1..60 chars.
    # Applied only when non-null (drafts may lack a slug until publish).
    op.execute(
        """
        ALTER TABLE marketplace_listing
            DROP CONSTRAINT IF EXISTS marketplace_listing_slug_shape_chk,
            ADD  CONSTRAINT marketplace_listing_slug_shape_chk
                 CHECK (slug IS NULL
                        OR slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
                        AND char_length(slug) BETWEEN 1 AND 60)
        """
    )
    # Trust score + revenue split in [0, 1].
    op.execute(
        """
        ALTER TABLE marketplace_listing
            DROP CONSTRAINT IF EXISTS marketplace_listing_trust_range_chk,
            ADD  CONSTRAINT marketplace_listing_trust_range_chk
                 CHECK (trust_score_cached IS NULL
                        OR (trust_score_cached >= 0.000
                            AND trust_score_cached <= 1.000))
        """
    )
    op.execute(
        """
        ALTER TABLE marketplace_listing
            DROP CONSTRAINT IF EXISTS marketplace_listing_rev_split_range_chk,
            ADD  CONSTRAINT marketplace_listing_rev_split_range_chk
                 CHECK (revenue_split_override IS NULL
                        OR (revenue_split_override >= 0.000
                            AND revenue_split_override <= 1.000))
        """
    )

    # ------------------------------------------------------------------
    # Indexes. Unique slug lookup. The existing 034 ``idx_listing_published``
    # (category, subtype, published_at DESC) still serves the filtered-by-
    # category public catalogue query; we add a trust-score index for the
    # ``sort=rating`` variant and a GIN on category_metadata for downstream
    # Hyperion subtype-specific filters.
    # ------------------------------------------------------------------
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_listing_slug_unique "
        "ON marketplace_listing(slug) WHERE slug IS NOT NULL"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_listing_trust_published "
        "ON marketplace_listing(trust_score_cached DESC) "
        "WHERE status = 'published' AND trust_score_cached IS NOT NULL"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_listing_category_metadata_gin "
        "ON marketplace_listing USING GIN (category_metadata jsonb_path_ops)"
    )
    # Partial non-archived index for the default list filter.
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_listing_active "
        "ON marketplace_listing(tenant_id, created_at DESC) "
        "WHERE archived_at IS NULL"
    )

    # ------------------------------------------------------------------
    # Hemera flag registration. ``marketplace.live`` is the pillar-wide
    # kill switch; default false so pre-GA writes stay gated for every
    # user. Judges + demo accounts flip via user-scope overrides.
    # ``marketplace.premium_issuance`` already lives in the default_flags
    # seed; we do NOT touch it here so operator tunings survive.
    # ------------------------------------------------------------------
    op.execute(
        """
        INSERT INTO hemera_flag
            (flag_name, default_value, kind, description, owner_agent, tags)
        VALUES
            ('marketplace.live', 'false'::jsonb, 'boolean',
             'Pillar-wide kill switch for marketplace listing write endpoints. '
             'Flip true to open the submission wizard to a user or tenant.',
             'phanes', ARRAY['demo', 'gate', 'exposed_to_user'])
        ON CONFLICT (flag_name) DO UPDATE SET
            description = EXCLUDED.description,
            owner_agent = EXCLUDED.owner_agent,
            tags        = EXCLUDED.tags,
            kind        = EXCLUDED.kind,
            updated_at  = now()
        """
    )


def downgrade() -> None:
    """Strict reverse order: flag row, indexes, constraints, columns.

    The table itself is NOT dropped; it was scaffolded by 034 and other
    downstream migrations may attach foreign keys or materialized views
    to it. Downgrading this revision reverts the SHAPE only.
    """

    op.execute("DELETE FROM hemera_flag WHERE flag_name = 'marketplace.live'")

    op.execute("DROP INDEX IF EXISTS idx_listing_active")
    op.execute("DROP INDEX IF EXISTS idx_listing_category_metadata_gin")
    op.execute("DROP INDEX IF EXISTS idx_listing_trust_published")
    op.execute("DROP INDEX IF EXISTS idx_listing_slug_unique")

    op.execute(
        """
        ALTER TABLE marketplace_listing
            DROP CONSTRAINT IF EXISTS marketplace_listing_rev_split_range_chk,
            DROP CONSTRAINT IF EXISTS marketplace_listing_trust_range_chk,
            DROP CONSTRAINT IF EXISTS marketplace_listing_slug_shape_chk,
            DROP CONSTRAINT IF EXISTS marketplace_listing_short_desc_len_chk,
            DROP CONSTRAINT IF EXISTS marketplace_listing_pricing_model_chk,
            DROP CONSTRAINT IF EXISTS marketplace_listing_license_chk,
            DROP CONSTRAINT IF EXISTS marketplace_listing_subtype_chk
        """
    )

    op.execute(
        """
        ALTER TABLE marketplace_listing
            DROP COLUMN IF EXISTS archived_at,
            DROP COLUMN IF EXISTS version_history,
            DROP COLUMN IF EXISTS revenue_split_override,
            DROP COLUMN IF EXISTS trust_score_cached,
            DROP COLUMN IF EXISTS thumbnail_r2_key,
            DROP COLUMN IF EXISTS asset_refs,
            DROP COLUMN IF EXISTS category_metadata,
            DROP COLUMN IF EXISTS pricing_details,
            DROP COLUMN IF EXISTS pricing_model,
            DROP COLUMN IF EXISTS capability_tags,
            DROP COLUMN IF EXISTS long_description,
            DROP COLUMN IF EXISTS short_description,
            DROP COLUMN IF EXISTS slug
        """
    )
