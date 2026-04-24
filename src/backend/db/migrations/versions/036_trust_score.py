"""trust_score table: scaffold for Astraea's precomputed score surface.

Revision ID: 036_trust_score
Revises: 035_transaction_ledger
Create Date: 2026-04-24 20:00:00.000000

Author: Aether (W1 FastAPI core, NP phase Session 3)
Contract refs:
    - docs/contracts/trust_score.contract.md Section 3 schema.
    - docs/contracts/postgres_multi_tenant.contract.md Section 3.2 RLS.

Scope
-----
Astraea's full contract ships a ``trust_score_snapshot`` + weights table
with Bayesian-Wilson precomputation. Aether seeds the minimal ``trust_score``
table that downstream surfaces (identity card, marketplace listing cache,
MCP get_trust_score tool) can read with a stable column set. Astraea
extends with the snapshot table, formula weights, boost components, and
stability band in Wave 2.

Design notes
------------
- ``subject_type`` + ``subject_id`` polymorphic pair covers
  user / agent / listing scoring without separate tables per kind. The
  combination is UNIQUE-ified by ``(tenant_id, subject_type, subject_id,
  category)`` so "overall" and per-category scores coexist.
- ``score numeric(5,4)`` gives 4 decimal precision over [0.0, 1.0]
  (check constraint enforces bounds). Astraea's contract uses 3-decimal
  ``numeric(4,3)``; keeping one extra digit here is forward-compatible
  (Astraea can cast down in her Wave 2 SELECT).
- ``signal_count`` surfaces the sample size so UI can show "based on 12
  reviews" without a join back to the underlying signals.
- ``precomputed_at`` is the last time Astraea's cron refreshed the row.
  Consumers should read this and render staleness warnings if > 24 h.
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

from src.backend.db.rls import enable_tenant_rls, grant_app_role_crud, disable_tenant_rls


# revision identifiers, used by Alembic.
revision: str = "036_trust_score"
down_revision: Union[str, Sequence[str], None] = "035_transaction_ledger"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create trust_score with indexes, grants, RLS, trigger."""

    op.execute(
        """
        CREATE TABLE trust_score (
            id              uuid PRIMARY KEY,
            tenant_id       uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
            subject_type    text NOT NULL
                            CHECK (subject_type IN ('user', 'agent', 'listing')),
            subject_id      uuid NOT NULL,
            category        text NOT NULL
                            CHECK (category IN (
                              'reliability', 'accuracy', 'uptime',
                              'quality', 'overall'
                            )),
            score           numeric(5, 4) NOT NULL
                            CHECK (score >= 0 AND score <= 1),
            signal_count    int NOT NULL DEFAULT 0 CHECK (signal_count >= 0),
            precomputed_at  timestamptz,
            metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
            created_at      timestamptz NOT NULL DEFAULT now(),
            updated_at      timestamptz NOT NULL DEFAULT now(),
            UNIQUE (tenant_id, subject_type, subject_id, category)
        )
        """
    )

    op.execute(
        "CREATE INDEX idx_trust_score_tenant_subject "
        "ON trust_score(tenant_id, subject_type, score DESC)"
    )
    op.execute(
        "CREATE INDEX idx_trust_score_tenant_created "
        "ON trust_score(tenant_id, created_at DESC)"
    )
    op.execute(
        "CREATE INDEX idx_trust_score_precomputed "
        "ON trust_score(precomputed_at DESC) "
        "WHERE precomputed_at IS NOT NULL"
    )
    # Subject-first lookup for per-agent / per-listing card render.
    op.execute(
        "CREATE INDEX idx_trust_score_subject_lookup "
        "ON trust_score(subject_type, subject_id, category)"
    )

    for sql in enable_tenant_rls("trust_score"):
        op.execute(sql)
    for sql in grant_app_role_crud("trust_score"):
        op.execute(sql)

    op.execute(
        """
        DROP TRIGGER IF EXISTS trg_trust_score_set_updated_at ON trust_score;
        CREATE TRIGGER trg_trust_score_set_updated_at
          BEFORE UPDATE ON trust_score
          FOR EACH ROW
          EXECUTE FUNCTION set_updated_at()
        """
    )


def downgrade() -> None:
    """Reverse upgrade in strict reverse dependency order."""

    op.execute(
        "DROP TRIGGER IF EXISTS trg_trust_score_set_updated_at ON trust_score"
    )
    for sql in disable_tenant_rls("trust_score"):
        op.execute(sql)
    op.execute("DROP INDEX IF EXISTS idx_trust_score_subject_lookup")
    op.execute("DROP INDEX IF EXISTS idx_trust_score_precomputed")
    op.execute("DROP INDEX IF EXISTS idx_trust_score_tenant_created")
    op.execute("DROP INDEX IF EXISTS idx_trust_score_tenant_subject")
    op.execute("DROP TABLE IF EXISTS trust_score")
