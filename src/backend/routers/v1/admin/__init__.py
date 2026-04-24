"""Admin-only v1 routers.

Each admin pillar exports its ``APIRouter`` from a sibling module. The
package re-exports the most commonly mounted ones so ``main.py`` can do
``from src.backend.routers.v1.admin import flags_router`` without
reaching into the file tree.
"""

from __future__ import annotations

from src.backend.routers.v1.admin.budget import router as budget_router
from src.backend.routers.v1.admin.flags import router as flags_router

__all__ = ["budget_router", "flags_router"]
