"""FastAPI router for /.well-known/oauth-* metadata endpoints.

Contract: ``docs/contracts/mcp_server.contract.md`` Section 3.2.

RFC 9728 Protected Resource Metadata + RFC 8414 Authorization Server
Metadata. Bytes served verbatim from static JSON under
``src/backend/well_known/``. Cache-Control 5 min per spec recommendation.
"""

from __future__ import annotations

import json
import logging
from functools import lru_cache
from typing import Any

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from src.backend.well_known import load_asset_bytes

log = logging.getLogger(__name__)

router = APIRouter(tags=["mcp", "well-known"])


@lru_cache(maxsize=2)
def _load_metadata(filename: str) -> dict[str, Any]:
    raw = load_asset_bytes(filename)
    return json.loads(raw)


def _metadata_response(filename: str) -> JSONResponse:
    payload = _load_metadata(filename)
    return JSONResponse(
        content=payload,
        headers={"Cache-Control": "public, max-age=300"},
    )


@router.get("/.well-known/oauth-protected-resource")
async def oauth_protected_resource() -> JSONResponse:
    return _metadata_response("oauth_protected_resource.json")


@router.get("/.well-known/oauth-authorization-server")
async def oauth_authorization_server() -> JSONResponse:
    return _metadata_response("oauth_authorization_server.json")


def refresh_metadata_cache() -> None:
    _load_metadata.cache_clear()
