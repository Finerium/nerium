"""Tests for the double-entry ledger helpers.

Owner: Plutus (W2 NP P4 S1).

Covers:
- ``_assert_balanced`` invariants (positive amounts, balanced D/C,
  single currency).
- ``post_double_entry`` inserts transaction + entries via the fake
  conn, surfaces ``was_inserted=True`` on a fresh insert and
  ``was_inserted=False`` on idempotency replay (fetchrow returns None
  on ON CONFLICT DO NOTHING).
- ``post_subscription_payment`` produces the canonical DEBIT(stripe)
  + CREDIT(revenue) leg pair.
- ``post_subscription_refund`` produces the reversing pair.
"""

from __future__ import annotations

from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest

from src.backend.billing import ledger
from src.backend.billing.ledger import (
    ACCOUNT_STRIPE_BALANCE_USD,
    ACCOUNT_SUBSCRIPTION_REVENUE_USD,
    LedgerLeg,
    post_double_entry,
    post_subscription_payment,
    post_subscription_refund,
)


# ---------------------------------------------------------------------------
# _assert_balanced
# ---------------------------------------------------------------------------


def test_balanced_two_leg_pair() -> None:
    legs = [
        LedgerLeg(ACCOUNT_STRIPE_BALANCE_USD, "D", 1000),
        LedgerLeg(ACCOUNT_SUBSCRIPTION_REVENUE_USD, "C", 1000),
    ]
    ledger._assert_balanced(legs)  # should not raise


def test_imbalanced_raises() -> None:
    legs = [
        LedgerLeg(ACCOUNT_STRIPE_BALANCE_USD, "D", 1000),
        LedgerLeg(ACCOUNT_SUBSCRIPTION_REVENUE_USD, "C", 500),
    ]
    with pytest.raises(ValueError, match="do not balance"):
        ledger._assert_balanced(legs)


def test_negative_amount_raises() -> None:
    legs = [
        LedgerLeg(ACCOUNT_STRIPE_BALANCE_USD, "D", -1),
        LedgerLeg(ACCOUNT_SUBSCRIPTION_REVENUE_USD, "C", 1),
    ]
    with pytest.raises(ValueError, match="strictly positive"):
        ledger._assert_balanced(legs)


def test_mixed_currency_raises() -> None:
    legs = [
        LedgerLeg(ACCOUNT_STRIPE_BALANCE_USD, "D", 100, "USD"),
        LedgerLeg(ACCOUNT_SUBSCRIPTION_REVENUE_USD, "C", 100, "IDR"),
    ]
    with pytest.raises(ValueError, match="one currency"):
        ledger._assert_balanced(legs)


def test_bad_direction_raises() -> None:
    legs = [
        LedgerLeg(ACCOUNT_STRIPE_BALANCE_USD, "X", 100),  # type: ignore[arg-type]
        LedgerLeg(ACCOUNT_SUBSCRIPTION_REVENUE_USD, "C", 100),
    ]
    with pytest.raises(ValueError, match="bad direction"):
        ledger._assert_balanced(legs)


def test_empty_raises() -> None:
    with pytest.raises(ValueError):
        ledger._assert_balanced([])


# ---------------------------------------------------------------------------
# post_double_entry
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_post_double_entry_inserts_fresh(fake_billing_pool) -> None:
    conn = fake_billing_pool._test_conn
    tx_uuid = uuid4()
    account_id_stripe = 1
    account_id_revenue = 2

    # First call: INSERT returns a row (fresh).
    conn.fetchrow = AsyncMock(return_value={"id": tx_uuid})
    # Second call: SELECT account codes returns both.
    conn.fetch = AsyncMock(
        return_value=[
            {"id": account_id_stripe, "code": ACCOUNT_STRIPE_BALANCE_USD},
            {"id": account_id_revenue, "code": ACCOUNT_SUBSCRIPTION_REVENUE_USD},
        ]
    )

    legs = [
        LedgerLeg(ACCOUNT_STRIPE_BALANCE_USD, "D", 4900),
        LedgerLeg(ACCOUNT_SUBSCRIPTION_REVENUE_USD, "C", 4900),
    ]
    result = await post_double_entry(
        idempotency_key="stripe:evt:evt_1",
        legs=legs,
    )
    assert result.was_inserted is True
    assert result.transaction_id == tx_uuid
    # executemany invoked once with 2 rows.
    assert conn.executemany.await_count == 1
    call = conn.executemany.await_args
    values = call.args[1]
    assert len(values) == 2
    # Leg rows carry the resolved account_id, not the code.
    account_ids = {row[1] for row in values}
    assert account_ids == {account_id_stripe, account_id_revenue}


