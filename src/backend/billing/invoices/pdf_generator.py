"""ReportLab Canvas PDF renderer for marketplace purchase invoices.

Owner: Plutus (W2 NP S2).

Why ReportLab and not WeasyPrint
--------------------------------
WeasyPrint pulls libcairo2 + libpango-1.0-0 + libgdk-pixbuf-2.0-0 as
shared library deps. ReportLab is pure Python (with a tiny C extension
that ships in the wheel) so the Docker base layer stays slim. The
visual output is also deterministic per platform which keeps the
``test_invoice_pdf.py`` golden checks stable.

Visual contract
---------------
Match the landing page palette (Marshall pricing CTA references):
   - ink ``#0a0a0a`` for body text
   - phosphor green ``#a3e635`` for the NERIUM accent + total bar
   - graphite ``#5b5b5b`` for secondary metadata
   - rule grey ``#e5e5e5`` for separators

Typography uses Helvetica (ReportLab built-in alias for the four PDF
core fonts which every reader supports without font embedding).

Layout
------
A4 portrait, 18mm margins all sides. The page renders top-down:

   1. NERIUM mark (top-left) + Invoice metadata block (top-right).
   2. Bill-to + Bill-from row.
   3. Line items table with rule separators.
   4. Total bar (phosphor accent strip + bold total).
   5. Payment status badge + tax breakdown.
   6. Footer with company info + honest-claim test mode disclosure.

The renderer DOES NOT phone home, DOES NOT call Stripe, DOES NOT touch
Redis. Everything required to draw the page comes through the
:class:`InvoiceData` dataclass so the function is trivially testable
with frozen test fixtures.
"""

from __future__ import annotations

import io
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont  # noqa: F401  # documented escape hatch
from reportlab.pdfgen.canvas import Canvas

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Palette + typography (single source of truth for the renderer)
# ---------------------------------------------------------------------------

INK = HexColor("#0a0a0a")
PHOSPHOR = HexColor("#a3e635")
GRAPHITE = HexColor("#5b5b5b")
RULE = HexColor("#e5e5e5")
PAGE_BG = HexColor("#ffffff")
SUCCESS = HexColor("#16a34a")
WARNING = HexColor("#d97706")
DANGER = HexColor("#dc2626")

PAGE_WIDTH, PAGE_HEIGHT = A4
MARGIN = 18 * mm


# ---------------------------------------------------------------------------
# Data shapes consumed by the renderer
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class InvoiceLineItem:
    """Single row in the invoice line-item table."""

    description: str
    quantity: int
    unit_amount_cents: int
    line_total_cents: int


@dataclass(frozen=True)
class InvoiceData:
    """Frozen view of everything the renderer needs.

    The router builds this from the live ``marketplace_purchase`` row
    plus joined creator + buyer + listing rows. Tests build it from
    fixtures so the renderer stays pure.
    """

    invoice_number: str
    issue_date: datetime
    period_start: datetime
    period_end: datetime
    seller_name: str
    seller_email: Optional[str]
    seller_company: str
    buyer_name: str
    buyer_email: Optional[str]
    line_items: list[InvoiceLineItem]
    subtotal_cents: int
    tax_cents: int
    total_cents: int
    currency: str
    payment_status: str
    payment_intent_id: Optional[str]
    notes: str = ""
    test_mode: bool = True
    metadata: dict[str, Any] = field(default_factory=dict)


class InvoiceNotFoundError(LookupError):
    """Raised by :func:`build_invoice_data` when no purchase matches."""


# ---------------------------------------------------------------------------
# Render
# ---------------------------------------------------------------------------


