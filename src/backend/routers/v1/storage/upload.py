"""Upload router: presigned POST init + upload complete.

Per file_storage.contract Section 4.1, 4.2.

Endpoints:

- ``POST /v1/storage/uploads`` -> presigned POST payload.
- ``POST /v1/storage/uploads/{manifest_id}/complete`` -> verify + enqueue.

The handlers are intentionally thin. Validation, R2 signing, and scan
enqueue are delegated to ``src/backend/storage/*`` helpers. Error
envelope conforms to RFC 7807 problem+json per rest_api_base 3.2.

Authentication + tenant binding is enforced upstream by Aether's
``TenantBindingMiddleware`` (session 2). Handlers read
``request.state.user_id`` and ``request.state.tenant_id`` which the
middleware populates. In tests we pass them via the dependency
override.

Aether forward-references
-------------------------

These modules are written by Aether sessions 1 to 2 and imported by
their final dotted paths. Chione does not redefine them; if Aether's
names differ at integration time, Harmonia-v3 is the owner of the
reconciliation audit.

- ``src.backend.db.pool.get_db_pool`` (Aether S1)
- ``src.backend.config.get_settings`` (Aether S1)
- ``src.backend.errors.problem_json.problem_response`` (Aether S2)
- ``src.backend.workers.arq_worker.get_arq_redis`` (Aether S2)
"""

from __future__ import annotations

import json
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from ....storage.clamav_scan import ARQ_JOB_SCAN_VIRUS
from ....storage.presigned import (
    ALLOWED_MIME,
    DEFAULT_UPLOAD_TTL_SECONDS,
    MAX_UPLOAD_BYTES,
    generate_presigned_post,
    validate_upload_request,
)
from ....storage.r2_client import R2Settings, get_r2_client
from ....utils.uuid7 import uuid7

router = APIRouter(prefix="/v1/storage", tags=["storage"])


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------


class UploadInitRequest(BaseModel):
    """Client payload for presigned POST init. Contract 4.1."""

    original_filename: str = Field(..., max_length=255, min_length=1)
    content_type: str = Field(..., max_length=127)
    size_bytes: int = Field(..., gt=0, le=MAX_UPLOAD_BYTES)
    visibility: Literal["public", "private", "tenant_shared"] = "private"
    reference_type: Literal[
        "listing_asset",
        "invoice_pdf",
        "ma_output",
        "gdpr_export",
        "avatar",
        "listing_thumbnail",
        "generic",
    ] = "generic"
    reference_id: str | None = Field(None, max_length=128)


class PresignedPostPayload(BaseModel):
    """Shape mirroring boto3's ``generate_presigned_post`` output."""

    url: str
    fields: dict[str, str]


class UploadInitResponse(BaseModel):
    manifest_id: str
    presigned_post: PresignedPostPayload
    expires_in: int
    max_size_bytes: int


class UploadCompleteResponse(BaseModel):
    manifest_id: str
    virus_scan_status: Literal["pending", "clean", "infected", "error"]
    r2_bucket: str
    r2_key: str
    size_bytes: int
    sha256: str


# ---------------------------------------------------------------------------
# Dependency stubs. Aether's real implementations replace these at import
# time through the app's ``dependency_overrides`` at startup. For tests
# each fixture supplies its own double.
# ---------------------------------------------------------------------------


def get_current_user_id(request: Request) -> str:
    """Read tenant-scoped user id from middleware state."""

    user_id = getattr(request.state, "user_id", None)
    if user_id is None:
        raise HTTPException(status_code=401, detail="unauthorized")
    return str(user_id)


def get_current_tenant_id(request: Request) -> str:
    tenant_id = getattr(request.state, "tenant_id", None)
    if tenant_id is None:
        raise HTTPException(status_code=401, detail="unauthorized")
    return str(tenant_id)


def get_r2_settings_dep(request: Request) -> R2Settings:
    """Pull R2Settings out of ``app.state``. Aether seeds at startup."""

    settings = getattr(request.app.state, "r2_settings", None)
    if settings is None:
        raise HTTPException(
            status_code=503, detail="storage_not_configured"
        )
    return settings


def get_r2_client_dep(
    settings: R2Settings = Depends(get_r2_settings_dep),
) -> Any:
    return get_r2_client(settings)


def get_db_pool_dep(request: Request) -> Any:
    pool = getattr(request.app.state, "db_pool", None)
    if pool is None:
        raise HTTPException(
            status_code=503, detail="database_not_ready"
        )
    return pool


def get_arq_redis_dep(request: Request) -> Any:
    queue = getattr(request.app.state, "arq_redis", None)
    if queue is None:
        raise HTTPException(
            status_code=503, detail="queue_not_ready"
        )
    return queue


