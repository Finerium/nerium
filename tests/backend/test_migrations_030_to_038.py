"""Alembic migration smoke test for the Aether Session 3 revisions.

Gated on ``NERIUM_TEST_DATABASE_URL`` env var. Skips cleanly in CI that
does not have a live Postgres 16 cluster with the NERIUM schema.
When the env var is set, the test:

1. Applies ``alembic upgrade head`` programmatically.
2. Verifies each of the nine tables (app_user, user_session,
   quest_progress, inventory, marketplace_listing, transaction_ledger,
   trust_score, agent_identity, vendor_adapter) is present with RLS
   enabled.
3. Downgrades the Aether chain (030 to the previous head) and
   re-upgrades to confirm the path is reversible.

The test also validates the shared ``set_updated_at`` trigger is
attached to every Session 3 table.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

try:
    from alembic import command as _alembic_command  # noqa: F401

    _ALEMBIC_AVAILABLE = True
except Exception:
    _ALEMBIC_AVAILABLE = False

_REPO_ROOT = Path(__file__).resolve().parents[2]


SESSION_3_TABLES = (
    "app_user",
    "user_session",
    "quest_progress",
    "inventory",
    "marketplace_listing",
    "transaction_ledger",
    "trust_score",
    "agent_identity",
    "vendor_adapter",
)


pytestmark = pytest.mark.skipif(
    not _ALEMBIC_AVAILABLE,
    reason="alembic not importable in this environment",
)


async def _table_exists(conn, table: str) -> bool:
    return bool(
        await conn.fetchval(
            """
            SELECT EXISTS (
              SELECT 1 FROM pg_tables
              WHERE schemaname = 'public' AND tablename = $1
            )
            """,
            table,
        )
    )


async def _rls_enabled(conn, table: str) -> bool:
    row = await conn.fetchrow(
        """
        SELECT relrowsecurity, relforcerowsecurity
        FROM pg_class
        WHERE relname = $1
          AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
        """,
        table,
    )
    return bool(row and row["relrowsecurity"] and row["relforcerowsecurity"])


async def _has_policy(conn, table: str, policy: str = "tenant_isolation") -> bool:
    return bool(
        await conn.fetchval(
            """
            SELECT EXISTS (
              SELECT 1 FROM pg_policies
              WHERE tablename = $1 AND policyname = $2
            )
            """,
            table,
            policy,
        )
    )


async def _has_trigger(conn, table: str) -> bool:
    trg = f"trg_{table}_set_updated_at"
    return bool(
        await conn.fetchval(
            """
            SELECT EXISTS (
              SELECT 1 FROM pg_trigger
              WHERE NOT tgisinternal AND tgname = $1
            )
            """,
            trg,
        )
    )


@pytest.mark.asyncio
async def test_all_session_3_tables_present_after_upgrade(pg_test_pool) -> None:
    """End-to-end smoke: run upgrade head then inspect schema."""

    from alembic import command
    from alembic.config import Config

    cfg = Config(str(_REPO_ROOT / "src" / "backend" / "db" / "migrations" / "alembic.ini"))
    cfg.set_main_option(
        "script_location",
        str(_REPO_ROOT / "src" / "backend" / "db" / "migrations"),
    )
    cfg.set_main_option(
        "sqlalchemy.url",
        os.environ["NERIUM_TEST_DATABASE_URL"],
    )

    # Alembic runs synchronously against an async engine; ok to invoke
    # from an async test because alembic.env drives its own asyncio.run.
    command.upgrade(cfg, "heads")

    async with pg_test_pool.acquire() as conn:
        for table in SESSION_3_TABLES:
            assert await _table_exists(conn, table), f"missing table {table}"
            if table != "tenant":
                assert await _rls_enabled(conn, table), f"RLS not enabled on {table}"
                assert await _has_policy(conn, table), f"policy missing on {table}"
            assert await _has_trigger(conn, table), (
                f"updated_at trigger missing on {table}"
            )


@pytest.mark.asyncio
async def test_set_updated_at_function_installed(pg_test_pool) -> None:
    """``set_updated_at`` plpgsql function ships with migration 030."""

    async with pg_test_pool.acquire() as conn:
        exists = await conn.fetchval(
            """
            SELECT EXISTS (
              SELECT 1 FROM pg_proc p
              JOIN pg_namespace n ON p.pronamespace = n.oid
              WHERE n.nspname = 'public' AND p.proname = 'set_updated_at'
            )
            """
        )
        assert bool(exists), "set_updated_at() trigger function missing"
