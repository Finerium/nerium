"""Stripe webhook signature verify + idempotent dispatch.

Owner: Plutus (W2 NP P4 S1).

Entry point: :func:`process_stripe_webhook`. The router handler
(``src.backend.routers.v1.billing.webhook``) reads the raw body +
``Stripe-Signature`` header and hands them here.

Flow
----
1. Verify signature via :func:`stripe.Webhook.construct_event`. Tampered
   payloads raise ``SignatureVerificationError`` which we translate to
   :class:`UnauthorizedProblem` 401.
2. Insert an idempotency row into ``subscription_event`` keyed on the
   Stripe event id. ``ON CONFLICT (stripe_event_id) DO NOTHING`` returns
   zero rows on replay which short-circuits to a no-op 200.
3. Dispatch on the event type. Handled types:
   - ``checkout.session.completed``  leads to subscription upsert
   - ``customer.subscription.created|updated``  leads to state sync
   - ``customer.subscription.deleted``  leads to soft delete
   - ``invoice.paid``  leads to ledger post (DEBIT cash + CREDIT revenue)
   - ``charge.refunded``  leads to reversing ledger entry
   - any other event  leads to log + 200 (Stripe keeps sending us broad
     event streams; we skip silently to keep the endpoint cheap).
4. Mark the ``subscription_event`` row ``processed_at = now()``.

Response contract
-----------------
HTTP 200 within 5s for every well-signed event so Stripe does not
retry. Unsigned or tampered payloads yield 401. Internal exceptions
bubble to 500 via the problem+json handler; Stripe will retry and the
idempotency key collapses the replay on the second try.
"""

from __future__ import annotations

import json
import logging
from typing import Any
from uuid import UUID

import stripe

from src.backend.billing import ledger
from src.backend.billing import subscription as subscription_ops
from src.backend.billing.plans import ALL_TIERS, Tier
from src.backend.billing.stripe_client import (
    ensure_live_mode_disabled,
    get_stripe_client,  # noqa: F401 (ensures the client is imported even if unused here)
)
from src.backend.config import get_settings
from src.backend.db.pool import get_pool
from src.backend.errors import (
    ProblemException,
    UnauthorizedProblem,
    ValidationProblem,
)
from src.backend.utils.uuid7 import uuid7

logger = logging.getLogger(__name__)


# Set of events the handler understands. Anything outside this set logs
# at INFO and returns success so Stripe does not retry.
#
# Iapetus W2 NP P4 S1 extends with marketplace event types via the
# commerce webhook hook (``src.backend.commerce.webhook``). The hook
# module is imported lazily inside the dispatcher so a commerce-stack
# outage does not break subscription webhook processing.
HANDLED_EVENT_TYPES: frozenset[str] = frozenset(
    {
        "checkout.session.completed",
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
        "invoice.paid",
        "invoice.payment_failed",
        "charge.refunded",
        # Marketplace commerce (Iapetus W2 NP P4 S1).
        "payment_intent.succeeded",
        "payment_intent.payment_failed",
        "account.updated",
    }
)


class WebhookProcessResult:
    """Structured return surfacing dispatch outcome for tests + metrics."""

    __slots__ = ("event_id", "event_type", "was_replay", "was_handled", "notes")

    def __init__(
        self,
        *,
        event_id: str,
        event_type: str,
        was_replay: bool,
        was_handled: bool,
        notes: list[str] | None = None,
    ) -> None:
        self.event_id = event_id
        self.event_type = event_type
        self.was_replay = was_replay
        self.was_handled = was_handled
        self.notes = notes or []

    def to_dict(self) -> dict[str, Any]:
        return {
            "event_id": self.event_id,
            "event_type": self.event_type,
            "was_replay": self.was_replay,
            "was_handled": self.was_handled,
            "notes": list(self.notes),
        }


def _verify_signature(
    payload_bytes: bytes,
    sig_header: str,
    webhook_secret: str,
) -> stripe.Event:
    """Delegate to the Stripe SDK signature verifier.

    Raises
    ------
    UnauthorizedProblem
        On signature mismatch or stale timestamp.
    """

    try:
        return stripe.Webhook.construct_event(
            payload_bytes,
            sig_header,
            webhook_secret,
        )
    except stripe.SignatureVerificationError as exc:
        logger.warning("billing.webhook.signature_invalid err=%s", exc)
        raise UnauthorizedProblem(
            detail="Stripe webhook signature verification failed.",
        ) from exc
    except ValueError as exc:
        # Malformed JSON body (Stripe SDK raises ValueError).
        logger.warning("billing.webhook.body_invalid err=%s", exc)
        raise ValidationProblem(
            detail="Stripe webhook body could not be parsed as JSON.",
        ) from exc


