"""Marketplace v1 routers.

Owner: Phanes (W2 NP P1). Exposes ``listing_router`` mounted by
``src.backend.routers.v1.mount_v1_routers`` under the ``/v1`` prefix.
The package pattern mirrors ``routers/v1/ma`` (a thin namespace module
that re-exports the actual ``APIRouter``s).
"""

from src.backend.routers.v1.marketplace.listing import listing_router

__all__ = ["listing_router"]
