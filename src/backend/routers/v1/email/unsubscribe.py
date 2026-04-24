"""Unsubscribe router.

Contract: ``docs/contracts/email_transactional.contract.md`` Section 4.3.

Endpoints
---------
- ``GET  /unsubscribe``          : HTML confirmation page (marketing-
  friendly landing). Returns 200 with a minimal page even on invalid
  token so the user sees a graceful experience.
- ``POST /v1/email/unsubscribe`` : machine endpoint. Verifies HMAC and
  persists the opt-out. Supports RFC 8058 one-click (mail client
  POSTs ``List-Unsubscribe=One-Click`` as the body).

Both routes accept the token as a query parameter because that is how
the footer link is shaped in templates.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Form, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse

from src.backend.email.unsubscribe import (
    InvalidUnsubscribeToken,
    record_unsubscribe,
    verify_unsubscribe_token,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["email"])


_CONFIRM_PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex,nofollow">
<title>{title}</title>
<style>
  body {{ font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
          background: #0b0f17; color: #e6edf3; margin: 0; padding: 48px 24px;
          display: flex; justify-content: center; }}
  .card {{ max-width: 520px; background: #11161f; border: 1px solid #1f2937;
           border-radius: 12px; padding: 32px; }}
  h1 {{ margin: 0 0 12px 0; font-size: 22px; }}
  p {{ line-height: 1.6; color: #9ca3af; }}
  .muted {{ font-size: 13px; color: #6b7280; margin-top: 24px; }}
  a {{ color: #60a5fa; }}
</style>
</head>
<body>
  <div class="card">
    <h1>{title}</h1>
    <p>{body}</p>
    <p class="muted">NERIUM respects your inbox. Transactional messages
    required for account security (sign-in, password reset, billing
    disputes) may still be delivered.</p>
  </div>
</body>
</html>
"""


def _confirm_html(*, title: str, body: str, status_code: int = 200) -> HTMLResponse:
    return HTMLResponse(
        content=_CONFIRM_PAGE.format(title=title, body=body),
        status_code=status_code,
    )


@router.get("/unsubscribe", include_in_schema=False)
async def unsubscribe_get(token: str | None = Query(default=None)) -> HTMLResponse:
    """Public landing. Accepts ``?token=`` and persists opt-out immediately.

    Gmail + Yahoo one-click clients issue a POST against the same URL;
    this GET exists for human clicks from the email footer. We both
    verify and record on GET so the user does not have to click a
    second button (friction reduces opt-out rates; compliance wants
    the opposite).
    """

    if not token:
        return _confirm_html(
            title="Unsubscribe link missing",
            body=(
                "The unsubscribe link is missing its token. Re-open the "
                "original email and click the footer link again."
            ),
            status_code=400,
        )
    try:
        payload = verify_unsubscribe_token(token)
    except InvalidUnsubscribeToken as exc:
        logger.warning("email.unsubscribe.invalid_token reason=%s", exc)
        return _confirm_html(
            title="Unsubscribe link invalid",
            body=(
                "This link is no longer valid. It may have expired or been "
                "tampered with. Contact support@nerium.com if you need help."
            ),
            status_code=400,
        )

    await record_unsubscribe(
        email=payload.email,
        category=payload.category,
        reason="footer_link",
        source="link_click",
    )
    return _confirm_html(
        title="You are unsubscribed",
        body=(
            f"We removed <strong>{payload.email}</strong> from the "
            f"<strong>{payload.category}</strong> category. Changes take "
            "effect immediately."
        ),
    )


@router.post("/v1/email/unsubscribe")
async def unsubscribe_post(
    request: Request,
    token: str | None = Query(default=None),
    list_unsubscribe: str | None = Form(default=None, alias="List-Unsubscribe"),
) -> JSONResponse:
    """RFC 8058 one-click endpoint.

    Mail clients POST ``List-Unsubscribe=One-Click`` as the body; we
    honour the token from the query string that was embedded in the
    ``List-Unsubscribe`` header. The ``list_unsubscribe`` form field is
    accepted for clients that send it for consistency with the RFC
    example payload; we do not require it.
    """

    # Some clients send the token in the JSON body instead of the
    # query string. Accept both shapes.
    extracted = token
    if extracted is None:
        try:
            body: dict[str, Any] = await request.json()
        except Exception:  # noqa: BLE001 - many parse errors, all mean no body
            body = {}
        if isinstance(body, dict):
            extracted = body.get("token")

    if not extracted:
        raise HTTPException(status_code=400, detail="missing_token")

    try:
        payload = verify_unsubscribe_token(extracted)
    except InvalidUnsubscribeToken as exc:
        logger.warning("email.unsubscribe.invalid_token reason=%s", exc)
        raise HTTPException(status_code=403, detail="invalid_token") from exc

    source = "link_click" if list_unsubscribe else "one_click"
    await record_unsubscribe(
        email=payload.email,
        category=payload.category,
        reason="rfc_8058",
        source=source,
    )
    return JSONResponse(
        status_code=200,
        content={
            "status": "unsubscribed",
            "email": payload.email,
            "category": payload.category,
        },
    )


__all__ = ["router"]
