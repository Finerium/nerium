"""``/v1/billing/*`` router package.

Owner: Plutus (W2 NP P4 S1).

Routers
-------
- :data:`plans_router` ``GET /v1/billing/plans`` (public).
- :data:`checkout_router` ``POST /v1/billing/checkout`` (auth required).
- :data:`webhook_router` ``POST /v1/billing/webhook/stripe`` (Stripe-signed).
- :data:`subscription_router` ``GET /v1/billing/subscription/me``.

Each is mounted separately via ``_PILLAR_REGISTRY`` in the parent
router package so the mount-report label can call out per-endpoint
ownership (helpful for Nemea smoke tests).
"""

from __future__ import annotations

from src.backend.routers.v1.billing.checkout import checkout_router
from src.backend.routers.v1.billing.plans import plans_router
from src.backend.routers.v1.billing.subscription import subscription_router
from src.backend.routers.v1.billing.webhook import webhook_router

__all__ = [
    "checkout_router",
    "plans_router",
    "subscription_router",
    "webhook_router",
]
