"""Tests for Stripe webhook signature verify + idempotent dispatch.

Owner: Plutus (W2 NP P4 S1).

The signature verifier is monkeypatched per-case so tests never need
the real ``stripe.Webhook.construct_event`` implementation; this
isolates handler logic from the Stripe SDK's HMAC internals. A
separate integration test (not shipped in S1) would exercise the real
verifier with a live ``whsec_`` fixture.
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import pytest
import stripe

from src.backend.billing import webhook as webhook_module
from src.backend.billing.webhook import (
    HANDLED_EVENT_TYPES,
    process_stripe_webhook,
)
from src.backend.errors import UnauthorizedProblem, ValidationProblem

from tests.backend.billing.conftest import (
    _make_subscription_object,
    make_charge_refunded_event,
    make_checkout_completed_event,
    make_invoice_paid_event,
    make_subscription_deleted_event,
    make_subscription_updated_event,
)


TENANT_ID = UUID("22222222-2222-7222-8222-222222222222")
USER_ID = UUID("11111111-1111-7111-8111-111111111111")


def _install_verifier(monkeypatch, event):
    """Monkeypatch the signature verifier to return ``event`` directly."""

    def _fake(payload_bytes, sig, secret):
        return event

    monkeypatch.setattr(
        "src.backend.billing.webhook._verify_signature", _fake
    )


def _fresh_insert(conn) -> None:
    """Arrange the connection so record_event_or_skip returns True."""

    conn.fetchrow = AsyncMock(return_value={"id": uuid4()})


def _replay_insert(conn) -> None:
    """Arrange the connection so record_event_or_skip returns False."""

    conn.fetchrow = AsyncMock(return_value=None)


# ---------------------------------------------------------------------------
# Signature + body failure paths
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_missing_secret_raises_401(
    monkeypatch, billing_settings, flag_false
) -> None:
    # Force empty secret.
    from pydantic import SecretStr

    patched = billing_settings.model_copy(
        update={"stripe_webhook_secret": SecretStr("")}
    )
    monkeypatch.setattr(
        "src.backend.billing.webhook.get_settings", lambda: patched
    )
    with pytest.raises(UnauthorizedProblem):
        await process_stripe_webhook(
            payload_bytes=b"{}",
            sig_header="t=1,v1=whatever",
        )


@pytest.mark.asyncio
async def test_signature_failure_translates_to_401(
    monkeypatch, billing_settings, flag_false
) -> None:
    def bad(payload, sig, secret):
        raise stripe.SignatureVerificationError("bad sig", sig)

    monkeypatch.setattr(stripe.Webhook, "construct_event", bad)
    with pytest.raises(UnauthorizedProblem):
        await process_stripe_webhook(
            payload_bytes=b"{}",
            sig_header="t=1,v1=bad",
        )


@pytest.mark.asyncio
async def test_malformed_body_raises_422(
    monkeypatch, billing_settings, flag_false
) -> None:
    def bad(payload, sig, secret):
        raise ValueError("not json")

    monkeypatch.setattr(stripe.Webhook, "construct_event", bad)
    with pytest.raises(ValidationProblem):
        await process_stripe_webhook(
            payload_bytes=b"not json",
            sig_header="t=1,v1=x",
        )


# ---------------------------------------------------------------------------
# Idempotency
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_replay_short_circuits(
    monkeypatch, billing_settings, fake_billing_pool, flag_false
) -> None:
    event = make_invoice_paid_event(event_id="evt_replay_1")
    _install_verifier(monkeypatch, event)
    conn = fake_billing_pool._test_conn
    _replay_insert(conn)

    result = await process_stripe_webhook(
        payload_bytes=json.dumps(dict(event)).encode(),
        sig_header="t=1,v1=x",
    )
    assert result.was_replay is True
    # Should not have attempted to post any ledger entries on replay.
    # executemany still zero invocations in the fake.
    assert conn.executemany.await_count == 0


# ---------------------------------------------------------------------------
# checkout.session.completed
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_checkout_completed_upserts_subscription(
    monkeypatch,
    billing_settings,
    fake_billing_pool,
    fake_stripe_client,
    flag_false,
) -> None:
    conn = fake_billing_pool._test_conn

    event = make_checkout_completed_event(
        event_id="evt_co_1",
        subscription_id="sub_co_1",
        user_id=USER_ID,
        tenant_id=TENANT_ID,
        tier="pro",
    )
    _install_verifier(monkeypatch, event)

    # fetchrow is called twice: first for record_event (fresh insert),
    # second for the subscription upsert RETURNING row.
    subscription_row_return = {
        "id": uuid4(),
        "tenant_id": TENANT_ID,
        "user_id": USER_ID,
        "stripe_customer_id": "cus_test_1",
        "stripe_subscription_id": "sub_co_1",
        "tier": "pro",
        "status": "active",
        "current_period_start": None,
        "current_period_end": None,
        "cancel_at_period_end": False,
        "created_at": None,
        "updated_at": None,
        "deleted_at": None,
    }
    conn.fetchrow = AsyncMock(
        side_effect=[
            {"id": uuid4()},  # subscription_event INSERT
            subscription_row_return,  # subscription upsert RETURNING
        ]
    )

    # The handler calls ``client.subscriptions.retrieve`` to expand
    # the Checkout session's thin subscription reference. Override so
    # the returned object carries the tier metadata.
    full_sub = _make_subscription_object(
        sub_id="sub_co_1",
        customer_id="cus_test_1",
        metadata={
            "nerium_user_id": str(USER_ID),
            "nerium_tenant_id": str(TENANT_ID),
            "nerium_tier": "pro",
        },
    )
    fake_stripe_client.subscriptions.retrieve = MagicMock(return_value=full_sub)

    result = await process_stripe_webhook(
        payload_bytes=b"{}",
        sig_header="t=1,v1=x",
    )
    assert result.was_replay is False
    assert result.was_handled is True
    assert "subscription_upserted" in result.notes


@pytest.mark.asyncio
async def test_checkout_completed_missing_metadata_skips(
    monkeypatch,
    billing_settings,
    fake_billing_pool,
    fake_stripe_client,
    flag_false,
) -> None:
    """A Checkout session without our metadata logs + returns OK."""

    conn = fake_billing_pool._test_conn

    from tests.backend.billing.conftest import _StubStripeObject

    event = _StubStripeObject(
        id="evt_no_meta",
        type="checkout.session.completed",
        data=_StubStripeObject(
            object=_StubStripeObject(
                id="cs_test_meta_missing",
                subscription="sub_missing",
                metadata={},
            )
        ),
    )
    _install_verifier(monkeypatch, event)
    _fresh_insert(conn)

    result = await process_stripe_webhook(
        payload_bytes=b"{}",
        sig_header="t=1,v1=x",
    )
    assert result.was_handled is True
    assert "metadata_missing" in result.notes


# ---------------------------------------------------------------------------
# customer.subscription.updated + deleted
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_subscription_updated_syncs_state(
    monkeypatch,
    billing_settings,
    fake_billing_pool,
    fake_stripe_client,
    flag_false,
) -> None:
    conn = fake_billing_pool._test_conn
    event = make_subscription_updated_event(
        subscription_id="sub_upd_1",
        status_value="past_due",
        user_id=USER_ID,
        tenant_id=TENANT_ID,
        tier="pro",
    )
    _install_verifier(monkeypatch, event)

    returned = {
        "id": uuid4(),
        "tenant_id": TENANT_ID,
        "user_id": USER_ID,
        "stripe_customer_id": "cus_test_1",
        "stripe_subscription_id": "sub_upd_1",
        "tier": "pro",
        "status": "past_due",
        "current_period_start": None,
        "current_period_end": None,
        "cancel_at_period_end": False,
        "created_at": None,
        "updated_at": None,
        "deleted_at": None,
    }
    conn.fetchrow = AsyncMock(
        side_effect=[{"id": uuid4()}, returned]
    )

    result = await process_stripe_webhook(
        payload_bytes=b"{}",
        sig_header="t=1,v1=x",
    )
    assert "subscription_synced" in result.notes


@pytest.mark.asyncio
async def test_subscription_deleted_soft_deletes(
    monkeypatch,
    billing_settings,
    fake_billing_pool,
    flag_false,
) -> None:
    conn = fake_billing_pool._test_conn
    event = make_subscription_deleted_event(subscription_id="sub_del_1")
    _install_verifier(monkeypatch, event)

    from datetime import datetime, timezone

    canceled_row = {
        "id": uuid4(),
        "tenant_id": TENANT_ID,
        "user_id": USER_ID,
        "stripe_customer_id": "cus_test_1",
        "stripe_subscription_id": "sub_del_1",
        "tier": "pro",
        "status": "canceled",
        "current_period_start": None,
        "current_period_end": None,
        "cancel_at_period_end": False,
        "created_at": None,
        "updated_at": None,
        "deleted_at": datetime.now(timezone.utc),
    }
    conn.fetchrow = AsyncMock(
        side_effect=[{"id": uuid4()}, canceled_row]
    )

    result = await process_stripe_webhook(
        payload_bytes=b"{}",
        sig_header="t=1,v1=x",
    )
    assert "subscription_canceled" in result.notes


# ---------------------------------------------------------------------------
# invoice.paid + charge.refunded (ledger)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_invoice_paid_posts_ledger(
    monkeypatch,
    billing_settings,
    fake_billing_pool,
    flag_false,
) -> None:
    conn = fake_billing_pool._test_conn
    event = make_invoice_paid_event(amount_paid=4900)
    _install_verifier(monkeypatch, event)

    # Order of fetchrow calls:
    # 1. subscription_event INSERT (returns fresh id row).
    # 2. subscription lookup by stripe_subscription_id (returns None =
    #    platform-scope; handler proceeds with tenant_id=None).
    # 3. ledger_transaction INSERT (returns tx id).
    conn.fetchrow = AsyncMock(
        side_effect=[
            {"id": uuid4()},  # event insert
            None,  # subscription not mirrored yet
            {"id": uuid4()},  # ledger tx insert
        ]
    )
    conn.fetch = AsyncMock(
        return_value=[
            {"id": 1, "code": "asset:stripe_balance_usd"},
            {"id": 2, "code": "revenue:subscription_usd"},
        ]
    )

    result = await process_stripe_webhook(
        payload_bytes=b"{}",
        sig_header="t=1,v1=x",
    )
    assert "invoice_paid_posted" in result.notes
    # executemany fired once with 2 entries.
    assert conn.executemany.await_count == 1


@pytest.mark.asyncio
async def test_charge_refunded_posts_reversing_ledger(
    monkeypatch,
    billing_settings,
    fake_billing_pool,
    flag_false,
) -> None:
    conn = fake_billing_pool._test_conn
    event = make_charge_refunded_event(amount_refunded=4900)
    _install_verifier(monkeypatch, event)

    conn.fetchrow = AsyncMock(
        side_effect=[
            {"id": uuid4()},  # event insert
            {"id": uuid4()},  # ledger tx insert
        ]
    )
    conn.fetch = AsyncMock(
        return_value=[
            {"id": 1, "code": "asset:stripe_balance_usd"},
            {"id": 2, "code": "revenue:subscription_usd"},
        ]
    )

    result = await process_stripe_webhook(
        payload_bytes=b"{}",
        sig_header="t=1,v1=x",
    )
    assert "refund_posted" in result.notes


# ---------------------------------------------------------------------------
# Unhandled event types still return 200-style success
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_unhandled_event_returns_ok(
    monkeypatch,
    billing_settings,
    fake_billing_pool,
    flag_false,
) -> None:
    from tests.backend.billing.conftest import _StubStripeObject

    event = _StubStripeObject(
        id="evt_wallet",
        type="wallet.created",  # not in HANDLED_EVENT_TYPES
        data=_StubStripeObject(object=_StubStripeObject()),
    )
    _install_verifier(monkeypatch, event)
    _fresh_insert(fake_billing_pool._test_conn)

    result = await process_stripe_webhook(
        payload_bytes=b"{}",
        sig_header="t=1,v1=x",
    )
    assert result.was_replay is False
    assert result.was_handled is False
    assert "unhandled_type" in result.notes


def test_handled_event_types_include_core() -> None:
    for wanted in (
        "checkout.session.completed",
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
        "invoice.paid",
        "charge.refunded",
    ):
        assert wanted in HANDLED_EVENT_TYPES


# ---------------------------------------------------------------------------
# Live-mode gate must block the webhook even before signature check
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_live_mode_flag_blocks_webhook(
    monkeypatch, billing_settings, flag_true
) -> None:
    from src.backend.billing.stripe_client import StripeLiveModeForbiddenProblem

    with pytest.raises(StripeLiveModeForbiddenProblem):
        await process_stripe_webhook(
            payload_bytes=b"{}",
            sig_header="t=1,v1=x",
        )