async def _record_event_or_skip(
    *,
    conn: Any,
    event: stripe.Event,
) -> bool:
    """INSERT the idempotency row. Returns True on fresh insert, False on replay."""

    row = await conn.fetchrow(
        """
        INSERT INTO subscription_event (
            id, event_type, stripe_event_id, payload
        )
        VALUES ($1, $2, $3, $4::jsonb)
        ON CONFLICT (stripe_event_id) DO NOTHING
        RETURNING id
        """,
        uuid7(),
        event["type"],
        event["id"],
        json.dumps(_event_to_dict(event)),
    )
    if row is None:
        logger.info(
            "billing.webhook.replay stripe_event_id=%s type=%s",
            event["id"],
            event["type"],
        )
        return False
    return True


async def _mark_processed(
    *,
    conn: Any,
    stripe_event_id: str,
    error: str | None = None,
) -> None:
    await conn.execute(
        """
        UPDATE subscription_event
        SET processed_at = now(),
            processing_error = $2
        WHERE stripe_event_id = $1
        """,
        stripe_event_id,
        error,
    )


async def process_stripe_webhook(
    *,
    payload_bytes: bytes,
    sig_header: str,
) -> WebhookProcessResult:
    """Verify + idempotently dispatch a Stripe webhook POST.

    Returns the dispatch outcome so the router can log + return 200.
    Raises :class:`ProblemException` subclasses on signature or body
    failure; the global problem handler converts to 401/422.
    """

    # Live-mode gate first so an accidental live webhook hitting our
    # test endpoint never even reaches the signature step.
    await ensure_live_mode_disabled()

    settings = get_settings()
    secret = settings.stripe_webhook_secret.get_secret_value()
    if not secret:
        # Without a secret we cannot verify; fail closed.
        logger.error("billing.webhook.secret_missing")
        raise UnauthorizedProblem(
            detail=(
                "Webhook secret unset (NERIUM_STRIPE_WEBHOOK_SECRET). "
                "Configure before exposing the endpoint."
            )
        )

    event = _verify_signature(payload_bytes, sig_header, secret)
    event_type: str = event["type"]
    event_id: str = event["id"]
    notes: list[str] = []

    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            fresh = await _record_event_or_skip(conn=conn, event=event)
            if not fresh:
                return WebhookProcessResult(
                    event_id=event_id,
                    event_type=event_type,
                    was_replay=True,
                    was_handled=event_type in HANDLED_EVENT_TYPES,
                    notes=["replay"],
                )

            was_handled = event_type in HANDLED_EVENT_TYPES
            processing_error: str | None = None

            try:
                if event_type == "checkout.session.completed":
                    notes.extend(await _handle_checkout_completed(conn, event))
                elif event_type in (
                    "customer.subscription.created",
                    "customer.subscription.updated",
                ):
                    notes.extend(
                        await _handle_subscription_upsert(conn, event)
                    )
                elif event_type == "customer.subscription.deleted":
                    notes.extend(
                        await _handle_subscription_deleted(conn, event)
                    )
                elif event_type == "invoice.paid":
                    notes.extend(await _handle_invoice_paid(conn, event))
                elif event_type == "invoice.payment_failed":
                    notes.append("payment_failed_logged")
                    logger.warning(
                        "billing.webhook.payment_failed stripe_event_id=%s",
                        event_id,
                    )
                elif event_type == "charge.refunded":
                    # Subscription-path refund: reverses the subscription
                    # revenue entry. The marketplace hook also runs so a
                    # refund on a marketplace purchase reverses the fee +
                    # creator payable legs. Both are idempotent via
                    # distinct ledger keys.
                    notes.extend(await _handle_charge_refunded(conn, event))
                    notes.extend(
                        await _run_commerce_hook(conn, event)
                    )
                elif event_type in (
                    "payment_intent.succeeded",
                    "payment_intent.payment_failed",
                    "account.updated",
                ):
                    # Marketplace commerce events (Iapetus W2 NP P4 S1).
                    notes.extend(
                        await _run_commerce_hook(conn, event)
                    )
                else:
                    notes.append("unhandled_type")
                    logger.info(
                        "billing.webhook.unhandled stripe_event_id=%s type=%s",
                        event_id,
                        event_type,
                    )
            except ProblemException:
                raise
            except Exception as exc:  # pragma: no cover - defensive
                processing_error = f"{type(exc).__name__}: {exc}"
                logger.exception(
                    "billing.webhook.handler_failed stripe_event_id=%s type=%s",
                    event_id,
                    event_type,
                )
                raise

            await _mark_processed(
                conn=conn,
                stripe_event_id=event_id,
                error=processing_error,
            )

    return WebhookProcessResult(
        event_id=event_id,
        event_type=event_type,
        was_replay=False,
        was_handled=was_handled,
        notes=notes,
    )


