"""FastMCP server mount + Streamable HTTP ASGI adapter.

Contract: ``docs/contracts/mcp_server.contract.md`` Section 3.1.

Module-level FastMCP singleton so the ``src.backend.mcp.tools`` package
can decorate tool handlers via ``@mcp_server().tool()``. ``mount_mcp(app)``
registers the handlers (import triggers decoration), wraps the ASGI
sub-app with :class:`~src.backend.mcp.auth.McpPrincipalBridgeMiddleware`,
and mounts it at ``/mcp``. Aether calls this inside ``create_app``.

Version probing: we try ``mcp_server.streamable_http_app()`` (FastMCP
>= 1.6) first, then fall back to ``create_streamable_http_app`` on older
releases. A clear RuntimeError surfaces if neither path works.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any, Callable

if TYPE_CHECKING:
    from fastapi import FastAPI

log = logging.getLogger(__name__)


def _build_mcp_server() -> "Any":
    from mcp.server.fastmcp import FastMCP

    return FastMCP(
        name="nerium",
        version="0.1.0",
        instructions=(
            "NERIUM infrastructure for the AI agent economy. Tools expose "
            "project + agent listings, marketplace search, trust scores, and "
            "managed-agent session creation. Spec revision 2025-06-18."
        ),
    )


_mcp_server: "Any | None" = None


def mcp_server() -> "Any":
    """Return the module-level FastMCP singleton, constructing it on first call."""

    global _mcp_server
    if _mcp_server is None:
        _mcp_server = _build_mcp_server()
    return _mcp_server


def _resolve_streamable_http_factory() -> Callable[[Any], Any]:
    server = mcp_server()
    method = getattr(server, "streamable_http_app", None)
    if callable(method):
        return lambda srv: srv.streamable_http_app()

    try:  # pragma: no cover
        from mcp.server.streamable_http import create_streamable_http_app

        return create_streamable_http_app
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError(
            "Installed mcp SDK does not expose Streamable HTTP. Pin "
            "mcp>=1.6.0 per pyproject.toml optional-dependencies.mcp."
        ) from exc


def register_mcp_tools() -> None:
    """Import the tools package so each handler's @tool() decorator runs.

    Deferred import is critical: the tools package imports back from this
    module to grab the ``mcp_server()`` singleton, so eager import at the
    top of this module would create a circular dependency.
    """

    from src.backend.mcp.auth import McpPrincipalBridgeMiddleware  # noqa: F401
    from src.backend.mcp import tools  # noqa: F401 - side-effect import

    log.info(
        "mcp.tools.registered",
        extra={
            "event": "mcp.tools.registered",
            "tool_count": len(tools.REGISTERED_TOOL_MODULES),
        },
    )


def mount_mcp(app: "FastAPI") -> None:
    """Mount the FastMCP Streamable HTTP server at ``/mcp`` on the FastAPI app.

    Side effect order:

    1. Import + register all tool modules (``@mcp_server().tool()`` decorators).
    2. Resolve the Streamable HTTP ASGI factory for the installed FastMCP.
    3. Wrap the ASGI app with
       :class:`~src.backend.mcp.auth.McpPrincipalBridgeMiddleware` so tool
       handlers see the :class:`AuthPrincipal` via
       :func:`current_mcp_principal`.
    4. Mount at ``/mcp``.
    """

    register_mcp_tools()

    from src.backend.mcp.auth import McpPrincipalBridgeMiddleware

    factory = _resolve_streamable_http_factory()
    asgi_app = factory(mcp_server())
    bridged = McpPrincipalBridgeMiddleware(asgi_app)
    app.mount("/mcp", bridged)
    log.info(
        "mcp.server.mounted",
        extra={"event": "mcp.server.mounted", "path": "/mcp"},
    )


def reset_for_tests() -> None:
    global _mcp_server
    _mcp_server = None
