"""hemera_flag + hemera_override + hemera_audit tables (NP Wave 1).

Revision ID: 025_hemera_flags
Revises: 020_email_transactional
Create Date: 2026-04-24 18:00:00.000000

Author: Hemera (W1 Feature Flag service, NP phase).
Contract refs:
    - docs/contracts/feature_flag.contract.md Section 3.1 tables
    - docs/contracts/feature_flag.contract.md Section 3.2 audit trigger
    - docs/contracts/feature_flag.contract.md Section 3.3 default flags

Chain placement
---------------
Branches off the committed Chain A head (``020_email_transactional``)
alongside Chione (``010_file_storage_manifest``) and Pheme. Aether's
Session 3 scaffold (``030_app_user_extensions`` through
``038_vendor_adapter``) forms a separate Chain B off ``000_baseline``
that V4 merges via ``alembic merge heads`` once all three agents land.
The Hemera tables only FK to ``app_user(id)``, which is created in
``000_baseline``, so Hemera does not require any Chain B migration to
apply. At merge-time the heads reconcile cleanly without reshuffling
Hemera's revision id.

Scope
-----
Ships the three global (non-tenant-scoped) tables that back the Hemera
feature flag service plus two audit triggers (one per mutating table)
and the supporting indexes. Default flag seed + judges/Ghaisan/demo
whitelist override seed live under ``src/backend/db/seed/`` and are
applied by an out-of-band psql invocation, NOT by this migration; the
seed file is idempotent via ``ON CONFLICT`` so it may be re-applied.

Design notes
------------
- All three tables are GLOBAL per contract 3.1: flags drive
  platform-wide behaviour so tenant RLS would strand the admin UI from
  seeing effective state. Row access is gated at the API layer via the
  admin-scope check in the flag router instead of at Postgres.
- ``hemera_override.scope_kind`` + ``scope_id`` encode the precedence
  dimension (user > tenant > global). A UNIQUE index on
  ``(flag_name, scope_kind, scope_id)`` keeps the override table flat.
- The audit trigger fires ``AFTER`` not ``BEFORE`` so the canonical row
  state has already been written; the trigger reads from ``NEW`` / ``OLD``
  without risk of re-entering and re-firing. A ``pg_trigger_depth() < 2``
  guard is wrapped around the body anyway per contract 3.2 as defence
  against future triggers that mutate the same tables.
- ``current_setting('hemera.actor_id', true)`` with the ``missing_ok``
  second argument means the GUC may be unset (system cron sweep writes
  a NULL actor) and the trigger tolerates that gracefully.
- Audit rows include ``scope_kind`` + ``scope_id`` on flag-level actions
  (flag_created, flag_updated, flag_deleted) with both set NULL so the
  column shape is uniform across the six override actions.
- ``audit_hemera_override`` and ``audit_hemera_flag`` are two separate
  trigger functions because the action enum differs per table. Sharing
  a single function forces an IF ladder on ``TG_TABLE_NAME`` which is
  brittle against typos.
- Seed data is applied via a separate SQL file (``db/seed/default_flags.sql``)
  so the migration stays idempotent and the seed can be re-applied in
  development without re-running the DDL.
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "025_hemera_flags"
down_revision: Union[str, Sequence[str], None] = "020_email_transactional"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# SQL for the audit function on hemera_override. Shared between upgrade()
# and the inline docstring above so operators see identical text. The
# ``pg_trigger_depth() < 2`` guard protects against future recursive
# triggers; at depth >= 2 we silently return without emitting another
# audit row.
HEMERA_OVERRIDE_AUDIT_FN = """
CREATE OR REPLACE FUNCTION hemera_override_audit_fn() RETURNS trigger AS $$
DECLARE
  actor uuid := NULLIF(current_setting('hemera.actor_id', true), '')::uuid;
  op_name text;