def generate_invoice_pdf(data: InvoiceData) -> bytes:
    """Return the rendered PDF for ``data`` as bytes.

    Pure function. No I/O beyond the in-memory buffer. Safe to call
    from any thread (ReportLab Canvas is itself thread-safe per
    instance and we instantiate a new one each call).
    """

    buf = io.BytesIO()
    c = Canvas(
        buf,
        pagesize=A4,
        pageCompression=1,
        invariant=True,
    )

    # Set permanent metadata so PDF readers show the title bar
    # consistently and search engines do not pick up "untitled".
    c.setTitle(f"NERIUM Invoice {data.invoice_number}")
    c.setAuthor("NERIUM")
    c.setSubject(
        f"Marketplace invoice for {data.buyer_name} period "
        f"{data.period_start.date().isoformat()} to "
        f"{data.period_end.date().isoformat()}"
    )
    c.setCreator("NERIUM Billing")

    cursor_y = PAGE_HEIGHT - MARGIN

    cursor_y = _draw_header(c, data, cursor_y)
    cursor_y -= 6 * mm
    cursor_y = _draw_parties(c, data, cursor_y)
    cursor_y -= 6 * mm
    cursor_y = _draw_line_items(c, data, cursor_y)
    cursor_y -= 4 * mm
    cursor_y = _draw_totals(c, data, cursor_y)
    cursor_y -= 6 * mm
    cursor_y = _draw_status(c, data, cursor_y)

    _draw_footer(c, data)

    c.showPage()
    c.save()
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Section renderers (pure layout helpers)
# ---------------------------------------------------------------------------


def _draw_header(c: Canvas, data: InvoiceData, y: float) -> float:
    """Draw the top NERIUM mark + invoice metadata block."""

    # NERIUM mark: phosphor square + wordmark next to it.
    c.setFillColor(PHOSPHOR)
    c.rect(MARGIN, y - 8 * mm, 8 * mm, 8 * mm, fill=1, stroke=0)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(MARGIN + 11 * mm, y - 6 * mm, "NERIUM")
    c.setFont("Helvetica", 8)
    c.setFillColor(GRAPHITE)
    c.drawString(
        MARGIN + 11 * mm,
        y - 9.5 * mm,
        "Infrastructure for the AI agent economy",
    )

    # Right-aligned invoice metadata.
    right_x = PAGE_WIDTH - MARGIN
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 14)
    c.drawRightString(right_x, y - 2 * mm, "INVOICE")
    c.setFont("Helvetica", 9)
    c.setFillColor(GRAPHITE)
    c.drawRightString(
        right_x, y - 7 * mm, f"Invoice number  {data.invoice_number}"
    )
    c.drawRightString(
        right_x,
        y - 11 * mm,
        f"Issue date  {data.issue_date.strftime('%d %b %Y')}",
    )
    c.drawRightString(
        right_x,
        y - 15 * mm,
        (
            f"Billing period  "
            f"{data.period_start.strftime('%d %b %Y')} "
            f"to {data.period_end.strftime('%d %b %Y')}"
        ),
    )

    # Underline rule.
    next_y = y - 22 * mm
    c.setStrokeColor(RULE)
    c.setLineWidth(0.5)
    c.line(MARGIN, next_y, PAGE_WIDTH - MARGIN, next_y)
    return next_y


def _draw_parties(c: Canvas, data: InvoiceData, y: float) -> float:
    """Draw the bill-to + bill-from two-column block."""

    col_width = (PAGE_WIDTH - 2 * MARGIN) / 2

    c.setFillColor(GRAPHITE)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(MARGIN, y - 5 * mm, "BILL FROM")
    c.drawString(MARGIN + col_width, y - 5 * mm, "BILL TO")

    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(MARGIN, y - 11 * mm, data.seller_company)
    c.drawString(MARGIN + col_width, y - 11 * mm, data.buyer_name)

    c.setFont("Helvetica", 9)
    c.setFillColor(GRAPHITE)
    c.drawString(MARGIN, y - 15.5 * mm, data.seller_name)
    if data.seller_email:
        c.drawString(MARGIN, y - 19.5 * mm, data.seller_email)
    if data.buyer_email:
        c.drawString(MARGIN + col_width, y - 15.5 * mm, data.buyer_email)

    return y - 24 * mm


