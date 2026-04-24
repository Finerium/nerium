"""Authentication middleware.

Owner: Aether (W1 Session 2). Extracts the ``Authorization: Bearer ...``
header (or NERIUM session cookie in a future iteration), verifies the
token, and populates ``request.state.auth`` with a typed principal so
downstream middleware and route handlers can make authorisation
decisions without re-parsing the header.

Pluggable verifier
------------------
Khronos (OAuth issuer, see ``src/backend/auth/``) will eventually sign
tokens with RS256 using JWKS; Aether's middleware consumes those
tokens. To keep Session 2 testable without a live issuer we accept a
pluggable ``verify_token`` callable. The default implementation
validates an HS256 JWT using ``settings.secret_key``; Khronos injects
an RS256-aware verifier at mount time once its issuer session lands.

Usage::

    from src.backend.middleware.auth import AuthMiddleware, install_auth

    install_auth(app, settings=settings)

Contract references
-------------------
- ``docs/contracts/rest_api_base.contract.md`` Section 4.1 (ordering,
  sixth layer), Section 4.3 (bearer + cookie schemes).
- ``docs/contracts/oauth_dcr.contract.md`` (token shape; RS256 issuer).
- ``docs/contracts/redis_session.contract.md`` Section 4.3 (session
  cookie envelope, reserved for a later iteration).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Awaitable, Callable, Iterable

from jose import jwt
from jose.exceptions import JWTError
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from src.backend.config import Settings
from src.backend.errors import UnauthorizedProblem
from src.backend.errors.problem_json import problem_response

logger = logging.getLogger(__name__)

DEFAULT_PUBLIC_PATHS: tuple[str, ...] = (
    "/healthz",
    "/readyz",
    "/version",
    "/metrics",
    "/openapi.json",
    "/docs",
    "/docs-swagger",
    "/redoc",
    # Aether-owned router mount probe used by Nemea-RV-v2 E2E smoke
    # tests to verify the /v1 prefix is live. Returns no tenant data.
    "/v1/__placeholder",
)
"""Paths that bypass auth entirely. Docs + health probes + OpenAPI spec."""

DEFAULT_PUBLIC_PREFIXES: tuple[str, ...] = (
    "/.well-known/",
    "/oauth/",
    "/problems/",
)
"""Path prefixes that bypass auth. OAuth discovery + problem type pages."""


DEFAULT_PUBLIC_SUFFIXES: tuple[str, ...] = (
    # Kratos W2 S2: MA session SSE endpoint. Browser ``EventSource``
    # cannot set ``Authorization`` headers so the endpoint consumes
    # either a query-param ``?ticket=<jwt>`` (Nike realtime ticket)
    # or an inline ``Authorization: Bearer <jwt>`` for server-side
    # callers. Both paths resolve an :class:`AuthPrincipal`
    # explicitly inside the handler via
    # :func:`src.backend.ma.sse_stream.resolve_sse_principal`, so we
    # skip the middleware here rather than reject bare ``EventSource``
    # connections pre-handler.
    "/stream",
)
"""Path suffixes that bypass auth. SSE endpoints that self-authenticate
via realtime ticket or explicit bearer inside the handler."""


@dataclass(frozen=True)
class AuthPrincipal:
    """Authenticated caller identity.

    ``scopes`` is a frozenset for cheap membership tests in authorisation
    checks. ``raw_claims`` preserves the full decoded JWT for advanced
    callers (Khronos audit logger, Eunomia admin surface) without
    forcing them through the middleware state again.
    """

    user_id: str
    tenant_id: str
    scopes: frozenset[str] = field(default_factory=frozenset)
    issuer: str = ""
    token_type: str = "bearer"
    raw_claims: dict[str, object] = field(default_factory=dict)


TokenVerifier = Callable[[str, Settings], AuthPrincipal]
"""Signature for pluggable verifiers.