BEGIN
  IF pg_trigger_depth() >= 2 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO hemera_audit(actor_user_id, flag_name, scope_kind, scope_id,
                              action, new_value, reason)
    VALUES (actor, NEW.flag_name, NEW.scope_kind, NEW.scope_id,
            'override_created', NEW.value, NEW.reason);
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO hemera_audit(actor_user_id, flag_name, scope_kind, scope_id,
                              action, old_value, new_value, reason)
    VALUES (actor, NEW.flag_name, NEW.scope_kind, NEW.scope_id,
            'override_updated', OLD.value, NEW.value, NEW.reason);
  ELSIF TG_OP = 'DELETE' THEN
    -- ``override_expired`` is written by the TTL sweep job using
    -- ``SET LOCAL hemera.audit_action = 'override_expired'`` before the
    -- DELETE; the trigger honours the override so the sweep-driven
    -- deletions appear with the right action in the audit stream.
    op_name := COALESCE(
      NULLIF(current_setting('hemera.audit_action', true), ''),
      'override_deleted'
    );
    INSERT INTO hemera_audit(actor_user_id, flag_name, scope_kind, scope_id,
                              action, old_value, reason)
    VALUES (actor, OLD.flag_name, OLD.scope_kind, OLD.scope_id,
            op_name, OLD.value, OLD.reason);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
"""


# SQL for the audit function on hemera_flag. Separate function because
# the action enum values differ from hemera_override's.
HEMERA_FLAG_AUDIT_FN = """
CREATE OR REPLACE FUNCTION hemera_flag_audit_fn() RETURNS trigger AS $$
DECLARE
  actor uuid := NULLIF(current_setting('hemera.actor_id', true), '')::uuid;
BEGIN
  IF pg_trigger_depth() >= 2 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO hemera_audit(actor_user_id, flag_name, action, new_value)
    VALUES (actor, NEW.flag_name, 'flag_created', NEW.default_value);
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO hemera_audit(actor_user_id, flag_name, action,
                              old_value, new_value)
    VALUES (actor, NEW.flag_name, 'flag_updated',
            OLD.default_value, NEW.default_value);
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO hemera_audit(actor_user_id, flag_name, action, old_value)
    VALUES (actor, OLD.flag_name, 'flag_deleted', OLD.default_value);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
