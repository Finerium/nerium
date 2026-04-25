"""``GET /v1/billing/invoices/{invoice_id}.pdf`` invoice download.

Owner: Plutus (W2 NP S2). Consumer: Iapetus dashboard download button.

Auth required. The endpoint resolves ``invoice_id`` to the matching
``marketplace_purchase`` row, verifies the requester is either the
buyer or the seller of that purchase, renders the PDF via
:func:`generate_invoice_pdf`, and streams the bytes back with
``Content-Type: application/pdf`` and a download-friendly
``Content-Disposition`` header.

The ``.pdf`` suffix in the path is cosmetic; some browsers + the macOS
Preview save dialog use the URL filename when the response does not
suggest one. Both ``/{id}`` and ``/{id}.pdf`` match the same route to
keep the surface forgiving to copy-paste.
"""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Request, Response, status

from src.backend.billing.invoices.pdf_generator import (
    InvoiceNotFoundError,
    build_invoice_data,
    generate_invoice_pdf,
)
from src.backend.errors import NotFoundProblem, UnauthorizedProblem
from src.backend.middleware.auth import AuthPrincipal

logger = logging.getLogger(__name__)

invoices_router = APIRouter(
    prefix="/billing",
    tags=["billing", "invoices"],
)


def _require_auth(request: Request) -> AuthPrincipal:
    auth = getattr(request.state, "auth", None)
    if not isinstance(auth, AuthPrincipal):
        raise UnauthorizedProblem(detail="no authenticated principal")
    return auth


def _build_disposition(invoice_id: UUID) -> str:
    """Return the ``Content-Disposition`` value for the response.

    ``attachment`` triggers the browser's save dialog rather than the
    inline PDF viewer. The filename uses the short invoice id so the
    saved file is human-readable.
    """

    short = invoice_id.hex[:8].upper()
    return f'attachment; filename="nerium-invoice-{short}.pdf"'


async def _render(
    *,
    invoice_id: UUID,
    requesting_user_id: UUID,
    tenant_id: UUID,
) -> bytes:
    """Resolve the data + render PDF bytes, raising 404 on miss/forbid."""

    try:
        data = await build_invoice_data(
            invoice_id=invoice_id,
            requesting_user_id=requesting_user_id,
            tenant_id=tenant_id,
        )
    except InvoiceNotFoundError as exc:
        # Fold both "not found" and "not visible" into a single 404 so
        # we do not leak existence under cross-tenant probing.
        raise NotFoundProblem(detail=str(exc)) from exc

    return generate_invoice_pdf(data)


@invoices_router.get(
    "/invoices/{invoice_id}.pdf",
    status_code=status.HTTP_200_OK,
    responses={
        200: {
            "content": {"application/pdf": {}},
            "description": "PDF stream",
        },
        404: {"description": "Invoice not found or not visible to caller"},
    },
)
async def download_invoice_pdf(
    invoice_id: UUID,
    request: Request,
) -> Response:
    """Render + stream the PDF for the authenticated caller.

    Returns
    -------
    Response
        Raw bytes with ``application/pdf`` Content-Type and an
        attachment Content-Disposition.

    Raises
    ------
    UnauthorizedProblem (401)
        When no principal is bound to the request.
    NotFoundProblem (404)
        When the invoice id does not match a purchase or the caller is
        neither buyer nor seller of the purchase.
    """

    principal = _require_auth(request)
    try:
        requesting_uuid = UUID(principal.user_id)
        tenant_uuid = UUID(principal.tenant_id)
    except (TypeError, ValueError) as exc:
        raise UnauthorizedProblem(
            detail="JWT sub/tenant_id claim is not a valid UUID.",
        ) from exc

    pdf_bytes = await _render(
        invoice_id=invoice_id,
        requesting_user_id=requesting_uuid,
        tenant_id=tenant_uuid,
    )

    logger.info(
        "billing.invoice.rendered invoice_id=%s requester=%s bytes=%d",
        invoice_id,
        requesting_uuid,
        len(pdf_bytes),
    )

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": _build_disposition(invoice_id),
            "Cache-Control": "private, max-age=0, no-cache",
            "X-Content-Type-Options": "nosniff",
        },
    )


# Variant without ``.pdf`` suffix so direct API consumers (curl, the
# frontend fetch helper) can hit the same payload without fighting URL
# templating libraries that strip dot suffixes.
@invoices_router.get(
    "/invoices/{invoice_id}",
    status_code=status.HTTP_200_OK,
    include_in_schema=False,
)
async def download_invoice_pdf_alias(
    invoice_id: UUID,
    request: Request,
) -> Response:
    """Alias of :func:`download_invoice_pdf` without the ``.pdf`` suffix."""

    return await download_invoice_pdf(invoice_id, request)


__all__ = ["invoices_router"]