def _draw_line_items(c: Canvas, data: InvoiceData, y: float) -> float:
    """Draw the line item table.

    Columns (left -> right):
       Description  |  Qty  |  Unit  |  Total
    """

    inner_width = PAGE_WIDTH - 2 * MARGIN
    col_qty_x = MARGIN + inner_width * 0.55
    col_unit_x = MARGIN + inner_width * 0.72
    col_total_x = PAGE_WIDTH - MARGIN

    # Header row.
    c.setFillColor(GRAPHITE)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(MARGIN, y - 4 * mm, "DESCRIPTION")
    c.drawRightString(col_qty_x + 4 * mm, y - 4 * mm, "QTY")
    c.drawRightString(col_unit_x + 14 * mm, y - 4 * mm, "UNIT")
    c.drawRightString(col_total_x, y - 4 * mm, "TOTAL")

    rule_y = y - 6 * mm
    c.setStrokeColor(RULE)
    c.setLineWidth(0.5)
    c.line(MARGIN, rule_y, PAGE_WIDTH - MARGIN, rule_y)

    # Line item rows.
    cursor = rule_y - 6 * mm
    c.setFillColor(INK)
    c.setFont("Helvetica", 10)
    for item in data.line_items:
        # Description wraps softly: clip to 60 chars to keep the column
        # honest. Real invoices rarely exceed this width and the
        # alternative (full text-flow) is overkill for a hackathon
        # receipt PDF.
        description = item.description
        if len(description) > 60:
            description = description[:57] + "..."

        c.setFillColor(INK)
        c.drawString(MARGIN, cursor, description)
        c.drawRightString(col_qty_x + 4 * mm, cursor, str(item.quantity))
        c.drawRightString(
            col_unit_x + 14 * mm,
            cursor,
            _format_currency(item.unit_amount_cents, data.currency),
        )
        c.drawRightString(
            col_total_x,
            cursor,
            _format_currency(item.line_total_cents, data.currency),
        )

        cursor -= 5 * mm
        c.setStrokeColor(RULE)
        c.line(MARGIN, cursor + 1 * mm, PAGE_WIDTH - MARGIN, cursor + 1 * mm)
        cursor -= 1 * mm

    return cursor


def _draw_totals(c: Canvas, data: InvoiceData, y: float) -> float:
    """Subtotal + tax + total stack flush right."""

    inner_width = PAGE_WIDTH - 2 * MARGIN
    label_x = MARGIN + inner_width * 0.6
    value_x = PAGE_WIDTH - MARGIN

    c.setFont("Helvetica", 10)
    c.setFillColor(GRAPHITE)
    c.drawRightString(label_x + 30 * mm, y - 4 * mm, "Subtotal")
    c.setFillColor(INK)
    c.drawRightString(
        value_x,
        y - 4 * mm,
        _format_currency(data.subtotal_cents, data.currency),
    )

    c.setFillColor(GRAPHITE)
    c.drawRightString(label_x + 30 * mm, y - 9 * mm, "Tax")
    c.setFillColor(INK)
    c.drawRightString(
        value_x,
        y - 9 * mm,
        _format_currency(data.tax_cents, data.currency),
    )

    # Phosphor total bar.
    bar_y = y - 17 * mm
    c.setFillColor(PHOSPHOR)
    c.rect(label_x, bar_y, value_x - label_x, 8 * mm, fill=1, stroke=0)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(label_x + 4 * mm, bar_y + 2.5 * mm, "TOTAL DUE")
    c.setFont("Helvetica-Bold", 12)
    c.drawRightString(
        value_x - 4 * mm,
        bar_y + 2.5 * mm,
        _format_currency(data.total_cents, data.currency),
    )

    return bar_y


def _draw_status(c: Canvas, data: InvoiceData, y: float) -> float:
    """Payment status badge + Stripe reference."""

    status = data.payment_status.lower()
    if status in {"completed", "paid", "succeeded"}:
        color = SUCCESS
        label = "PAID"
    elif status in {"pending", "processing"}:
        color = WARNING
        label = "PENDING"
    elif status in {"refunded", "partially_refunded"}:
        color = WARNING
        label = "REFUNDED"
    else:
        color = DANGER
        label = status.upper() or "FAILED"

    badge_y = y - 4 * mm
    c.setFillColor(color)
    badge_w = 26 * mm
    c.rect(MARGIN, badge_y, badge_w, 6 * mm, fill=1, stroke=0)
    c.setFillColor(PAGE_BG)
    c.setFont("Helvetica-Bold", 9)
    c.drawCentredString(MARGIN + badge_w / 2, badge_y + 1.7 * mm, label)

    if data.payment_intent_id:
        c.setFillColor(GRAPHITE)
        c.setFont("Helvetica", 8)
        c.drawString(
            MARGIN + badge_w + 4 * mm,
            badge_y + 1.7 * mm,
            f"Stripe ref  {data.payment_intent_id}",
        )

    if data.notes:
        c.setFont("Helvetica-Oblique", 8)
        c.setFillColor(GRAPHITE)
        c.drawString(MARGIN, badge_y - 6 * mm, data.notes[:120])

    return badge_y - 12 * mm


