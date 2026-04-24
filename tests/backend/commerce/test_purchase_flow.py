"""Purchase flow: gates + happy path + webhook state transitions."""

from __future__ import annotations

from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest

from src.backend.commerce import purchase as purchase_module
from src.backend.commerce.connect import CreatorNotOnboardedProblem
from src.backend.commerce.purchase import (
    ListingNotPurchasableProblem,
    SelfPurchaseForbiddenProblem,
    create_purchase_intent,
    mark_purchase_completed,
    mark_purchase_refunded,
)
from src.backend.errors import NotFoundProblem, ValidationProblem

from tests.backend.commerce.conftest import (
    make_connect_account_row,
    make_listing_row,
    make_purchase_row,
)


TENANT_ID = UUID("22222222-2222-7222-8222-222222222222")
BUYER_ID = UUID("11111111-1111-7111-8111-111111111111")
CREATOR_ID = UUID("33333333-3333-7333-8333-333333333333")


# ---------------------------------------------------------------------------
# create_purchase_intent gates
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_purchase_listing_not_found(
    fake_commerce_pool, fake_stripe_client, commerce_settings, flag_patch
) -> None:
    flag_patch({"marketplace.platform_fee_pct": 20})
    conn = fake_commerce_pool._test_conn
    conn.fetchrow = AsyncMock(return_value=None)

    with pytest.raises(NotFoundProblem):
        await create_purchase_intent(
            tenant_id=TENANT_ID,
            buyer_user_id=BUYER_ID,
            listing_id=uuid4(),
        )


@pytest.mark.asyncio
async def test_purchase_self_forbidden(
    fake_commerce_pool, fake_stripe_client, commerce_settings, flag_patch
) -> None:
    flag_patch({"marketplace.platform_fee_pct": 20})
    conn = fake_commerce_pool._test_conn
    listing = make_listing_row(
        tenant_id=TENANT_ID,
        creator_user_id=BUYER_ID,  # buyer == creator triggers 403
    )
    conn.fetchrow = AsyncMock(return_value=listing)

    with pytest.raises(SelfPurchaseForbiddenProblem):
        await create_purchase_intent(
            tenant_id=TENANT_ID,
            buyer_user_id=BUYER_ID,
            listing_id=listing["id"],
        )


@pytest.mark.asyncio
async def test_purchase_archived_listing(
    fake_commerce_pool, fake_stripe_client, commerce_settings, flag_patch
) -> None:
    from datetime import datetime, timezone

    flag_patch({"marketplace.platform_fee_pct": 20})
    conn = fake_commerce_pool._test_conn
    listing = make_listing_row(
        tenant_id=TENANT_ID,
        creator_user_id=CREATOR_ID,
        archived_at=datetime.now(timezone.utc),
    )
    conn.fetchrow = AsyncMock(return_value=listing)

    with pytest.raises(ListingNotPurchasableProblem):
        await create_purchase_intent(
            tenant_id=TENANT_ID,
            buyer_user_id=BUYER_ID,
            listing_id=listing["id"],
        )


@pytest.mark.asyncio
async def test_purchase_draft_listing(
    fake_commerce_pool, fake_stripe_client, commerce_settings, flag_patch
) -> None:
    flag_patch({"marketplace.platform_fee_pct": 20})
    conn = fake_commerce_pool._test_conn
    listing = make_listing_row(
        tenant_id=TENANT_ID,
        creator_user_id=CREATOR_ID,
        status="draft",
    )
    conn.fetchrow = AsyncMock(return_value=listing)

    with pytest.raises(ListingNotPurchasableProblem):
        await create_purchase_intent(
            tenant_id=TENANT_ID,
            buyer_user_id=BUYER_ID,
            listing_id=listing["id"],
        )