def _problem_response(
    status_code: int,
    problem_slug: str,
    detail: str,
    instance: str,
    errors: list[dict[str, str]] | None = None,
) -> HTTPException:
    """Compose a 7807 problem+json HTTPException.

    Aether's ``problem_json`` exception handler converts HTTPException
    into the full envelope. We pass the slug + detail in the
    ``detail`` dict so the handler can serialize without re-inspecting.
    """

    payload: dict[str, Any] = {
        "type": f"https://nerium.com/problems/{problem_slug}",
        "title": problem_slug.replace("_", " ").title(),
        "status": status_code,
        "detail": detail,
        "instance": instance,
    }
    if errors:
        payload["errors"] = errors
    return HTTPException(status_code=status_code, detail=payload)


# ---------------------------------------------------------------------------
# Handlers
# ---------------------------------------------------------------------------


@router.post("/uploads", response_model=UploadInitResponse, status_code=200)
async def init_upload(
    payload: UploadInitRequest,
    request: Request,
    user_id: str = Depends(get_current_user_id),
    tenant_id: str = Depends(get_current_tenant_id),
    r2_client: Any = Depends(get_r2_client_dep),
    r2_settings: R2Settings = Depends(get_r2_settings_dep),
    db_pool: Any = Depends(get_db_pool_dep),
) -> UploadInitResponse:
    """Issue a presigned POST + insert a ``pending`` manifest row."""

    ok, problem = validate_upload_request(
        payload.content_type, payload.size_bytes
    )
    if not ok:
        if problem == "unsupported_media_type":
            raise _problem_response(
                415,
                "unsupported_media_type",
                f"content type {payload.content_type!r} not allowed. "
                f"allowed: {sorted(ALLOWED_MIME)}",
                instance=str(request.url.path),
            )
        if problem == "payload_too_large":
            raise _problem_response(
                413,
                "payload_too_large",
                f"size {payload.size_bytes} exceeds per-type cap or "
                f"hard limit {MAX_UPLOAD_BYTES}",
                instance=str(request.url.path),
            )
        raise _problem_response(
            400,
            "validation_failed",
            "upload request invalid",
            instance=str(request.url.path),
        )

    # UUID v7 per rest_api_base.contract Section 3.5. Time-ordered
    # primary keys give us B-tree locality for manifest queries that
    # typically filter on ``created_at DESC``.
    manifest_id = str(uuid7())

    # ``scope_id`` resolution per reference type. For per-listing
    # assets Phanes issues a listing_id ahead of upload and the client
    # passes it as ``reference_id``; Chione defaults to user_id for
    # per-user scopes (avatar, ma_output owned by user, gdpr_export).
    scope_id: str
    if payload.reference_type in ("listing_asset", "listing_thumbnail"):
        if not payload.reference_id:
            raise _problem_response(
                400,
                "validation_failed",
                "reference_id is required for listing-scoped uploads",
                instance=str(request.url.path),
                errors=[
                    {
                        "field": "reference_id",
                        "code": "required",
                        "message": "listing_id must be provided",
                    }
                ],
            )
        scope_id = payload.reference_id
    else:
        scope_id = user_id

    presigned = generate_presigned_post(
        r2_client,
        r2_settings,
        manifest_id=manifest_id,
        reference_type=payload.reference_type,  # type: ignore[arg-type]
        scope_id=scope_id,
        original_filename=payload.original_filename,
        content_type=payload.content_type,
        size_bytes=payload.size_bytes,
        visibility=payload.visibility,  # type: ignore[arg-type]
    )

    async with db_pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "SET LOCAL app.tenant_id = $1", str(tenant_id)
            )
            await conn.execute(
                """
                INSERT INTO file_storage_manifest (
                    id, tenant_id, owner_user_id, r2_bucket, r2_key,
                    original_filename, content_type, size_bytes,
                    sha256, virus_scan_status, visibility,
                    reference_type, reference_id, metadata,
                    created_at, updated_at
                ) VALUES (
                    $1, $2, $3, $4, $5,
                    $6, $7, $8,
                    '', 'pending', $9,
                    $10, $11, '{}'::jsonb,
                    now(), now()
                )
                """,
                manifest_id,
                tenant_id,
                user_id,
                presigned.r2_bucket,
                presigned.r2_key,
                payload.original_filename,
                payload.content_type,
                payload.size_bytes,
                payload.visibility,
                payload.reference_type,
                payload.reference_id,
            )

    return UploadInitResponse(
        manifest_id=manifest_id,
        presigned_post=PresignedPostPayload(
            url=presigned.url, fields=presigned.fields
        ),
        expires_in=presigned.expires_in,
        max_size_bytes=presigned.max_size_bytes,
    )