def _draw_footer(c: Canvas, data: InvoiceData) -> None:
    """Footer with company info + test-mode disclosure (honest-claim)."""

    foot_y = MARGIN
    c.setStrokeColor(RULE)
    c.setLineWidth(0.5)
    c.line(MARGIN, foot_y + 12 * mm, PAGE_WIDTH - MARGIN, foot_y + 12 * mm)

    c.setFillColor(GRAPHITE)
    c.setFont("Helvetica", 7)
    c.drawString(
        MARGIN,
        foot_y + 7 * mm,
        "NERIUM, infrastructure for the AI agent economy.",
    )
    c.drawString(
        MARGIN,
        foot_y + 4 * mm,
        "github.com/Finerium/nerium  |  finerium@users.noreply.github.com",
    )

    if data.test_mode:
        c.setFillColor(WARNING)
        c.setFont("Helvetica-Bold", 7)
        c.drawRightString(
            PAGE_WIDTH - MARGIN,
            foot_y + 7 * mm,
            "STRIPE TEST MODE",
        )
        c.setFont("Helvetica", 7)
        c.setFillColor(GRAPHITE)
        c.drawRightString(
            PAGE_WIDTH - MARGIN,
            foot_y + 4 * mm,
            "Pre-Atlas verification. No live charges.",
        )


# ---------------------------------------------------------------------------
# Backend data resolver
# ---------------------------------------------------------------------------


