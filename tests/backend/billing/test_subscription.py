"""Tests for subscription CRUD + webhook sync helpers.

Owner: Plutus (W2 NP P4 S1).
"""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest

from src.backend.billing.subscription import (
    SubscriptionSnapshot,
    get_active_subscription_for_user,
    get_subscription_by_stripe_id,
    get_subscription_snapshot,
    mark_subscription_canceled,
    upsert_from_stripe_subscription,
)


TENANT_ID = UUID("22222222-2222-7222-8222-222222222222")
USER_ID = UUID("11111111-1111-7111-8111-111111111111")


def _row(**overrides):
    """Build a subscription row dict with sane defaults."""

    now = datetime.now(timezone.utc)
    base = {
        "id": uuid4(),
        "tenant_id": TENANT_ID,
        "user_id": USER_ID,
        "stripe_customer_id": "cus_test_1",
        "stripe_subscription_id": "sub_test_1",
        "tier": "pro",
        "status": "active",
        "current_period_start": now,
        "current_period_end": now,
        "cancel_at_period_end": False,
        "created_at": now,
        "updated_at": now,
        "deleted_at": None,
    }
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# get_active_subscription_for_user
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_active_none_when_no_row(fake_billing_pool) -> None:
    conn = fake_billing_pool._test_conn
    conn.fetchrow = AsyncMock(return_value=None)
    out = await get_active_subscription_for_user(
        user_id=USER_ID, tenant_id=TENANT_ID
    )
    assert out is None


@pytest.mark.asyncio
async def test_get_active_returns_projection(fake_billing_pool) -> None:
    conn = fake_billing_pool._test_conn
    row = _row(tier="team", status="active")
    conn.fetchrow = AsyncMock(return_value=row)
    out = await get_active_subscription_for_user(
        user_id=USER_ID, tenant_id=TENANT_ID
    )
    assert out is not None
    assert out.tier == "team"
    assert out.status == "active"
    assert out.stripe_customer_id == "cus_test_1"


@pytest.mark.asyncio
async def test_get_snapshot_maps_to_narrow_shape(fake_billing_pool) -> None:
    conn = fake_billing_pool._test_conn
    row = _row(tier="starter", cancel_at_period_end=True)
    conn.fetchrow = AsyncMock(return_value=row)
    snap = await get_subscription_snapshot(
        user_id=USER_ID, tenant_id=TENANT_ID
    )
    assert isinstance(snap, SubscriptionSnapshot)
    assert snap.tier == "starter"
    assert snap.cancel_at_period_end is True


@pytest.mark.asyncio
async def test_get_snapshot_returns_none_for_free(fake_billing_pool) -> None:
    conn = fake_billing_pool._test_conn
    conn.fetchrow = AsyncMock(return_value=None)
    out = await get_subscription_snapshot(
        user_id=USER_ID, tenant_id=TENANT_ID
    )
    assert out is None


# ---------------------------------------------------------------------------
# get_subscription_by_stripe_id
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_by_stripe_id_hit(fake_billing_pool) -> None:
    conn = fake_billing_pool._test_conn
    conn.fetchrow = AsyncMock(return_value=_row())
    out = await get_subscription_by_stripe_id(
        stripe_subscription_id="sub_test_1"
    )
    assert out is not None
    assert out.stripe_subscription_id == "sub_test_1"


@pytest.mark.asyncio
async def test_get_by_stripe_id_uses_conn_when_given(
    fake_billing_pool,
) -> None:
    """When a conn is passed we skip the pool acquisition."""

    pool_conn = fake_billing_pool._test_conn
    pool_conn.fetchrow = AsyncMock(return_value=None)

    # Distinct fake conn we pass explicitly.
    from unittest.mock import MagicMock

    explicit_conn = MagicMock()
    explicit_conn.fetchrow = AsyncMock(return_value=_row())
    out = await get_subscription_by_stripe_id(
        stripe_subscription_id="sub_test_1",
        conn=explicit_conn,
    )
    assert out is not None
    # Only the explicit conn was queried.
    assert explicit_conn.fetchrow.await_count == 1
    assert pool_conn.fetchrow.await_count == 0


