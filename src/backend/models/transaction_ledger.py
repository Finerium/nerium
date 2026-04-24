"""Pydantic v2 projections for ``transaction_ledger`` (scaffold).

Scaffold matching migration ``035_transaction_ledger``. Plutus extends
with the double-entry breakdown (``ledger_entry`` + ``ledger_account``)
in Wave 2.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Literal, Optional
from uuid import UUID

from pydantic import Field

from src.backend.models.base import NeriumModel, TenantBaseModel

TransactionType = Literal[
    "purchase",
    "refund",
    "payout",
    "subscription_charge",
    "credit_grant",
    "usage_debit",
    "adjustment",
]
TransactionStatus = Literal["pending", "posted", "reversed", "failed"]


class Transaction(TenantBaseModel):
    """Row projection of ``transaction_ledger``."""

    user_id: Optional[UUID] = None
    transaction_ref: str = Field(..., max_length=200)
    transaction_type: TransactionType
    amount_cents: int = Field(
        ...,
        description="Signed integer; credits positive, debits negative.",
    )
    currency: str = Field(default="USD", min_length=3, max_length=3)
    status: TransactionStatus = Field(default="pending")
    metadata: dict[str, Any] = Field(default_factory=dict)
    posted_at: Optional[datetime] = None


class TransactionCreate(NeriumModel):
    """Request body for posting a new transaction (scaffold)."""

    user_id: Optional[UUID] = None
    transaction_ref: str = Field(..., min_length=1, max_length=200)
    transaction_type: TransactionType
    amount_cents: int
    currency: str = Field(default="USD", min_length=3, max_length=3)
    metadata: dict[str, Any] = Field(default_factory=dict)

    # Decimal helper so callers can pass a Decimal USD value without
    # pre-converting to cents. Consumers that use this field MUST clear
    # ``amount_cents`` to avoid conflict.
    amount_usd: Optional[Decimal] = Field(
        default=None,
        description="Optional decimal convenience; server converts to cents.",
    )


__all__ = [
    "Transaction",
    "TransactionCreate",
    "TransactionStatus",
    "TransactionType",
]
