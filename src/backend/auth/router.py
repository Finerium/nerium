"""Parent router combining the three OAuth sub-routers.

Aether integration::

    # src/backend/main.py
    from src.backend.auth.router import oauth_router

    app.include_router(oauth_router)

Assembles /oauth/* surface in a single import.
"""

from __future__ import annotations

from fastapi import APIRouter

from src.backend.auth.oauth_authorize import router as _authorize_router
from src.backend.auth.oauth_dcr import router as _dcr_router
from src.backend.auth.oauth_token import router as _token_router

oauth_router = APIRouter()
oauth_router.include_router(_dcr_router)
oauth_router.include_router(_authorize_router)
oauth_router.include_router(_token_router)


__all__ = ["oauth_router"]