@pytest.mark.asyncio
async def test_purchase_creator_not_onboarded(
    fake_commerce_pool, fake_stripe_client, commerce_settings, flag_patch
) -> None:
    flag_patch({"marketplace.platform_fee_pct": 20})
    conn = fake_commerce_pool._test_conn
    listing = make_listing_row(
        tenant_id=TENANT_ID,
        creator_user_id=CREATOR_ID,
    )
    # Sequence: listing lookup -> listing, then connect account fetch -> None.
    conn.fetchrow = AsyncMock(side_effect=[listing, None])

    with pytest.raises(CreatorNotOnboardedProblem):
        await create_purchase_intent(
            tenant_id=TENANT_ID,
            buyer_user_id=BUYER_ID,
            listing_id=listing["id"],
        )


@pytest.mark.asyncio
async def test_purchase_zero_price_rejected(
    fake_commerce_pool, fake_stripe_client, commerce_settings, flag_patch
) -> None:
    flag_patch({"marketplace.platform_fee_pct": 20})
    conn = fake_commerce_pool._test_conn
    listing = make_listing_row(
        tenant_id=TENANT_ID,
        creator_user_id=CREATOR_ID,
        amount_cents=0,
    )
    conn.fetchrow = AsyncMock(return_value=listing)

    with pytest.raises(ValidationProblem):
        await create_purchase_intent(
            tenant_id=TENANT_ID,
            buyer_user_id=BUYER_ID,
            listing_id=listing["id"],
        )


@pytest.mark.asyncio
async def test_purchase_happy_path(
    fake_commerce_pool, fake_stripe_client, commerce_settings, flag_patch
) -> None:
    flag_patch({"marketplace.platform_fee_pct": 20})
    conn = fake_commerce_pool._test_conn
    listing = make_listing_row(
        tenant_id=TENANT_ID,
        creator_user_id=CREATOR_ID,
        amount_cents=1000,
    )
    connect = make_connect_account_row(
        tenant_id=TENANT_ID,
        user_id=CREATOR_ID,
        charges_enabled=True,
    )
    created_purchase = make_purchase_row(
        tenant_id=TENANT_ID,
        listing_id=listing["id"],
        buyer_user_id=BUYER_ID,
        creator_user_id=CREATOR_ID,
        gross_amount_cents=1000,
        platform_fee_cents=200,
        creator_net_cents=800,
        payment_intent_id="pi_test_stub",
    )
    # fetchrow sequence:
    #   1. listing lookup -> listing row
    #   2. connect fetch inside require_onboarded_creator -> connect row
    #   3. purchase insert RETURNING -> created row
    conn.fetchrow = AsyncMock(
        side_effect=[listing, connect, created_purchase]
    )

    result = await create_purchase_intent(
        tenant_id=TENANT_ID,
        buyer_user_id=BUYER_ID,
        listing_id=listing["id"],
    )

    assert result.payment_intent_id == "pi_test_stub"
    assert result.client_secret == "pi_test_stub_secret_xyz"
    assert result.split.gross_amount_cents == 1000
    assert result.split.platform_fee_cents == 200
    assert result.split.creator_net_cents == 800
    assert result.split.take_rate_percent == 20

    # Stripe PaymentIntent create was called with correct split + destination.
    fake_stripe_client.payment_intents.create.assert_called_once()
    params = fake_stripe_client.payment_intents.create.call_args.kwargs["params"]
    assert params["amount"] == 1000
    assert params["application_fee_amount"] == 200
    assert params["transfer_data"]["destination"] == connect["stripe_account_id"]
    assert params["metadata"]["nerium_listing_id"] == str(listing["id"])


@pytest.mark.asyncio
async def test_purchase_idempotency_replay(
    fake_commerce_pool, fake_stripe_client, commerce_settings, flag_patch
) -> None:
    flag_patch({"marketplace.platform_fee_pct": 20})
    conn = fake_commerce_pool._test_conn

    # Idempotency short-circuit returns an existing row.
    existing = make_purchase_row(
        tenant_id=TENANT_ID,
        buyer_user_id=BUYER_ID,
        creator_user_id=CREATOR_ID,
        status="completed",
        gross_amount_cents=1000,
        platform_fee_cents=200,
        creator_net_cents=800,
    )
    conn.fetchrow = AsyncMock(return_value=existing)

    result = await create_purchase_intent(
        tenant_id=TENANT_ID,
        buyer_user_id=BUYER_ID,
        listing_id=existing["listing_id"],
        idempotency_key="client_abc123",
    )
    # Stripe was NOT called because we short-circuited on idempotency.
    assert not fake_stripe_client.payment_intents.create.called
    assert result.purchase.status == "completed"


