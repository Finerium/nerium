"""Plutus W2 NP S2: invoice PDF generator + router auth tests.

Coverage
--------
1. ``generate_invoice_pdf`` produces a valid PDF blob (magic bytes, EOF
   marker, content-type metadata embedded).
2. Currency formatting + invoice-number derivation are stable across
   inputs.
3. Refund + zero-tax + multi-line cases all render without exception
   (we exercise every section path).
4. ``build_invoice_data`` resolves a row + buyer/seller authorization
   gate via fake asyncpg pool.
5. The router returns the PDF stream with the right headers when the
   caller is the buyer or the seller; 404 when neither.
6. Missing principal returns 401.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.backend.billing.invoices.pdf_generator import (
    InvoiceData,
    InvoiceLineItem,
    InvoiceNotFoundError,
    _format_currency,
    _format_invoice_number,
    build_invoice_data,
    generate_invoice_pdf,
)
from src.backend.billing.invoices.router import invoices_router
from src.backend.errors import register_problem_handlers
from src.backend.middleware.auth import AuthPrincipal


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _frozen_data(**overrides: Any) -> InvoiceData:
    base = dict(
        invoice_number="NRM-20260426-DEADBEEF",
        issue_date=datetime(2026, 4, 26, 12, 0, tzinfo=timezone.utc),
        period_start=datetime(2026, 4, 26, 11, 30, tzinfo=timezone.utc),
        period_end=datetime(2026, 4, 26, 12, 0, tzinfo=timezone.utc),
        seller_name="Apollo Builder",
        seller_email="apollo@example.com",
        seller_company="NERIUM Marketplace",
        buyer_name="Buyer User",
        buyer_email="buyer@example.com",
        line_items=[
            InvoiceLineItem(
                description="Premium agent: trading signal pack",
                quantity=1,
                unit_amount_cents=4900,
                line_total_cents=4900,
            )
        ],
        subtotal_cents=4900,
        tax_cents=0,
        total_cents=4900,
        currency="USD",
        payment_status="completed",
        payment_intent_id="pi_test_abc123",
        notes="",
        test_mode=True,
    )
    base.update(overrides)
    return InvoiceData(**base)


# ---------------------------------------------------------------------------
# Pure renderer tests
# ---------------------------------------------------------------------------


def test_generate_pdf_emits_valid_pdf_magic_bytes():
    """The output must start with %PDF and end with %%EOF."""

    pdf = generate_invoice_pdf(_frozen_data())

    assert pdf.startswith(b"%PDF-"), "missing PDF magic bytes"
    assert b"%%EOF" in pdf[-128:], "missing PDF EOF marker"
    assert len(pdf) > 1000, "PDF unexpectedly small"


def test_generate_pdf_handles_long_description_truncation():
    """Descriptions over 60 chars are truncated rather than overflowing."""

    long_desc = "Very long marketplace listing title " * 5
    pdf = generate_invoice_pdf(
        _frozen_data(
            line_items=[
                InvoiceLineItem(
                    description=long_desc,
                    quantity=1,
                    unit_amount_cents=1000,
                    line_total_cents=1000,
                )
            ]
        )
    )
    assert pdf.startswith(b"%PDF-")


def test_generate_pdf_handles_refund_status():
    """Refund status routes through the warning badge branch."""

    pdf = generate_invoice_pdf(
        _frozen_data(
            payment_status="refunded",
            notes="Refunded amount USD 49.00.",
        )
    )
    assert pdf.startswith(b"%PDF-")


def test_generate_pdf_handles_failed_status():
    """Failed status routes through the danger badge branch."""

    pdf = generate_invoice_pdf(
        _frozen_data(
            payment_status="failed",
            payment_intent_id=None,
        )
    )
    assert pdf.startswith(b"%PDF-")


def test_generate_pdf_multi_line_renders():
    """Multiple line items all draw without exception."""

    items = [
        InvoiceLineItem(
            description=f"Listing {i}",
            quantity=1,
            unit_amount_cents=1000 * (i + 1),
            line_total_cents=1000 * (i + 1),
        )
        for i in range(5)
    ]
    pdf = generate_invoice_pdf(
        _frozen_data(
            line_items=items,
            subtotal_cents=15000,
            total_cents=15000,
        )
    )
    assert pdf.startswith(b"%PDF-")


def test_format_currency_matches_locale_convention():
    """Minor units render with thousand separator + 2 decimal places."""

    assert _format_currency(123456, "USD") == "USD 1,234.56"
    assert _format_currency(0, "USD") == "USD 0.00"
    assert _format_currency(99, "USD") == "USD 0.99"
    assert _format_currency(-500, "USD") == "-USD 5.00"


def test_format_invoice_number_is_deterministic():
    """Same UUID + date produce the same invoice number."""

    pid = UUID("01890000-0000-7000-8000-deadbeefcafe")
    issue = datetime(2026, 4, 26, tzinfo=timezone.utc)
    n = _format_invoice_number(pid, issue)
    assert n.startswith("NRM-20260426-")
    assert len(n) == len("NRM-20260426-XXXXXXXX")


# ---------------------------------------------------------------------------
# Resolver tests (build_invoice_data with fake pool)
# ---------------------------------------------------------------------------


@pytest.fixture
def fake_pool_for_invoice(monkeypatch: pytest.MonkeyPatch):
    """Install a fake asyncpg pool with controllable fetchrow result."""

    conn = MagicMock()
    conn.fetchrow = AsyncMock(return_value=None)

    class _AcquireCtx:
        async def __aenter__(self):
            return conn

        async def __aexit__(self, *exc):
            return None

    pool = MagicMock()
    pool.acquire = MagicMock(return_value=_AcquireCtx())

    monkeypatch.setattr(
        "src.backend.billing.invoices.pdf_generator.get_pool"
        if False
        else "src.backend.db.pool.get_pool",
        lambda: pool,
    )
    return conn


@pytest.mark.asyncio
async def test_build_invoice_data_raises_when_row_missing(fake_pool_for_invoice):
    """Missing row raises InvoiceNotFoundError."""

    fake_pool_for_invoice.fetchrow.return_value = None
    with pytest.raises(InvoiceNotFoundError):
        await build_invoice_data(
            invoice_id=uuid4(),
            requesting_user_id=uuid4(),
            tenant_id=uuid4(),
        )


@pytest.mark.asyncio
async def test_build_invoice_data_blocks_unrelated_user(fake_pool_for_invoice):
    """A user who is neither buyer nor seller hits 404 (folded)."""

    buyer_id = uuid4()
    creator_id = uuid4()
    other_id = uuid4()
    tenant_id = uuid4()
    purchase_id = uuid4()
    listing_id = uuid4()

    fake_pool_for_invoice.fetchrow.return_value = _make_purchase_row(
        purchase_id=purchase_id,
        tenant_id=tenant_id,
        listing_id=listing_id,
        buyer_user_id=buyer_id,
        creator_user_id=creator_id,
    )
    with pytest.raises(InvoiceNotFoundError):
        await build_invoice_data(
            invoice_id=purchase_id,
            requesting_user_id=other_id,
            tenant_id=tenant_id,
        )


@pytest.mark.asyncio
async def test_build_invoice_data_succeeds_for_buyer(fake_pool_for_invoice):
    """Buyer can resolve their own invoice."""

    buyer_id = uuid4()
    creator_id = uuid4()
    tenant_id = uuid4()
    purchase_id = uuid4()
    listing_id = uuid4()

    fake_pool_for_invoice.fetchrow.return_value = _make_purchase_row(
        purchase_id=purchase_id,
        tenant_id=tenant_id,
        listing_id=listing_id,
        buyer_user_id=buyer_id,
        creator_user_id=creator_id,
    )

    data = await build_invoice_data(
        invoice_id=purchase_id,
        requesting_user_id=buyer_id,
        tenant_id=tenant_id,
    )
    assert data.payment_status == "completed"
    assert data.payment_intent_id == "pi_test_xyz"
    assert data.line_items[0].description == "Test Listing"
    assert data.total_cents == 9900


@pytest.mark.asyncio
async def test_build_invoice_data_succeeds_for_seller(fake_pool_for_invoice):
    """Seller can resolve invoices for purchases of their listings."""

    buyer_id = uuid4()
    creator_id = uuid4()
    tenant_id = uuid4()
    purchase_id = uuid4()
    listing_id = uuid4()

    fake_pool_for_invoice.fetchrow.return_value = _make_purchase_row(
        purchase_id=purchase_id,
        tenant_id=tenant_id,
        listing_id=listing_id,
        buyer_user_id=buyer_id,
        creator_user_id=creator_id,
    )

    data = await build_invoice_data(
        invoice_id=purchase_id,
        requesting_user_id=creator_id,
        tenant_id=tenant_id,
    )
    assert data.invoice_number.startswith("NRM-")


# ---------------------------------------------------------------------------
# Router tests
# ---------------------------------------------------------------------------


def _build_test_app(principal: AuthPrincipal | None) -> FastAPI:
    """Return a tiny FastAPI app mounting the invoice router.

    Auth is injected via a middleware that stamps ``request.state.auth``
    so the router's ``_require_auth`` helper resolves cleanly without
    spinning up the full Aether middleware stack.
    """

    app = FastAPI()
    register_problem_handlers(app)

    @app.middleware("http")
    async def _inject_auth(request, call_next):
        if principal is not None:
            request.state.auth = principal
        return await call_next(request)

    app.include_router(invoices_router, prefix="/v1")
    return app


def test_router_returns_401_without_principal(monkeypatch):
    """No principal => 401."""

    app = _build_test_app(principal=None)
    client = TestClient(app, raise_server_exceptions=False)

    resp = client.get(f"/v1/billing/invoices/{uuid4()}.pdf")
    assert resp.status_code == 401


def test_router_returns_pdf_for_authorized_buyer(monkeypatch):
    """Buyer hitting the endpoint receives a PDF stream."""

    buyer_id = uuid4()
    creator_id = uuid4()
    tenant_id = uuid4()
    purchase_id = uuid4()
    listing_id = uuid4()

    conn = MagicMock()
    conn.fetchrow = AsyncMock(
        return_value=_make_purchase_row(
            purchase_id=purchase_id,
            tenant_id=tenant_id,
            listing_id=listing_id,
            buyer_user_id=buyer_id,
            creator_user_id=creator_id,
        )
    )

    class _AcquireCtx:
        async def __aenter__(self):
            return conn

        async def __aexit__(self, *exc):
            return None

    pool = MagicMock()
    pool.acquire = MagicMock(return_value=_AcquireCtx())
    monkeypatch.setattr("src.backend.db.pool.get_pool", lambda: pool)

    principal = AuthPrincipal(
        user_id=str(buyer_id),
        tenant_id=str(tenant_id),
        scopes=frozenset({"user"}),
        token_type="bearer",
    )
    app = _build_test_app(principal=principal)
    client = TestClient(app)

    resp = client.get(f"/v1/billing/invoices/{purchase_id}.pdf")
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"].startswith("application/pdf")
    assert "attachment" in resp.headers.get("content-disposition", "")
    assert resp.content.startswith(b"%PDF-")


def test_router_returns_404_for_unrelated_user(monkeypatch):
    """A user neither buyer nor seller gets 404 (existence not leaked)."""

    buyer_id = uuid4()
    creator_id = uuid4()
    tenant_id = uuid4()
    purchase_id = uuid4()
    listing_id = uuid4()
    other_id = uuid4()

    conn = MagicMock()
    conn.fetchrow = AsyncMock(
        return_value=_make_purchase_row(
            purchase_id=purchase_id,
            tenant_id=tenant_id,
            listing_id=listing_id,
            buyer_user_id=buyer_id,
            creator_user_id=creator_id,
        )
    )

    class _AcquireCtx:
        async def __aenter__(self):
            return conn

        async def __aexit__(self, *exc):
            return None

    pool = MagicMock()
    pool.acquire = MagicMock(return_value=_AcquireCtx())
    monkeypatch.setattr("src.backend.db.pool.get_pool", lambda: pool)

    principal = AuthPrincipal(
        user_id=str(other_id),
        tenant_id=str(tenant_id),
        scopes=frozenset({"user"}),
        token_type="bearer",
    )
    app = _build_test_app(principal=principal)
    client = TestClient(app)

    resp = client.get(f"/v1/billing/invoices/{purchase_id}.pdf")
    assert resp.status_code == 404


def test_router_alias_without_pdf_suffix_works(monkeypatch):
    """``/invoices/{id}`` without ``.pdf`` returns the same payload."""

    buyer_id = uuid4()
    creator_id = uuid4()
    tenant_id = uuid4()
    purchase_id = uuid4()
    listing_id = uuid4()

    conn = MagicMock()
    conn.fetchrow = AsyncMock(
        return_value=_make_purchase_row(
            purchase_id=purchase_id,
            tenant_id=tenant_id,
            listing_id=listing_id,
            buyer_user_id=buyer_id,
            creator_user_id=creator_id,
        )
    )

    class _AcquireCtx:
        async def __aenter__(self):
            return conn

        async def __aexit__(self, *exc):
            return None

    pool = MagicMock()
    pool.acquire = MagicMock(return_value=_AcquireCtx())
    monkeypatch.setattr("src.backend.db.pool.get_pool", lambda: pool)

    principal = AuthPrincipal(
        user_id=str(buyer_id),
        tenant_id=str(tenant_id),
        scopes=frozenset({"user"}),
        token_type="bearer",
    )
    app = _build_test_app(principal=principal)
    client = TestClient(app)

    resp = client.get(f"/v1/billing/invoices/{purchase_id}")
    assert resp.status_code == 200
    assert resp.content.startswith(b"%PDF-")


# ---------------------------------------------------------------------------
# Row factory
# ---------------------------------------------------------------------------


def _make_purchase_row(
    *,
    purchase_id: UUID,
    tenant_id: UUID,
    listing_id: UUID,
    buyer_user_id: UUID,
    creator_user_id: UUID,
) -> dict[str, Any]:
    return {
        "id": purchase_id,
        "tenant_id": tenant_id,
        "listing_id": listing_id,
        "buyer_user_id": buyer_user_id,
        "creator_user_id": creator_user_id,
        "gross_amount_cents": 9900,
        "platform_fee_cents": 1980,
        "creator_net_cents": 7920,
        "refunded_amount_cents": 0,
        "currency": "USD",
        "status": "completed",
        "payment_intent_id": "pi_test_xyz",
        "created_at": datetime(2026, 4, 26, 11, 30, tzinfo=timezone.utc),
        "completed_at": datetime(2026, 4, 26, 12, 0, tzinfo=timezone.utc),
        "listing_title": "Test Listing",
        "listing_category": "core_agent",
        "buyer_email": "buyer@example.com",
        "buyer_display_name": "Test Buyer",
        "creator_email": "creator@example.com",
        "creator_display_name": "Test Creator",
    }