"""


def upgrade() -> None:
    """Create the three tables + indexes + audit triggers. No seed."""

    # --- hemera_flag (global, flag registry) -----------------------------

    op.execute(
        """
        CREATE TABLE hemera_flag (
            flag_name      text PRIMARY KEY,
            default_value  jsonb NOT NULL,
            kind           text NOT NULL
                CHECK (kind IN ('boolean', 'number', 'string', 'object', 'array')),
            description    text,
            owner_agent    text,
            tags           text[] NOT NULL DEFAULT '{}',
            created_at     timestamptz NOT NULL DEFAULT now(),
            updated_at     timestamptz NOT NULL DEFAULT now(),
            created_by     uuid REFERENCES app_user(id) ON DELETE SET NULL
        )
        """
    )

    # Expressed as a partial index so flag-catalog queries that filter by
    # tag (``tags @> '{demo}'``) can short-circuit. GIN supports array ops.
    op.execute(
        "CREATE INDEX idx_hemera_flag_tags ON hemera_flag USING GIN (tags)"
    )

    # --- hemera_override (global, per-scope overrides) -------------------

    op.execute(
        """
        CREATE TABLE hemera_override (
            id           bigserial PRIMARY KEY,
            flag_name    text NOT NULL
                REFERENCES hemera_flag(flag_name) ON DELETE CASCADE,
            scope_kind   text NOT NULL
                CHECK (scope_kind IN ('user', 'tenant', 'global')),
            scope_id     uuid,
            value        jsonb NOT NULL,
            expires_at   timestamptz,
            reason       text,
            created_by   uuid REFERENCES app_user(id) ON DELETE SET NULL,
            created_at   timestamptz NOT NULL DEFAULT now(),
            updated_at   timestamptz NOT NULL DEFAULT now(),
            UNIQUE (flag_name, scope_kind, scope_id)
        )
        """
    )

    # Scope sanity: user + tenant require a non-NULL scope_id; global
    # requires NULL. Enforced via CHECK to avoid drift at the API layer.
    op.execute(
        """
        ALTER TABLE hemera_override
        ADD CONSTRAINT hemera_override_scope_id_shape
        CHECK (
            (scope_kind IN ('user', 'tenant') AND scope_id IS NOT NULL)
            OR (scope_kind = 'global' AND scope_id IS NULL)
        )
        """
    )

    # Partial index for the TTL sweep cron's ``WHERE expires_at < now()``
    # scan. Partial because most overrides are permanent (no expiry).
    op.execute(
        "CREATE INDEX idx_hemera_override_expires "
        "ON hemera_override(expires_at) WHERE expires_at IS NOT NULL"
    )

    # --- hemera_audit (global, append-only audit trail) ------------------

    op.execute(
        """
        CREATE TABLE hemera_audit (
            id             bigserial PRIMARY KEY,
            actor_user_id  uuid,
            flag_name      text NOT NULL,
            scope_kind     text,
            scope_id       uuid,
            action         text NOT NULL CHECK (action IN (
                'flag_created', 'flag_updated', 'flag_deleted',
                'override_created', 'override_updated', 'override_deleted',
                'override_expired'
            )),
            old_value      jsonb,
            new_value      jsonb,
            reason         text,
            at             timestamptz NOT NULL DEFAULT now()
        )
        """
    )

    op.execute(
        "CREATE INDEX idx_hemera_audit_flag_at "
        "ON hemera_audit(flag_name, at DESC)"
    )
    op.execute(
        "CREATE INDEX idx_hemera_audit_actor_at "
        "ON hemera_audit(actor_user_id, at DESC) "
        "WHERE actor_user_id IS NOT NULL"
    )

    # --- Audit trigger functions + triggers ------------------------------

    op.execute(HEMERA_OVERRIDE_AUDIT_FN)
    op.execute(HEMERA_FLAG_AUDIT_FN)

    op.execute(
        "CREATE TRIGGER hemera_override_audit_trg "
        "AFTER INSERT OR UPDATE OR DELETE ON hemera_override "
        "FOR EACH ROW EXECUTE FUNCTION hemera_override_audit_fn()"
    )
    op.execute(
        "CREATE TRIGGER hemera_flag_audit_trg "
        "AFTER INSERT OR UPDATE OR DELETE ON hemera_flag "
        "FOR EACH ROW EXECUTE FUNCTION hemera_flag_audit_fn()"
    )

    # --- Grants for the app role ----------------------------------------
    # No RLS: global tables. Admin-scope check is enforced at the API
    # layer by the flag router. The app role needs CRUD on all three:
    # SELECT for read-paths, INSERT/UPDATE/DELETE for mutation. The audit
    # table is append-only at the API layer but we grant UPDATE/DELETE to
    # satisfy Postgres' requirement that the owner of the trigger function
    # (nerium_api) be able to insert into it from within the trigger; the
    # API's audit router is read-only and enforces that boundary in code.
    op.execute(
        "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE hemera_flag TO nerium_api"
    )
    op.execute(
        "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE hemera_override TO nerium_api"
    )
    op.execute(
        "GRANT SELECT, INSERT ON TABLE hemera_audit TO nerium_api"
    )
    # bigserial owns an implicit sequence that the app role must also
    # hold USAGE on for INSERT of the bigserial PK to succeed.
    op.execute(
        "GRANT USAGE, SELECT ON SEQUENCE hemera_override_id_seq TO nerium_api"
    )
    op.execute(
        "GRANT USAGE, SELECT ON SEQUENCE hemera_audit_id_seq TO nerium_api"
    )


def downgrade() -> None:
    """Reverse upgrade: drop triggers, functions, indexes, tables."""

    op.execute("DROP TRIGGER IF EXISTS hemera_flag_audit_trg ON hemera_flag")
    op.execute(
        "DROP TRIGGER IF EXISTS hemera_override_audit_trg ON hemera_override"
    )
    op.execute("DROP FUNCTION IF EXISTS hemera_flag_audit_fn()")
    op.execute("DROP FUNCTION IF EXISTS hemera_override_audit_fn()")

    op.execute("DROP INDEX IF EXISTS idx_hemera_audit_actor_at")
    op.execute("DROP INDEX IF EXISTS idx_hemera_audit_flag_at")
    op.execute("DROP TABLE IF EXISTS hemera_audit")

    op.execute("DROP INDEX IF EXISTS idx_hemera_override_expires")
    op.execute("DROP TABLE IF EXISTS hemera_override")

    op.execute("DROP INDEX IF EXISTS idx_hemera_flag_tags")
    op.execute("DROP TABLE IF EXISTS hemera_flag")