# ---------------------------------------------------------------------------
# Per-event handlers
# ---------------------------------------------------------------------------


async def _handle_checkout_completed(
    conn: Any,
    event: stripe.Event,
) -> list[str]:
    """On ``checkout.session.completed``, upsert the subscription row."""

    session = event["data"]["object"]
    metadata: dict[str, Any] = session.get("metadata", {}) or {}
    user_id_raw = metadata.get("nerium_user_id")
    tenant_id_raw = metadata.get("nerium_tenant_id")
    tier_raw = metadata.get("nerium_tier")
    subscription_id = session.get("subscription")

    notes: list[str] = []
    if not (user_id_raw and tenant_id_raw and tier_raw):
        notes.append("metadata_missing")
        logger.warning(
            "billing.webhook.checkout_metadata_missing session_id=%s",
            session.get("id"),
        )
        return notes

    if subscription_id is None:
        # Mode-subscription Checkout always populates this; defensive
        # log + skip if Stripe ever shifts the payload.
        notes.append("subscription_missing")
        return notes

    tier = _coerce_tier(tier_raw)
    if tier is None:
        notes.append("tier_unknown")
        return notes

    # The subscription object from Checkout may be just an id string;
    # we need the full object to grab period + status. The StripeClient
    # retrieval is synchronous per SDK so we allow the sync call inside
    # the async handler (I/O bound, short).
    client = get_stripe_client()
    full = client.subscriptions.retrieve(subscription_id)

    await subscription_ops.upsert_from_stripe_subscription(
        stripe_subscription=_event_object_to_dict(full),
        user_id=UUID(user_id_raw),
        tenant_id=UUID(tenant_id_raw),
        tier=tier,
        conn=conn,
    )
    notes.append("subscription_upserted")
    return notes


async def _handle_subscription_upsert(
    conn: Any,
    event: stripe.Event,
) -> list[str]:
    """Sync ``subscription`` row on created/updated events.

    Metadata on the Stripe subscription carries nerium_{user,tenant,tier}
    (seeded at Checkout time). If the event lacks metadata we try to
    look up by ``stripe_subscription_id`` against our mirror; on miss we
    skip with a log line (the checkout.session.completed path will
    create it).
    """

    sub = event["data"]["object"]
    metadata: dict[str, Any] = sub.get("metadata", {}) or {}
    user_id_raw = metadata.get("nerium_user_id")
    tenant_id_raw = metadata.get("nerium_tenant_id")
    tier_raw = metadata.get("nerium_tier")
    notes: list[str] = []

    if not (user_id_raw and tenant_id_raw and tier_raw):
        existing = await subscription_ops.get_subscription_by_stripe_id(
            stripe_subscription_id=sub["id"],
            conn=conn,
        )
        if existing is None:
            notes.append("metadata_missing_no_mirror")
            return notes
        user_id_raw = str(existing.user_id)
        tenant_id_raw = str(existing.tenant_id)
        tier_raw = existing.tier

    tier = _coerce_tier(tier_raw)
    if tier is None:
        notes.append("tier_unknown")
        return notes

    await subscription_ops.upsert_from_stripe_subscription(
        stripe_subscription=_event_object_to_dict(sub),
        user_id=UUID(user_id_raw),
        tenant_id=UUID(tenant_id_raw),
        tier=tier,
        conn=conn,
    )
    notes.append("subscription_synced")
    return notes


