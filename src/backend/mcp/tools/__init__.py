"""MCP tool handler modules.

Owner: Khronos. Importing this package triggers each submodule's
``@mcp_server().tool()`` registration so the single call
``register_mcp_tools()`` from :mod:`src.backend.mcp.server` walks them
all before ``streamable_http_app()`` snapshots the registry.

Per-tool modules
----------------
- :mod:`list_projects`
- :mod:`list_agents`
- :mod:`search_marketplace`
- :mod:`get_agent_identity`
- :mod:`get_trust_score`
- :mod:`create_ma_session`
- :mod:`get_ma_session`

Each module defines a Pydantic input + output model (co-located), calls
``require_scope`` early, emits ``mcp.tool.invoked`` / ``mcp.tool.completed``
log events, and opens an OTel span named ``mcp.tool.<tool_name>``.
"""


from src.backend.mcp.tools import (  # noqa: F401 - side-effect imports
    create_ma_session,
    get_agent_identity,
    get_ma_session,
    get_trust_score,
    list_agents,
    list_projects,
    search_marketplace,
)

REGISTERED_TOOL_MODULES = (
    "list_projects",
    "list_agents",
    "search_marketplace",
    "get_agent_identity",
    "get_trust_score",
    "create_ma_session",
    "get_ma_session",
)


__all__ = ["REGISTERED_TOOL_MODULES"]