# ---------------------------------------------------------------------------
# upsert_from_stripe_subscription
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_upsert_writes_expected_params(fake_billing_pool) -> None:
    conn = fake_billing_pool._test_conn
    returned = _row(tier="pro", status="active")
    conn.fetchrow = AsyncMock(return_value=returned)

    stripe_payload = {
        "id": "sub_test_1",
        "customer": "cus_test_1",
        "status": "active",
        "current_period_start": 1_700_000_000,
        "current_period_end": 1_702_000_000,
        "cancel_at_period_end": False,
    }
    row = await upsert_from_stripe_subscription(
        stripe_subscription=stripe_payload,
        user_id=USER_ID,
        tenant_id=TENANT_ID,
        tier="pro",
    )
    assert row.tier == "pro"
    args = conn.fetchrow.await_args.args
    # args[0] is SQL. Positional params follow in this order:
    # 1:new_id, 2:tenant, 3:user, 4:stripe_customer, 5:stripe_sub,
    # 6:tier, 7:status, 8:period_start, 9:period_end,
    # 10:cancel_at_period_end, 11:metadata_json.
    sql = args[0]
    assert "INSERT INTO subscription" in sql
    assert "ON CONFLICT (stripe_subscription_id)" in sql
    assert args[6] == "pro"
    assert args[7] == "active"
    assert args[4] == "cus_test_1"
    assert args[5] == "sub_test_1"


@pytest.mark.asyncio
async def test_upsert_converts_unix_timestamps(fake_billing_pool) -> None:
    conn = fake_billing_pool._test_conn
    returned = _row()
    conn.fetchrow = AsyncMock(return_value=returned)

    await upsert_from_stripe_subscription(
        stripe_subscription={
            "id": "sub_test_2",
            "customer": "cus_test_2",
            "status": "trialing",
            "current_period_start": 1_600_000_000,
            "current_period_end": 1_602_000_000,
            "cancel_at_period_end": True,
        },
        user_id=USER_ID,
        tenant_id=TENANT_ID,
        tier="team",
    )
    args = conn.fetchrow.await_args.args
    # period_start is arg 8 (after id, tenant, user, cust, sub, tier, status)
    period_start = args[8]
    period_end = args[9]
    cancel_flag = args[10]
    assert isinstance(period_start, datetime)
    assert period_start.tzinfo is not None
    assert isinstance(period_end, datetime)
    assert cancel_flag is True


@pytest.mark.asyncio
async def test_upsert_handles_none_timestamps(fake_billing_pool) -> None:
    conn = fake_billing_pool._test_conn
    conn.fetchrow = AsyncMock(return_value=_row())

    await upsert_from_stripe_subscription(
        stripe_subscription={
            "id": "sub_test_3",
            "customer": "cus_test_3",
            "status": "incomplete",
            "current_period_start": None,
            "current_period_end": 0,
            "cancel_at_period_end": False,
        },
        user_id=USER_ID,
        tenant_id=TENANT_ID,
        tier="starter",
    )
    args = conn.fetchrow.await_args.args
    assert args[8] is None
    assert args[9] is None


# ---------------------------------------------------------------------------
# mark_subscription_canceled
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cancel_soft_deletes_row(fake_billing_pool) -> None:
    conn = fake_billing_pool._test_conn
    canceled = _row(
        status="canceled",
        deleted_at=datetime.now(timezone.utc),
    )
    conn.fetchrow = AsyncMock(return_value=canceled)

    out = await mark_subscription_canceled(
        stripe_subscription_id="sub_test_1"
    )
    assert out is not None
    assert out.status == "canceled"
    assert out.deleted_at is not None


@pytest.mark.asyncio
async def test_cancel_unknown_returns_none(fake_billing_pool) -> None:
    conn = fake_billing_pool._test_conn
    conn.fetchrow = AsyncMock(return_value=None)
    out = await mark_subscription_canceled(
        stripe_subscription_id="sub_unknown"
    )
    assert out is None


# ---------------------------------------------------------------------------
# Tier-transition smoke: starter to pro via two upserts
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_subscription_tier_transition(fake_billing_pool) -> None:
    conn = fake_billing_pool._test_conn

    # First upsert returns starter-tier row.
    starter_row = _row(tier="starter")
    # Second upsert returns pro-tier row (ON CONFLICT DO UPDATE shape).
    pro_row = _row(tier="pro")
    conn.fetchrow = AsyncMock(side_effect=[starter_row, pro_row])

    first = await upsert_from_stripe_subscription(
        stripe_subscription={
            "id": "sub_x",
            "customer": "cus_x",
            "status": "active",
            "current_period_start": 1_700_000_000,
            "current_period_end": 1_702_000_000,
            "cancel_at_period_end": False,
        },
        user_id=USER_ID,
        tenant_id=TENANT_ID,
        tier="starter",
    )
    second = await upsert_from_stripe_subscription(
        stripe_subscription={
            "id": "sub_x",
            "customer": "cus_x",
            "status": "active",
            "current_period_start": 1_700_500_000,
            "current_period_end": 1_702_500_000,
            "cancel_at_period_end": False,
        },
        user_id=USER_ID,
        tenant_id=TENANT_ID,
        tier="pro",
    )
    assert first.tier == "starter"
    assert second.tier == "pro"
    # SQL carries the ON CONFLICT update branch.
    for call in conn.fetchrow.await_args_list:
        assert "ON CONFLICT (stripe_subscription_id)" in call.args[0]
