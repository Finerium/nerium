"""User-scoped v1 routers (``/v1/me/*``).

Each ``/me`` endpoint operates on the authenticated caller's own data
(profile, flags exposure, notification prefs, sessions). The prefix is
applied inside each sub-router so the package just re-exports them.
"""

from __future__ import annotations

from src.backend.routers.v1.me.consent import router as consent_router
from src.backend.routers.v1.me.flags import router as flags_router
from src.backend.routers.v1.me.gdpr import router as gdpr_router

__all__ = ["consent_router", "flags_router", "gdpr_router"]
