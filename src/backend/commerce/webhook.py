"""Marketplace-specific Stripe webhook hooks (Iapetus W2 NP P4 S1).

Integration path
----------------
Plutus owns the signature-verified dispatcher in
:mod:`src.backend.billing.webhook`. Extending the dispatcher directly
would interleave subscription + commerce handlers; we prefer a
hook-registry pattern where commerce modules subscribe per event type
and the core dispatcher iterates them after the subscription branch.

This file exposes :func:`handle_payment_intent_succeeded`,
:func:`handle_payment_intent_failed`, :func:`handle_charge_refunded`,
and :func:`handle_account_updated` as the callables Plutus' extend
point wires up. Plutus' dispatcher imports + invokes them from
``src.backend.billing.webhook`` during the event type branch.

The alternative - Iapetus standing up ``/v1/commerce/webhook/stripe``
- was considered + rejected:

- Stripe can only send one URL per event type; we would have to
  split event type subscriptions in the Stripe dashboard (config
  drift risk).
- The signature secret would be duplicated (operational risk).
- The idempotency table (``subscription_event``) already handles
  every event id; splitting endpoints re-opens the replay gap.

So the decision: extend Plutus' dispatcher from within. We add the
commerce branch at the end of the existing event type switch. See
the patch in :mod:`src.backend.billing.webhook` for the hook call.

All hooks follow the same contract:

- Accept the ``stripe.Event`` plus the webhook's asyncpg connection
  so the dispatch runs inside the same transaction as the
  ``subscription_event`` idempotency insert. If the ledger post
  fails we rollback the whole event and Stripe retries.
- Return a list of note strings which the dispatcher appends to its
  own notes list for the ACK response.
- Raise ``ProblemException`` on unexpected errors; the dispatcher
  propagates to the router which translates to 500 + Stripe retry.
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

import stripe

from src.backend.commerce.connect import sync_account_from_stripe
from src.backend.commerce.purchase import (
    mark_purchase_completed,
    mark_purchase_failed,
    mark_purchase_refunded,
)

logger = logging.getLogger(__name__)


# Event types this module claims. Plutus' dispatcher consults this
# frozenset when deciding whether to call the hooks.
COMMERCE_EVENT_TYPES: frozenset[str] = frozenset(
    {
        "payment_intent.succeeded",
        "payment_intent.payment_failed",
        "charge.refunded",
        "account.updated",
    }
)


async def handle_payment_intent_succeeded(
    conn: Any,
    event: stripe.Event,
) -> list[str]:
    """Flip purchase to completed + post fee + payable ledger legs.

    Stripe sends this on a successful PaymentIntent charge. We look
    up the purchase via ``payment_intent_id``; if the PI is not one
    of ours (e.g., unrelated to marketplace) we log + no-op.
    """

    pi = event["data"]["object"]
    pi_id = _attr(pi, "id")
    charge_id = _first_charge_id(pi)

    if not pi_id:
        return ["commerce_no_pi_id"]

    purchase = await mark_purchase_completed(
        payment_intent_id=pi_id,
        stripe_charge_id=charge_id,
        stripe_event_id=event["id"],
        conn=conn,
    )
    if purchase is None:
        return ["commerce_pi_not_ours"]
    return [f"commerce_purchase_completed:{purchase.id}"]


async def handle_payment_intent_failed(
    conn: Any,
    event: stripe.Event,
) -> list[str]:
    """Transition our purchase row to failed for UI surfacing."""

    pi = event["data"]["object"]
    pi_id = _attr(pi, "id")
    if not pi_id:
        return ["commerce_no_pi_id"]

    purchase = await mark_purchase_failed(
        payment_intent_id=pi_id,
        conn=conn,
    )
    if purchase is None:
        return ["commerce_pi_not_ours"]
    return [f"commerce_purchase_failed:{purchase.id}"]


async def handle_charge_refunded(
    conn: Any,
    event: stripe.Event,
) -> list[str]:
    """Reverse ledger legs proportionally for refunded amount.

    Stripe refund events include both the ``charge`` object (with
    ``amount_refunded`` cumulative) and the ``payment_intent`` id
    inside the charge object. We prefer the PI id for lookup but
    fall back to the charge id.
    """

    charge = event["data"]["object"]
    amount_refunded = int(_attr(charge, "amount_refunded") or 0)
    currency = str(_attr(charge, "currency") or "usd").upper()
    charge_id = _attr(charge, "id")
    pi_id = _attr(charge, "payment_intent")

    if amount_refunded <= 0:
        return ["commerce_refund_zero"]

    purchase = await mark_purchase_refunded(
        payment_intent_id=pi_id,
        stripe_charge_id=charge_id,
        amount_refunded_cents=amount_refunded,
        currency=currency,
        stripe_event_id=event["id"],
        conn=conn,
    )
    if purchase is None:
        return ["commerce_refund_not_ours"]
    return [f"commerce_purchase_refunded:{purchase.id}"]


async def handle_account_updated(
    conn: Any,
    event: stripe.Event,
) -> list[str]:
    """Sync ``creator_connect_account`` on Stripe Account state change.

    We receive ``account.updated`` when onboarding progresses past a
    step, when requirements get resolved, or when Stripe flips
    charges_enabled / payouts_enabled.
    """

    account = event["data"]["object"]
    account_id = _attr(account, "id")
    if not account_id:
        return ["commerce_account_no_id"]

    try:
        row = await sync_account_from_stripe(
            stripe_account_id=account_id,
            tenant_id=None,
        )
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning(
            "commerce.webhook.account_sync_failed acct=%s err=%s",
            account_id,
            exc,
        )
        return ["commerce_account_sync_failed"]

    if row is None:
        return ["commerce_account_unknown"]
    return [
        f"commerce_account_synced:{row.id}:charges={row.charges_enabled}:payouts={row.payouts_enabled}"
    ]


# ---------------------------------------------------------------------------
# Dispatcher entry
# ---------------------------------------------------------------------------


async def handle_commerce_event(
    conn: Any,
    event: stripe.Event,
) -> list[str]:
    """Single entry point Plutus' dispatcher calls.

    Returns a list of note strings the dispatcher appends to its ack
    payload. Unknown event types (not in :data:`COMMERCE_EVENT_TYPES`)
    return an empty list so Plutus skips silently.
    """

    event_type: str = event["type"]
    if event_type == "payment_intent.succeeded":
        return await handle_payment_intent_succeeded(conn, event)
    if event_type == "payment_intent.payment_failed":
        return await handle_payment_intent_failed(conn, event)
    if event_type == "charge.refunded":
        return await handle_charge_refunded(conn, event)
    if event_type == "account.updated":
        return await handle_account_updated(conn, event)
    return []


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------


def _attr(obj: Any, key: str) -> Any:
    if isinstance(obj, dict):
        return obj.get(key)
    return getattr(obj, key, None)


def _first_charge_id(payment_intent: Any) -> str | None:
    """Return the primary charge id from a PaymentIntent payload.

    PaymentIntent objects list successful charges in ``charges.data``
    (legacy SDKs) or ``latest_charge`` (newer SDKs). We check both.
    """

    latest = _attr(payment_intent, "latest_charge")
    if isinstance(latest, str) and latest:
        return latest
    charges = _attr(payment_intent, "charges")
    if charges is None:
        return None
    data = _attr(charges, "data")
    if not data:
        return None
    first = data[0]
    return _attr(first, "id")


__all__ = [
    "COMMERCE_EVENT_TYPES",
    "handle_account_updated",
    "handle_charge_refunded",
    "handle_commerce_event",
    "handle_payment_intent_failed",
    "handle_payment_intent_succeeded",
]
