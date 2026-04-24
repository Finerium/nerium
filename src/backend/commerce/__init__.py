"""Marketplace commerce package (Iapetus W2 NP P4 S1).

Public surface
--------------
- :mod:`.revenue_split` per-category take rate math (BIGINT cents).
- :mod:`.connect` Stripe Connect Express onboarding helpers.
- :mod:`.purchase` buyer-initiated purchase flow + idempotency.
- :mod:`.review` verified-purchase review CRUD + Astraea event emit.
- :mod:`.webhook` marketplace-specific Stripe event dispatch wired into
  the Plutus webhook pipeline.

Contract: ``docs/contracts/marketplace_commerce.contract.md``. Revenue
splits run through the Plutus ``post_double_entry`` helper against the
shared ``billing_ledger_*`` tables per the name-space lock in
migration 049.
"""

from __future__ import annotations

__all__ = [
    "connect",
    "purchase",
    "review",
    "revenue_split",
    "webhook",
]
