"""Eunomia admin ops: moderation_event + consent_event (W2 NP P6 S1).

Revision ID: 051_eunomia_admin_moderation_gdpr
Revises: 050_marketplace_commerce
Create Date: 2026-04-24 16:00:00.000000

Author: Eunomia (W2 NP P6 Session 1).

Contract refs
-------------
- docs/contracts/marketplace_listing.contract.md Section 5 event signatures
  (``marketplace.listing.submitted`` consumer landing here).
- docs/contracts/feature_flag.contract.md (admin flag UI already shipped
  at ``/v1/admin/flags``; moderation surfaces a sibling admin pillar).
- docs/contracts/postgres_multi_tenant.contract.md Section 3.2 RLS.

Scope (Session 1 only; Session 2 CUT per V4 #6 budget lock)
-----------------------------------------------------------
1. ``moderation_event`` table. Audit trail for admin approve/reject
   decisions on marketplace listings. One row per decision; never
   mutated. Required for the "who signed off on that rejection"
   question plus the moderation dashboard feed.
2. ``consent_event`` table. GDPR consent history. One row per
   user-initiated consent grant/revoke plus one seeded row at signup.
   Klaro (Session 2 CUT) will emit events into this table; the
   ``POST /v1/me/consent`` endpoint lands in Session 1 and writes
   directly.

Name-space note
---------------
Moderation + consent share this migration because they are tightly
coupled Eunomia tables (one admin-scoped, one user-scoped) and
splitting them would leave a tiny 052 for consent. Keeping them in
one revision matches the Plutus + Iapetus pattern where related
tables ship together.

Chain placement
---------------
Chains off ``050_marketplace_commerce`` (Iapetus W2 NP P4 S1) which
is the single head at author time. No branch, no merge revision.

Design notes
------------
- ``moderation_event.action`` is TEXT + CHECK, not native ENUM, so a
  future action value (``dismiss``, ``escalate``) lands via ALTER
  CHECK without a type migration dance.
- ``moderation_event.reason`` is nullable; enforced NOT NULL-when-
  action='reject' at the app layer rather than via a CHECK so the
  error path surfaces a problem+json with a useful detail.
- ``moderation_event`` is admin-only. RLS is applied with an admin-
  scope-friendly policy that allows ``tenant_id IS NULL`` cross-tenant
  visibility plus the standard per-tenant isolation. Admin panel sets
  ``SET LOCAL app.tenant_id = '00000000-0000-0000-0000-000000000000'``
  for its reads via the existing tenant binding bypass for ``/admin``.
- ``consent_event`` is user-scoped under standard tenant RLS so a user
  can only read their own history. The ``user_id`` + ``tenant_id``
  pair is indexed for the ``GET /v1/me/consent/history`` paginated read.
- ``consent_type`` CHECK enum matches the Klaro config service namespace
  (analytics / marketing / functional / necessary). Necessary consent is
  always granted for the app to run; recording it gives a complete audit
  view so regulators can see the user never toggled it off (we never
  offered the choice).
- ``ip_address`` is stored as INET per Postgres convention; an IPv4 or
  IPv6 address both round-trip as strings without a CAST.
- ``user_agent`` is TEXT (unbounded) rather than VARCHAR(N) so future
  longer browser UA strings do not force a migration.
- Indexes tuned for the read patterns:
  * moderation_event: lookup by listing_id + timestamp DESC (audit feed)
    and by moderator_id + timestamp DESC (per-admin decisions list).
  * consent_event: lookup by user_id + timestamp DESC (history endpoint).
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
revision: str = "051_eunomia_admin_moderation_gdpr"
down_revision: Union[str, Sequence[str], None] = "050_marketplace_commerce"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ---------------------------------------------------------------------------
# moderation_event
# ---------------------------------------------------------------------------

_MODERATION_EVENT_DDL = """
CREATE TABLE moderation_event (
    id              uuid PRIMARY KEY,
    tenant_id       uuid REFERENCES tenant(id) ON DELETE CASCADE,
    moderator_id    uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
    listing_id      uuid NOT NULL REFERENCES marketplace_listing(id) ON DELETE CASCADE,
    action          text NOT NULL
                    CHECK (action IN ('approve', 'reject')),
    reason          text,
    metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
)
"""


# ---------------------------------------------------------------------------
# consent_event
# ---------------------------------------------------------------------------

_CONSENT_EVENT_DDL = """
CREATE TABLE consent_event (
    id              uuid PRIMARY KEY,
    tenant_id       uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    user_id         uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    consent_type    text NOT NULL
                    CHECK (consent_type IN (
                        'analytics', 'marketing', 'functional', 'necessary'
                    )),
    granted         boolean NOT NULL,
    source          text NOT NULL DEFAULT 'banner'
                    CHECK (source IN (
                        'signup', 'banner', 'settings', 'admin', 'klaro'
                    )),
    ip_address      inet,
    user_agent      text,
    created_at      timestamptz NOT NULL DEFAULT now()
)
"""


def upgrade() -> None:
    """Create moderation_event + consent_event + RLS + indexes."""

    # ------------------------------------------------------------------
    # 1. moderation_event
    # ------------------------------------------------------------------
    op.execute(_MODERATION_EVENT_DDL)
    op.execute(
        "CREATE INDEX idx_moderation_event_listing "
        "ON moderation_event(listing_id, created_at DESC)"
    )
    op.execute(
        "CREATE INDEX idx_moderation_event_moderator "
        "ON moderation_event(moderator_id, created_at DESC)"
    )
    op.execute(
        "CREATE INDEX idx_moderation_event_created "
        "ON moderation_event(created_at DESC)"
    )
    # Admin-read policy: tenant_id NULL is always visible so admin-scope
    # queries without a tenant context can read the full feed. When a
    # tenant binds explicitly, they see only rows scoped to that tenant.
    op.execute("ALTER TABLE moderation_event ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE moderation_event FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY tenant_isolation ON moderation_event
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
        "ON TABLE moderation_event TO nerium_api"
    )

    # ------------------------------------------------------------------
    # 2. consent_event
    # ------------------------------------------------------------------
    op.execute(_CONSENT_EVENT_DDL)
    op.execute(
        "CREATE INDEX idx_consent_event_user "
        "ON consent_event(user_id, created_at DESC)"
    )
    op.execute(
        "CREATE INDEX idx_consent_event_tenant_user_type "
        "ON consent_event(tenant_id, user_id, consent_type, created_at DESC)"
    )
    for sql in enable_tenant_rls("consent_event"):
        op.execute(sql)
    for sql in grant_app_role_crud("consent_event"):
        op.execute(sql)


def downgrade() -> None:
    """Strict reverse order: consent_event, moderation_event."""

    # 2. consent_event
    for sql in disable_tenant_rls("consent_event"):
        op.execute(sql)
    op.execute("DROP INDEX IF EXISTS idx_consent_event_tenant_user_type")
    op.execute("DROP INDEX IF EXISTS idx_consent_event_user")
    op.execute("DROP TABLE IF EXISTS consent_event")

    # 1. moderation_event
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON moderation_event")
    op.execute("ALTER TABLE moderation_event NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE moderation_event DISABLE ROW LEVEL SECURITY")
    op.execute("DROP INDEX IF EXISTS idx_moderation_event_created")
    op.execute("DROP INDEX IF EXISTS idx_moderation_event_moderator")
    op.execute("DROP INDEX IF EXISTS idx_moderation_event_listing")
    op.execute("DROP TABLE IF EXISTS moderation_event")
