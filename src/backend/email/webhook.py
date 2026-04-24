"""Resend webhook processor.

Per ``docs/contracts/email_transactional.contract.md`` Section 4.4.

Events handled
--------------
- ``email.sent``        : ignored (send path already recorded).
- ``email.delivered``   : update ``sent_at`` if still null.
- ``email.bounced``     : insert ``email_bounce``; on hard bounce auto-
  unsubscribe + update ``email_message.status='bounced'``.
- ``email.complained``  : auto-unsubscribe + update status=``complained``.
- ``email.opened``      : IGNORED at submission (no open tracking for
  transactional; honest-claim README).
- ``email.clicked``     : IGNORED at submission (same reasoning).

The processor is idempotent: duplicate webhooks from Resend (they
retry on timeouts) produce the same state. We dedupe on the
``provider_message_id`` plus the Resend ``created_at`` tuple.

Invocation contract
-------------------
The router calls :func:`process_event` with the parsed payload dict
AFTER signature verification has succeeded (the router owns the
signature check via
:meth:`src.backend.email.resend_client.ResendClient.verify_webhook`).
Returning normally means the webhook is acknowledged; raising makes
the router return a 5xx so Resend retries.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from src.backend.db.pool import get_pool
from src.backend.email.unsubscribe import record_unsubscribe
from src.backend.utils.uuid7 import uuid7

logger = logging.getLogger(__name__)


async def process_event(event: dict[str, Any]) -> None:
    """Dispatch a single verified Resend webhook event."""

    event_type = event.get("type", "")
    data = event.get("data", {}) or {}
    provider_message_id = data.get("email_id") or data.get("id")

    logger.info(
        "email.webhook.received event_type=%s provider_message_id=%s",
        event_type,
        provider_message_id,
    )

    if event_type == "email.sent":
        return
    if event_type == "email.delivered":
        await _mark_delivered(provider_message_id, data)
        return
    if event_type == "email.bounced":
        await _handle_bounce(provider_message_id, data)
        return
    if event_type == "email.complained":
        await _handle_complaint(provider_message_id, data)
        return
    if event_type in {"email.opened", "email.clicked"}:
        return

    logger.warning(
        "email.webhook.unknown_event_type event_type=%s",
        event_type,
    )


async def _mark_delivered(provider_message_id: str | None, data: dict[str, Any]) -> None:
    if not provider_message_id:
        return
    pool = get_pool()
    update = (
        "UPDATE email_message "
        "SET sent_at = COALESCE(sent_at, $2), updated_at = now() "
        "WHERE provider_message_id = $1"
    )
    delivered_at = _parse_iso_timestamp(data.get("created_at"))
    async with pool.acquire() as conn:
        await conn.execute(update, provider_message_id, delivered_at)


async def _handle_bounce(provider_message_id: str | None, data: dict[str, Any]) -> None:
    bounce_type = (data.get("bounce", {}) or {}).get("type", "soft")
    bounce_type = "hard" if bounce_type == "hard" else "soft"
    to_email = _extract_to_email(data)

    pool = get_pool()
    insert_bounce = (
        "INSERT INTO email_bounce (id, to_email, bounce_type, provider_event) "
        "VALUES ($1, $2, $3, $4::jsonb)"
    )
    update_message = (
        "UPDATE email_message "
        "SET status = 'bounced', failure_reason = $2, updated_at = now() "
        "WHERE provider_message_id = $1"
    )

    import json as _json

    async with pool.acquire() as conn:
        await conn.execute(
            insert_bounce,
            uuid7(),
            to_email,
            bounce_type,
            _json.dumps(data, default=str),
        )
        if provider_message_id:
            await conn.execute(update_message, provider_message_id, f"bounce:{bounce_type}")

    if bounce_type == "hard" and to_email:
        # Category is unknown from the bounce payload; record a global
        # opt-out by seeding with a sentinel category. The
        # is_unsubscribed check treats an empty-array row as global.
        await record_unsubscribe(
            email=to_email,
            category="system_alert",
            reason="hard_bounce_auto_unsubscribe",
            source="auto_bounce",
        )

    logger.info(
        "email.bounce.recorded to_email=%s bounce_type=%s",
        to_email,
        bounce_type,
    )


async def _handle_complaint(provider_message_id: str | None, data: dict[str, Any]) -> None:
    to_email = _extract_to_email(data)
    pool = get_pool()
    update_message = (
        "UPDATE email_message "
        "SET status = 'complained', updated_at = now() "
        "WHERE provider_message_id = $1"
    )
    async with pool.acquire() as conn:
        if provider_message_id:
            await conn.execute(update_message, provider_message_id)

    if to_email:
        await record_unsubscribe(
            email=to_email,
            category="system_alert",
            reason="spam_complaint",
            source="complaint",
        )

    logger.info(
        "email.complaint.recorded to_email=%s",
        to_email,
    )


def _extract_to_email(data: dict[str, Any]) -> str | None:
    to_field = data.get("to")
    if isinstance(to_field, list) and to_field:
        return str(to_field[0]).strip().lower()
    if isinstance(to_field, str) and to_field:
        return to_field.strip().lower()
    return None


def _parse_iso_timestamp(value: Any) -> datetime:
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed
        except ValueError:
            pass
    return datetime.now(timezone.utc)


__all__ = ["process_event"]