Implementations MUST raise :class:`UnauthorizedProblem` on any failure;
never return ``None``. Khronos injects its RS256/JWKS implementation
via :func:`install_auth` (``verifier=...``) once that module lands.
"""


def _default_hs256_verifier(token: str, settings: Settings) -> AuthPrincipal:
    """Decode an HS256 JWT signed with the app secret key.

    This is the *development* verifier. Production binds an RS256
    verifier via Khronos. The claim names mirror the Khronos token
    contract so the verifier swap is a no-op for downstream code.
    """

    try:
        claims = jwt.decode(
            token,
            settings.secret_key.get_secret_value(),
            algorithms=["HS256"],
            options={"require_sub": True},
        )
    except JWTError as exc:
        raise UnauthorizedProblem(
            detail="Bearer token failed signature or expiry validation.",
        ) from exc

    sub = claims.get("sub")
    tenant_id = claims.get("tenant_id") or claims.get("tid")
    if not sub or not tenant_id:
        raise UnauthorizedProblem(
            detail="Bearer token missing 'sub' or 'tenant_id' claim.",
        )

    raw_scopes = claims.get("scope") or claims.get("scopes") or ""
    if isinstance(raw_scopes, str):
        scope_set = frozenset(s for s in raw_scopes.split() if s)
    elif isinstance(raw_scopes, (list, tuple, set)):
        scope_set = frozenset(str(s) for s in raw_scopes if s)
    else:
        scope_set = frozenset()

    return AuthPrincipal(
        user_id=str(sub),
        tenant_id=str(tenant_id),
        scopes=scope_set,
        issuer=str(claims.get("iss", "")),
        token_type="bearer",
        raw_claims=claims,
    )


class AuthMiddleware(BaseHTTPMiddleware):
    """Bearer-token authentication middleware.

    Paths listed in :data:`DEFAULT_PUBLIC_PATHS` (or extended via the
    ``public_paths``/``public_prefixes`` constructor arguments) bypass
    auth entirely. Every other request MUST present a bearer token; a
    missing or invalid token yields 401 problem+json.

    On success ``request.state.auth`` is populated with an
    :class:`AuthPrincipal` and the request continues into the stack.
    """

    def __init__(
        self,
        app: object,
        *,
        settings: Settings,
        verifier: TokenVerifier | None = None,
        public_paths: Iterable[str] = DEFAULT_PUBLIC_PATHS,
        public_prefixes: Iterable[str] = DEFAULT_PUBLIC_PREFIXES,
        public_suffixes: Iterable[str] = DEFAULT_PUBLIC_SUFFIXES,
    ) -> None:
        super().__init__(app)
        self._settings = settings
        self._verifier: TokenVerifier = verifier or _default_hs256_verifier
        self._public_paths = frozenset(public_paths)
        self._public_prefixes = tuple(public_prefixes)
        self._public_suffixes = tuple(public_suffixes)

    def is_public(self, path: str) -> bool:
        """Return True when ``path`` does not require authentication."""

        if path in self._public_paths:
            return True
        for prefix in self._public_prefixes:
            if path.startswith(prefix):
                return True
        for suffix in self._public_suffixes:
            if path.endswith(suffix):
                return True
        return False

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        path = request.url.path

        # Public routes skip both token parsing and state population. Later
        # middleware (TenantBinding) checks ``hasattr(request.state, 'auth')``.
        if self.is_public(path):
            return await call_next(request)

        # Preflight OPTIONS passes through; CORS middleware already handles
        # the handshake before we see it, but defensive: auth should never
        # block an OPTIONS.
        if request.method == "OPTIONS":
            return await call_next(request)

        authorization = request.headers.get("authorization", "")
        if not authorization:
            return self._unauthorized(
                request,
                detail="Authorization header is missing. Present a bearer token.",
            )

        scheme, _, token = authorization.partition(" ")
        if scheme.lower() != "bearer" or not token:
            return self._unauthorized(
                request,
                detail="Authorization header must use the 'Bearer <token>' scheme.",
            )

        try:
            principal = self._verifier(token, self._settings)
        except UnauthorizedProblem as exc:
            return self._unauthorized(
                request,
                detail=exc.detail or "Bearer token rejected by verifier.",
            )
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("auth.verifier.exception", exc_info=exc)
            return self._unauthorized(
                request,
                detail="Bearer token could not be verified.",
            )

        request.state.auth = principal
        return await call_next(request)

    def _unauthorized(self, request: Request, *, detail: str) -> Response:
        """Build a 401 problem+json response carrying the correlation id."""

        exc = UnauthorizedProblem(detail=detail)
        request_id = request.headers.get("x-request-id")
        try:
            from asgi_correlation_id.context import correlation_id

            if correlation_id.get():
                request_id = correlation_id.get()
        except ImportError:  # pragma: no cover
            pass
        problem = exc.to_problem(
            instance=str(request.url.path),
            request_id=request_id,
        )
        return problem_response(problem, headers={"WWW-Authenticate": "Bearer"})


def install_auth(
    app: object,
    *,
    settings: Settings,
    verifier: TokenVerifier | None = None,
    public_paths: Iterable[str] = DEFAULT_PUBLIC_PATHS,
    public_prefixes: Iterable[str] = DEFAULT_PUBLIC_PREFIXES,
    public_suffixes: Iterable[str] = DEFAULT_PUBLIC_SUFFIXES,
) -> None:
    """Attach :class:`AuthMiddleware` to the given FastAPI/Starlette app.

    Keeps the add_middleware call site in ``main.py`` short and lets
    Khronos override the verifier in a single place when its issuer
    session lands.
    """

    app.add_middleware(  # type: ignore[attr-defined]
        AuthMiddleware,
        settings=settings,
        verifier=verifier,
        public_paths=tuple(public_paths),
        public_prefixes=tuple(public_prefixes),
        public_suffixes=tuple(public_suffixes),
    )


__all__ = [
    "AuthMiddleware",
    "AuthPrincipal",
    "DEFAULT_PUBLIC_PATHS",
    "DEFAULT_PUBLIC_PREFIXES",
    "DEFAULT_PUBLIC_SUFFIXES",
    "TokenVerifier",
    "install_auth",
]
