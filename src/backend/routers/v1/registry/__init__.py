"""Registry v1 routers.

Owner: Astraea (trust router) + (future) Tethys (identity router).
Both routers mount via ``src.backend.routers.v1.mount_v1_routers`` under
the ``/v1`` prefix with the ``registry`` namespace.

The package pattern mirrors ``routers/v1/marketplace`` (thin namespace
module that re-exports the actual ``APIRouter`` objects).
"""

from src.backend.routers.v1.registry.trust import trust_router

__all__ = ["trust_router"]
