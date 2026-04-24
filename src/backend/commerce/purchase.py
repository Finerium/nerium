"""Marketplace purchase flow (Iapetus W2 NP P4 S1).

Contract refs:
    - docs/contracts/marketplace_commerce.contract.md Section 4.3 POST
      ``/v1/commerce/purchase``, Section 4.4 webhook integration.
    - docs/contracts/payment_stripe.contract.md (shared Stripe client +
      ledger).

Responsibilities
----------------
- :func:`create_purchase_intent`: validate buyer + listing + creator
  state, compute the revenue split, create a Stripe PaymentIntent
  with ``application_fee_amount`` + ``transfer_data.destination``
  pointing to the creator's Connect account, persist the
  ``marketplace_purchase`` row.
- :func:`mark_purchase_completed`: webhook hook called on
  ``payment_intent.succeeded``. Flips the row to ``completed``,
  posts double-entry ledger rows for the platform fee + creator
  payable liability.
- :func:`mark_purchase_refunded`: webhook hook on ``charge.refunded``.
  Reverses both ledger legs for the refunded portion.
- :func:`mark_purchase_failed`: webhook hook on
  ``payment_intent.payment_failed``. Transitions status=failed.
- :func:`buyer_has_completed_purchase`: gate used by the review
  service to enforce purchased-only reviews.

Ledger convention
-----------------
On ``payment_intent.succeeded`` we post TWO transactions (so each
sums to zero independently and the webhook stays composable):

1. Platform fee transaction: ``DEBIT cash / CREDIT
   revenue:marketplace_fee_usd``.
2. Creator payable: ``DEBIT cash / CREDIT
   liability:creator_payable_usd:<creator_id>``.

Each transaction carries a distinct idempotency key derived from the
Stripe event id plus a leg discriminator so the replay collapse on
``billing_ledger_transaction.idempotency_key`` unique works.

The per-creator liability account is seeded lazily the first time a
creator earns revenue.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Optional
from uuid import UUID

import asyncpg

from src.backend.billing.ledger import (
    ACCOUNT_MARKETPLACE_FEE_REVENUE_USD,
    ACCOUNT_STRIPE_BALANCE_USD,
    LedgerLeg,
    LedgerPostResult,
    post_double_entry,
)
from src.backend.billing.stripe_client import get_stripe_client
from src.backend.commerce.connect import (
    ConnectAccountRow,
    require_onboarded_creator,
)
from src.backend.commerce.revenue_split import (
    SplitResult,
    compute_split,
    resolve_take_rate_percent,
)
from src.backend.db.pool import get_pool
from src.backend.db.tenant import tenant_scoped
from src.backend.errors import (
    ForbiddenProblem,
    NotFoundProblem,
    ProblemException,
    ValidationProblem,
)
from src.backend.utils.uuid7 import uuid7

logger = logging.getLogger(__name__)


# Problem-JSON slugs (commerce namespace).
SLUG_SELF_PURCHASE: str = "marketplace_purchase_self_forbidden"
SLUG_LISTING_NOT_PURCHASABLE: str = "marketplace_listing_not_purchasable"
SLUG_NO_ELIGIBLE_PURCHASE: str = "marketplace_review_purchased_only"


class SelfPurchaseForbiddenProblem(ForbiddenProblem):
    """403 raised when a user tries to buy their own listing."""

    slug = SLUG_SELF_PURCHASE
    title = "Cannot purchase own listing"
    status = 403


class ListingNotPurchasableProblem(ForbiddenProblem):
    """403 raised when the listing is draft/archived/suspended."""

    slug = SLUG_LISTING_NOT_PURCHASABLE
    title = "Listing not purchasable"
    status = 403


@dataclass(frozen=True)
class PurchaseRow:
    """Projection of ``marketplace_purchase`` for router + service use."""

    id: UUID
    tenant_id: UUID
    listing_id: UUID
    buyer_user_id: UUID
    creator_user_id: UUID
    connect_account_id: Optional[UUID]
    gross_amount_cents: int
    platform_fee_cents: int
    creator_net_cents: int
    refunded_amount_cents: int
    currency: str
    rail: str
    status: str
    payment_intent_id: Optional[str]
    stripe_checkout_session_id: Optional[str]
    stripe_charge_id: Optional[str]
    idempotency_key: Optional[str]
    client_reference_id: Optional[str]
    metadata: dict[str, Any]
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime]


@dataclass(frozen=True)
class PurchaseIntentResponse:
    """Shape returned to the frontend on successful intent create.

    ``client_secret`` is what the browser Stripe.js client uses to
    confirm the PaymentIntent with the user's card details. The
    purchase row is ``pending`` until the webhook fires.
    """

    purchase: PurchaseRow
    client_secret: Optional[str]
    payment_intent_id: str
    split: SplitResult


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


async def create_purchase_intent(
    *,
    tenant_id: UUID,
    buyer_user_id: UUID,
    listing_id: UUID,
    idempotency_key: Optional[str] = None,
) -> PurchaseIntentResponse:
    """Create a Stripe PaymentIntent + persist the purchase row.

    Pre-conditions
    --------------
    1. Listing exists + status = 'published' + not archived.
    2. Buyer is NOT the listing creator.
    3. Creator has completed Stripe Connect onboarding
       (``charges_enabled=true``).
    4. ``pricing_details.amount_cents`` is set + > 0.

    Idempotency
    -----------
    The optional ``idempotency_key`` is stored in
    ``marketplace_purchase.idempotency_key`` with a UNIQUE(buyer,
    idempotency_key) constraint. Repeat calls with the same key
    short-circuit to the existing row (Stripe call skipped). A
    concurrent double-click without an explicit key is harmless
    because the second Stripe intent attaches to a new row.
    """

    pool = get_pool()
    async with tenant_scoped(pool, tenant_id) as conn:
        # Idempotency short-circuit.
        if idempotency_key:
            existing = await conn.fetchrow(
                """
                SELECT * FROM marketplace_purchase
                WHERE buyer_user_id = $1 AND idempotency_key = $2
                """,
                buyer_user_id,
                idempotency_key,
            )
            if existing is not None:
                row = _row_to_dataclass(existing)
                split = SplitResult(
                    gross_amount_cents=row.gross_amount_cents,
                    platform_fee_cents=row.platform_fee_cents,
                    creator_net_cents=row.creator_net_cents,
                    take_rate_percent=int(
                        round(
                            (row.platform_fee_cents / row.gross_amount_cents) * 100
                        )
                    )
                    if row.gross_amount_cents
                    else 0,
                    minimum_floor_applied=False,
                )
                return PurchaseIntentResponse(
                    purchase=row,
                    client_secret=None,  # original secret was consumed
                    payment_intent_id=row.payment_intent_id or "",
                    split=split,
                )

        # 1. Listing lookup + validation.
        listing = await conn.fetchrow(
            """
            SELECT id, creator_user_id, category, status, archived_at,
                   pricing_details, revenue_split_override, title
            FROM marketplace_listing
            WHERE id = $1
            """,
            listing_id,
        )
        if listing is None:
            raise NotFoundProblem(detail=f"listing {listing_id} not found")
        if listing["archived_at"] is not None:
            raise ListingNotPurchasableProblem(
                detail="listing is archived and no longer purchasable"
            )
        if listing["status"] != "published":
            raise ListingNotPurchasableProblem(
                detail=(
                    f"listing status is {listing['status']!r}; only "
                    f"'published' listings are purchasable"
                )
            )

        creator_user_id: UUID = listing["creator_user_id"]
        if creator_user_id == buyer_user_id:
            raise SelfPurchaseForbiddenProblem(
                detail="A listing's creator cannot purchase their own listing."
            )

        pricing_details = _decode_jsonb(listing["pricing_details"]) or {}
        amount_cents = pricing_details.get("amount_cents")
        if not isinstance(amount_cents, int) or amount_cents <= 0:
            raise ValidationProblem(
                detail=(
                    "listing pricing_details.amount_cents is missing or "
                    "not a positive integer"
                )
            )
        currency = str(
            pricing_details.get("currency") or "USD"
        ).upper()
        if currency not in {"USD"}:
            # Submission scope restricts to USD; IDR/Midtrans path in
            # contract Section 4.3 lands post-hackathon.
            raise ValidationProblem(
                detail=f"currency {currency!r} not supported in submission scope",
            )

        override_raw = listing["revenue_split_override"]
        override = (
            float(override_raw) if override_raw is not None else None
        )

        # 2. Creator onboarding gate (runs its own tenant_scoped; we
        #    release our connection for the span by wrapping in a
        #    separate call). Re-acquires under the same tenant scope.
        pass  # keep conn above; gate uses its own scope via get_pool

    # gate outside the tx so the Stripe Connect lookup doesn't share
    # our write transaction.
    account = await require_onboarded_creator(
        tenant_id=tenant_id, creator_user_id=creator_user_id
    )

    # 3. Compute split.
    take_rate = await resolve_take_rate_percent(
        category=str(listing["category"]),
        user_id=buyer_user_id,
        tenant_id=tenant_id,
        verified_creator=False,  # Astraea drives this post-review
        revenue_split_override=override,
    )
    split = compute_split(
        gross_amount_cents=int(amount_cents),
        take_rate_percent=take_rate,
    )

    # 4. Stripe PaymentIntent create.
    client = get_stripe_client()
    client_reference_id = str(uuid7())
    metadata = {
        "nerium_listing_id": str(listing_id),
        "nerium_buyer_user_id": str(buyer_user_id),
        "nerium_creator_user_id": str(creator_user_id),
        "nerium_tenant_id": str(tenant_id),
        "nerium_take_rate_pct": str(split.take_rate_percent),
        "nerium_client_reference_id": client_reference_id,
    }
    try:
        intent = client.payment_intents.create(
            params={
                "amount": int(split.gross_amount_cents),
                "currency": currency.lower(),
                "application_fee_amount": int(split.platform_fee_cents),
                "transfer_data": {
                    "destination": account.stripe_account_id,
                },
                "metadata": metadata,
                "description": f"NERIUM marketplace: {listing['title']}",
            }
        )
    except Exception as exc:  # pragma: no cover - defensive
        logger.exception(
            "commerce.purchase.intent_create_failed listing_id=%s err=%s",
            listing_id,
            exc,
        )
        raise ValidationProblem(
            detail="Stripe PaymentIntent create failed. Retry in a moment.",
        ) from exc

    payment_intent_id = getattr(intent, "id", None) or intent["id"]
    client_secret = getattr(intent, "client_secret", None) or intent.get(
        "client_secret"
    )

    # 5. Persist purchase row.
    pool = get_pool()
    async with tenant_scoped(pool, tenant_id) as conn:
        new_id = uuid7()
        row = await conn.fetchrow(
            """
            INSERT INTO marketplace_purchase (
                id, tenant_id, listing_id, buyer_user_id, creator_user_id,
                connect_account_id, gross_amount_cents, platform_fee_cents,
                creator_net_cents, currency, rail, status,
                payment_intent_id, idempotency_key, client_reference_id,
                metadata
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                    'stripe', 'pending', $11, $12, $13, $14::jsonb)
            ON CONFLICT (buyer_user_id, idempotency_key) DO NOTHING
            RETURNING *
            """,
            new_id,
            tenant_id,
            listing_id,
            buyer_user_id,
            creator_user_id,
            account.id,
            split.gross_amount_cents,
            split.platform_fee_cents,
            split.creator_net_cents,
            currency,
            payment_intent_id,
            idempotency_key,
            client_reference_id,
            json.dumps({"take_rate_pct": split.take_rate_percent}),
        )
        if row is None:
            # Race on idempotency: re-read the winning row.
            existing = await conn.fetchrow(
                """
                SELECT * FROM marketplace_purchase
                WHERE buyer_user_id = $1 AND idempotency_key = $2
                """,
                buyer_user_id,
                idempotency_key,
            )
            if existing is None:  # pragma: no cover - defensive
                raise ValidationProblem(
                    detail="purchase idempotency race without winning row"
                )
            row = existing

    purchase = _row_to_dataclass(row)
    logger.info(
        "commerce.purchase.created purchase_id=%s pi=%s gross=%s fee=%s net=%s",
        purchase.id,
        payment_intent_id,
        split.gross_amount_cents,
        split.platform_fee_cents,
        split.creator_net_cents,
    )
    return PurchaseIntentResponse(
        purchase=purchase,
        client_secret=client_secret,
        payment_intent_id=payment_intent_id,
        split=split,
    )


# ---------------------------------------------------------------------------
# Webhook state transitions
# ---------------------------------------------------------------------------


async def mark_purchase_completed(
    *,
    payment_intent_id: str,
    stripe_charge_id: Optional[str],
    stripe_event_id: str,
    conn: Optional[asyncpg.Connection] = None,
) -> Optional[PurchaseRow]:
    """Flip purchase to completed + post double-entry ledger legs.

    Called from the webhook dispatcher on ``payment_intent.succeeded``
    (or equivalently ``checkout.session.completed`` for the
    PaymentIntent route).

    Idempotent via the ledger's own ``idempotency_key`` (we derive
    distinct keys for the fee + payable legs). Re-processing the same
    event is a no-op.
    """

    async def _run(c: asyncpg.Connection) -> Optional[PurchaseRow]:
        row = await c.fetchrow(
            """
            UPDATE marketplace_purchase
            SET status = 'completed',
                stripe_charge_id = COALESCE($2, stripe_charge_id),
                completed_at = COALESCE(completed_at, now())
            WHERE payment_intent_id = $1
              AND status IN ('pending', 'completed')
            RETURNING *
            """,
            payment_intent_id,
            stripe_charge_id,
        )
        if row is None:
            logger.info(
                "commerce.purchase.complete_unknown_pi pi=%s",
                payment_intent_id,
            )
            return None

        # Post ledger legs only the first time (completed_at matched now
        # implies we just flipped; if it was already completed pre-hop
        # the ledger idempotency key collapses the replay).
        await _post_purchase_ledger(
            c=c,
            stripe_event_id=stripe_event_id,
            platform_fee_cents=int(row["platform_fee_cents"]),
            creator_net_cents=int(row["creator_net_cents"]),
            currency=str(row["currency"]),
            creator_user_id=row["creator_user_id"],
            tenant_id=row["tenant_id"],
            purchase_id=row["id"],
        )
        return _row_to_dataclass(row)

    if conn is not None:
        return await _run(conn)

    pool = get_pool()
    async with pool.acquire() as acquired:
        async with acquired.transaction():
            return await _run(acquired)


async def mark_purchase_refunded(
    *,
    payment_intent_id: Optional[str],
    stripe_charge_id: Optional[str],
    amount_refunded_cents: int,
    currency: str,
    stripe_event_id: str,
    conn: Optional[asyncpg.Connection] = None,
) -> Optional[PurchaseRow]:
    """Transition purchase to refunded + reverse ledger legs.

    For partial refunds we update ``refunded_amount_cents`` but keep
    status='completed' until the cumulative refunded equals gross
    (full refund). The ledger reversal splits the refunded portion
    proportionally between platform fee + creator payable.
    """

    async def _run(c: asyncpg.Connection) -> Optional[PurchaseRow]:
        if payment_intent_id:
            row = await c.fetchrow(
                """
                UPDATE marketplace_purchase
                SET
                    refunded_amount_cents = LEAST(
                        refunded_amount_cents + $2, gross_amount_cents
                    ),
                    status = CASE
                        WHEN refunded_amount_cents + $2 >= gross_amount_cents
                        THEN 'refunded'
                        ELSE status
                    END
                WHERE payment_intent_id = $1
                RETURNING *
                """,
                payment_intent_id,
                amount_refunded_cents,
            )
        elif stripe_charge_id:
            row = await c.fetchrow(
                """
                UPDATE marketplace_purchase
                SET
                    refunded_amount_cents = LEAST(
                        refunded_amount_cents + $2, gross_amount_cents
                    ),
                    status = CASE
                        WHEN refunded_amount_cents + $2 >= gross_amount_cents
                        THEN 'refunded'
                        ELSE status
                    END
                WHERE stripe_charge_id = $1
                RETURNING *
                """,
                stripe_charge_id,
                amount_refunded_cents,
            )
        else:
            return None

        if row is None:
            logger.info(
                "commerce.purchase.refund_unknown_pi pi=%s charge=%s",
                payment_intent_id,
                stripe_charge_id,
            )
            return None

        # Proportional split of the refunded amount so ledger totals
        # stay consistent: platform_share = gross / fee * amount.
        gross = int(row["gross_amount_cents"])
        fee = int(row["platform_fee_cents"])
        if gross > 0:
            fee_refund = (amount_refunded_cents * fee) // gross
        else:
            fee_refund = 0
        creator_refund = amount_refunded_cents - fee_refund

        await _post_refund_ledger(
            c=c,
            stripe_event_id=stripe_event_id,
            fee_refund_cents=fee_refund,
            creator_refund_cents=creator_refund,
            currency=currency.upper(),
            creator_user_id=row["creator_user_id"],
            tenant_id=row["tenant_id"],
            purchase_id=row["id"],
        )
        return _row_to_dataclass(row)

    if conn is not None:
        return await _run(conn)

    pool = get_pool()
    async with pool.acquire() as acquired:
        async with acquired.transaction():
            return await _run(acquired)


async def mark_purchase_failed(
    *,
    payment_intent_id: str,
    conn: Optional[asyncpg.Connection] = None,
) -> Optional[PurchaseRow]:
    """Transition purchase to failed on ``payment_intent.payment_failed``."""

    async def _run(c: asyncpg.Connection) -> Optional[PurchaseRow]:
        row = await c.fetchrow(
            """
            UPDATE marketplace_purchase
            SET status = 'failed'
            WHERE payment_intent_id = $1 AND status = 'pending'
            RETURNING *
            """,
            payment_intent_id,
        )
        if row is None:
            return None
        return _row_to_dataclass(row)

    if conn is not None:
        return await _run(conn)

    pool = get_pool()
    async with pool.acquire() as acquired:
        async with acquired.transaction():
            return await _run(acquired)


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------


async def get_purchase_by_payment_intent(
    *,
    payment_intent_id: str,
) -> Optional[PurchaseRow]:
    """Global lookup (used from the webhook path) without tenant scope."""

    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM marketplace_purchase WHERE payment_intent_id = $1",
            payment_intent_id,
        )
        if row is None:
            return None
        return _row_to_dataclass(row)


async def buyer_has_completed_purchase(
    *,
    tenant_id: UUID,
    buyer_user_id: UUID,
    listing_id: UUID,
) -> bool:
    """Return True when the buyer has a non-refunded completed purchase.

    Used by the review service to enforce the purchased-only gate.
    A 'completed' row that has been partially refunded still counts
    (refunded_amount_cents < gross_amount_cents) because the buyer
    retained some portion of the delivered value.
    """

    pool = get_pool()
    async with tenant_scoped(pool, tenant_id) as conn:
        row = await conn.fetchrow(
            """
            SELECT 1
            FROM marketplace_purchase
            WHERE listing_id = $1
              AND buyer_user_id = $2
              AND status = 'completed'
              AND refunded_amount_cents < gross_amount_cents
            LIMIT 1
            """,
            listing_id,
            buyer_user_id,
        )
        return row is not None


async def get_completed_purchase_id(
    *,
    tenant_id: UUID,
    buyer_user_id: UUID,
    listing_id: UUID,
) -> Optional[UUID]:
    """Return the most recent completed purchase id for a buyer+listing."""

    pool = get_pool()
    async with tenant_scoped(pool, tenant_id) as conn:
        row = await conn.fetchrow(
            """
            SELECT id
            FROM marketplace_purchase
            WHERE listing_id = $1
              AND buyer_user_id = $2
              AND status = 'completed'
            ORDER BY completed_at DESC NULLS LAST, created_at DESC
            LIMIT 1
            """,
            listing_id,
            buyer_user_id,
        )
        if row is None:
            return None
        return row["id"]


# ---------------------------------------------------------------------------
# Ledger helpers
# ---------------------------------------------------------------------------


async def _ensure_creator_payable_account(
    conn: asyncpg.Connection,
    *,
    creator_user_id: UUID,
    currency: str,
) -> str:
    """Lazy-create the per-creator liability account.

    Idempotent: existing account code is returned; otherwise a fresh
    ``liability:creator_payable_usd:<uuid>`` account row is inserted
    into ``billing_ledger_account``. This matches the contract
    Section 7 naming convention.
    """

    code = f"liability:creator_payable_{currency.lower()}:{creator_user_id}"
    existing = await conn.fetchval(
        "SELECT id FROM billing_ledger_account WHERE code = $1",
        code,
    )
    if existing is not None:
        return code

    await conn.execute(
        """
        INSERT INTO billing_ledger_account (
            tenant_id, code, name, type, currency, is_system
        )
        VALUES (NULL, $1, $2, 'liability', $3, false)
        ON CONFLICT (code) DO NOTHING
        """,
        code,
        f"Creator Payable {creator_user_id} ({currency.upper()})",
        currency.upper(),
    )
    return code


async def _post_purchase_ledger(
    *,
    c: asyncpg.Connection,
    stripe_event_id: str,
    platform_fee_cents: int,
    creator_net_cents: int,
    currency: str,
    creator_user_id: UUID,
    tenant_id: UUID,
    purchase_id: UUID,
) -> list[LedgerPostResult]:
    """Post the platform fee + creator payable legs.

    Two transactions so each sums to zero independently.
    """

    results: list[LedgerPostResult] = []

    # Leg 1: platform fee revenue.
    if platform_fee_cents > 0:
        fee_legs = [
            LedgerLeg(
                account_code=ACCOUNT_STRIPE_BALANCE_USD,
                direction="D",
                amount_minor_units=platform_fee_cents,
                currency=currency,
            ),
            LedgerLeg(
                account_code=ACCOUNT_MARKETPLACE_FEE_REVENUE_USD,
                direction="C",
                amount_minor_units=platform_fee_cents,
                currency=currency,
            ),
        ]
        fee_result = await post_double_entry(
            idempotency_key=f"stripe:evt:{stripe_event_id}:mkp_fee",
            legs=fee_legs,
            reference_type="marketplace_purchase",
            reference_id=str(purchase_id),
            description=f"Marketplace platform fee for purchase {purchase_id}",
            metadata={
                "purchase_id": str(purchase_id),
                "creator_user_id": str(creator_user_id),
                "event_id": stripe_event_id,
            },
            tenant_id=None,
            conn=c,
        )
        results.append(fee_result)

    # Leg 2: creator payable liability.
    if creator_net_cents > 0:
        payable_code = await _ensure_creator_payable_account(
            c, creator_user_id=creator_user_id, currency=currency
        )
        creator_legs = [
            LedgerLeg(
                account_code=ACCOUNT_STRIPE_BALANCE_USD,
                direction="D",
                amount_minor_units=creator_net_cents,
                currency=currency,
            ),
            LedgerLeg(
                account_code=payable_code,
                direction="C",
                amount_minor_units=creator_net_cents,
                currency=currency,
            ),
        ]
        creator_result = await post_double_entry(
            idempotency_key=f"stripe:evt:{stripe_event_id}:mkp_creator",
            legs=creator_legs,
            reference_type="marketplace_purchase",
            reference_id=str(purchase_id),
            description=f"Marketplace creator payable for purchase {purchase_id}",
            metadata={
                "purchase_id": str(purchase_id),
                "creator_user_id": str(creator_user_id),
                "event_id": stripe_event_id,
            },
            tenant_id=None,
            conn=c,
        )
        results.append(creator_result)

    return results


async def _post_refund_ledger(
    *,
    c: asyncpg.Connection,
    stripe_event_id: str,
    fee_refund_cents: int,
    creator_refund_cents: int,
    currency: str,
    creator_user_id: UUID,
    tenant_id: UUID,
    purchase_id: UUID,
) -> list[LedgerPostResult]:
    """Reverse the fee + creator payable legs proportionally."""

    results: list[LedgerPostResult] = []

    if fee_refund_cents > 0:
        fee_legs = [
            LedgerLeg(
                account_code=ACCOUNT_MARKETPLACE_FEE_REVENUE_USD,
                direction="D",
                amount_minor_units=fee_refund_cents,
                currency=currency,
            ),
            LedgerLeg(
                account_code=ACCOUNT_STRIPE_BALANCE_USD,
                direction="C",
                amount_minor_units=fee_refund_cents,
                currency=currency,
            ),
        ]
        fee_result = await post_double_entry(
            idempotency_key=f"stripe:evt:{stripe_event_id}:mkp_fee_refund",
            legs=fee_legs,
            reference_type="marketplace_purchase",
            reference_id=str(purchase_id),
            description=f"Marketplace platform fee refund for purchase {purchase_id}",
            metadata={
                "purchase_id": str(purchase_id),
                "event_id": stripe_event_id,
            },
            tenant_id=None,
            conn=c,
        )
        results.append(fee_result)

    if creator_refund_cents > 0:
        payable_code = await _ensure_creator_payable_account(
            c, creator_user_id=creator_user_id, currency=currency
        )
        creator_legs = [
            LedgerLeg(
                account_code=payable_code,
                direction="D",
                amount_minor_units=creator_refund_cents,
                currency=currency,
            ),
            LedgerLeg(
                account_code=ACCOUNT_STRIPE_BALANCE_USD,
                direction="C",
                amount_minor_units=creator_refund_cents,
                currency=currency,
            ),
        ]
        creator_result = await post_double_entry(
            idempotency_key=f"stripe:evt:{stripe_event_id}:mkp_creator_refund",
            legs=creator_legs,
            reference_type="marketplace_purchase",
            reference_id=str(purchase_id),
            description=f"Marketplace creator payable refund for purchase {purchase_id}",
            metadata={
                "purchase_id": str(purchase_id),
                "event_id": stripe_event_id,
            },
            tenant_id=None,
            conn=c,
        )
        results.append(creator_result)

    return results


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------


def _row_to_dataclass(row: Any) -> PurchaseRow:
    return PurchaseRow(
        id=row["id"],
        tenant_id=row["tenant_id"],
        listing_id=row["listing_id"],
        buyer_user_id=row["buyer_user_id"],
        creator_user_id=row["creator_user_id"],
        connect_account_id=row.get("connect_account_id") if hasattr(
            row, "get"
        ) else row["connect_account_id"],
        gross_amount_cents=int(row["gross_amount_cents"]),
        platform_fee_cents=int(row["platform_fee_cents"]),
        creator_net_cents=int(row["creator_net_cents"]),
        refunded_amount_cents=int(row["refunded_amount_cents"]),
        currency=str(row["currency"]),
        rail=str(row["rail"]),
        status=str(row["status"]),
        payment_intent_id=row["payment_intent_id"],
        stripe_checkout_session_id=row["stripe_checkout_session_id"],
        stripe_charge_id=row["stripe_charge_id"],
        idempotency_key=row["idempotency_key"],
        client_reference_id=row["client_reference_id"],
        metadata=_decode_jsonb(row["metadata"]) or {},
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        completed_at=row["completed_at"],
    )


def _decode_jsonb(raw: Any) -> Any:
    if raw is None:
        return None
    if isinstance(raw, (dict, list)):
        return raw
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except ValueError:
            return None
    return raw


__all__ = [
    "ListingNotPurchasableProblem",
    "PurchaseIntentResponse",
    "PurchaseRow",
    "SLUG_LISTING_NOT_PURCHASABLE",
    "SLUG_NO_ELIGIBLE_PURCHASE",
    "SLUG_SELF_PURCHASE",
    "SelfPurchaseForbiddenProblem",
    "buyer_has_completed_purchase",
    "create_purchase_intent",
    "get_completed_purchase_id",
    "get_purchase_by_payment_intent",
    "mark_purchase_completed",
    "mark_purchase_failed",
    "mark_purchase_refunded",
]
