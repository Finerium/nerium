"""Fixtures for Plutus billing tests (W2 NP P4 S1).

Mirrors the marketplace / trust patterns: the asyncpg pool is faked via
MagicMock + AsyncMock so the service + webhook layers run without a
live Postgres. Stripe is also faked via ``fake_stripe_client`` so
tests never hit the network.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import pytest

from pydantic import SecretStr

from src.backend.billing import stripe_client as stripe_client_module
from src.backend.config import Settings, get_settings


class _FakeAcquireCtx:
    def __init__(self, conn: MagicMock) -> None:
        self._conn = conn

    async def __aenter__(self) -> MagicMock:
        return self._conn

    async def __aexit__(self, exc_type, exc, tb) -> None:
        return None


class _FakeTransactionCtx:
    async def __aenter__(self) -> None:
        return None

    async def __aexit__(self, exc_type, exc, tb) -> None:
        return None


@pytest.fixture
def fake_billing_pool(monkeypatch: pytest.MonkeyPatch) -> MagicMock:
    """Install a fake asyncpg pool on every billing-side ``get_pool`` ref."""

    conn = MagicMock()
    conn.fetchrow = AsyncMock(return_value=None)
    conn.fetch = AsyncMock(return_value=[])
    conn.fetchval = AsyncMock(return_value=None)
    conn.execute = AsyncMock(return_value="OK")
    conn.executemany = AsyncMock(return_value=None)
    conn.transaction = MagicMock(return_value=_FakeTransactionCtx())

    pool = MagicMock()
    pool.acquire = MagicMock(return_value=_FakeAcquireCtx(conn))
    pool.close = AsyncMock(return_value=None)

    # Patch every consumer's import site so both subscription + ledger
    # + webhook + tenant_scoped see the fake.
    monkeypatch.setattr("src.backend.db.pool.get_pool", lambda: pool)
    monkeypatch.setattr("src.backend.billing.subscription.get_pool", lambda: pool)
    monkeypatch.setattr("src.backend.billing.ledger.get_pool", lambda: pool)
    monkeypatch.setattr("src.backend.billing.webhook.get_pool", lambda: pool)

    pool._test_conn = conn
    return pool


@pytest.fixture
def fake_stripe_client(monkeypatch: pytest.MonkeyPatch) -> MagicMock:
    """Replace :func:`get_stripe_client` with a rich MagicMock.

    The returned object carries ``.checkout.sessions.create`` +
    ``.subscriptions.retrieve`` + ``.Webhook.construct_event`` so the
    checkout + webhook code paths can drive it without a network hit.
    Tests override the return values per case.
    """

    client = MagicMock()

    # ``client.checkout.sessions.create`` returns a MagicMock with id + url.
    session = MagicMock()
    session.id = "cs_test_stub123"
    session.url = "https://checkout.stripe.com/c/pay/cs_test_stub123"
    client.checkout.sessions.create = MagicMock(return_value=session)

    # ``client.subscriptions.retrieve`` defaults to a minimal payload.
    default_sub = _make_subscription_object()
    client.subscriptions.retrieve = MagicMock(return_value=default_sub)

    # Keep the singleton path clean: clear the cached client + return ours.
    stripe_client_module.reset_stripe_client()
    monkeypatch.setattr(
        "src.backend.billing.stripe_client.get_stripe_client",
        lambda: client,
    )
    # Also patch the ref the webhook module may import under.
    monkeypatch.setattr(
        "src.backend.billing.webhook.get_stripe_client",
        lambda: client,
    )
    monkeypatch.setattr(
        "src.backend.billing.checkout.get_stripe_client",
        lambda: client,
    )
    return client


@pytest.fixture
def flag_false(monkeypatch: pytest.MonkeyPatch) -> None:
    """Force ``billing.live_mode_enabled`` to resolve False."""

    async def fake_get_flag(flag_name, *, user_id=None, tenant_id=None, **kw):
        if flag_name == "billing.live_mode_enabled":
            return False
        return None

    monkeypatch.setattr(
        "src.backend.billing.stripe_client.get_flag", fake_get_flag
    )


@pytest.fixture
def flag_true(monkeypatch: pytest.MonkeyPatch) -> None:
    """Force ``billing.live_mode_enabled`` to resolve True (should block)."""

    async def fake_get_flag(flag_name, *, user_id=None, tenant_id=None, **kw):
        if flag_name == "billing.live_mode_enabled":
            return True
        return None

    monkeypatch.setattr(
        "src.backend.billing.stripe_client.get_flag", fake_get_flag
    )


@pytest.fixture
def billing_settings(monkeypatch: pytest.MonkeyPatch) -> Settings:
    """Return a Settings instance with Stripe env populated for tests."""

    settings = Settings(
        env="development",
        version="0.1.0-test",
        trusted_hosts=["testserver", "localhost"],
        cors_origins=["http://testserver"],
        stripe_secret_key_test=SecretStr("sk_test_dummykey123"),
        stripe_webhook_secret=SecretStr("whsec_test_dummysecret"),
        stripe_price_id_starter="price_test_starter",
        stripe_price_id_pro="price_test_pro",
        stripe_price_id_team="price_test_team",
        stripe_success_url="https://nerium.com/billing/success",
        stripe_cancel_url="https://nerium.com/billing/cancel",
    )
    monkeypatch.setattr(
        "src.backend.config.get_settings", lambda: settings
    )
    monkeypatch.setattr(
        "src.backend.billing.stripe_client.get_settings", lambda: settings
    )
    monkeypatch.setattr(
        "src.backend.billing.plans.get_settings", lambda: settings
    )
    monkeypatch.setattr(
        "src.backend.billing.checkout.get_settings", lambda: settings
    )
    monkeypatch.setattr(
        "src.backend.billing.webhook.get_settings", lambda: settings
    )
    get_settings.cache_clear()
    stripe_client_module.reset_stripe_client()
    return settings


# ---------------------------------------------------------------------------
# Helper object factories
# ---------------------------------------------------------------------------


class _StubStripeObject(dict):
    """Dict-like stand-in for a Stripe API object.

    The Stripe SDK returns ``StripeObject`` instances that support both
    attribute and subscript access. Our production code uses subscript
    access for payload fields but attribute access for session.id / url
    + subscriptions.retrieve output. Subclassing dict + implementing
    ``__getattr__`` covers both idioms without needing to mock the full
    stripe type hierarchy.
    """

    def __getattr__(self, name: str) -> Any:
        try:
            return self[name]
        except KeyError as exc:
            raise AttributeError(name) from exc

    def to_dict_recursive(self) -> dict[str, Any]:
        return dict(self)


def _make_subscription_object(
    *,
    sub_id: str = "sub_test_1",
    customer_id: str = "cus_test_1",
    status_value: str = "active",
    current_period_start: int = 1_700_000_000,
    current_period_end: int = 1_702_000_000,
    cancel_at_period_end: bool = False,
    metadata: dict[str, Any] | None = None,
) -> _StubStripeObject:
    return _StubStripeObject(
        id=sub_id,
        customer=customer_id,
        status=status_value,
        current_period_start=current_period_start,
        current_period_end=current_period_end,
        cancel_at_period_end=cancel_at_period_end,
        metadata=metadata or {},
    )


def make_checkout_completed_event(
    *,
    event_id: str = "evt_checkout_1",
    session_id: str = "cs_test_1",
    subscription_id: str = "sub_test_1",
    user_id: UUID | None = None,
    tenant_id: UUID | None = None,
    tier: str = "pro",
) -> _StubStripeObject:
    """Build a ``checkout.session.completed`` event object."""

    return _StubStripeObject(
        id=event_id,
        type="checkout.session.completed",
        data=_StubStripeObject(
            object=_StubStripeObject(
                id=session_id,
                subscription=subscription_id,
                metadata={
                    "nerium_user_id": str(user_id or uuid4()),
                    "nerium_tenant_id": str(tenant_id or uuid4()),
                    "nerium_tier": tier,
                },
            )
        ),
    )


def make_invoice_paid_event(
    *,
    event_id: str = "evt_invoice_1",
    invoice_id: str = "in_test_1",
    subscription_id: str = "sub_test_1",
    customer_id: str = "cus_test_1",
    amount_paid: int = 4900,
    currency: str = "usd",
) -> _StubStripeObject:
    return _StubStripeObject(
        id=event_id,
        type="invoice.paid",
        data=_StubStripeObject(
            object=_StubStripeObject(
                id=invoice_id,
                subscription=subscription_id,
                customer=customer_id,
                amount_paid=amount_paid,
                currency=currency,
            )
        ),
    )


def make_charge_refunded_event(
    *,
    event_id: str = "evt_refund_1",
    charge_id: str = "ch_test_1",
    customer_id: str = "cus_test_1",
    amount_refunded: int = 4900,
    currency: str = "usd",
) -> _StubStripeObject:
    return _StubStripeObject(
        id=event_id,
        type="charge.refunded",
        data=_StubStripeObject(
            object=_StubStripeObject(
                id=charge_id,
                customer=customer_id,
                amount_refunded=amount_refunded,
                currency=currency,
            )
        ),
    )


def make_subscription_deleted_event(
    *,
    event_id: str = "evt_delete_1",
    subscription_id: str = "sub_test_1",
) -> _StubStripeObject:
    return _StubStripeObject(
        id=event_id,
        type="customer.subscription.deleted",
        data=_StubStripeObject(object=_StubStripeObject(id=subscription_id)),
    )


def make_subscription_updated_event(
    *,
    event_id: str = "evt_update_1",
    subscription_id: str = "sub_test_1",
    customer_id: str = "cus_test_1",
    status_value: str = "past_due",
    user_id: UUID | None = None,
    tenant_id: UUID | None = None,
    tier: str = "pro",
) -> _StubStripeObject:
    return _StubStripeObject(
        id=event_id,
        type="customer.subscription.updated",
        data=_StubStripeObject(
            object=_make_subscription_object(
                sub_id=subscription_id,
                customer_id=customer_id,
                status_value=status_value,
                metadata={
                    "nerium_user_id": str(user_id or uuid4()),
                    "nerium_tenant_id": str(tenant_id or uuid4()),
                    "nerium_tier": tier,
                },
            )
        ),
    )


__all__ = [
    "_StubStripeObject",
    "_make_subscription_object",
    "fake_billing_pool",
    "fake_stripe_client",
    "flag_false",
    "flag_true",
    "billing_settings",
    "make_charge_refunded_event",
    "make_checkout_completed_event",
    "make_invoice_paid_event",
    "make_subscription_deleted_event",
    "make_subscription_updated_event",
]
