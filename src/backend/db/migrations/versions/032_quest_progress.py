"""quest_progress table: per-user quest state persistence.

Revision ID: 032_quest_progress
Revises: 031_user_session
Create Date: 2026-04-24 19:40:00.000000

Author: Aether (W1 FastAPI core, NP phase Session 3)
Contract refs:
    - docs/contracts/quest_schema.contract.md (quest runner contract; this
      table mirrors only the durable cross-session fields; per-frame state
      lives in the Zustand quest store).
    - docs/contracts/postgres_multi_tenant.contract.md Section 3.2 RLS.

Scope
-----
Quest definitions themselves are static JSON under ``src/data/quests/``.
This table records each user's progress per quest: which step they are on,
per-quest freeform state bag, lifecycle timestamps. Zustand keeps the hot
path in memory; ``quest_progress`` is the durable anchor so a page reload
or cross-device login resumes at the correct step.

Design notes
------------
- ``(tenant_id, user_id, quest_id)`` UNIQUE enforces a single active
  progress row per quest per user. Re-running a completed quest bumps
  ``started_at`` + resets ``status`` in-place rather than inserting a new
  row; history is captured in Selene logs, not here.
- ``status`` is a text CHECK instead of a Postgres enum so adding quest
  lifecycle states (``abandoned``, ``paused``) does not require an enum
  migration with drop/recreate semantics.
- ``state`` jsonb carries per-quest variables (NPC trust values, prompt
  draft, puzzle progress, etc). Queries never index into ``state``; the
  runtime reads the whole blob and narrows in Python.
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

from src.backend.db.rls import enable_tenant_rls, grant_app_role_crud, disable_tenant_rls


# revision identifiers, used by Alembic.
revision: str = "032_quest_progress"
down_revision: Union[str, Sequence[str], None] = "031_user_session"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create quest_progress with indexes, grants, RLS, and updated_at trigger."""

    op.execute(
        """
        CREATE TABLE quest_progress (
            id            uuid PRIMARY KEY,
            tenant_id     uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
            user_id       uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
            quest_id      text NOT NULL,
            status        text NOT NULL DEFAULT 'in_progress'
                          CHECK (status IN ('not_started', 'in_progress', 'completed', 'failed')),
            current_step  int NOT NULL DEFAULT 0 CHECK (current_step >= 0),
            state         jsonb NOT NULL DEFAULT '{}'::jsonb,
            started_at    timestamptz,
            completed_at  timestamptz,
            created_at    timestamptz NOT NULL DEFAULT now(),
            updated_at    timestamptz NOT NULL DEFAULT now(),
            UNIQUE (tenant_id, user_id, quest_id)
        )
        """
    )

    op.execute(
        "CREATE INDEX idx_quest_progress_tenant_user_status "
        "ON quest_progress(tenant_id, user_id, status)"
    )
    op.execute(
        "CREATE INDEX idx_quest_progress_tenant_created "
        "ON quest_progress(tenant_id, created_at DESC)"
    )
    op.execute(
        "CREATE INDEX idx_quest_progress_quest_id "
        "ON quest_progress(quest_id, status)"
    )
    op.execute(
        "CREATE INDEX idx_quest_progress_completed "
        "ON quest_progress(completed_at DESC) WHERE completed_at IS NOT NULL"
    )

    for sql in enable_tenant_rls("quest_progress"):
        op.execute(sql)
    for sql in grant_app_role_crud("quest_progress"):
        op.execute(sql)

    op.execute(
        """
        DROP TRIGGER IF EXISTS trg_quest_progress_set_updated_at ON quest_progress;
        CREATE TRIGGER trg_quest_progress_set_updated_at
          BEFORE UPDATE ON quest_progress
          FOR EACH ROW
          EXECUTE FUNCTION set_updated_at()
        """
    )


def downgrade() -> None:
    """Reverse upgrade in strict reverse dependency order."""

    op.execute(
        "DROP TRIGGER IF EXISTS trg_quest_progress_set_updated_at ON quest_progress"
    )
    for sql in disable_tenant_rls("quest_progress"):
        op.execute(sql)
    op.execute("DROP INDEX IF EXISTS idx_quest_progress_completed")
    op.execute("DROP INDEX IF EXISTS idx_quest_progress_quest_id")
    op.execute("DROP INDEX IF EXISTS idx_quest_progress_tenant_created")
    op.execute("DROP INDEX IF EXISTS idx_quest_progress_tenant_user_status")
    op.execute("DROP TABLE IF EXISTS quest_progress")
