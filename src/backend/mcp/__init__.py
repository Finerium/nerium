"""MCP (Model Context Protocol) server subsystem.

Owner: Khronos. Exposes FastMCP-backed Streamable HTTP at ``/mcp`` plus the
``/.well-known/oauth-*`` metadata endpoints required by Claude.ai discovery.

Aether integration::

    from src.backend.mcp.server import mount_mcp
    from src.backend.mcp.well_known import router as well_known_router

    app = FastAPI(lifespan=lifespan)
    mount_mcp(app)
    app.include_router(well_known_router)
"""

from __future__ import annotations
