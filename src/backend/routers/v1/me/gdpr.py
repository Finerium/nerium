"""GDPR endpoints mounted under ``/v1/me/*``.

Owner: Eunomia (W2 NP P6 S1).

Endpoints
---------
- ``POST /v1/me/gdpr/export``: synchronous ZIP download of the caller's
  data footprint. Returns ``application/zip`` inline. Payload cap
  :data:`src.backend.gdpr.export.MAX_EXPORT_PAYLOAD_BYTES`; over the
  cap returns 413 with problem+json (async Arq path DEFERRED S2 CUT).
- ``POST /v1/me/gdpr/delete``: soft-delete the caller's account +
  revoke every live session. Full purge cron DEFERRED post-submit.

Auth
----
Both endpoints require a bearer token. No admin scope required; a user
owns their own data and can export or delete without admin approval.
Future iteration: add a "reason" prompt + 24h grace period per Zirngibl
compliance guidance; for the hackathon wave the delete is immediate.
"""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Request, Response
from pydantic import ConfigDict

from src.backend.errors import UnauthorizedProblem
from src.backend.gdpr import delete as delete_service
from src.backend.gdpr import export as export_service
from src.backend.models.base import NeriumModel

logger = logging.getLogger(__name__)

# Mounted under ``/v1`` -> effective ``/v1/me/gdpr/*``.
router = APIRouter(prefix="/me/gdpr", tags=["me-gdpr"])


class DeleteResponse(NeriumModel):
    """Wire shape for the soft-delete route."""

    model_config = ConfigDict(extra="forbid")

    user_id: UUID
    deleted_at: str
    purge_at: str
    sessions_revoked: int
    already_deleted: bool
    # async path DEFERRED per P6 Pack V4 #6 CUT; frontend may render
    # this string verbatim next to the confirmation toast.
    note: str = (
        "Your account has been soft-deleted and will be purged in 30 days. "
        "Contact support within the window if you change your mind."
    )


@router.post(
    "/export",
    responses={
        200: {
            "description": "ZIP bundle of the caller's NERIUM footprint.",
            "content": {"application/zip": {}},
        },
        413: {"description": "Payload exceeds synchronous export cap."},
    },
)
async def export_my_data(request: Request) -> Response:
    """Assemble + return a ZIP of the caller's data.

    The ZIP contains ``manifest.json`` at the root plus one
    ``tables/<name>.json`` file per table with rows.
    """

    user_id = _caller_uuid(request)
    zip_bytes = await export_service.build_user_export(user_id)
    filename = f"nerium-export-{user_id}.zip"
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={
            "content-disposition": f"attachment; filename=\"{filename}\"",
            "cache-control": "no-store",
        },
    )


@router.post("/delete", response_model=DeleteResponse)
async def delete_my_account(request: Request) -> DeleteResponse:
    """Soft-delete the caller's account + revoke every session."""

    user_id = _caller_uuid(request)
    result = await delete_service.delete_user_account(user_id=user_id)
    return DeleteResponse(
        user_id=result.user_id,
        deleted_at=result.deleted_at.isoformat(),
        purge_at=result.purge_at.isoformat(),
        sessions_revoked=result.sessions_revoked,
        already_deleted=result.already_deleted,
    )


def _caller_uuid(request: Request) -> UUID:
    """Return the authenticated principal's user UUID or raise 401."""

    principal = getattr(request.state, "auth", None)
    if principal is None:
        raise UnauthorizedProblem(
            detail="GDPR endpoints require an authenticated principal.",
        )
    try:
        return UUID(principal.user_id)
    except (TypeError, ValueError) as exc:
        raise UnauthorizedProblem(
            detail="JWT sub claim is not a valid UUID.",
        ) from exc


__all__ = ["router"]
