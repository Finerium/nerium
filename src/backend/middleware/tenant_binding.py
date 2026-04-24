"""Tenant binding middleware.

Owner: Aether (W1 Session 2). Reads the authenticated principal that
:class:`~src.backend.middleware.auth.AuthMiddleware` placed on
``request.state.auth`` and copies its ``tenant_id`` onto
``request.state.tenant_id`` so route handlers and query helpers can
call :func:`src.backend.db.tenant.tenant_scoped` without re-parsing the
JWT.

Why separate from auth
----------------------
Authentication answers "who is this"; tenant binding answers "whose
data do they see". Splitting the two keeps auth reusable (public APIs
that expose read-only aggregates across tenants can still want token
introspection without binding), keeps route code trivial (``tenant_id
= request.state.tenant_id``), and lets tests exercise each concern in
isolation.

DB session variable note
------------------------
Per :mod:`src.backend.db.tenant` the Postgres GUC ``app.tenant_id`` is
set inside a transaction via ``SET LOCAL`` using the
:func:`tenant_scoped` context manager. This middleware DOES NOT touch
the DB directly; it only records the tenant on ``request.state`` so
handler code can feed it into ``tenant_scoped`` at query time. Binding
at the middleware layer instead of in the pool checkout keeps the
request path RLS-safe across background tasks and SSE streams that
hold a connection for the entire request duration.

Contract references
-------------------
- ``docs/contracts/rest_api_base.contract.md`` Section 4.1 (middleware
  ordering: TenantBinding is the innermost layer).
- ``docs/contracts/postgres_multi_tenant.contract.md`` Section 4.2
  (``app.tenant_id`` GUC + ``tenant_scoped`` helper).
"""

from __future__ import annotations

import logging
from typing import Awaitable, Callable, Iterable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from src.backend.errors import ForbiddenProblem
from src.backend.errors.problem_json import problem_response
from src.backend.middleware.auth import (
    DEFAULT_PUBLIC_PATHS,
    DEFAULT_PUBLIC_PREFIXES,
    AuthPrincipal,
)

logger = logging.getLogger(__name__)


DEFAULT_CROSS_TENANT_PATHS: tuple[str, ...] = (
    "/admin",
)
"""Paths where cross-tenant admin reads are expected.

Admin panel (SQLAdmin) uses a dedicated migration role with BYPASSRLS
so binding a tenant here is both unnecessary and potentially harmful
(would force the admin to pick a tenant before listing all of them).
Eunomia's impersonation middleware sets ``request.state.tenant_id``
explicitly when an admin chooses to act as a specific tenant.

The auth middleware's ``DEFAULT_PUBLIC_PATHS`` is reused here so routes
that bypass auth also bypass tenant binding; the exact-path set is
centralised to a single definition to keep the two middlewares in sync.
"""


class TenantBindingMiddleware(BaseHTTPMiddleware):
    """Copy ``request.state.auth.tenant_id`` to ``request.state.tenant_id``.

    Skips:
    - Public paths (same set as :mod:`auth` middleware).
    - Cross-tenant admin paths (``/admin*``).
    - Requests lacking ``request.state.auth`` (only possible if an earlier
      middleware misorder lets us run before auth; we return 403 to
      surface the bug rather than silently pass).
    """

    def __init__(
        self,
        app: object,
        *,
        public_paths: Iterable[str] = DEFAULT_PUBLIC_PATHS,
        public_prefixes: Iterable[str] = DEFAULT_PUBLIC_PREFIXES,
        cross_tenant_prefixes: Iterable[str] = DEFAULT_CROSS_TENANT_PATHS,
    ) -> None:
        super().__init__(app)
        self._public_paths = frozenset(public_paths)
        self._public_prefixes = tuple(public_prefixes)
        self._cross_tenant_prefixes = tuple(cross_tenant_prefixes)

    def _is_skipped(self, path: str) -> bool:
        if path in self._public_paths:
            return True
        for prefix in self._public_prefixes:
            if path.startswith(prefix):
                return True
        for prefix in self._cross_tenant_prefixes:
            if path.startswith(prefix):
                return True
        return False

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        path = request.url.path

        if self._is_skipped(path) or request.method == "OPTIONS":
            return await call_next(request)

        principal: AuthPrincipal | None = getattr(request.state, "auth", None)
        if principal is None:
            # Auth middleware should have enforced presence before we reach
            # here. A missing principal indicates a stack misorder or a
            # custom route that disabled AuthMiddleware but forgot to register
            # a cross-tenant exemption. Surface a 403 so the operator fixes
            # the bug rather than leaking tenant-unbound queries.
            logger.warning(
                "tenant_binding.principal_missing",
                extra={"path": path, "method": request.method},
            )
            exc = ForbiddenProblem(
                detail=(
                    "Tenant binding could not find an authenticated principal. "
                    "This is a server configuration error."
                ),
            )
            return problem_response(
                exc.to_problem(
                    instance=path,
                    request_id=request.headers.get("x-request-id"),
                )
            )

        request.state.tenant_id = principal.tenant_id
        return await call_next(request)


def install_tenant_binding(
    app: object,
    *,
    public_paths: Iterable[str] = DEFAULT_PUBLIC_PATHS,
    public_prefixes: Iterable[str] = DEFAULT_PUBLIC_PREFIXES,
    cross_tenant_prefixes: Iterable[str] = DEFAULT_CROSS_TENANT_PATHS,
) -> None:
    """Register :class:`TenantBindingMiddleware` on the app."""

    app.add_middleware(  # type: ignore[attr-defined]
        TenantBindingMiddleware,
        public_paths=tuple(public_paths),
        public_prefixes=tuple(public_prefixes),
        cross_tenant_prefixes=tuple(cross_tenant_prefixes),
    )


__all__ = [
    "DEFAULT_CROSS_TENANT_PATHS",
    "TenantBindingMiddleware",
    "install_tenant_binding",
]