@router.post(
    "/uploads/{manifest_id}/complete",
    response_model=UploadCompleteResponse,
    status_code=200,
)
async def complete_upload(
    manifest_id: str,
    request: Request,
    tenant_id: str = Depends(get_current_tenant_id),
    r2_client: Any = Depends(get_r2_client_dep),
    db_pool: Any = Depends(get_db_pool_dep),
    arq_redis: Any = Depends(get_arq_redis_dep),
) -> UploadCompleteResponse:
    """Verify the R2 object exists + size matches; enqueue scan.

    1. Tenant-scoped SELECT on the manifest row (RLS enforces).
    2. HEAD the R2 object. If 404, surface 410 gone (client retry init).
       If size mismatch, quarantine + reject.
    3. Compute SHA256 via streaming GET (done here for single-pass;
       large files can be deferred into the scan worker if latency
       becomes an issue).
    4. UPDATE manifest with sha256 + keep ``virus_scan_status=pending``.
    5. Enqueue ``storage_scan`` Arq job.
    """

    # Step 1: load manifest
    async with db_pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "SET LOCAL app.tenant_id = $1", str(tenant_id)
            )
            row = await conn.fetchrow(
                """
                SELECT id, r2_bucket, r2_key, size_bytes,
                       virus_scan_status, content_type
                  FROM file_storage_manifest
                 WHERE id = $1
                """,
                manifest_id,
            )

    if row is None:
        raise _problem_response(
            404,
            "not_found",
            f"manifest {manifest_id} not found",
            instance=str(request.url.path),
        )

    if row["virus_scan_status"] != "pending":
        # Idempotent: already completed. Return current state rather
        # than re-enqueueing a scan.
        return UploadCompleteResponse(
            manifest_id=manifest_id,
            virus_scan_status=row["virus_scan_status"],
            r2_bucket=row["r2_bucket"],
            r2_key=row["r2_key"],
            size_bytes=row["size_bytes"],
            sha256="",
        )

    # Step 2: HEAD R2
    import asyncio

    try:
        head = await asyncio.to_thread(
            r2_client.head_object,
            Bucket=row["r2_bucket"],
            Key=row["r2_key"],
        )
    except Exception as exc:  # noqa: BLE001
        raise _problem_response(
            410,
            "gone",
            "object not found at R2; re-initialize upload",
            instance=str(request.url.path),
        ) from exc

    actual_size = int(head.get("ContentLength", 0))
    if actual_size != int(row["size_bytes"]):
        # Size mismatch is a trust violation. Mark error + delete R2
        # object to avoid orphan storage. Admin reviews via Eunomia.
        async with db_pool.acquire() as conn:
            async with conn.transaction():
                await conn.execute(
                    "SET LOCAL app.tenant_id = $1", str(tenant_id)
                )
                await conn.execute(
                    """
                    UPDATE file_storage_manifest
                       SET virus_scan_status = 'error',
                           virus_scan_result = $1::jsonb,
                           updated_at        = now()
                     WHERE id = $2
                    """,
                    json.dumps(
                        {
                            "error": "size_mismatch",
                            "claimed": int(row["size_bytes"]),
                            "actual": actual_size,
                        }
                    ),
                    manifest_id,
                )
        try:
            await asyncio.to_thread(
                r2_client.delete_object,
                Bucket=row["r2_bucket"],
                Key=row["r2_key"],
            )
        except Exception:  # noqa: BLE001 - swept by expiry cron
            pass
        raise _problem_response(
            422,
            "unprocessable_entity",
            "upload size did not match claimed size",
            instance=str(request.url.path),
        )

    # Step 3: SHA256 streaming
    import hashlib

    hasher = hashlib.sha256()

    def _hash_object() -> str:
        resp = r2_client.get_object(
            Bucket=row["r2_bucket"], Key=row["r2_key"]
        )
        body = resp["Body"]
        try:
            while True:
                chunk = body.read(64 * 1024)
                if not chunk:
                    break
                hasher.update(chunk)
        finally:
            try:
                body.close()
            except Exception:  # pragma: no cover
                pass
        return hasher.hexdigest()

    sha256_hex = await asyncio.to_thread(_hash_object)

    # Step 4: UPDATE manifest sha256
    async with db_pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "SET LOCAL app.tenant_id = $1", str(tenant_id)
            )
            await conn.execute(
                """
                UPDATE file_storage_manifest
                   SET sha256     = $1,
                       updated_at = now()
                 WHERE id = $2
                """,
                sha256_hex,
                manifest_id,
            )

    # Step 5: enqueue ClamAV scan (async; do not block response)
    await arq_redis.enqueue_job(ARQ_JOB_SCAN_VIRUS, manifest_id)

    return UploadCompleteResponse(
        manifest_id=manifest_id,
        virus_scan_status="pending",
        r2_bucket=row["r2_bucket"],
        r2_key=row["r2_key"],
        size_bytes=int(row["size_bytes"]),
        sha256=sha256_hex,
    )


# Export upload TTL default so Khronos + Phanes can surface the same
# value in their own UI copy.
UPLOAD_TTL_SECONDS: int = DEFAULT_UPLOAD_TTL_SECONDS

__all__ = [
    "router",
    "UploadInitRequest",
    "UploadInitResponse",
    "UploadCompleteResponse",
    "UPLOAD_TTL_SECONDS",
]
