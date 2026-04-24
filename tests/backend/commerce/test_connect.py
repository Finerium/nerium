"""Stripe Connect Express onboard + refresh + status tests."""

from __future__ import annotations

from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest

from src.backend.commerce import connect as connect_module

from tests.backend.commerce.conftest import (
    _StubStripeObject,
    make_connect_account_row,
)


TENANT_ID = UUID("22222222-2222-7222-8222-222222222222")
USER_ID = UUID("11111111-1111-7111-8111-111111111111")


# ---------------------------------------------------------------------------
# create_or_get_connect_account
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_when_no_existing_row(
    fake_commerce_pool, fake_stripe_client, commerce_settings
) -> None:
    conn = fake_commerce_pool._test_conn
    # First fetchrow is the existence check (None) + second is the INSERT ...
    # RETURNING. We short-circuit by having the existence check return None
    # and the second call return a freshly-minted row dict.
    fresh_row = make_connect_account_row(
        user_id=USER_ID,
        tenant_id=TENANT_ID,
        stripe_account_id="acct_test_stub",
        charges_enabled=False,
        payouts_enabled=False,
        details_submitted=False,
        onboarding_status="pending",
    )
    conn.fetchrow = AsyncMock(side_effect=[None, fresh_row])

    account = await connect_module.create_or_get_connect_account(
        tenant_id=TENANT_ID,
        user_id=USER_ID,
    )

    assert account.stripe_account_id == "acct_test_stub"
    assert account.charges_enabled is False
    assert fake_stripe_client.accounts.create.called


@pytest.mark.asyncio
async def test_create_is_idempotent_on_existing_row(
    fake_commerce_pool, fake_stripe_client, commerce_settings
) -> None:
    conn = fake_commerce_pool._test_conn
    existing_row = make_connect_account_row(
        user_id=USER_ID,
        tenant_id=TENANT_ID,
        stripe_account_id="acct_already",
    )
    conn.fetchrow = AsyncMock(return_value=existing_row)

    account = await connect_module.create_or_get_connect_account(
        tenant_id=TENANT_ID,
        user_id=USER_ID,
    )

    assert account.stripe_account_id == "acct_already"
    # Stripe create was NOT called because existing row short-circuited.
    assert not fake_stripe_client.accounts.create.called


# ---------------------------------------------------------------------------
# create_onboarding_link
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_onboarding_link(
    fake_commerce_pool, fake_stripe_client, commerce_settings
) -> None:
    link = await connect_module.create_onboarding_link(
        stripe_account_id="acct_test_stub",
        return_url="https://example.com/return",
        refresh_url="https://example.com/refresh",
    )
    assert link["url"].startswith("https://connect.stripe.com/")
    fake_stripe_client.account_links.create.assert_called_once()
    params = fake_stripe_client.account_links.create.call_args.kwargs["params"]
    assert params["account"] == "acct_test_stub"
    assert params["type"] == "account_onboarding"


# ---------------------------------------------------------------------------
# sync_account_from_stripe
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_sync_account_flips_flags(
    fake_commerce_pool, fake_stripe_client, commerce_settings
) -> None:
    conn = fake_commerce_pool._test_conn

    # Stripe returns a verified account.
    verified = _StubStripeObject(
        id="acct_test_stub",
        charges_enabled=True,
        payouts_enabled=True,
        details_submitted=True,
        requirements={"currently_due": []},
        country="US",
        default_currency="usd",
    )
    fake_stripe_client.accounts.retrieve = (
        fake_stripe_client.accounts.retrieve.__class__()
    )
    fake_stripe_client.accounts.retrieve = pytest.MonkeyPatch()  # reset
    # Simpler: just re-assign the callable.
    fake_stripe_client.accounts.retrieve = lambda acct: verified

    updated_row = make_connect_account_row(
        stripe_account_id="acct_test_stub",
        charges_enabled=True,
        payouts_enabled=True,
        details_submitted=True,
        onboarding_status="verified",
    )
    conn.fetchrow = AsyncMock(return_value=updated_row)

    result = await connect_module.sync_account_from_stripe(
        stripe_account_id="acct_test_stub",
        tenant_id=None,
    )
    assert result is not None
    assert result.onboarding_status == "verified"
    assert result.charges_enabled is True
    assert result.payouts_enabled is True


@pytest.mark.asyncio
async def test_sync_account_unknown_returns_none(
    fake_commerce_pool, fake_stripe_client, commerce_settings
) -> None:
    conn = fake_commerce_pool._test_conn
    # Stripe returns something but the DB lookup returns None.
    # fake_stripe_client.accounts.retrieve default returns the stub account.
    conn.fetchrow = AsyncMock(return_value=None)

    result = await connect_module.sync_account_from_stripe(
        stripe_account_id="acct_unknown",
        tenant_id=None,
    )
    assert result is None


# ---------------------------------------------------------------------------
# require_onboarded_creator
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_require_raises_when_no_account(
    fake_commerce_pool, fake_stripe_client, commerce_settings
) -> None:
    conn = fake_commerce_pool._test_conn
    conn.fetchrow = AsyncMock(return_value=None)

    with pytest.raises(connect_module.CreatorNotOnboardedProblem):
        await connect_module.require_onboarded_creator(
            tenant_id=TENANT_ID,
            creator_user_id=USER_ID,
        )


@pytest.mark.asyncio
async def test_require_raises_when_charges_disabled(
    fake_commerce_pool, fake_stripe_client, commerce_settings
) -> None:
    conn = fake_commerce_pool._test_conn
    row = make_connect_account_row(
        user_id=USER_ID,
        tenant_id=TENANT_ID,
        charges_enabled=False,
        payouts_enabled=False,
        details_submitted=False,
        onboarding_status="pending",
    )
    conn.fetchrow = AsyncMock(return_value=row)

    with pytest.raises(connect_module.CreatorNotOnboardedProblem):
        await connect_module.require_onboarded_creator(
            tenant_id=TENANT_ID,
            creator_user_id=USER_ID,
        )


@pytest.mark.asyncio
async def test_require_passes_when_charges_enabled(
    fake_commerce_pool, fake_stripe_client, commerce_settings
) -> None:
    conn = fake_commerce_pool._test_conn
    row = make_connect_account_row(
        user_id=USER_ID,
        tenant_id=TENANT_ID,
        charges_enabled=True,
        onboarding_status="verified",
    )
    conn.fetchrow = AsyncMock(return_value=row)

    account = await connect_module.require_onboarded_creator(
        tenant_id=TENANT_ID,
        creator_user_id=USER_ID,
    )
    assert account.charges_enabled is True
