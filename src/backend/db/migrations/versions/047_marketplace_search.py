"""marketplace search FTS + pgvector indexes (Hyperion W2 NP P1 S1).

Revision ID: 047_marketplace_search
Revises: 046_marketplace_listing_schema
Create Date: 2026-04-25 18:00:00.000000

Author: Hyperion (W2 NP P1 Session 1).
Contract refs:
    - docs/contracts/marketplace_search.contract.md Section 3.1 DDL
      (search_tsv + pg_trgm + pgvector + filter indexes).
    - docs/contracts/marketplace_listing.contract.md (substrate columns
      that feed the search doc: title, short_description, long_description,
      capability_tags, category, subtype).

Chain placement
---------------
Chains off ``046_marketplace_listing_schema`` (Phanes W2 NP P1 S1) which
is the single head at the time of authoring. Verified via
``tests/backend/marketplace/test_migration_chain.py``.

Scope
-----
Adds hybrid-search substrate to ``marketplace_listing``:

1. Enables ``pg_trgm`` (trigram similarity) and ``vector`` (pgvector)
   extensions. ``pg_trgm`` was also enabled by ``000_baseline`` so the
   IF NOT EXISTS guard is a no-op in a live chain.
2. Adds ``listing_search_doc tsvector`` column built from title (weight A),
   short_description + capability_tags (weight B), long_description (weight C),
   category + subtype (weight D). Config is ``'simple'`` (not ``'english'``)
   so bilingual Indonesian + English tokens pass through without stemming
   loss per contract Section 3.1.
3. Adds ``listing_embedding vector(1024)`` column. Dimension 1024 matches
   Voyage ``voyage-3.5`` native output + OpenAI ``text-embedding-3-small``
   with ``dimensions=1024`` param. Fallback path guarantees the same dim
   so pgvector's strict shape constraint is always satisfied.
4. Backfills ``listing_search_doc`` for every existing row via UPDATE
   with ``setweight`` so the seed listings from Phanes S2 become
   immediately searchable post-migration.
5. Creates indexes:
   - GIN on ``listing_search_doc`` for FTS match.
   - GIN with gin_trgm_ops on ``title`` for autocomplete + fuzzy match.
   - ivfflat on ``listing_embedding`` with ``vector_cosine_ops`` and
     ``lists=100`` per contract. HNSW (faster query, higher recall) is
     the documented post-hackathon upgrade per Section 11.
6. Installs trigger ``marketplace_listing_search_doc_update`` that
   recomputes ``listing_search_doc`` on INSERT or UPDATE of any source
   column. This removes the need for a generated column (which would
   require a rewrite in a later schema change) and lets us re-weight
   without a column-drop dance.

Extension policy
~~~~~~~~~~~~~~~~
``pg_trgm`` + ``vector`` are Postgres cluster-wide shared objects. We
do NOT drop them on downgrade because other tables may depend on
them; the downgrade reverts only the columns + indexes this revision
added.

pgvector availability
~~~~~~~~~~~~~~~~~~~~~
pgvector 0.5+ is required for ``vector_cosine_ops``. When the
extension is unavailable at deploy time, the migration halts in
``upgrade()`` on ``CREATE EXTENSION vector`` and the operator must
install the extension (``apt install postgresql-16-pgvector`` or
``brew install pgvector``) before retrying. The search router
degrades gracefully to FTS-only when the embedding column is missing
(see :mod:`src.backend.marketplace.search`).
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "047_marketplace_search"
down_revision: Union[str, Sequence[str], None] = "046_marketplace_listing_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Vector column dimension. 1024 matches Voyage voyage-3.5 native and
# OpenAI text-embedding-3-small with dimensions=1024 parameter. Changing
# this requires a new migration + re-embed of every row; it is NOT safe
# to edit in place.
VECTOR_DIM: int = 1024


def upgrade() -> None:
    """Add FTS + pgvector columns, indexes, and update trigger."""

    # ------------------------------------------------------------------
    # Extensions. pg_trgm ships in stdlib contrib and is already enabled
    # by 000_baseline; the IF NOT EXISTS guard is cheap. pgvector must
    # be installed at the cluster level first (see module docstring).
    # ------------------------------------------------------------------
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # ------------------------------------------------------------------
    # Columns. Both are nullable because a row is created before the
    # embedding is computed (embedding is an async background job) and
    # the tsvector is populated by the trigger on INSERT / UPDATE.
    # ------------------------------------------------------------------
    op.execute(
        f"""
        ALTER TABLE marketplace_listing
            ADD COLUMN IF NOT EXISTS listing_search_doc tsvector,
            ADD COLUMN IF NOT EXISTS listing_embedding vector({VECTOR_DIM})
        """
    )

    # ------------------------------------------------------------------
    # Trigger function that (re)builds listing_search_doc. Uses 'simple'
    # config per contract Section 3.1 so Indonesian tokens are not
    # stemmed as English. Weights:
    #   A = title                 (highest relevance)
    #   B = short_description + capability_tags
    #   C = long_description
    #   D = category + subtype    (lowest; mostly taxonomy boost)
    # ------------------------------------------------------------------
    op.execute(
        """
        CREATE OR REPLACE FUNCTION marketplace_listing_search_doc_fn()
        RETURNS trigger AS $$
        BEGIN
            NEW.listing_search_doc :=
                setweight(to_tsvector('simple', coalesce(NEW.title, '')), 'A') ||
                setweight(
                    to_tsvector(
                        'simple',
                        coalesce(NEW.short_description, '') || ' ' ||
                        coalesce(array_to_string(NEW.capability_tags, ' '), '')
                    ), 'B'
                ) ||
                setweight(to_tsvector('simple', coalesce(NEW.long_description, '')), 'C') ||
                setweight(
                    to_tsvector(
                        'simple',
                        coalesce(NEW.category, '') || ' ' || coalesce(NEW.subtype, '')
                    ), 'D'
                );
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
        """
    )

    op.execute("DROP TRIGGER IF EXISTS marketplace_listing_search_doc_update ON marketplace_listing")
    op.execute(
        """
        CREATE TRIGGER marketplace_listing_search_doc_update
        BEFORE INSERT OR UPDATE OF
            title, short_description, long_description,
            capability_tags, category, subtype
        ON marketplace_listing
        FOR EACH ROW
        EXECUTE FUNCTION marketplace_listing_search_doc_fn()
        """
    )

    # ------------------------------------------------------------------
    # Backfill: the trigger fires on INSERT/UPDATE only, so pre-existing
    # rows need a one-off rewrite. We touch every row with a no-op UPDATE
    # of title (trigger recomputes the doc). Index is built below so the
    # backfill benefits from it on subsequent reads.
    # ------------------------------------------------------------------
    op.execute(
        "UPDATE marketplace_listing SET title = title WHERE listing_search_doc IS NULL"
    )

    # ------------------------------------------------------------------
    # Indexes. Order matters: GIN after backfill so the index build sees
    # populated tsvectors without a concurrent write race.
    # ------------------------------------------------------------------
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_listing_search_doc "
        "ON marketplace_listing USING GIN (listing_search_doc)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_listing_title_trgm "
        "ON marketplace_listing USING GIN (title gin_trgm_ops)"
    )
    # ivfflat requires rows to exist when the index is built for the k-means
    # centroid step to work; on an empty table it falls back to a full scan.
    # lists=100 is a reasonable default for <100k rows per pgvector guidance.
    # HNSW upgrade is a future revision (see docstring + contract Section 11).
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_listing_embedding "
        "ON marketplace_listing USING ivfflat "
        "(listing_embedding vector_cosine_ops) WITH (lists = 100)"
    )


def downgrade() -> None:
    """Reverse order: indexes, trigger, trigger function, columns.

    Extensions (pg_trgm, vector) are NOT dropped because they are cluster
    shared and may be depended on by other tables or other migrations.
    """

    op.execute("DROP INDEX IF EXISTS idx_listing_embedding")
    op.execute("DROP INDEX IF EXISTS idx_listing_title_trgm")
    op.execute("DROP INDEX IF EXISTS idx_listing_search_doc")

    op.execute(
        "DROP TRIGGER IF EXISTS marketplace_listing_search_doc_update "
        "ON marketplace_listing"
    )
    op.execute("DROP FUNCTION IF EXISTS marketplace_listing_search_doc_fn()")

    op.execute(
        """
        ALTER TABLE marketplace_listing
            DROP COLUMN IF EXISTS listing_embedding,
            DROP COLUMN IF EXISTS listing_search_doc
        """
    )
