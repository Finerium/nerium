"""Send dispatcher: enqueue a template send + persist ``email_message``.

Per ``docs/contracts/email_transactional.contract.md`` Section 4.1.

Flow
----
1. Validate template + look up metadata.
2. Check the unsubscribe opt-out unless the template is ``critical``.
3. Check the warmup cap unless the template is ``critical``.
4. Insert ``email_message`` with ``status='queued'``.
5. Enqueue an Arq job against
   ``src.backend.workers.email_sender.send_email`` by ``message_id``.
6. Return the ``message_id`` for downstream correlation.

The actual Resend HTTP call lives in the Arq worker so HTTP request
latency never bleeds into the FastAPI request path.

Render happens in the worker too, NOT here, because rendering touches
the filesystem (rendered shell) which would add sync IO to the request
hot path. The only work done here is a small DB insert + an
``arq.enqueue_job`` call.
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from src.backend.config import Settings, get_settings
from src.backend.db.pool import get_pool
from src.backend.email.templates import category_of, get_template_meta
from src.backend.email.unsubscribe import is_unsubscribed
from src.backend.email.warmup import WarmupDecision, within_warmup_cap
from src.backend.utils.uuid7 import uuid7

logger = logging.getLogger(__name__)

# Optional Arq enqueue: if the worker subsystem has not yet booted we
# still persist the email_message row with status='queued'. A background
# sweeper (implemented by the email_sender worker at boot) re-enqueues
# any rows that have been queued for more than N seconds so nothing is
# lost on race between request-time enqueue and worker startup.
try:
    from arq.connections import ArqRedis as _ArqRedis  # type: ignore[import]
except ImportError:  # pragma: no cover - optional during tests
    _ArqRedis = None  # type: ignore[assignment]


ARQ_JOB_SEND_EMAIL = "send_email"


class EmailSendError(RuntimeError):
    """Base class for Pheme send-path errors."""


class UnknownTemplateError(EmailSendError):
    """Raised when the caller supplies a template_name not in the registry."""


class UnsubscribedError(EmailSendError):
    """Raised when the recipient has opted out of the category."""


class WarmupCapExceededError(EmailSendError):
    """Raised when today's warmup cap is reached and the template is non-critical."""

    def __init__(self, decision: WarmupDecision) -> None:
        super().__init__(
            f"warmup_cap_exceeded day_sent={decision.day_sent} cap={decision.cap}"
        )
        self.decision = decision


async def send(
    template_name: str,
    to_email: str,
    props: dict[str, Any],
    *,
    user_id: UUID | None = None,
    tenant_id: UUID | None = None,
    idempotency_key: str | None = None,
    tag: str | None = None,
    subject_override: str | None = None,
    from_email: str | None = None,
    reply_to: str | None = None,
    settings: Settings | None = None,
    arq_redis: Any | None = None,
) -> UUID:
    """Queue a transactional email send.

    Returns
    -------
    uuid.UUID
        The ``email_message.id`` primary key. Callers that need to
        correlate downstream (invoice PDFs, dispute timelines) persist
        this id alongside their entity.

    Raises
    ------
    UnknownTemplateError
        ``template_name`` is not in the registry.
    UnsubscribedError
        The recipient has opted out; translate to HTTP 403 upstream.
    WarmupCapExceededError
        Non-critical template exceeded today's cap; translate to HTTP
        429 with ``Retry-After`` header upstream.
    """

    try:
        meta = get_template_meta(template_name)
    except KeyError as exc:
        raise UnknownTemplateError(str(exc)) from exc

    resolved = settings or get_settings()
    normalised_to = to_email.strip().lower()

    # Opt-out check runs even for critical templates because CAN-SPAM +
    # GDPR respect global opt-outs for explicitly non-essential mail.
    # The ``critical`` flag flips only for security + billing-critical
    # paths; those still run through the check and raise, and the caller
    # chain at the security layer decides whether to surface as an
    # error or log + drop.
    if await is_unsubscribed(normalised_to, meta.category):
        logger.info(
            "email.send.rejected.unsubscribed template=%s to=%s category=%s",
            template_name,
            normalised_to,
            meta.category,
        )
        raise UnsubscribedError(normalised_to)

    decision = await within_warmup_cap(critical=meta.critical, settings=resolved)
    if not decision.allowed:
        raise WarmupCapExceededError(decision)

    subject = subject_override or meta.subject
    effective_from = from_email or resolved.resend_from_email
    effective_reply_to = reply_to or resolved.resend_reply_to_email

    message_id = await _insert_email_message(
        template_name=meta.name,
        template_version=meta.version,
        to_email=normalised_to,
        from_email=effective_from,
        reply_to=effective_reply_to,
        subject=subject,
        props=props,
        user_id=user_id,
        tenant_id=tenant_id,
        idempotency_key=idempotency_key,
        tag=tag,
    )

    logger.info(
        "email.send.queued message_id=%s template=%s to=%s critical=%s reason=%s",
        message_id,
        meta.name,
        normalised_to,
        meta.critical,
        decision.reason,
    )

    await _enqueue_send(
        arq_redis=arq_redis,
        message_id=message_id,
        idempotency_key=idempotency_key,
    )

    return message_id


