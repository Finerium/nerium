"""ma_session + ma_event + ma_step tables (NP P2 Wave 2).

Revision ID: 040_ma_session
Revises: f0cce6103282
Create Date: 2026-04-24 20:00:00.000000

Author: Kratos (W2 Builder runtime, NP phase P2 Session 1).
Contract refs:
    - docs/contracts/ma_session_lifecycle.contract.md Section 3.1 DDL.
    - docs/contracts/agent_orchestration_runtime.contract.md Section 3
      (state enum, DAG primitives).
    - docs/contracts/postgres_multi_tenant.contract.md Section 3.4 shared
      enum ``ma_session_status`` (locked 7 values).
    - docs/contracts/postgres_multi_tenant.contract.md Section 4.2 RLS
      policy shape consumed via src.backend.db.rls helpers.

Chain placement
---------------
Branches off the committed W1 merge head ``f0cce6103282`` so the P2
Builder runtime tables land atop the fully reconciled Aether chain B +
Hemera chain A. Downstream Kratos migrations (S2 adds cost rollup
materialised view, S3 adds ma_stream_pos index) chain off this
revision id.

Scope
-----
- Creates ``ma_session_status`` enum (7 locked values).
- Creates ``ma_session`` table + indexes + RLS + updated_at trigger +
  grants.
- Creates ``ma_event`` append-only event log + RLS (mirrors parent
  tenant binding for defence-in-depth).
- Creates ``ma_step`` outer-DAG state rows + RLS.
- Idempotency unique constraint on ``(user_id, idempotency_key)`` per
  ``ma_session_lifecycle.contract.md`` Section 3.1.

Design notes
------------
- ``prompt_preview`` is GENERATED ALWAYS so list endpoints can surface
  a short preview without re-slicing the full prompt at query time.
- The tenant column on ``ma_event`` + ``ma_step`` is carried via
  ``session_id`` FK cascade (rows disappear when the parent session
  does). We still add direct RLS policies on them so an admin tool
  that bypasses the session JOIN still sees tenant isolation.
- Status transitions are application-enforced via
  :func:`src.backend.ma.state_machine.assert_transition`; no CHECK
  constraint on the database side because Postgres enums already reject
  bad values and a full transition matrix in SQL would triple the
  CHECK expression length for marginal safety.
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

from src.backend.db.rls import enable_tenant_rls, grant_app_role_crud


# revision identifiers, used by Alembic.
revision: str = "040_ma_session"
down_revision: Union[str, Sequence[str], None] = "f0cce6103282"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create the three MA runtime tables + indexes + RLS + grants."""

    # --- Shared enum --------------------------------------------------
    # The enum is used by both ma_session and future dispatcher code;
    # creating it here keeps the migration self-contained even though
    # postgres_multi_tenant.contract.md names it as a shared enum. We
    # guard with ``IF NOT EXISTS`` so re-running partial migrations
    # (e.g. after fixing a downstream error) does not trip.
    op.execute(
        """
        DO $$ BEGIN
            CREATE TYPE ma_session_status AS ENUM (
                'queued', 'running', 'streaming', 'completed',
                'cancelled', 'failed', 'budget_capped'
            );
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
        """
    )

    # --- ma_session ---------------------------------------------------
    op.execute(
        """
        CREATE TABLE ma_session (
            id                   uuid PRIMARY KEY,
            tenant_id            uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
            user_id              uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
            mode                 text NOT NULL
                CHECK (mode IN ('web', 'tauri', 'mcp')),
            model                text NOT NULL,
            status               ma_session_status NOT NULL DEFAULT 'queued',
            system_prompt        text,
            prompt               text NOT NULL,
            prompt_preview       text
                GENERATED ALWAYS AS (substring(prompt from 1 for 200)) STORED,
            max_tokens           int NOT NULL DEFAULT 8192
                CHECK (max_tokens BETWEEN 256 AND 32768),
            budget_usd_cap       numeric(10, 4) NOT NULL DEFAULT 5.0
                CHECK (budget_usd_cap >= 0.01),
            thinking             boolean NOT NULL DEFAULT false,
            tools                jsonb NOT NULL DEFAULT '[]'::jsonb,
            input_tokens         int NOT NULL DEFAULT 0,
            output_tokens        int NOT NULL DEFAULT 0,
            cache_read_tokens    int NOT NULL DEFAULT 0,
            cache_write_tokens   int NOT NULL DEFAULT 0,
            cost_usd             numeric(10, 4) NOT NULL DEFAULT 0.0,
            anthropic_message_id text,
            stop_reason          text,
            error                jsonb,
            idempotency_key      text,
            created_at           timestamptz NOT NULL DEFAULT now(),
            started_at           timestamptz,
            ended_at             timestamptz,
            updated_at           timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        "CREATE UNIQUE INDEX uq_ma_session_idempotency "
        "ON ma_session(user_id, idempotency_key) "
        "WHERE idempotency_key IS NOT NULL"
    )
    op.execute(
        "CREATE INDEX idx_ma_session_tenant_created "
        "ON ma_session(tenant_id, created_at DESC)"
    )
    op.execute(
        "CREATE INDEX idx_ma_session_user_status "
        "ON ma_session(user_id, status)"
    )

    for sql in enable_tenant_rls("ma_session"):
        op.execute(sql)
    for sql in grant_app_role_crud("ma_session"):
        op.execute(sql)

    # Auto-maintain updated_at on every UPDATE via a shared trigger
    # function. The function is installed once at baseline
    # (``000_baseline``) so we reuse it; a local CREATE FUNCTION would
    # collide at migration time.
    op.execute(
        """
        CREATE TRIGGER trg_ma_session_set_updated_at
        BEFORE UPDATE ON ma_session
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
        """
    )

    # --- ma_event -----------------------------------------------------
    op.execute(
        """
        CREATE TABLE ma_event (
            id           bigserial PRIMARY KEY,
            session_id   uuid NOT NULL REFERENCES ma_session(id) ON DELETE CASCADE,
            tenant_id    uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
            seq          int NOT NULL,
            event_type   text NOT NULL,
            payload      jsonb NOT NULL,
            created_at   timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        "CREATE UNIQUE INDEX uq_ma_event_session_seq "
        "ON ma_event(session_id, seq)"
    )
    op.execute(
        "CREATE INDEX idx_ma_event_session_id "
        "ON ma_event(session_id, id)"
    )

    for sql in enable_tenant_rls("ma_event"):
        op.execute(sql)
    for sql in grant_app_role_crud("ma_event"):
        op.execute(sql)

    # --- ma_step ------------------------------------------------------
    op.execute(
        """
        CREATE TABLE ma_step (
            id           uuid PRIMARY KEY,
            session_id   uuid NOT NULL REFERENCES ma_session(id) ON DELETE CASCADE,
            tenant_id    uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
            name         text NOT NULL,
            depends_on   uuid[] NOT NULL DEFAULT '{}',
            status       text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','running','completed','failed','skipped')),
            result       jsonb,
            error        jsonb,
            attempts     int NOT NULL DEFAULT 0,
            started_at   timestamptz,
            ended_at     timestamptz,
            created_at   timestamptz NOT NULL DEFAULT now(),
            updated_at   timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        "CREATE INDEX idx_ma_step_session_status "
        "ON ma_step(session_id, status)"
    )
    for sql in enable_tenant_rls("ma_step"):
        op.execute(sql)
    for sql in grant_app_role_crud("ma_step"):
        op.execute(sql)
    op.execute(
        """
        CREATE TRIGGER trg_ma_step_set_updated_at
        BEFORE UPDATE ON ma_step
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
        """
    )


def downgrade() -> None:
    """Reverse the upgrade in the opposite order.

    The enum is left in place because dropping a Postgres enum when any
    column of that type still exists raises; a later downgrade path
    that truly wants to dispose of it should drop it after ensuring no
    downstream migration uses ``ma_session_status``.
    """

    op.execute("DROP TRIGGER IF EXISTS trg_ma_step_set_updated_at ON ma_step")
    op.execute("DROP TABLE IF EXISTS ma_step")
    op.execute("DROP TABLE IF EXISTS ma_event")
    op.execute("DROP TRIGGER IF EXISTS trg_ma_session_set_updated_at ON ma_session")
    op.execute("DROP TABLE IF EXISTS ma_session")
    # Keep the enum; see docstring.
