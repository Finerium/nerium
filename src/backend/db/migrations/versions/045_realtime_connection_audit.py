"""realtime_connection_audit table (Nike NP P3 Session 1).

Revision ID: 045_realtime_connection_audit
Revises: 040_ma_session
Create Date: 2026-04-24 22:00:00.000000

Author: Nike (W2 NP P3 Session 1).
Contract refs:
    - docs/contracts/realtime_bus.contract.md Section 5 lifecycle events.
    - docs/contracts/observability.contract.md Section 9 audit retention.
    - docs/contracts/postgres_multi_tenant.contract.md Section 4.2 RLS shape.

Chain placement
---------------
Branches off the Kratos head ``040_ma_session`` so the realtime audit
table lands atop the MA session schema. Future Nike S2 migrations
chain off this revision id when adding the JTI replay-protection
auxiliary table (post-hackathon, EdDSA mint flow).

Scope
-----
- Creates ``realtime_connection_audit`` row-per-event audit table.
- Indexes ``(tenant_id, created_at DESC)`` for tail queries.
- Enables tenant RLS policy + grants the app role CRUD privileges so
  Selene's admin surface (Eunomia) can render the table later through
  the standard tenant-scoped pool.

Design notes
------------
- ``id`` is a UUID v7 pk so listing by id is approximately time-ordered
  for free.
- ``connection_id`` is a UUID v7 string minted by the ConnectionManager
  on accept. We store it as ``text`` (not ``uuid``) so the column can
  hold the literal "-" sentinel surfaced by quota-rejection events
  that never received a connection id.
- ``metadata`` is jsonb so future fields (user agent, geo) drop in
  without a migration.
- We deliberately do NOT add a foreign key to ``app_user`` or
  ``tenant``: when those rows are deleted we want the audit history
  preserved (post-hackathon retention policy may rotate via TTL trim
  rather than cascade).
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

from src.backend.db.rls import enable_tenant_rls, grant_app_role_crud


# revision identifiers, used by Alembic.
revision: str = "045_realtime_connection_audit"
down_revision: Union[str, Sequence[str], None] = "040_ma_session"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE realtime_connection_audit (
            id              uuid PRIMARY KEY,
            tenant_id       uuid NOT NULL,
            user_id         uuid NOT NULL,
            connection_id   text NOT NULL,
            event_type      text NOT NULL
                CHECK (event_type IN ('connect', 'disconnect', 'timeout', 'error')),
            reason          text,
            metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
            created_at      timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        "CREATE INDEX idx_realtime_audit_tenant_created "
        "ON realtime_connection_audit(tenant_id, created_at DESC)"
    )
    op.execute(
        "CREATE INDEX idx_realtime_audit_connection "
        "ON realtime_connection_audit(connection_id)"
    )

    for sql in enable_tenant_rls("realtime_connection_audit"):
        op.execute(sql)
    for sql in grant_app_role_crud("realtime_connection_audit"):
        op.execute(sql)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS realtime_connection_audit")
