"""Download router: CDN redirect for public, signed URL for private.

Per file_storage.contract Section 4.4.

Endpoints:

- ``GET /v1/storage/files/{manifest_id}`` -> 302 to CDN (public) or
  302 to a 7-day signed URL (private). Quarantined files return 403.
  Missing manifests return 404 (not 403) to prevent enumeration.
- ``GET /v1/storage/files/{manifest_id}/signed-url`` -> JSON payload
  with signed URL + metadata. Same tenant scope as the redirect form.

We expose both shapes because:

- Widgets that embed an ``<img src>`` need a direct redirect.
- API clients that want to introspect expiry + sha256 want the JSON form.
"""

from __future__ import annotations

from datetime import UTC
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from ....storage.presigned import generate_private_download_url
from ....storage.r2_client import R2Settings, public_cdn_url
from .upload import (
    _problem_response,  # reuse the 7807 envelope helper
    get_current_tenant_id,
    get_db_pool_dep,
    get_r2_client_dep,
    get_r2_settings_dep,
)

router = APIRouter(prefix="/v1/storage", tags=["storage"])


class SignedUrlResponse(BaseModel):
    """Shape for the JSON signed-url endpoint. Contract 4.4."""

    url: str
    expires_at: str  # ISO-8601; we compute from TTL at response time
    content_type: str
    size_bytes: int
    sha256: str
    visibility: Literal["public", "private", "tenant_shared"]


PRIVATE_SIGNED_URL_TTL_SECONDS: int = 7 * 24 * 3600


async def _load_manifest_for_download(
    db_pool: Any, *, tenant_id: str, manifest_id: str
) -> dict[str, Any] | None:
    """Fetch a single manifest row under tenant RLS."""

    async with db_pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "SET LOCAL app.tenant_id = $1", str(tenant_id)
            )
            row = await conn.fetchrow(
                """
                SELECT id, r2_bucket, r2_key, content_type, size_bytes,
                       sha256, visibility, virus_scan_status
                  FROM file_storage_manifest
                 WHERE id = $1
                   AND deleted_at IS NULL
                """,
                manifest_id,
            )
            return dict(row) if row else None


def _gate_scan_status(
    manifest: dict[str, Any], instance: str
) -> None:
    """Raise problem+json errors for unsafe scan states.

    - ``pending`` -> 409 conflict (still scanning; try again)
    - ``infected`` -> 403 forbidden (quarantined; never served)
    - ``error``    -> 409 conflict (scan errored; admin must review)
    """

    status = manifest["virus_scan_status"]
    if status == "clean":
        return
    if status == "pending":
        raise _problem_response(
            409,
            "conflict",
            "virus scan still pending; try again shortly",
            instance=instance,
        )
    if status == "infected":
        raise _problem_response(
            403,
            "forbidden",
            "file quarantined as infected; access denied",
            instance=instance,
        )
    # error
    raise _problem_response(
        409,
        "conflict",
        "virus scan errored; admin review required",
        instance=instance,
    )


@router.get("/files/{manifest_id}", status_code=302)
async def redirect_to_file(
    manifest_id: str,
    request: Request,
    tenant_id: str = Depends(get_current_tenant_id),
    db_pool: Any = Depends(get_db_pool_dep),
    r2_client: Any = Depends(get_r2_client_dep),
    r2_settings: R2Settings = Depends(get_r2_settings_dep),
) -> RedirectResponse:
    """302 redirect to CDN (public) or signed R2 URL (private)."""

    manifest = await _load_manifest_for_download(
        db_pool, tenant_id=tenant_id, manifest_id=manifest_id
    )
    if manifest is None:
        # 404 (not 403) per contract 8 anti-enumeration guidance.
        raise HTTPException(status_code=404, detail="not_found")

    _gate_scan_status(manifest, instance=str(request.url.path))

    if manifest["visibility"] == "public":
        target = public_cdn_url(r2_settings, manifest["r2_key"])
    else:
        target = generate_private_download_url(
            r2_client,
            bucket=manifest["r2_bucket"],
            key=manifest["r2_key"],
            expires_in=PRIVATE_SIGNED_URL_TTL_SECONDS,
        )

    # 302 not 301: we want browsers to always revalidate the TTL.
    return RedirectResponse(url=target, status_code=302)


@router.get(
    "/files/{manifest_id}/signed-url",
    response_model=SignedUrlResponse,
    status_code=200,
)
async def get_signed_url(
    manifest_id: str,
    request: Request,
    tenant_id: str = Depends(get_current_tenant_id),
    db_pool: Any = Depends(get_db_pool_dep),
    r2_client: Any = Depends(get_r2_client_dep),
    r2_settings: R2Settings = Depends(get_r2_settings_dep),
) -> SignedUrlResponse:
    """JSON payload with the signed URL + manifest metadata."""

    from datetime import datetime, timedelta

    manifest = await _load_manifest_for_download(
        db_pool, tenant_id=tenant_id, manifest_id=manifest_id
    )
    if manifest is None:
        raise HTTPException(status_code=404, detail="not_found")

    _gate_scan_status(manifest, instance=str(request.url.path))

    if manifest["visibility"] == "public":
        url = public_cdn_url(r2_settings, manifest["r2_key"])
        # Public CDN URLs do not expire but we report a far-future
        # timestamp for schema uniformity.
        expires_at = datetime.now(UTC) + timedelta(days=365)
    else:
        url = generate_private_download_url(
            r2_client,
            bucket=manifest["r2_bucket"],
            key=manifest["r2_key"],
            expires_in=PRIVATE_SIGNED_URL_TTL_SECONDS,
        )
        expires_at = datetime.now(UTC) + timedelta(
            seconds=PRIVATE_SIGNED_URL_TTL_SECONDS
        )

    return SignedUrlResponse(
        url=url,
        expires_at=expires_at.isoformat(),
        content_type=manifest["content_type"],
        size_bytes=int(manifest["size_bytes"]),
        sha256=manifest["sha256"] or "",
        visibility=manifest["visibility"],
    )


__all__ = [
    "router",
    "SignedUrlResponse",
    "PRIVATE_SIGNED_URL_TTL_SECONDS",
]
