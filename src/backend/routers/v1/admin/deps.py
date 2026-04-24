"""Shared dependencies for the admin v1 routers.

- :func:`require_admin_scope` asserts the authenticated principal has
  either the broad ``admin`` scope or the pillar-specific scope
  (``admin:flags`` for the Hemera router). Missing scope yields 403
  problem+json.
- :func:`get_actor_id` returns the actor UUID from the JWT ``sub``
  claim for audit attribution.

Kept narrow on purpose: Eunomia (W2 admin panel owner) may layer an
impersonation cookie on top, in which case these helpers become the
single point that converts "headers to identity" into a UUID.
"""

from __future__ import annotations

from typing import Iterable
from uuid import UUID

from fastapi import Request

from src.backend.errors import ForbiddenProblem, UnauthorizedProblem
from src.backend.middleware.auth import AuthPrincipal

ADMIN_SCOPES_BROAD: tuple[str, ...] = ("admin",)
"""Scopes that grant access to every ``/v1/admin/*`` router."""


def require_admin_scope(*, pillar_scope: str | None = None) -> object:
    """Return a FastAPI dependency callable that enforces admin auth.

    Usage::

        router.get(
            "/flags",
            dependencies=[Depends(require_admin_scope(pillar_scope='admin:flags'))],
        )

    The returned callable returns the :class:`AuthPrincipal` so the route
    handler can still fetch it via ``Depends`` if it wants the actor id
    without reading ``request.state``.
    """

    accepted: tuple[str, ...] = ADMIN_SCOPES_BROAD
    if pillar_scope:
        accepted = (*accepted, pillar_scope)

    async def _dep(request: Request) -> AuthPrincipal:
        principal = _principal(request)
        if not _has_any_scope(principal.scopes, accepted):
            raise ForbiddenProblem(
                detail=(
                    "Admin scope required. Present one of: "
                    f"{', '.join(accepted)}."
                ),
            )
        return principal

    return _dep


def get_actor_id(request: Request) -> UUID:
    """Return the authenticated actor's UUID. Raises 401 on missing auth.

    Admin mutations bind this UUID as ``hemera.actor_id`` so the audit
    trigger attributes the row to the correct user.
    """

    principal = _principal(request)
    try:
        return UUID(principal.user_id)
    except (TypeError, ValueError) as exc:
        raise UnauthorizedProblem(
            detail="JWT sub claim is not a valid UUID."
        ) from exc


def _principal(request: Request) -> AuthPrincipal:
    principal = getattr(request.state, "auth", None)
    if not isinstance(principal, AuthPrincipal):
        raise UnauthorizedProblem(
            detail="Admin endpoint requires an authenticated principal.",
        )
    return principal


def _has_any_scope(scopes: Iterable[str], accepted: Iterable[str]) -> bool:
    scope_set = set(scopes)
    return any(scope in scope_set for scope in accepted)


__all__ = [
    "ADMIN_SCOPES_BROAD",
    "get_actor_id",
    "require_admin_scope",
]
