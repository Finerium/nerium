"""Resend webhook router.

Per ``docs/contracts/email_transactional.contract.md`` Section 4.4.
"""

from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.responses import JSONResponse

from src.backend.config import get_settings
from src.backend.email.resend_client import ResendClient
from src.backend.email.webhook import process_event

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/email", tags=["email"])


@router.post("/webhooks/resend")
async def resend_webhook(
    request: Request,
    svix_signature: str | None = Header(default=None, alias="Svix-Signature"),
    resend_signature: str | None = Header(default=None, alias="Resend-Signature"),
) -> JSONResponse:
    """Receive + verify + dispatch a Resend webhook event.

    Resend currently ships signatures via Svix ``Svix-Signature``
    headers with the ``svix_msg_*`` format. Older accounts use the
    ``Resend-Signature`` header with raw HMAC hex. We accept either
    and defer verification to
    :meth:`ResendClient.verify_webhook` which implements the HMAC
    compare.
    """

    settings = get_settings()
    body = await request.body()
    secret = settings.resend_webhook_secret.get_secret_value()
    signature = svix_signature or resend_signature or ""

    if not secret:
        # Pre-deploy state. Accept + log but do not dispatch; this
        # prevents a test POST from mutating DB state before Ghaisan
        # wires the secret.
        logger.warning("email.webhook.missing_secret signature_present=%s", bool(signature))
        raise HTTPException(status_code=503, detail="webhook_secret_not_configured")

    if not ResendClient.verify_webhook(
        payload_bytes=body,
        signature_header=signature,
        secret=secret,
    ):
        logger.warning("email.webhook.signature.invalid")
        raise HTTPException(status_code=401, detail="invalid_signature")

    try:
        event = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=400, detail="invalid_payload") from exc

    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="invalid_payload_shape")

    await process_event(event)
    return JSONResponse(status_code=200, content={"status": "ok"})


__all__ = ["router"]
