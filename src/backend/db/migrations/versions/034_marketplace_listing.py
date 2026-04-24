"""marketplace_listing table: scaffold for Phanes' marketplace core.

Revision ID: 034_marketplace_listing
Revises: 033_inventory
Create Date: 2026-04-24 19:50:00.000000

Author: Aether (W1 FastAPI core, NP phase Session 3)
Contract refs:
    - docs/contracts/marketplace_listing.contract.md Section 3.3 DDL.
    - docs/contracts/marketplace_search.contract.md (Hyperion search columns).
    - docs/contracts/postgres_multi_tenant.contract.md Section 3.2 RLS.

Scope
-----
Scaffold the ``marketplace_listing`` table so Wave 2 Phanes can extend it
with full column detail (search_tsv, embedding vector(1024), full
pricing_details shape, per-category metadata) without re-authoring the
root DDL. Aether ships the columns that are cross-cutting and stable
(tenant_id, category, subtype, status, title, pricing, version,
metadata) plus the GIN index on metadata needed for Hyperion's discovery
query.

Design notes
------------
- ``creator_user_id`` is an FK to ``app_user(id)`` rather than
  ``agent_identity(id)`` because ``agent_identity`` is authored later in
  the chain (037). Phanes can add a second nullable ``creator_identity_id``
  column in a Wave 2 migration when the identity graph comes online.
- Category + subtype are plain text with an advisory CHECK that names
  the primary categories. Phanes expands the subtype CHECK to the full
  taxonomy per ``marketplace_listing.contract.md`` Section 3.1.
- ``pricing`` jsonb is the wide-open shape for now; Phanes splits it
  into ``pricing_model`` + ``pricing_details`` per contract Section 3.2
  during Wave 2.
- GIN on metadata with ``jsonb_path_ops`` is the right index class for
  ``metadata @> '{"tag": ...}'`` containment lookups dominating Hyperion's
  discovery filter; Phanes may add a second full-text GIN on
  ``search_tsv`` when that generated column lands.
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

from src.backend.db.rls import enable_tenant_rls, grant_app_role_crud, disable_tenant_rls


# revision identifiers, used by Alembic.
revision: str = "034_marketplace_listing"
down_revision: Union[str, Sequence[str], None] = "033_inventory"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create marketplace_listing scaffold with indexes, grants, RLS, trigger."""

    op.execute(
        """
        CREATE TABLE marketplace_listing (
            id                  uuid PRIMARY KEY,
            tenant_id           uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
            creator_user_id     uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
            category            text NOT NULL
                                CHECK (category IN (
                                  'core_agent', 'content', 'infrastructure',
                                  'assets', 'services', 'premium', 'data'
                                )),
            subtype             text NOT NULL,
            title               text NOT NULL,
            description         text,
            pricing             jsonb NOT NULL DEFAULT '{}'::jsonb,
            license             text NOT NULL DEFAULT 'PROPRIETARY',
            status              text NOT NULL DEFAULT 'draft'
                                CHECK (status IN (
                                  'draft', 'published', 'suspended', 'archived'
                                )),
            version             text NOT NULL DEFAULT '0.1.0',
            metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
            published_at        timestamptz,
            created_at          timestamptz NOT NULL DEFAULT now(),
            updated_at          timestamptz NOT NULL DEFAULT now()
        )
        """
    )

    op.execute(
        "CREATE INDEX idx_listing_tenant_category_status "
        "ON marketplace_listing(tenant_id, category, status)"
    )
    op.execute(
        "CREATE INDEX idx_listing_tenant_creator "
        "ON marketplace_listing(tenant_id, creator_user_id)"
    )
    op.execute(
        "CREATE INDEX idx_listing_tenant_created "
        "ON marketplace_listing(tenant_id, created_at DESC)"
    )
    # Published-only partial so the public catalogue query doesn't scan
    # draft + archived rows.
    op.execute(
        "CREATE INDEX idx_listing_published "
        "ON marketplace_listing(category, subtype, published_at DESC) "
        "WHERE status = 'published'"
    )
    # GIN on metadata jsonb_path_ops for Hyperion discovery containment.
    op.execute(
        "CREATE INDEX idx_listing_metadata_gin "
        "ON marketplace_listing USING GIN (metadata jsonb_path_ops)"
    )
    # pg_trgm title index for fuzzy match in discovery UI.
    op.execute(
        "CREATE INDEX idx_listing_title_trgm "
        "ON marketplace_listing USING GIN (title gin_trgm_ops)"
    )

    for sql in enable_tenant_rls("marketplace_listing"):
        op.execute(sql)
    for sql in grant_app_role_crud("marketplace_listing"):
        op.execute(sql)

    op.execute(
        """
        DROP TRIGGER IF EXISTS trg_marketplace_listing_set_updated_at
          ON marketplace_listing;
        CREATE TRIGGER trg_marketplace_listing_set_updated_at
          BEFORE UPDATE ON marketplace_listing
          FOR EACH ROW
          EXECUTE FUNCTION set_updated_at()
        """
    )


def downgrade() -> None:
    """Reverse upgrade in strict reverse dependency order."""

    op.execute(
        "DROP TRIGGER IF EXISTS trg_marketplace_listing_set_updated_at "
        "ON marketplace_listing"
    )
    for sql in disable_tenant_rls("marketplace_listing"):
        op.execute(sql)
    op.execute("DROP INDEX IF EXISTS idx_listing_title_trgm")
    op.execute("DROP INDEX IF EXISTS idx_listing_metadata_gin")
    op.execute("DROP INDEX IF EXISTS idx_listing_published")
    op.execute("DROP INDEX IF EXISTS idx_listing_tenant_created")
    op.execute("DROP INDEX IF EXISTS idx_listing_tenant_creator")
    op.execute("DROP INDEX IF EXISTS idx_listing_tenant_category_status")
    op.execute("DROP TABLE IF EXISTS marketplace_listing")
