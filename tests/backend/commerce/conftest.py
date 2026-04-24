"""Fixtures for Iapetus commerce tests (W2 NP P4 S1).

Mirrors the Plutus billing conftest: the asyncpg pool is faked via
MagicMock + AsyncMock so the service layers run without a live
Postgres. Stripe is also faked via ``fake_stripe_client``. We expose
the same structural helpers (``_StubStripeObject`` etc.) so tests
can round-trip event payloads without inheriting Plutus' conftest
directly (pytest does not cross-import across sibling conftest dirs).
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


class _FakeTenantScopedCtx:
    """Async context manager that returns the fake connection directly.

    Used to replace ``tenant_scoped`` in the commerce service modules
    so tests avoid the ``SET LOCAL app.tenant_id`` path on the fake
    pool (which would call ``SET LOCAL`` against a MagicMock and
    pass but add noise).
    """

    def __init__(self, conn: MagicMock) -> None:
        self._conn = conn

    async def __aenter__(self) -> MagicMock:
        return self._conn

    async def __aexit__(self, exc_type, exc, tb) -> None:
        return None


class _StubStripeObject(dict):
    """Dict-like stand-in for a Stripe API object."""

    def __getattr__(self, name: str) -> Any:
        try:
            return self[name]
        except KeyError as exc:
            raise AttributeError(name) from exc

    def to_dict_recursive(self) -> dict[str, Any]:
        return dict(self)


@pytest.fixture
def fake_commerce_pool(monkeypatch: pytest.MonkeyPatch) -> MagicMock:
    """Install a fake asyncpg pool on every commerce-side ``get_pool`` ref.

    Also patches ``tenant_scoped`` in the commerce modules so the
    async context manager yields the fake connection directly.
    """

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

    # Patch the DB pool import sites.
    monkeypatch.setattr("src.backend.db.pool.get_pool", lambda: pool)
    monkeypatch.setattr(
        "src.backend.commerce.connect.get_pool", lambda: pool
    )
    monkeypatch.setattr(
        "src.backend.commerce.purchase.get_pool", lambda: pool
    )
    monkeypatch.setattr(
        "src.backend.commerce.review.get_pool", lambda: pool
    )
    # Ledger + webhook also pull get_pool; align so the webhook tests
    # can run in the same pool fixture.
    monkeypatch.setattr(
        "src.backend.billing.ledger.get_pool", lambda: pool
    )
    monkeypatch.setattr(
        "src.backend.billing.webhook.get_pool", lambda: pool
    )

    # Patch tenant_scoped in the commerce modules so the async-ctx
    # yields the same fake conn. We keep the original function
    # signature (pool, tenant_id) so callers pass through unchanged.
    def _patched_tenant_scoped(_pool, _tenant_id):
        return _FakeTenantScopedCtx(conn)

    monkeypatch.setattr(
        "src.backend.commerce.connect.tenant_scoped",
        _patched_tenant_scoped,
    )
    monkeypatch.setattr(
        "src.backend.commerce.purchase.tenant_scoped",
        _patched_tenant_scoped,
    )
    monkeypatch.setattr(
        "src.backend.commerce.review.tenant_scoped",
        _patched_tenant_scoped,
    )

    pool._test_conn = conn
    return pool


@pytest.fixture
def fake_stripe_client(monkeypatch: pytest.MonkeyPatch) -> MagicMock:
    """Replace :func:`get_stripe_client` with a rich MagicMock.

    Exposes the four Stripe surfaces Iapetus uses:
    - ``accounts.create`` / ``accounts.retrieve`` (Connect Express).
    - ``account_links.create`` (onboarding URL).
    - ``payment_intents.create`` (purchase flow).
    - ``transfers.create`` (Session 2 payout, stubbed only).
    """

    client = MagicMock()

    # Connect account create.
    account = _StubStripeObject(
        id="acct_test_stub",
        charges_enabled=False,
        payouts_enabled=False,
        details_submitted=False,
        requirements={"currently_due": ["external_account"]},
        country="US",
        default_currency="usd",
    )
    client.accounts.create = MagicMock(return_value=account)
    client.accounts.retrieve = MagicMock(return_value=account)

    # AccountLink create.
    link = _StubStripeObject(
        url="https://connect.stripe.com/test/acct_test_stub",
        expires_at=1_700_000_000,
        created=1_699_999_900,
    )
    client.account_links.create = MagicMock(return_value=link)

    # PaymentIntent create.
    intent = _StubStripeObject(
        id="pi_test_stub",
        client_secret="pi_test_stub_secret_xyz",
        currency="usd",
        amount=1000,
    )
    client.payment_intents.create = MagicMock(return_value=intent)

    # Payout / Transfer helpers (S2 payout cron stub).
    client.transfers.create = MagicMock(
        return_value=_StubStripeObject(id="tr_test_stub")
    )

    stripe_client_module.reset_stripe_client()
    monkeypatch.setattr(
        "src.backend.billing.stripe_client.get_stripe_client",
        lambda: client,
    )
    # Commerce modules import under their own namespace.
    monkeypatch.setattr(
        "src.backend.commerce.connect.get_stripe_client",
        lambda: client,
    )
    monkeypatch.setattr(
        "src.backend.commerce.purchase.get_stripe_client",
        lambda: client,
    )
    return client


@pytest.fixture
def flag_patch(monkeypatch: pytest.MonkeyPatch):
    """Patch Hemera ``get_flag`` in the commerce modules."""

    def _apply(values: dict[str, Any]) -> None:
        async def fake_get_flag(flag_name, *, user_id=None, tenant_id=None, **kw):
            if flag_name in values:
                return values[flag_name]
            return None

        # Patch every consumer import site.
        monkeypatch.setattr(
            "src.backend.commerce.revenue_split.get_flag",
            fake_get_flag,
        )
        # stripe_client.get_flag used for ensure_live_mode_disabled.
        monkeypatch.setattr(
            "src.backend.billing.stripe_client.get_flag",
            fake_get_flag,
        )

    return _apply


@pytest.fixture
def live_flag_false(flag_patch) -> None:
    """Convenience: force billing.live_mode_enabled to False."""

    flag_patch({"billing.live_mode_enabled": False})


@pytest.fixture
def commerce_settings(monkeypatch: pytest.MonkeyPatch) -> Settings:
    settings = Settings(
        env="development",
        version="0.1.0-test",
        trusted_hosts=["testserver", "localhost"],
        cors_origins=["http://testserver"],
        stripe_secret_key_test=SecretStr("sk_test_dummykey123"),
        stripe_webhook_secret=SecretStr("whsec_test_dummysecret"),
    )
    monkeypatch.setattr(
        "src.backend.config.get_settings", lambda: settings
    )
    monkeypatch.setattr(
        "src.backend.billing.stripe_client.get_settings", lambda: settings
    )
    get_settings.cache_clear()
    stripe_client_module.reset_stripe_client()
    return settings


# ---------------------------------------------------------------------------
# Row factory helpers
# ---------------------------------------------------------------------------


def make_listing_row(
    *,
    listing_id: UUID | None = None,
    tenant_id: UUID | None = None,
    creator_user_id: UUID | None = None,
    category: str = "content",
    status: str = "published",
    archived_at=None,
    amount_cents: int = 1000,
    currency: str = "USD",
    revenue_split_override: float | None = None,
    title: str = "Test Listing",
) -> dict[str, Any]:
    """Return an asyncpg-compatible dict for marketplace_listing."""

    return {
        "id": listing_id or uuid4(),
        "tenant_id": tenant_id or uuid4(),
        "creator_user_id": creator_user_id or uuid4(),
        "category": category,
        "status": status,
        "archived_at": archived_at,
        "pricing_details": {"amount_cents": amount_cents, "currency": currency},
        "revenue_split_override": revenue_split_override,
        "title": title,
    }


def make_connect_account_row(
    *,
    account_id: UUID | None = None,
    tenant_id: UUID | None = None,
    user_id: UUID | None = None,
    stripe_account_id: str = "acct_test_stub",
    charges_enabled: bool = True,
    payouts_enabled: bool = True,
    details_submitted: bool = True,
    onboarding_status: str = "verified",
) -> dict[str, Any]:
    """Return an asyncpg-compatible dict for creator_connect_account."""

    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    return {
        "id": account_id or uuid4(),
        "tenant_id": tenant_id or uuid4(),
        "user_id": user_id or uuid4(),
        "stripe_account_id": stripe_account_id,
        "onboarding_status": onboarding_status,
        "charges_enabled": charges_enabled,
        "payouts_enabled": payouts_enabled,
        "details_submitted": details_submitted,
        "requirements": {},
        "country": "US",
        "default_currency": "USD",
        "last_synced_at": now,
        "created_at": now,
        "updated_at": now,
    }


def make_purchase_row(
    *,
    purchase_id: UUID | None = None,
    tenant_id: UUID | None = None,
    listing_id: UUID | None = None,
    buyer_user_id: UUID | None = None,
    creator_user_id: UUID | None = None,
    gross_amount_cents: int = 1000,
    platform_fee_cents: int = 200,
    creator_net_cents: int = 800,
    status: str = "pending",
    payment_intent_id: str | None = "pi_test_stub",
    refunded_amount_cents: int = 0,
    stripe_charge_id: str | None = None,
    completed_at=None,
) -> dict[str, Any]:
    """Return an asyncpg-compatible dict for marketplace_purchase."""

    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    return {
        "id": purchase_id or uuid4(),
        "tenant_id": tenant_id or uuid4(),
        "listing_id": listing_id or uuid4(),
        "buyer_user_id": buyer_user_id or uuid4(),
        "creator_user_id": creator_user_id or uuid4(),
        "connect_account_id": uuid4(),
        "gross_amount_cents": gross_amount_cents,
        "platform_fee_cents": platform_fee_cents,
        "creator_net_cents": creator_net_cents,
        "refunded_amount_cents": refunded_amount_cents,
        "currency": "USD",
        "rail": "stripe",
        "status": status,
        "payment_intent_id": payment_intent_id,
        "stripe_checkout_session_id": None,
        "stripe_charge_id": stripe_charge_id,
        "midtrans_order_id": None,
        "idempotency_key": None,
        "client_reference_id": None,
        "metadata": {},
        "created_at": now,
        "updated_at": now,
        "completed_at": completed_at,
    }


def make_review_row(
    *,
    review_id: UUID | None = None,
    tenant_id: UUID | None = None,
    listing_id: UUID | None = None,
    reviewer_user_id: UUID | None = None,
    purchase_id: UUID | None = None,
    rating: int = 5,
    title: str | None = "Great",
    body: str | None = "Worked well",
    helpful_count: int = 0,
    flag_count: int = 0,
    status: str = "visible",
    deleted_at=None,
) -> dict[str, Any]:
    """Return an asyncpg-compatible dict for marketplace_review."""

    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    return {
        "id": review_id or uuid4(),
        "tenant_id": tenant_id or uuid4(),
        "listing_id": listing_id or uuid4(),
        "reviewer_user_id": reviewer_user_id or uuid4(),
        "purchase_id": purchase_id,
        "rating": rating,
        "title": title,
        "body": body,
        "helpful_count": helpful_count,
        "flag_count": flag_count,
        "status": status,
        "created_at": now,
        "updated_at": now,
        "deleted_at": deleted_at,
    }


__all__ = [
    "_FakeAcquireCtx",
    "_FakeTenantScopedCtx",
    "_FakeTransactionCtx",
    "_StubStripeObject",
    "commerce_settings",
    "fake_commerce_pool",
    "fake_stripe_client",
    "flag_patch",
    "live_flag_false",
    "make_connect_account_row",
    "make_listing_row",
    "make_purchase_row",
    "make_review_row",
]
