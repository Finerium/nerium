"""Template preview router (dev-only).

Per ``_meta/RV_PLAN.md`` RV.22 dev-ergonomics: Ghaisan + Nemea-RV-v2
need to eyeball rendered email HTML without firing a real send. This
route honours ``settings.email_env`` and returns 404 in production so
production inboxes never leak template internals.

Endpoints
---------
- ``GET /v1/email/preview``                : HTML index of known templates.
- ``GET /v1/email/preview/{template_name}`` : rendered HTML with placeholder props.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import HTMLResponse, JSONResponse

from src.backend.config import get_settings
from src.backend.email.renderer import render_html
from src.backend.email.templates import (
    TEMPLATES,
    get_template_meta,
    list_template_names,
)
from src.backend.email.unsubscribe import build_unsubscribe_url

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/email/preview", tags=["email"])


# Representative props per template. Kept inline (not in fixtures)
# because the preview surface is a developer ergonomics tool and
# reading a single file beats hunting fixtures. Each dict mirrors the
# expected props contract enforced upstream at send time; props that
# are template-specific get sensible defaults so every template
# renders without extra wiring.
_PREVIEW_PROPS: dict[str, dict[str, object]] = {
    "welcome": {
        "recipient_name": "Lumen",
        "tenant_name": "Lumio Reading",
        "dashboard_url": "https://nerium.com/app",
    },
    "email_verify": {
        "recipient_name": "Lumen",
        "verify_url": "https://nerium.com/verify?token=example",
        "expires_in_hours": 24,
    },
    "password_reset": {
        "recipient_name": "Lumen",
        "reset_url": "https://nerium.com/reset?token=example",
        "expires_in_hours": 1,
    },
    "purchase_receipt": {
        "recipient_name": "Lumen",
        "listing_title": "Pixel avatar pack",
        "amount_paid": "$19.00",
        "invoice_url": "https://nerium.com/invoice/example",
    },
    "marketplace_sale": {
        "recipient_name": "Atlas",
        "listing_title": "Pixel avatar pack",
        "buyer_handle": "lumen",
        "gross_amount": "$19.00",
        "seller_net": "$16.15",
    },
    "payout_paid": {
        "recipient_name": "Atlas",
        "amount": "$423.50",
        "bank_last4": "1234",
        "expected_arrival": "2026-04-28",
    },
    "invoice_receipt": {
        "recipient_name": "Lumen",
        "invoice_number": "INV-0001",
        "amount": "$29.00",
        "invoice_pdf_url": "https://nerium.com/invoice/INV-0001.pdf",
    },
    "quest_completion": {
        "recipient_name": "Lumen",
        "quest_name": "First Builder Session",
        "reward_summary": "Unlocked: Personal dashboard",
    },
    "key_rotation_alert": {
        "recipient_name": "Lumen",
        "old_fingerprint": "sha256:abc12345",
        "new_fingerprint": "sha256:def67890",
        "rotate_at": "2026-04-25 00:00 UTC",
    },
    "dispute_notification": {
        "recipient_name": "Atlas",
        "listing_title": "Pixel avatar pack",
        "dispute_reason": "Not as described",
        "action_deadline": "2026-05-01 23:59 UTC",
    },
    "gdpr_export_ready": {
        "recipient_name": "Lumen",
        "export_url": "https://nerium.com/gdpr/export/example.zip",
        "expires_at": "2026-05-01 00:00 UTC",
    },
    "maintenance_notice": {
        "recipient_name": "Lumen",
        "window_start": "2026-04-26 02:00 UTC",
        "window_end": "2026-04-26 03:00 UTC",
        "summary": "Scheduled Postgres minor version upgrade.",
    },
    "budget_alert": {
        "recipient_name": "Ghaisan",
        "threshold_percent": "85",
        "current_spend": "$425.00",
        "cap": "$500.00",
    },
}


def _preview_enabled() -> bool:
    return get_settings().email_env in {"dev", "staging"}


@router.get("", response_class=HTMLResponse, include_in_schema=False)
async def preview_index() -> HTMLResponse:
    """HTML list of templates with preview links."""

    if not _preview_enabled():
        raise HTTPException(status_code=404)

    rows = []
    for name in list_template_names():
        meta = TEMPLATES[name]
        rows.append(
            f"<tr><td><a href=\"/v1/email/preview/{name}\">{name}</a></td>"
            f"<td>{meta.subject}</td>"
            f"<td>{meta.category}</td>"
            f"<td>{'yes' if meta.critical else 'no'}</td></tr>"
        )
    html_body = (
        "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">"
        "<title>Pheme preview</title>"
        "<style>body{font-family:system-ui;padding:32px;}"
        "table{border-collapse:collapse;width:100%;}"
        "th,td{text-align:left;padding:8px 12px;border-bottom:1px solid #eee;}"
        "</style></head><body>"
        "<h1>Pheme email template preview</h1>"
        "<p>Dev-only route. Set <code>NERIUM_EMAIL_ENV=production</code> to disable.</p>"
        "<table><thead><tr><th>Template</th><th>Subject</th>"
        "<th>Category</th><th>Critical</th></tr></thead>"
        f"<tbody>{''.join(rows)}</tbody></table></body></html>"
    )
    return HTMLResponse(content=html_body, status_code=200)


@router.get(
    "/{template_name}",
    include_in_schema=False,
    response_model=None,
)
async def preview_template(
    template_name: str,
    fmt: str = Query(default="html", pattern="^(html|json)$"),
    to_email: str = Query(default="lumen@example.com"),
) -> HTMLResponse | JSONResponse:
    """Render a single template with canned props for visual review."""

    if not _preview_enabled():
        raise HTTPException(status_code=404)

    try:
        meta = get_template_meta(template_name)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="unknown_template") from exc

    props = dict(_PREVIEW_PROPS.get(template_name, {}))
    props["unsubscribe_url"] = build_unsubscribe_url(
        email=to_email,
        category=meta.category,
    )

    body = render_html(template_name, props)
    if fmt == "json":
        return JSONResponse(
            content={
                "template_name": template_name,
                "template_version": meta.version,
                "subject": meta.subject,
                "category": meta.category,
                "critical": meta.critical,
                "props": props,
                "html": body,
            }
        )
    return HTMLResponse(content=body, status_code=200)


__all__ = ["router"]
