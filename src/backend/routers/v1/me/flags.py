"""GET /v1/me/flags: effective flag values for the authenticated caller.

Only flags tagged with ``exposed_to_user`` (or the short alias
``exposed``) are included; everything else is server-side only and
leaking them would let callers probe system config.

Contract: ``docs/contracts/feature_flag.contract.md`` Section 4.2.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Request

from src.backend.db.pool import get_pool
from src.backend.errors import UnauthorizedProblem
from src.backend.flags import service as flag_service
from src.backend.flags.schemas import EffectiveFlag, MeFlagsResponse

EXPOSED_TAGS: tuple[str, ...] = ("exposed_to_user", "exposed")
"""Tag values that mark a flag as safe to surface to end users."""

# Mounted under ``/v1`` by :func:`mount_v1_routers`; effective prefix
# is ``/v1/me``. The tenant-binding middleware binds the caller's
# tenant on every request which matches ``/me`` semantics.
router = APIRouter(prefix="/me", tags=["me"])


@router.get("/flags", response_model=MeFlagsResponse)
async def get_my_flags(request: Request) -> MeFlagsResponse:
    """Return the caller's effective value for each user-exposed flag."""

    principal = getattr(request.state, "auth", None)
    if principal is None:
        raise UnauthorizedProblem(
            detail="GET /v1/me/flags requires authentication.",
        )
    user_id = principal.user_id
    tenant_id = getattr(request.state, "tenant_id", None)

    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT flag_name, kind, tags
            FROM hemera_flag
            WHERE tags && $1::text[]
            ORDER BY flag_name ASC
            """,
            list(EXPOSED_TAGS),
        )

    out: list[EffectiveFlag] = []
    for row in rows:
        value = await flag_service.get_flag(
            row["flag_name"],
            user_id=user_id,
            tenant_id=tenant_id,
        )
        out.append(
            EffectiveFlag(
                flag_name=row["flag_name"],
                value=value,
                kind=row["kind"],
            )
        )
    return MeFlagsResponse(
        flags=out,
        evaluated_at=datetime.now(timezone.utc),
    )


__all__ = ["router"]