async def _insert_email_message(
    *,
    template_name: str,
    template_version: str,
    to_email: str,
    from_email: str,
    reply_to: str | None,
    subject: str,
    props: dict[str, Any],
    user_id: UUID | None,
    tenant_id: UUID | None,
    idempotency_key: str | None,
    tag: str | None,
) -> UUID:
    """Persist a ``email_message`` row and return its id.

    The insert runs on the global pool (not tenant-scoped) because the
    ``email_message`` table RLS policy consults
    ``current_setting('app.tenant_id')`` from the session. Callers
    inside the request scope SHOULD use :func:`tenant_scoped` before
    invoking :func:`send`. When ``tenant_id`` is None we mark the row
    as system mail with tenant_id NULL (the RLS policy permits this
    for the admin + bootstrap role; application-role writes with NULL
    tenant_id are rejected by the policy unless the caller is inside
    ``tenant_scoped`` with a matching tenant).

    Idempotency: if ``(to_email, idempotency_key)`` already exists we
    return the existing id rather than inserting a duplicate. This
    makes webhook-driven sends (Stripe invoice.paid -> invoice_receipt)
    safe to retry.
    """

    pool = get_pool()
    import json as _json

    row_id = uuid7()
    tag_tuple = _tag_array(tag)

    # Try idempotent upsert first when a key is provided.
    if idempotency_key:
        existing_query = (
            "SELECT id FROM email_message "
            "WHERE to_email = $1 AND idempotency_key = $2 "
            "LIMIT 1"
        )
        async with pool.acquire() as conn:
            existing = await conn.fetchval(existing_query, to_email, idempotency_key)
        if existing is not None:
            return existing if isinstance(existing, UUID) else UUID(str(existing))

    insert = (
        "INSERT INTO email_message ("
        "  id, tenant_id, user_id, template_name, template_version, "
        "  to_email, from_email, reply_to, subject, props, status, "
        "  idempotency_key, tags"
        ") VALUES ("
        "  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, 'queued', $11, $12"
        ") RETURNING id"
    )
    async with pool.acquire() as conn:
        new_id = await conn.fetchval(
            insert,
            row_id,
            tenant_id,
            user_id,
            template_name,
            template_version,
            to_email,
            from_email,
            reply_to,
            subject,
            _json.dumps(props, default=str),
            idempotency_key,
            list(tag_tuple),
        )
    return new_id if isinstance(new_id, UUID) else UUID(str(new_id))


def _tag_array(tag: str | None) -> tuple[str, ...]:
    """Coerce the optional ``tag`` input into the text[] column payload."""

    if not tag:
        return ()
    return (tag,)


async def _enqueue_send(
    *,
    arq_redis: Any | None,
    message_id: UUID,
    idempotency_key: str | None,
) -> None:
    """Enqueue the worker job.

    Gracefully no-ops when the caller has not injected an Arq redis
    handle AND the process-wide accessor is unavailable (the worker
    module lazy-imports the redis handle from the Aether lifespan).
    The email_message row remains ``status='queued'`` and the sweeper
    path in ``workers/email_sender.py`` picks it up at boot.
    """

    handle = arq_redis
    if handle is None:
        try:
            from src.backend.workers.arq_redis import get_arq_redis  # type: ignore[import]
        except ImportError:
            logger.debug(
                "email.send.enqueue.arq_not_wired message_id=%s",
                message_id,
            )
            return
        try:
            handle = get_arq_redis()
        except RuntimeError:
            logger.debug(
                "email.send.enqueue.arq_not_ready message_id=%s",
                message_id,
            )
            return

    job_id = None
    if idempotency_key:
        # Pass the idempotency key to Arq so retries at the HTTP layer
        # cannot double-enqueue the same logical send.
        job_id = f"send_email:{idempotency_key}"

    kwargs: dict[str, Any] = {"_job_id": job_id} if job_id else {}
    try:
        await handle.enqueue_job(ARQ_JOB_SEND_EMAIL, str(message_id), **kwargs)
    except Exception:  # noqa: BLE001 - Arq raises a variety of errors
        logger.exception(
            "email.send.enqueue.failed message_id=%s",
            message_id,
        )
        raise


__all__ = [
    "ARQ_JOB_SEND_EMAIL",
    "EmailSendError",
    "UnknownTemplateError",
    "UnsubscribedError",
    "WarmupCapExceededError",
    "send",
]
