"""NERIUM billing package (Plutus W2 NP P4).

Public surface
--------------
- :mod:`.stripe_client` Stripe SDK lazy singleton + live-mode gate.
- :mod:`.plans` Static 4-tier plan catalogue (free/starter/pro/team).
- :mod:`.subscription` CRUD + state-sync helpers on ``subscription`` rows.
- :mod:`.checkout` Stripe Checkout Session create + retrieve helpers.
- :mod:`.webhook` Stripe webhook signature verify + idempotent dispatch.
- :mod:`.ledger` Double-entry ledger post helpers.

Contract: ``docs/contracts/payment_stripe.contract.md``. Every monetary
event flows through the internal double-entry ledger before trusting
Stripe's own numbers; the NERIUM ledger is source-of-truth per V3 lock.
Test mode only pre-Stripe-Atlas verification per V4 Gate 4.
"""

from __future__ import annotations

__all__ = [
    "plans",
    "stripe_client",
    "subscription",
    "checkout",
    "webhook",
    "ledger",
]
