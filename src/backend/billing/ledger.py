"""Double-entry ledger post helpers.

Owner: Plutus (W2 NP P4 S1).

Every monetary Stripe event (``invoice.paid``, ``charge.refunded``, ...)
creates a ``billing_ledger_transaction`` row + two ``billing_ledger_entry``
rows that sum to zero per the sum-to-zero trigger installed by migration
049. Amounts are BIGINT minor units (USD cents; never FLOAT) per V4
lock.

Accounting convention (contract Section 4.9)
--------------------------------------------
Subscription payment received:
    DEBIT  asset:stripe_balance_usd          +amount
    CREDIT revenue:subscription_usd          -amount

Refund:
    DEBIT  revenue:subscription_usd          +amount   (reverses revenue)
    CREDIT asset:stripe_balance_usd          -amount   (reduces balance)

The sum-to-zero trigger on ``billing_ledger_entry`` treats + for DEBIT
and - for CREDIT so both rows inserted above cancel out at commit.

Idempotency
-----------
Every post carries an ``idempotency_key`` stamped at the source event.
Webhook replays pass the same key; the ``UNIQUE (idempotency_key)``
index on ``billing_ledger_transaction`` collapses the replay into a
no-op via ``ON CONFLICT DO NOTHING``. A zero row-count tells the caller
the event was already posted.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any, Literal
from uuid import UUID

from src.backend.db.pool import get_pool
from src.backend.utils.uuid7 import uuid7

logger = logging.getLogger(__name__)


# Canonical account codes seeded by migration 049. Keep in lockstep
# with the seed DDL so mistypes are caught at the foreign-key hop.
ACCOUNT_STRIPE_BALANCE_USD = "asset:stripe_balance_usd"
ACCOUNT_SUBSCRIPTION_REVENUE_USD = "revenue:subscription_usd"
ACCOUNT_MARKETPLACE_FEE_REVENUE_USD = "revenue:marketplace_fee_usd"
ACCOUNT_STRIPE_REFUNDS_LIABILITY_USD = "liability:stripe_refunds_usd"


Direction = Literal["D", "C"]


@dataclass(frozen=True)
class LedgerLeg:
    """One side of a double-entry posting.

    ``account_code`` resolves to ``billing_ledger_account.id`` via the
    unique code column. ``amount_minor_units`` is strictly positive
    (direction encodes debit vs credit). ``currency`` keeps 3-letter
    ISO 4217; USD cents is the hackathon default.
    """

    account_code: str
    direction: Direction
    amount_minor_units: int
    currency: str = "USD"


@dataclass(frozen=True)
class LedgerPostResult:
    """Return shape of a ledger post.

    ``was_inserted`` is False when the ``idempotency_key`` matched an
    existing transaction (replay collapse). Callers that need to emit
    secondary side effects (Pheme email send, realtime event) gate on
    this flag so replays stay truly idempotent.
    """

    transaction_id: UUID | None
    was_inserted: bool


async def post_double_entry(
    *,
    idempotency_key: str,
    legs: list[LedgerLeg],
    reference_type: str | None = None,
    reference_id: str | None = None,
    description: str | None = None,
    metadata: dict[str, Any] | None = None,
    tenant_id: UUID | None = None,
    conn: Any | None = None,
) -> LedgerPostResult:
    """Insert a ledger transaction + its paired entries atomically.

    Parameters
    ----------
    idempotency_key
        Unique anchor, e.g. ``stripe:evt:evt_1NG...``. Replays of the
        same key short-circuit to a no-op.
    legs
        List of 2+ :class:`LedgerLeg`. Must balance: sum of debits minus
        sum of credits in minor units must equal zero. The deferred
        trigger catches violations at transaction commit.
    reference_type / reference_id
        Optional soft FK to the source object (``"stripe_event"`` +
        ``"evt_xxx"``). Indexed for admin reconciliation queries.
    description
        Human-readable blurb rendered in admin reconcile UI.
    metadata
        Optional jsonb bag (event type, webhook timestamp, etc).
    tenant_id
        Optional tenant scope. Platform-wide rows (revenue recognised
        at platform level) leave this None; tenant-scoped rows
        (marketplace Connect fees specific to one tenant) set it.
    conn
        Optional existing asyncpg connection (webhook handler owns the
        tx). When None we acquire + commit our own.
    """

    if len(legs) < 2:
        raise ValueError("post_double_entry requires at least two legs")
    _assert_balanced(legs)

    if conn is not None:
        return await _post_with_conn(
            conn=conn,
            idempotency_key=idempotency_key,
            legs=legs,
            reference_type=reference_type,
            reference_id=reference_id,
            description=description,
            metadata=metadata,
            tenant_id=tenant_id,
        )

    pool = get_pool()
    async with pool.acquire() as acquired:
        async with acquired.transaction():
            return await _post_with_conn(
                conn=acquired,
                idempotency_key=idempotency_key,
                legs=legs,
                reference_type=reference_type,
                reference_id=reference_id,
                description=description,
                metadata=metadata,
                tenant_id=tenant_id,
            )


async def _post_with_conn(
    *,
    conn: Any,
    idempotency_key: str,
    legs: list[LedgerLeg],
    reference_type: str | None,
    reference_id: str | None,
    description: str | None,
    metadata: dict[str, Any] | None,
    tenant_id: UUID | None,
) -> LedgerPostResult:
    """Inner post that assumes the caller owns transaction state."""

    new_id = uuid7()
    tx_row = await conn.fetchrow(
        """
        INSERT INTO billing_ledger_transaction (
            id, tenant_id, idempotency_key,
            reference_type, reference_id,
            description, metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING id
        """,
        new_id,
        tenant_id,
        idempotency_key,
        reference_type,
        reference_id,
        description,
        json.dumps(metadata or {}),
    )

    if tx_row is None:
        # Replay: existing row already recorded; we skip the entry
        # insert so the sum-to-zero trigger does not run over a
        # would-be duplicate set of legs. The replay flag below gives
        # the webhook handler a clean signal.
        existing = await conn.fetchval(
            "SELECT id FROM billing_ledger_transaction "
            "WHERE idempotency_key = $1",
            idempotency_key,
        )
        logger.info(
            "billing.ledger.replay idempotency_key=%s existing_tx=%s",
            idempotency_key,
            existing,
        )
        return LedgerPostResult(
            transaction_id=existing,
            was_inserted=False,
        )

    tx_id: UUID = tx_row["id"]

    # Resolve account codes to ids in one round-trip.
    codes = [leg.account_code for leg in legs]
    account_rows = await conn.fetch(
        "SELECT id, code FROM billing_ledger_account WHERE code = ANY($1::text[])",
        codes,
    )
    code_to_id: dict[str, int] = {row["code"]: row["id"] for row in account_rows}
    missing = [c for c in codes if c not in code_to_id]
    if missing:
        # Sum-to-zero trigger would fire anyway, but we surface the
        # missing-account error clearly at the app layer first.
        raise ValueError(
            f"billing.ledger: unknown account code(s) {missing}; "
            "seed via migration 049 or add the tenant-scoped account first."
        )

    # Insert all entries as a single executemany so the deferred
    # trigger evaluates exactly once at commit.
    insert_entry_sql = """
        INSERT INTO billing_ledger_entry (
            transaction_id, account_id,
            direction, amount_minor_units, currency
        )
        VALUES ($1, $2, $3, $4, $5)
    """
    values = [
        (
            tx_id,
            code_to_id[leg.account_code],
            leg.direction,
            leg.amount_minor_units,
            leg.currency,
        )
        for leg in legs
    ]
    await conn.executemany(insert_entry_sql, values)

    logger.info(
        "billing.ledger.posted tx=%s key=%s legs=%d",
        tx_id,
        idempotency_key,
        len(legs),
    )
    return LedgerPostResult(transaction_id=tx_id, was_inserted=True)


# ---------------------------------------------------------------------------
# Convenience wrappers for the two dominant patterns
# ---------------------------------------------------------------------------


async def post_subscription_payment(
    *,
    stripe_event_id: str,
    amount_minor_units: int,
    currency: str = "USD",
    description: str | None = None,
    metadata: dict[str, Any] | None = None,
    tenant_id: UUID | None = None,
    conn: Any | None = None,
) -> LedgerPostResult:
    """Post the DEBIT(stripe_balance) + CREDIT(subscription_revenue) pair.

    Called by the webhook on ``invoice.paid`` where the invoice line
    items represent a subscription charge. The idempotency key is
    derived from the Stripe event id so replays collapse.
    """

    legs = [
        LedgerLeg(
            account_code=ACCOUNT_STRIPE_BALANCE_USD,
            direction="D",
            amount_minor_units=amount_minor_units,
            currency=currency,
        ),
        LedgerLeg(
            account_code=ACCOUNT_SUBSCRIPTION_REVENUE_USD,
            direction="C",
            amount_minor_units=amount_minor_units,
            currency=currency,
        ),
    ]
    return await post_double_entry(
        idempotency_key=_stripe_event_key(stripe_event_id),
        legs=legs,
        reference_type="stripe_event",
        reference_id=stripe_event_id,
        description=description or f"Subscription payment {stripe_event_id}",
        metadata=metadata,
        tenant_id=tenant_id,
        conn=conn,
    )


async def post_subscription_refund(
    *,
    stripe_event_id: str,
    amount_minor_units: int,
    currency: str = "USD",
    description: str | None = None,
    metadata: dict[str, Any] | None = None,
    tenant_id: UUID | None = None,
    conn: Any | None = None,
) -> LedgerPostResult:
    """Reverse entry on ``charge.refunded``.

    DEBIT revenue + CREDIT asset so the net effect is a subscription-
    revenue clawback plus a Stripe balance reduction.
    """

    legs = [
        LedgerLeg(
            account_code=ACCOUNT_SUBSCRIPTION_REVENUE_USD,
            direction="D",
            amount_minor_units=amount_minor_units,
            currency=currency,
        ),
        LedgerLeg(
            account_code=ACCOUNT_STRIPE_BALANCE_USD,
            direction="C",
            amount_minor_units=amount_minor_units,
            currency=currency,
        ),
    ]
    return await post_double_entry(
        idempotency_key=_stripe_event_key(stripe_event_id),
        legs=legs,
        reference_type="stripe_event",
        reference_id=stripe_event_id,
        description=description or f"Subscription refund {stripe_event_id}",
        metadata=metadata,
        tenant_id=tenant_id,
        conn=conn,
    )


# ---------------------------------------------------------------------------
# Invariants (assertions mirror the DB trigger so we fail fast in Python)
# ---------------------------------------------------------------------------


def _assert_balanced(legs: list[LedgerLeg]) -> None:
    """Raise if signed sum of legs is nonzero or currencies mismatch.

    Matches the Postgres ``billing_ledger_check_sum_to_zero`` trigger
    so tests catch the violation at the app layer before the DB round-
    trip. Multi-currency postings (rare) must split into per-currency
    sub-transactions; we enforce single currency per transaction here
    for simplicity.
    """

    if not legs:
        raise ValueError("ledger: empty leg list")
    currencies = {leg.currency for leg in legs}
    if len(currencies) != 1:
        raise ValueError(
            "ledger: all legs must share one currency; got "
            f"{sorted(currencies)}"
        )
    signed = 0
    for leg in legs:
        if leg.amount_minor_units <= 0:
            raise ValueError(
                "ledger: amount_minor_units must be strictly positive "
                f"({leg.amount_minor_units})"
            )
        if leg.direction == "D":
            signed += leg.amount_minor_units
        elif leg.direction == "C":
            signed -= leg.amount_minor_units
        else:
            raise ValueError(f"ledger: bad direction {leg.direction!r}")
    if signed != 0:
        raise ValueError(
            f"ledger: legs do not balance; signed sum = {signed} minor units"
        )


def _stripe_event_key(event_id: str) -> str:
    """Idempotency key convention for Stripe-sourced ledger posts."""

    return f"stripe:evt:{event_id}"


__all__ = [
    "ACCOUNT_MARKETPLACE_FEE_REVENUE_USD",
    "ACCOUNT_STRIPE_BALANCE_USD",
    "ACCOUNT_STRIPE_REFUNDS_LIABILITY_USD",
    "ACCOUNT_SUBSCRIPTION_REVENUE_USD",
    "Direction",
    "LedgerLeg",
    "LedgerPostResult",
    "post_double_entry",
    "post_subscription_payment",
    "post_subscription_refund",
]
