"""email_message + email_unsubscribe + email_bounce tables (NP Wave 1).

Revision ID: 020_email_transactional
Revises: 010_file_storage_manifest
Create Date: 2026-04-24 17:30:00.000000

Author: Pheme (W1 Transactional Email, NP phase)
Contract refs:
    - docs/contracts/email_transactional.contract.md Section 3.1 schema
    - docs/contracts/postgres_multi_tenant.contract.md Section 3.2 RLS

Scope
-----
Ships the three tables that back the Pheme transactional email
pipeline plus the supporting indexes. Only ``email_message`` is
tenant-scoped; ``email_unsubscribe`` and ``email_bounce`` are global
because email-address validity crosses tenants.

Design notes
------------
- ``idempotency_key`` uses a partial UNIQUE index (WHERE NOT NULL) so
  sends without an idempotency key remain free to deduplicate via
  other mechanisms.
- ``status`` is a CHECK-constrained string rather than a Postgres
  enum to avoid the CREATE TYPE lifecycle friction (drop/cascade on
  migration downgrade). Contract Section 3.1 calls out the six
  allowed values explicitly.
- ``tags`` carries Selene-facing tags; Resend-facing tags are encoded
  inside ``props`` at send time. Keeping them separate avoids leaking
  provider-specific concerns into the row.
- ``props`` is jsonb for flexible template arguments. We do NOT index
  into props per-key; queries filter by template_name + status.
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

from src.backend.db.rls import disable_tenant_rls, enable_tenant_rls, grant_app_role_crud

# revision identifiers, used by Alembic.
revision: str = "020_email_transactional"
down_revision: Union[str, Sequence[str], None] = "010_file_storage_manifest"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create the three tables + indexes + RLS on email_message."""

    # --- email_message (tenant-scoped) -----------------------------------

    op.execute(
        """
        CREATE TABLE email_message (
            id                   uuid PRIMARY KEY,
            tenant_id            uuid REFERENCES tenant(id) ON DELETE CASCADE,
            user_id              uuid REFERENCES app_user(id) ON DELETE SET NULL,
            template_name        text NOT NULL,
            template_version     text NOT NULL,
            to_email             citext NOT NULL,
            from_email           citext NOT NULL,
            reply_to             citext,
            subject              text NOT NULL,
            props                jsonb NOT NULL DEFAULT '{}'::jsonb,
            rendered_html        text,
            rendered_text        text,
            provider_message_id  text,
            status               text NOT NULL DEFAULT 'queued'
                CHECK (status IN (
                    'queued', 'sending', 'sent', 'failed',
                    'bounced', 'complained'
                )),
            sent_at              timestamptz,
            failure_reason       text,
            retry_count          int NOT NULL DEFAULT 0,
            idempotency_key      text,
            tags                 text[] NOT NULL DEFAULT '{}',
            created_at           timestamptz NOT NULL DEFAULT now(),
            updated_at           timestamptz NOT NULL DEFAULT now()
        )
        """
    )

    # Indexes per contract Section 3.1.
    op.execute(
        "CREATE INDEX idx_email_message_tenant_created "
        "ON email_message(tenant_id, created_at DESC)"
    )
    op.execute(
        "CREATE INDEX idx_email_message_status "
        "ON email_message(status) "
        "WHERE status IN ('queued', 'sending')"
    )
    op.execute(
        "CREATE INDEX idx_email_message_sent_at "
        "ON email_message(sent_at) "
        "WHERE sent_at IS NOT NULL"
    )
    op.execute(
        "CREATE INDEX idx_email_message_provider_message "
        "ON email_message(provider_message_id) "
        "WHERE provider_message_id IS NOT NULL"
    )
    op.execute(
        "CREATE INDEX idx_email_message_template "
        "ON email_message(template_name, created_at DESC)"
    )
    op.execute(
        "CREATE UNIQUE INDEX idx_email_message_idempotency "
        "ON email_message(to_email, idempotency_key) "
        "WHERE idempotency_key IS NOT NULL"
    )

    # RLS for the tenant-scoped table. ``tenant_id`` is NULLABLE on
    # this table (system mail) so the policy uses the same pattern as
    # the rest of the schema: rows with NULL tenant are invisible to
    # the app role except when ``app.tenant_id`` is explicitly set to
    # the sentinel uuid (not used in the NP build). Admin role access
    # bypasses RLS via BYPASSRLS.
    for sql in enable_tenant_rls("email_message"):
        op.execute(sql)
    for sql in grant_app_role_crud("email_message"):
        op.execute(sql)

    # --- email_unsubscribe (global) --------------------------------------

    op.execute(
        """
        CREATE TABLE email_unsubscribe (
            id                uuid PRIMARY KEY,
            email             citext UNIQUE NOT NULL,
            categories        text[] NOT NULL DEFAULT '{}',
            reason            text,
            unsubscribed_at   timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        "CREATE INDEX idx_email_unsubscribe_unsubscribed_at "
        "ON email_unsubscribe(unsubscribed_at DESC)"
    )
    # No RLS: this table is global on purpose. Grant CRUD directly.
    op.execute(
        "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE email_unsubscribe "
        "TO nerium_api"
    )

    # --- email_bounce (global) -------------------------------------------

    op.execute(
        """
        CREATE TABLE email_bounce (
            id                  uuid PRIMARY KEY,
            to_email            citext NOT NULL,
            bounce_type         text NOT NULL
                CHECK (bounce_type IN ('hard', 'soft', 'complaint')),
            provider_event      jsonb NOT NULL,
            created_at          timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        "CREATE INDEX idx_email_bounce_email "
        "ON email_bounce(to_email, created_at DESC)"
    )
    op.execute(
        "CREATE INDEX idx_email_bounce_type "
        "ON email_bounce(bounce_type, created_at DESC)"
    )
    op.execute(
        "GRANT SELECT, INSERT ON TABLE email_bounce TO nerium_api"
    )


def downgrade() -> None:
    """Reverse upgrade: drop indexes, tables, policy. Leave extensions."""

    op.execute("DROP INDEX IF EXISTS idx_email_bounce_type")
    op.execute("DROP INDEX IF EXISTS idx_email_bounce_email")
    op.execute("DROP TABLE IF EXISTS email_bounce")

    op.execute("DROP INDEX IF EXISTS idx_email_unsubscribe_unsubscribed_at")
    op.execute("DROP TABLE IF EXISTS email_unsubscribe")

    for sql in disable_tenant_rls("email_message"):
        op.execute(sql)
    op.execute("DROP INDEX IF EXISTS idx_email_message_idempotency")
    op.execute("DROP INDEX IF EXISTS idx_email_message_template")
    op.execute("DROP INDEX IF EXISTS idx_email_message_provider_message")
    op.execute("DROP INDEX IF EXISTS idx_email_message_sent_at")
    op.execute("DROP INDEX IF EXISTS idx_email_message_status")
    op.execute("DROP INDEX IF EXISTS idx_email_message_tenant_created")
    op.execute("DROP TABLE IF EXISTS email_message")