# ---------------------------------------------------------------------------
# Webhook state transitions
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_mark_completed_posts_ledger(
    fake_commerce_pool, fake_stripe_client, commerce_settings
) -> None:
    conn = fake_commerce_pool._test_conn
    purchase = make_purchase_row(
        tenant_id=TENANT_ID,
        buyer_user_id=BUYER_ID,
        creator_user_id=CREATOR_ID,
        gross_amount_cents=1000,
        platform_fee_cents=200,
        creator_net_cents=800,
        payment_intent_id="pi_evt_1",
        status="completed",
    )
    # Sequence: UPDATE marketplace_purchase RETURNING -> purchase row.
    # Then the ledger helper runs conn.fetchrow for the billing_ledger_
    # transaction INSERT (new_id row) + conn.fetchval for existing
    # creator_payable account id + conn.fetch for account codes (list).
    ledger_tx_row = {"id": uuid4()}
    conn.fetchrow = AsyncMock(side_effect=[purchase, ledger_tx_row, ledger_tx_row])
    conn.fetch = AsyncMock(return_value=[
        {"id": 1, "code": "asset:stripe_balance_usd"},
        {"id": 2, "code": "revenue:marketplace_fee_usd"},
        {"id": 3, "code": f"liability:creator_payable_usd:{CREATOR_ID}"},
    ])
    conn.fetchval = AsyncMock(return_value=1)  # creator_payable account exists

    result = await mark_purchase_completed(
        payment_intent_id="pi_evt_1",
        stripe_charge_id="ch_evt_1",
        stripe_event_id="evt_test_1",
        conn=conn,
    )

    assert result is not None
    assert result.status == "completed"
    # Both ledger transactions attempted (platform fee + creator payable).
    assert conn.executemany.call_count >= 2


@pytest.mark.asyncio
async def test_mark_completed_unknown_pi_returns_none(
    fake_commerce_pool, fake_stripe_client, commerce_settings
) -> None:
    conn = fake_commerce_pool._test_conn
    conn.fetchrow = AsyncMock(return_value=None)

    result = await mark_purchase_completed(
        payment_intent_id="pi_unknown",
        stripe_charge_id=None,
        stripe_event_id="evt_test_unknown",
        conn=conn,
    )
    assert result is None


@pytest.mark.asyncio
async def test_mark_refunded_full_amount(
    fake_commerce_pool, fake_stripe_client, commerce_settings
) -> None:
    conn = fake_commerce_pool._test_conn
    refunded = make_purchase_row(
        tenant_id=TENANT_ID,
        buyer_user_id=BUYER_ID,
        creator_user_id=CREATOR_ID,
        gross_amount_cents=1000,
        platform_fee_cents=200,
        creator_net_cents=800,
        payment_intent_id="pi_refund",
        status="refunded",
        refunded_amount_cents=1000,
    )
    ledger_tx_row = {"id": uuid4()}
    conn.fetchrow = AsyncMock(side_effect=[refunded, ledger_tx_row, ledger_tx_row])
    conn.fetch = AsyncMock(return_value=[
        {"id": 1, "code": "asset:stripe_balance_usd"},
        {"id": 2, "code": "revenue:marketplace_fee_usd"},
        {"id": 3, "code": f"liability:creator_payable_usd:{CREATOR_ID}"},
    ])
    conn.fetchval = AsyncMock(return_value=1)

    result = await mark_purchase_refunded(
        payment_intent_id="pi_refund",
        stripe_charge_id="ch_refund",
        amount_refunded_cents=1000,
        currency="USD",
        stripe_event_id="evt_refund_1",
        conn=conn,
    )
    assert result is not None
    assert result.status == "refunded"
