"""Billing invoice PDF generation surface.

Owner: Plutus (W2 NP S2).

Public API
----------
- :func:`generate_invoice_pdf` renders a PDF byte string for a given
  ``marketplace_purchase`` row.
- :func:`build_invoice_data` resolves the purchase row + creator + buyer
  + listing context into the dataclass the renderer consumes.
- :data:`invoice_router` is the FastAPI router mounted at
  ``/v1/billing/invoices`` exposing the auth-gated PDF download.

The renderer uses ReportLab Canvas (pure-Python, no Cairo/Pango native
deps) per the spawn directive; weasyprint was rejected because it would
have required libcairo2 + libpango-1.0-0 in the Docker base layer.
"""

from __future__ import annotations

from src.backend.billing.invoices.pdf_generator import (
    InvoiceData,
    InvoiceLineItem,
    InvoiceNotFoundError,
    build_invoice_data,
    generate_invoice_pdf,
)
from src.backend.billing.invoices.router import invoices_router

__all__ = [
    "InvoiceData",
    "InvoiceLineItem",
    "InvoiceNotFoundError",
    "build_invoice_data",
    "generate_invoice_pdf",
    "invoices_router",
]
