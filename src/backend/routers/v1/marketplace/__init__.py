"""Marketplace v1 routers.

Owner: Phanes (listing_router) + Hyperion (search_router). Both routers
are mounted by ``src.backend.routers.v1.mount_v1_routers`` under the
``/v1`` prefix via separate registry entries. The package pattern
mirrors ``routers/v1/ma`` (a thin namespace module that re-exports the
actual ``APIRouter``s).
"""

from src.backend.routers.v1.marketplace.listing import listing_router
from src.backend.routers.v1.marketplace.search import search_router

__all__ = ["listing_router", "search_router"]
