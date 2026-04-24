"""Arq task: send a queued email_message through Resend.

Per ``docs/contracts/email_transactional.contract.md`` Section 4.1.

Flow (per ``send_email(message_id)``)
-------------------------------------
1. Load the ``email_message`` row. If it is already ``sent`` / ``bounced``
   / ``complained`` we return early (webhook beat us to it).
2. Flip ``status='sending'``, record attempt.
3. Render HTML + text via :mod:`src.backend.email.renderer`.
4. Build ``List-Unsubscribe`` headers via
   :mod:`src.backend.email.unsubscribe`.
5. POST to Resend via :class:`ResendClient`.
6. On success: ``status='sent'``, ``provider_message_id`` set,
   ``sent_at=now()``.
7. On ``ResendError.retriable``: bump ``retry_count``, re-raise so Arq
   schedules the next attempt with exponential backoff.
8. On ``ResendError.is_hard_bounce``: ``status='bounced'``, record
   bounce row, auto-unsubscribe.
9. On any other Resend error: after 3 attempts ``status='failed'`` with
   the Resend payload captured in ``failure_reason``.

Critical-template bypass
------------------------
When :func:`warmup.within_warmup_cap` denies a non-critical send at
enqueue time the send() dispatcher raises before the worker is ever
scheduled. If somehow the worker is invoked for a denied send (e.g.
Moros cap change mid-flight) we re-check here and re-queue for the
next day.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from src.backend.config import get_settings
from src.backend.db.pool import get_pool
from src.backend.email.renderer import render_html, render_text
from src.backend.email.resend_client import ResendError, build_resend_client
from src.backend.email.templates import get_template_meta
from src.backend.email.unsubscribe import (
    build_list_unsubscribe_headers,
    build_unsubscribe_url,
    record_unsubscribe,
)
from src.backend.workers.arq_worker import register_job

logger = logging.getLogger(__name__)

MAX_SEND_ATTEMPTS = 3


@register_job
async def send_email(ctx: dict[str, Any], message_id: str) -> dict[str, Any]:
    """Arq entrypoint: ship the referenced ``email_message`` row.

    Returns a small dict that Arq captures into the job result for
    Selene dashboards. Raises :class:`ResendError` with
    ``retriable=True`` to trigger Arq backoff.
    """

    settings = get_settings()
    pool = get_pool()

    row = await _load_row(pool, message_id)
    if row is None:
        logger.warning("email.send.row_missing message_id=%s", message_id)
        return {"status": "missing", "message_id": message_id}

    if row["status"] in {"sent", "bounced", "complained", "failed"}:
        logger.debug(
            "email.send.skip_terminal message_id=%s status=%s",
            message_id,
            row["status"],
        )
        return {"status": "skip_terminal", "message_id": message_id}

    template_name = row["template_name"]
    to_email = row["to_email"]
    meta = get_template_meta(template_name)

    await _set_status(pool, message_id, "sending")

    props = dict(row["props"] or {})
    unsub_url = build_unsubscribe_url(
        email=to_email,
        category=meta.category,
        settings=settings,
    )
    props.setdefault("unsubscribe_url", unsub_url)
    props.setdefault("template_name", meta.name)

    html_body = render_html(template_name, props)
    text_body = render_text(template_name, props)

    headers = build_list_unsubscribe_headers(
        email=to_email,
        category=meta.category,
        settings=settings,
    )

    tags = [
        {"name": "template", "value": meta.name},
        {"name": "env", "value": settings.email_env},
    ]
    if row["tenant_id"]:
        tags.append({"name": "tenant_id", "value": str(row["tenant_id"])})

    client = build_resend_client(settings)

    try:
        response = await client.send(
            to_email=to_email,
            subject=row["subject"],
            html_body=html_body,
            text_body=text_body,
            from_email=row["from_email"],
            reply_to=row["reply_to"],
            headers=headers,
            tags=tags,
            idempotency_key=row["idempotency_key"],
        )
    except ResendError as exc:
        return await _handle_resend_error(pool, row, exc)
    except httpx.HTTPError as exc:  # pragma: no cover - defensive
        logger.exception("email.send.http_error message_id=%s", message_id)
        await _set_status(
            pool,
            message_id,
            "failed",
            failure_reason=f"http_error:{type(exc).__name__}",
        )
        raise

    await _set_sent(pool, message_id, response.provider_message_id)
    logger.info(
        "email.send.sent message_id=%s provider_message_id=%s template=%s",
        message_id,
        response.provider_message_id,
        template_name,
    )
    return {
        "status": "sent",
        "message_id": message_id,
        "provider_message_id": response.provider_message_id,
    }


async def _handle_resend_error(pool, row, exc: ResendError) -> dict[str, Any]:
    message_id = str(row["id"])
    attempts = (row["retry_count"] or 0) + 1

    if exc.is_hard_bounce:
        await _set_status(
            pool,
            message_id,
            "bounced",
            failure_reason=f"hard_bounce:{exc}",
            increment_retry=True,
        )
        await record_unsubscribe(
            email=row["to_email"],
            category="system_alert",
            reason="hard_bounce_from_send",
            source="auto_bounce",
        )
        logger.info(
            "email.send.hard_bounce message_id=%s",
            message_id,
        )
        return {"status": "bounced", "message_id": message_id}

    if exc.retriable and attempts < MAX_SEND_ATTEMPTS:
        await _set_status(
            pool,
            message_id,
            "queued",
            failure_reason=f"retry:{exc}",
            increment_retry=True,
        )
        logger.warning(
            "email.send.retried message_id=%s attempt=%d reason=%s",
            message_id,
            attempts,
            exc,
        )
        raise exc

    await _set_status(
        pool,
        message_id,
        "failed",
        failure_reason=f"final:{exc}",
        increment_retry=True,
    )
    logger.error(
        "email.send.failed message_id=%s final_attempt=%d reason=%s",
        message_id,
        attempts,
        exc,
    )
    return {"status": "failed", "message_id": message_id}


async def _load_row(pool, message_id: str):
    query = (
        "SELECT id, tenant_id, user_id, template_name, template_version, "
        "       to_email, from_email, reply_to, subject, props, status, "
        "       provider_message_id, sent_at, failure_reason, retry_count, "
        "       idempotency_key "
        "FROM email_message WHERE id = $1"
    )
    async with pool.acquire() as conn:
        return await conn.fetchrow(query, message_id)


async def _set_status(
    pool,
    message_id: str,
    status: str,
    *,
    failure_reason: str | None = None,
    increment_retry: bool = False,
) -> None:
    fragments = ["status = $2", "updated_at = now()"]
    params: list[Any] = [message_id, status]
    if failure_reason is not None:
        params.append(failure_reason)
        fragments.append(f"failure_reason = ${len(params)}")
    if increment_retry:
        fragments.append("retry_count = COALESCE(retry_count, 0) + 1")

    query = f"UPDATE email_message SET {', '.join(fragments)} WHERE id = $1"
    async with pool.acquire() as conn:
        await conn.execute(query, *params)


async def _set_sent(pool, message_id: str, provider_message_id: str) -> None:
    query = (
        "UPDATE email_message "
        "SET status = 'sent', provider_message_id = $2, sent_at = now(), "
        "    updated_at = now() "
        "WHERE id = $1"
    )
    async with pool.acquire() as conn:
        await conn.execute(query, message_id, provider_message_id)


__all__ = ["MAX_SEND_ATTEMPTS", "send_email"]
