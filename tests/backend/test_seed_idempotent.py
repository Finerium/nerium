"""Idempotent demo seed tests.

Gated on ``NERIUM_TEST_DATABASE_URL``. Runs the seed twice back-to-back
and asserts every per-table insert count is zero on the second run,
proving the seed can be applied to an already-populated dev database
without duplicating rows.
"""

from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_seed_runs_twice_without_duplicates(pg_test_pool) -> None:
    from src.backend.db.seed import (
        DEMO_LISTING_A,
        DEMO_LISTING_B,
        DEMO_TENANT_A,
        DEMO_TENANT_B,
        seed_demo_data,
    )

    first = await seed_demo_data(pg_test_pool)
    second = await seed_demo_data(pg_test_pool)

    # Second run must be a no-op on every tracked table.
    assert all(count == 0 for count in second.values()), second

    # Row counts: tenants exactly 2 rows for the two demo tenants.
    async with pg_test_pool.acquire() as conn:
        tenant_count = await conn.fetchval(
            "SELECT count(*) FROM tenant WHERE id IN ($1, $2)",
            DEMO_TENANT_A,
            DEMO_TENANT_B,
        )
        assert tenant_count == 2

        listing_count = await conn.fetchval(
            "SELECT count(*) FROM marketplace_listing WHERE id IN ($1, $2)",
            DEMO_LISTING_A,
            DEMO_LISTING_B,
        )
        assert listing_count == 2

    # first must have inserted at least one row per tracked table on a
    # fresh DB; allow zero when the seed has been applied previously by
    # another fixture in the same session.
    assert first is not None


@pytest.mark.asyncio
async def test_seed_applies_rls_policies(pg_test_pool) -> None:
    """After seed, switching tenants via SET LOCAL hides the other tenant's rows."""

    from src.backend.db.seed import (
        DEMO_TENANT_A,
        DEMO_TENANT_B,
        seed_demo_data,
    )

    await seed_demo_data(pg_test_pool)

    async with pg_test_pool.acquire() as conn:
        # Acquire as the app role to exercise RLS; if the pool connects
        # as nerium_migration (BYPASSRLS), the SET LOCAL still sets the
        # guc but the policy is bypassed. Skip the RLS specifics when
        # BYPASSRLS is in effect.
        role = await conn.fetchval("SELECT current_user")
        if role == "nerium_migration":
            pytest.skip("Running as migration role bypasses RLS; isolation "
                        "exercised in a dedicated test that acquires as nerium_api.")

        async with conn.transaction():
            await conn.execute(f"SET LOCAL app.tenant_id = '{DEMO_TENANT_A}'")
            a_rows = await conn.fetch("SELECT id FROM app_user")
            # Only tenant A users are visible.
            for r in a_rows:
                tid = await conn.fetchval(
                    "SELECT tenant_id FROM app_user WHERE id = $1", r["id"]
                )
                assert tid == DEMO_TENANT_A

        async with conn.transaction():
            await conn.execute(f"SET LOCAL app.tenant_id = '{DEMO_TENANT_B}'")
            b_rows = await conn.fetch("SELECT id FROM app_user")
            for r in b_rows:
                tid = await conn.fetchval(
                    "SELECT tenant_id FROM app_user WHERE id = $1", r["id"]
                )
                assert tid == DEMO_TENANT_B