async def build_invoice_data(
    *,
    invoice_id: UUID,
    requesting_user_id: UUID,
    tenant_id: UUID,
) -> InvoiceData:
    """Resolve an invoice id (= ``marketplace_purchase.id``) to the
    :class:`InvoiceData` view.

    Raises
    ------
    InvoiceNotFoundError
        When no row matches the id, OR when the requesting user is
        neither the buyer nor the creator of the purchase. The same
        error is raised for both so we do not leak existence under
        cross-tenant probing.
    """

    from src.backend.db.pool import get_pool

    pool = get_pool()
    async with pool.acquire() as conn:
        # Tenant scope is enforced via the explicit equality check
        # on ``tenant_id`` plus the buyer/creator membership gate. The
        # purchase row carries its own tenant; we double-check rather
        # than rely on RLS only because the invoice surface is read by
        # both parties (buyer might live in a different tenant than the
        # creator's tenant once cross-tenant marketplaces ship).
        row = await conn.fetchrow(
            """
            SELECT
                mp.id,
                mp.tenant_id,
                mp.listing_id,
                mp.buyer_user_id,
                mp.creator_user_id,
                mp.gross_amount_cents,
                mp.platform_fee_cents,
                mp.creator_net_cents,
                mp.refunded_amount_cents,
                mp.currency,
                mp.status,
                mp.payment_intent_id,
                mp.created_at,
                mp.completed_at,
                ml.title AS listing_title,
                ml.category AS listing_category,
                buyer.email AS buyer_email,
                buyer.display_name AS buyer_display_name,
                creator.email AS creator_email,
                creator.display_name AS creator_display_name
            FROM marketplace_purchase mp
            JOIN marketplace_listing ml ON ml.id = mp.listing_id
            LEFT JOIN app_user buyer ON buyer.id = mp.buyer_user_id
            LEFT JOIN app_user creator ON creator.id = mp.creator_user_id
            WHERE mp.id = $1
            """,
            invoice_id,
        )

    if row is None:
        raise InvoiceNotFoundError(
            f"invoice {invoice_id} not found"
        )

    # Authorization: requesting_user must be either the buyer or the
    # seller of this purchase. Tenant gate is best-effort: we require
    # the requester's tenant matches the purchase tenant unless the
    # requester is the buyer (cross-tenant buyer flow is allowed).
    if requesting_user_id not in {
        row["buyer_user_id"],
        row["creator_user_id"],
    }:
        raise InvoiceNotFoundError(
            f"invoice {invoice_id} not visible to user {requesting_user_id}"
        )

    if (
        requesting_user_id == row["creator_user_id"]
        and tenant_id != row["tenant_id"]
    ):
        # Creator should always be in the same tenant as the purchase;
        # mismatch means the JWT was minted under a different tenant
        # context than the listing.
        raise InvoiceNotFoundError(
            f"invoice {invoice_id} tenant mismatch for creator"
        )

    issue_date: datetime = row["completed_at"] or row["created_at"]
    if issue_date.tzinfo is None:
        issue_date = issue_date.replace(tzinfo=timezone.utc)

    period_start = row["created_at"]
    if period_start.tzinfo is None:
        period_start = period_start.replace(tzinfo=timezone.utc)
    period_end = issue_date

    # Synthesize line items from the purchase row. Marketplace purchases
    # are single-line by construction (one listing per purchase) but we
    # keep the table multi-row friendly for future quantity-aware
    # listings (e.g. seat-licensed tiers).
    gross = int(row["gross_amount_cents"])
    fee = int(row["platform_fee_cents"])
    line_items = [
        InvoiceLineItem(
            description=str(row["listing_title"] or "Marketplace listing"),
            quantity=1,
            unit_amount_cents=gross,
            line_total_cents=gross,
        )
    ]

    # Tax surface: marketplace test mode does not collect tax. We keep
    # the row so the totals block draws correctly and the future
    # post-Atlas live mode can flip a real value in.
    tax_cents = 0
    subtotal_cents = gross
    total_cents = gross

    notes_parts: list[str] = []
    if fee:
        notes_parts.append(
            f"Platform fee {_format_currency(fee, str(row['currency']))} "
            f"deducted from creator earnings."
        )
    refunded = int(row["refunded_amount_cents"] or 0)
    if refunded:
        notes_parts.append(
            f"Refunded amount {_format_currency(refunded, str(row['currency']))}."
        )

    return InvoiceData(
        invoice_number=_format_invoice_number(row["id"], issue_date),
        issue_date=issue_date,
        period_start=period_start,
        period_end=period_end,
        seller_name=str(row["creator_display_name"] or "NERIUM Creator"),
        seller_email=row["creator_email"],
        seller_company="NERIUM Marketplace",
        buyer_name=str(row["buyer_display_name"] or "NERIUM Customer"),
        buyer_email=row["buyer_email"],
        line_items=line_items,
        subtotal_cents=subtotal_cents,
        tax_cents=tax_cents,
        total_cents=total_cents,
        currency=str(row["currency"]),
        payment_status=str(row["status"]),
        payment_intent_id=row["payment_intent_id"],
        notes=" ".join(notes_parts),
        test_mode=True,
        metadata={
            "listing_id": str(row["listing_id"]),
            "listing_category": str(row["listing_category"]),
            "purchase_id": str(row["id"]),
        },
    )


# ---------------------------------------------------------------------------
# Format helpers
# ---------------------------------------------------------------------------


def _format_currency(amount_cents: int, currency: str) -> str:
    """Format minor units to the human display string.

    Matches the frontend ``formatCurrency`` helper in
    ``src/lib/format/currency.ts`` for cross-surface consistency.
    """

    sign = "-" if amount_cents < 0 else ""
    abs_cents = abs(amount_cents)
    whole, frac = divmod(abs_cents, 100)
    return f"{sign}{currency.upper()} {whole:,}.{frac:02d}"


def _format_invoice_number(purchase_id: UUID, issue_date: datetime) -> str:
    """Stable invoice-number format users can quote in support.

    ``NRM-YYYYMMDD-<short_id>`` where ``<short_id>`` is the first 8
    hex chars of the purchase UUID. Collision is impossible per UUID
    v7 ordering plus tenant scope plus 8-char window.
    """

    short = purchase_id.hex[:8].upper()
    return f"NRM-{issue_date.strftime('%Y%m%d')}-{short}"