@pytest.mark.asyncio
async def test_post_double_entry_idempotent_replay(fake_billing_pool) -> None:
    conn = fake_billing_pool._test_conn

    # First fetchrow (INSERT ... ON CONFLICT DO NOTHING RETURNING id)
    # returns None (row already exists). Second fetchval returns the
    # prior tx id.
    existing_tx = uuid4()
    conn.fetchrow = AsyncMock(return_value=None)
    conn.fetchval = AsyncMock(return_value=existing_tx)

    result = await post_double_entry(
        idempotency_key="stripe:evt:evt_duplicate",
        legs=[
            LedgerLeg(ACCOUNT_STRIPE_BALANCE_USD, "D", 4900),
            LedgerLeg(ACCOUNT_SUBSCRIPTION_REVENUE_USD, "C", 4900),
        ],
    )
    assert result.was_inserted is False
    assert result.transaction_id == existing_tx
    # No entry inserts fired on replay.
    assert conn.executemany.await_count == 0


@pytest.mark.asyncio
async def test_post_double_entry_unknown_account_raises(
    fake_billing_pool,
) -> None:
    conn = fake_billing_pool._test_conn
    conn.fetchrow = AsyncMock(return_value={"id": uuid4()})
    # fetch returns empty so every leg code is "missing".
    conn.fetch = AsyncMock(return_value=[])

    with pytest.raises(ValueError, match="unknown account code"):
        await post_double_entry(
            idempotency_key="stripe:evt:evt_2",
            legs=[
                LedgerLeg(ACCOUNT_STRIPE_BALANCE_USD, "D", 100),
                LedgerLeg(ACCOUNT_SUBSCRIPTION_REVENUE_USD, "C", 100),
            ],
        )


@pytest.mark.asyncio
async def test_post_double_entry_rejects_single_leg(fake_billing_pool) -> None:
    with pytest.raises(ValueError, match="at least two legs"):
        await post_double_entry(
            idempotency_key="stripe:evt:evt_solo",
            legs=[LedgerLeg(ACCOUNT_STRIPE_BALANCE_USD, "D", 100)],
        )


# ---------------------------------------------------------------------------
# post_subscription_payment / refund
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_post_subscription_payment_legs_balance(fake_billing_pool) -> None:
    conn = fake_billing_pool._test_conn
    conn.fetchrow = AsyncMock(return_value={"id": uuid4()})
    conn.fetch = AsyncMock(
        return_value=[
            {"id": 1, "code": ACCOUNT_STRIPE_BALANCE_USD},
            {"id": 2, "code": ACCOUNT_SUBSCRIPTION_REVENUE_USD},
        ]
    )

    result = await post_subscription_payment(
        stripe_event_id="evt_inv_100",
        amount_minor_units=4900,
    )
    assert result.was_inserted is True
    values = conn.executemany.await_args.args[1]
    # Check the D/C + amount shape: one debit, one credit, same amount.
    directions = {row[2] for row in values}
    amounts = {row[3] for row in values}
    assert directions == {"D", "C"}
    assert amounts == {4900}


@pytest.mark.asyncio
async def test_post_subscription_refund_reverses_direction(
    fake_billing_pool,
) -> None:
    conn = fake_billing_pool._test_conn
    conn.fetchrow = AsyncMock(return_value={"id": uuid4()})
    conn.fetch = AsyncMock(
        return_value=[
            {"id": 1, "code": ACCOUNT_STRIPE_BALANCE_USD},
            {"id": 2, "code": ACCOUNT_SUBSCRIPTION_REVENUE_USD},
        ]
    )

    await post_subscription_refund(
        stripe_event_id="evt_refund_1",
        amount_minor_units=4900,
    )
    values = conn.executemany.await_args.args[1]
    # In the refund pair: revenue is DEBIT (clawback), stripe balance is CREDIT.
    by_account = {row[1]: row[2] for row in values}
    assert by_account[1] == "C"  # stripe balance credited (reduced)
    assert by_account[2] == "D"  # revenue debited (reversed)


@pytest.mark.asyncio
async def test_payment_and_refund_idempotency_keys_share_prefix(
    fake_billing_pool,
) -> None:
    conn = fake_billing_pool._test_conn
    conn.fetchrow = AsyncMock(return_value={"id": uuid4()})
    conn.fetch = AsyncMock(
        return_value=[
            {"id": 1, "code": ACCOUNT_STRIPE_BALANCE_USD},
            {"id": 2, "code": ACCOUNT_SUBSCRIPTION_REVENUE_USD},
        ]
    )

    await post_subscription_payment(
        stripe_event_id="evt_x",
        amount_minor_units=100,
    )
    # The transaction insert call received the idempotency key as arg3 ($3).
    insert_args = conn.fetchrow.await_args.args
    # fetchrow signature: (sql, new_id, tenant_id, idempotency_key, ...)
    assert "stripe:evt:evt_x" in insert_args
