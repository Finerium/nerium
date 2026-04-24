"""MCP auth plumbing.

Owner: Khronos. Responsibilities:

1. **``khronos_rs256_verifier``** conforms to Aether's ``TokenVerifier``
   protocol so ``install_auth(app, verifier=khronos_rs256_verifier)`` in
   :mod:`src.backend.main` swaps the default HS256 verifier for the
   Khronos RS256 / JWKS path. Bearer tokens with ``aud == <MCP resource>``
   plus any scope from ``{mcp:read, mcp:write, mcp:admin}`` pass; anything
   else raises :class:`~src.backend.errors.UnauthorizedProblem`.

2. **Principal bridge** between the outer FastAPI request pipeline and
   the FastMCP sub-app. Aether's ``AuthMiddleware`` stores the decoded
   principal on ``request.state.auth`` while the request is still HTTP;
   FastMCP tool handlers execute later inside the sub-app's ASGI stack.
   :class:`McpPrincipalBridgeMiddleware` reads ``scope["state"]``, copies
   the principal into the :data:`_mcp_principal_ctx` :class:`ContextVar`,
   and tools read it via :func:`current_mcp_principal`.

3. **Scope helpers**: :func:`require_scope`, :func:`has_scope`.

Design note: contextvars propagate across ``await`` boundaries inside the
same asyncio task, so the bridge middleware setting the contextvar before
calling the wrapped ASGI app is safe for FastMCP's tool dispatch path.
"""

from __future__ import annotations

import contextvars
import logging
from typing import Awaitable, Callable

from jose.exceptions import JWTError

from src.backend.auth.jwt_signer import get_signer
from src.backend.config import Settings
from src.backend.errors import ForbiddenProblem, UnauthorizedProblem
from src.backend.middleware.auth import AuthPrincipal

logger = logging.getLogger(__name__)

MCP_RESOURCE = "https://nerium.com/mcp"
SUPPORTED_SCOPES = frozenset({"mcp:read", "mcp:write", "mcp:admin"})


# ---------------------------------------------------------------------------
# Verifier
# ---------------------------------------------------------------------------


def khronos_rs256_verifier(token: str, settings: Settings) -> AuthPrincipal:
    """Verify a Khronos-issued RS256 JWT against the current JWKS.

    Returns an :class:`AuthPrincipal` compatible with Aether's middleware
    stack. ``tenant_id`` defaults to ``sub`` so TenantBinding binds the
    single-user tenancy convention; downstream multi-tenant changes will
    read ``tenant_id`` from the JWT ``tid`` claim once Tethys embeds it
    at issuance.
    """

    try:
        claims = get_signer().verify(token, audience=MCP_RESOURCE)
    except JWTError as exc:
        raise UnauthorizedProblem(
            detail=f"MCP bearer token failed verification: {exc}",
        ) from exc

    sub = claims.get("sub")
    if not sub:
        raise UnauthorizedProblem(detail="MCP bearer token missing 'sub' claim.")

    raw_scope = claims.get("scope", "")
    scope_set = frozenset(s for s in raw_scope.split() if s)
    if not scope_set & SUPPORTED_SCOPES:
        raise UnauthorizedProblem(
            detail="MCP bearer token carries no supported scope (mcp:read, mcp:write, mcp:admin).",
        )

    tenant_id = str(claims.get("tid") or claims.get("tenant_id") or sub)

    return AuthPrincipal(
        user_id=str(sub),
        tenant_id=tenant_id,
        scopes=scope_set,
        issuer=str(claims.get("iss", "")),
        token_type="bearer",
        raw_claims=claims,
    )


# ---------------------------------------------------------------------------
# Principal ContextVar
# ---------------------------------------------------------------------------


_mcp_principal_ctx: contextvars.ContextVar[AuthPrincipal | None] = contextvars.ContextVar(
    "mcp_current_principal", default=None
)


def current_mcp_principal() -> AuthPrincipal:
    """Return the principal bound to the active MCP tool call.

    Raises :class:`~src.backend.errors.UnauthorizedProblem` when called
    outside a request context (tool handlers invoked before the bridge
    middleware, for instance unit tests, SHOULD call :func:`set_principal_for_tests`
    to install a fixture).
    """

    principal = _mcp_principal_ctx.get()
    if principal is None:
        raise UnauthorizedProblem(
            detail="MCP tool invoked without an authenticated principal.",
        )
    return principal


def has_scope(scope: str) -> bool:
    principal = _mcp_principal_ctx.get()
    if principal is None:
        return False
    return scope in principal.scopes


def require_scope(scope: str) -> AuthPrincipal:
    """Return the principal or raise :class:`ForbiddenProblem` on scope miss."""

    principal = current_mcp_principal()
    if scope not in principal.scopes:
        raise ForbiddenProblem(
            detail=f"MCP tool requires scope '{scope}' (have: {sorted(principal.scopes)}).",
        )
    return principal


def set_principal_for_tests(principal: AuthPrincipal | None) -> contextvars.Token:
    """Install a principal for tests. Returns the ContextVar reset token."""

    return _mcp_principal_ctx.set(principal)


def reset_principal_for_tests(token: contextvars.Token) -> None:
    _mcp_principal_ctx.reset(token)


# ---------------------------------------------------------------------------
# ASGI bridge middleware
# ---------------------------------------------------------------------------


ASGIApp = Callable[..., Awaitable[None]]


class McpPrincipalBridgeMiddleware:
    """Bridge ``request.state.auth`` into the MCP ContextVar.

    Mount this directly on the FastMCP Streamable HTTP ASGI sub-app via
    ``app.mount("/mcp", McpPrincipalBridgeMiddleware(mcp_asgi))``. By the
    time the sub-app runs, Aether's :class:`AuthMiddleware` has already
    populated ``scope["state"]["auth"]`` with an :class:`AuthPrincipal`.
    We snapshot it into the contextvar before dispatching, so FastMCP
    tool handlers can call :func:`current_mcp_principal` synchronously.

    On the ``lifespan`` scope we pass through untouched; the sub-app's
    lifespan setup has nothing to do with auth state.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope, receive, send):  # type: ignore[no-untyped-def]
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        state = scope.get("state") or {}
        principal = state.get("auth") if isinstance(state, dict) else None

        if principal is None:
            # When this middleware is mounted outside Aether's AuthMiddleware
            # (for example during tests that mount FastMCP on a minimal app)
            # we simply do not set the contextvar; tool handlers will raise
            # UnauthorizedProblem via current_mcp_principal().
            await self.app(scope, receive, send)
            return

        token = _mcp_principal_ctx.set(principal)
        try:
            await self.app(scope, receive, send)
        finally:
            _mcp_principal_ctx.reset(token)


__all__ = [
    "MCP_RESOURCE",
    "McpPrincipalBridgeMiddleware",
    "SUPPORTED_SCOPES",
    "current_mcp_principal",
    "has_scope",
    "khronos_rs256_verifier",
    "require_scope",
    "reset_principal_for_tests",
    "set_principal_for_tests",
]
