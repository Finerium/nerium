"""``/v1/commerce/*`` router package.

Owner: Iapetus (W2 NP P4 S1).

Routers
-------
- :data:`connect_router`  POST /v1/commerce/connect/onboard + refresh
                          + GET /v1/commerce/connect/status.
- :data:`purchase_router` POST /v1/commerce/purchase.
- :data:`review_router`   POST /v1/commerce/listings/{id}/reviews,
                          GET /v1/commerce/listings/{id}/reviews,
                          PATCH/DELETE /v1/commerce/reviews/{id}.

Each router is mounted separately via ``_PILLAR_REGISTRY`` in the
parent router package so the mount-report label can call out
per-endpoint ownership for Nemea smoke tests.
"""

from __future__ import annotations

from src.backend.routers.v1.commerce.connect import connect_router
from src.backend.routers.v1.commerce.purchase import purchase_router
from src.backend.routers.v1.commerce.review import review_router

__all__ = [
    "connect_router",
    "purchase_router",
    "review_router",
]
