"""OAuth 2.1 authorization server + JWT primitives.

Owner: Khronos. Aether integration: ``from src.backend.auth.router import
oauth_router`` then ``app.include_router(oauth_router)`` inside
``src/backend/main.py``.
"""

from __future__ import annotations