async def _handle_subscription_deleted(
    conn: Any,
    event: stripe.Event,
) -> list[str]:
    sub = event["data"]["object"]
    result = await subscription_ops.mark_subscription_canceled(
        stripe_subscription_id=sub["id"],
        conn=conn,
    )
    if result is None:
        return ["unknown_subscription"]
    return ["subscription_canceled"]


async def _handle_invoice_paid(conn: Any, event: stripe.Event) -> list[str]:
    """Post the DEBIT cash + CREDIT subscription revenue pair."""

    invoice = event["data"]["object"]
    amount_paid = int(invoice.get("amount_paid", 0))
    currency = (invoice.get("currency") or "usd").upper()
    if amount_paid <= 0:
        return ["zero_amount"]

    # Resolve tenant scope via subscription lookup if available.
    tenant_id: UUID | None = None
    sub_id = invoice.get("subscription")
    if sub_id:
        existing = await subscription_ops.get_subscription_by_stripe_id(
            stripe_subscription_id=sub_id,
            conn=conn,
        )
        if existing is not None:
            tenant_id = existing.tenant_id

    result = await ledger.post_subscription_payment(
        stripe_event_id=event["id"],
        amount_minor_units=amount_paid,
        currency=currency,
        description=(
            f"Invoice {invoice.get('id', '?')} paid via Stripe"
        ),
        metadata={
            "stripe_invoice_id": invoice.get("id"),
            "stripe_subscription_id": sub_id,
            "stripe_customer_id": invoice.get("customer"),
        },
        tenant_id=tenant_id,
        conn=conn,
    )
    return ["invoice_paid_posted" if result.was_inserted else "invoice_paid_replay"]


async def _handle_charge_refunded(
    conn: Any,
    event: stripe.Event,
) -> list[str]:
    """Post the reversing ledger entry on ``charge.refunded``."""

    charge = event["data"]["object"]
    amount_refunded = int(charge.get("amount_refunded", 0))
    currency = (charge.get("currency") or "usd").upper()
    if amount_refunded <= 0:
        return ["zero_refund"]

    result = await ledger.post_subscription_refund(
        stripe_event_id=event["id"],
        amount_minor_units=amount_refunded,
        currency=currency,
        description=(
            f"Refund on charge {charge.get('id', '?')} via Stripe"
        ),
        metadata={
            "stripe_charge_id": charge.get("id"),
            "stripe_customer_id": charge.get("customer"),
        },
        conn=conn,
    )
    return ["refund_posted" if result.was_inserted else "refund_replay"]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _coerce_tier(value: Any) -> Tier | None:
    """Return ``value`` typed as :data:`Tier` or None on unknown."""

    if isinstance(value, str) and value in ALL_TIERS:
        return value  # type: ignore[return-value]
    return None


def _event_to_dict(event: stripe.Event) -> dict[str, Any]:
    """Serialise a Stripe Event to a plain dict for the payload column.

    ``stripe.Event`` is a ``StripeObject`` which dict()-converts cleanly
    but nests more StripeObject values; ``.to_dict_recursive()`` (SDK
    v7+) flattens them. We fall back to ``dict(event)`` on older SDKs.
    """

    to_dict = getattr(event, "to_dict_recursive", None)
    if callable(to_dict):
        return to_dict()
    return dict(event)


async def _run_commerce_hook(
    conn: Any,
    event: stripe.Event,
) -> list[str]:
    """Delegate marketplace events to Iapetus' commerce hook.

    Lazy import so a commerce-stack outage (import error) does not
    break subscription webhook processing. Any hook exception bubbles
    up so Stripe retries the event.
    """

    try:
        from src.backend.commerce.webhook import handle_commerce_event
    except ImportError:  # pragma: no cover - defensive
        logger.info(
            "billing.webhook.commerce_hook_missing type=%s", event["type"]
        )
        return ["commerce_hook_missing"]

    return await handle_commerce_event(conn, event)


def _event_object_to_dict(obj: Any) -> dict[str, Any]:
    """Same shape coercion for arbitrary StripeObject values (subscription, ...)."""

    to_dict = getattr(obj, "to_dict_recursive", None)
    if callable(to_dict):
        return to_dict()
    if isinstance(obj, dict):
        return dict(obj)
    return {}


__all__ = [
    "HANDLED_EVENT_TYPES",
    "WebhookProcessResult",
    "process_stripe_webhook",
]
