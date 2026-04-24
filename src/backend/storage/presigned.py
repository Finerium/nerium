"""Presigned POST generator for Cloudflare R2.

Per file_storage.contract.md Section 4.1 + Section 3.3 (content-type
allow-list) + Section 7 (naming convention).

The flow:

1. Client calls ``POST /v1/storage/uploads`` with filename, content-type,
   size, visibility, reference type. Router handler validates against
   the allow-list here and computes the R2 object key.
2. This module signs a policy permitting exactly that key + content-type
   + size range + 15-minute expiry.
3. Client POSTs directly to the R2 bucket URL with the returned form
   fields + file bytes. R2 enforces the policy server-side and rejects
   any deviation.
4. Client then calls ``POST /v1/storage/uploads/{manifest_id}/complete``
   which issues a HEAD against R2, computes SHA256, enqueues the
   ClamAV scan Arq job.

Why presigned POST (not PUT):

- POST permits a multipart form with policy conditions that bind the
  ``Content-Length-Range`` and exact ``key`` ahead of the upload. This
  is the only way to enforce a 25 MB cap without proxying bytes
  through FastAPI, which would blow the Hetzner CX32 memory budget and
  double egress cost.
- POST is the documented Cloudflare R2 browser-upload flow (see
  Cloudflare R2 docs presigned URLs section).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from ..utils.uuid7 import uuid7
from .r2_client import R2Settings

# Per contract Section 3.3. Values are per-MIME size caps in bytes.
# The router validates the client's claimed size against the matching
# entry before signing. 25 MB is the hard MVP cap regardless of MIME.
ALLOWED_MIME: dict[str, int] = {
    # Images
    "image/png": 10 * 1024 * 1024,
    "image/jpeg": 10 * 1024 * 1024,
    "image/webp": 10 * 1024 * 1024,
    "image/gif": 5 * 1024 * 1024,
    "image/svg+xml": 2 * 1024 * 1024,
    # Documents
    "application/pdf": 25 * 1024 * 1024,
    # Archives
    "application/zip": 25 * 1024 * 1024,
    "application/x-tar": 25 * 1024 * 1024,
    "application/gzip": 25 * 1024 * 1024,
    # Audio
    "audio/mpeg": 20 * 1024 * 1024,
    "audio/wav": 20 * 1024 * 1024,
    "audio/ogg": 20 * 1024 * 1024,
    # Text
    "text/plain": 5 * 1024 * 1024,
    "application/json": 5 * 1024 * 1024,
    "application/x-yaml": 5 * 1024 * 1024,
    # Model artifacts (safetensors, onnx, etc.)
    "application/octet-stream": 25 * 1024 * 1024,
}

# Hard cap regardless of MIME-specific allowance. Ghaisan-locked per
# contract Section 3.3 + M1 E.28 + agent_structure Section 4.13.
MAX_UPLOAD_BYTES: int = 25 * 1024 * 1024

# Per contract Section 4.1. R2 is documented to permit up to 7 days on
# a signed URL; we use 900s for uploads (15 minutes) to minimize abuse
# window while allowing retries on flaky client connections.
DEFAULT_UPLOAD_TTL_SECONDS: int = 900

Visibility = Literal["public", "private", "tenant_shared"]
ReferenceType = Literal[
    "listing_asset",
    "invoice_pdf",
    "ma_output",
    "gdpr_export",
    "avatar",
    "listing_thumbnail",
    "generic",
]

# Public-visibility reference types live in ``nerium-public``; everything
# else lives in ``nerium-private``. Quarantine bucket is write-only from
# the scanner's perspective. See contract Section 3.2 bucket layout.
_PUBLIC_REFERENCE_TYPES: frozenset[str] = frozenset(
    {"avatar", "listing_thumbnail"}
)


@dataclass(frozen=True)
class PresignedPost:
    """Return shape for a freshly-generated presigned POST.

    Mirrors ``UploadInitResponse`` in contract 4.1. ``fields`` is the
    dict of form fields boto3 produces; the client must include all of
    them verbatim in the multipart POST to R2.
    """

    manifest_id: str
    r2_bucket: str
    r2_key: str
    url: str
    fields: dict[str, str]
    expires_in: int
    max_size_bytes: int


def validate_upload_request(
    content_type: str, size_bytes: int
) -> tuple[bool, str | None]:
    """Check MIME allow-list and per-type size cap.

    Returns ``(True, None)`` on success, ``(False, reason_slug)`` where
    the slug maps to a problem+json ``type`` per rest_api_base.contract
    Section 3.2. Router converts the slug into a 415 / 413 response.
    """

    if content_type not in ALLOWED_MIME:
        return False, "unsupported_media_type"

    if size_bytes <= 0:
        return False, "validation_failed"

    per_type_cap = ALLOWED_MIME[content_type]
    if size_bytes > per_type_cap or size_bytes > MAX_UPLOAD_BYTES:
        return False, "payload_too_large"

    return True, None


def compose_r2_key(
    reference_type: ReferenceType,
    scope_id: str,
    original_filename: str,
    manifest_id: str | None = None,
) -> str:
    """Compose the object key per contract Section 7 convention.

    Format: ``<reference_type>/<scope_id>/<uuid>.<ext>``.

    ``scope_id`` is the tenant-scoped identifier appropriate for the
    reference type: user_id for avatar, listing_id for listing_asset +
    listing_thumbnail, invoice_id for invoice_pdf, etc. The caller (the
    router) is responsible for passing the right scope.

    ``manifest_id`` doubles as the object's UUID when provided; this
    keeps the R2 key in lockstep with the database manifest row and
    simplifies debugging ("show me R2 object ``avatars/USERID/MID.png``
    and manifest row ``MID``").
    """

    _, _, ext = original_filename.rpartition(".")
    ext = ext.lower() if ext else "bin"

    # Strip anything pathological from ext; cap length.
    safe_ext = "".join(c for c in ext if c.isalnum())[:10] or "bin"

    # UUID v7 matches rest_api_base.contract Section 3.5 primary-key
    # convention. Callers typically pass ``manifest_id`` so the R2 key
    # tracks the DB row id 1:1; only synthetic test callers rely on the
    # fallback.
    object_uuid = manifest_id or str(uuid7())
    return f"{reference_type}/{scope_id}/{object_uuid}.{safe_ext}"


def select_bucket(
    settings: R2Settings,
    visibility: Visibility,
    reference_type: ReferenceType,
) -> str:
    """Return the destination bucket per contract Section 3.2.

    Public-visibility avatars + listing thumbnails always land in
    ``nerium-public``. Everything else lands in ``nerium-private``.
    ``tenant_shared`` is still private at the bucket level; RLS +
    signed URLs handle cross-user access within a tenant.
    """

    if visibility == "public" and reference_type in _PUBLIC_REFERENCE_TYPES:
        return settings.bucket_public
    return settings.bucket_private


def generate_presigned_post(
    r2_client: Any,
    settings: R2Settings,
    *,
    manifest_id: str,
    reference_type: ReferenceType,
    scope_id: str,
    original_filename: str,
    content_type: str,
    size_bytes: int,
    visibility: Visibility = "private",
    expires_in: int = DEFAULT_UPLOAD_TTL_SECONDS,
) -> PresignedPost:
    """Produce a presigned POST binding R2 to exact key + type + size.

    Policy conditions:

    - ``bucket`` exact match (implied by target URL).
    - ``key`` exact match (prevents path traversal / overwrite).
    - ``Content-Type`` exact match (MIME spoof mitigation layer 1;
      layer 2 is post-upload python-magic scan in the complete handler).
    - ``Content-Length-Range`` min=1, max=<size_bytes> (R2 enforces).
    - ``x-amz-meta-manifest-id`` echoes the manifest row id so the
      server can reconcile on the complete handler.

    The boto3 signature produces a ``{url, fields}`` dict. We wrap it in
    a typed dataclass plus the bucket + key + TTL so routers do not
    need to re-derive them.

    Parameters
    ----------
    r2_client
        boto3 S3 client from ``get_r2_client(settings)``.
    settings
        R2 settings snapshot (endpoints + bucket names).
    manifest_id
        UUID v7 from the caller (router). Used in the object key +
        ``x-amz-meta-manifest-id`` metadata.
    reference_type, scope_id, original_filename
        Forwarded to ``compose_r2_key``.
    content_type, size_bytes
        Forwarded into the signing policy. Caller MUST have run
        ``validate_upload_request`` first; this function trusts inputs.
    visibility
        Drives ``select_bucket``. Defaults to ``private`` (safe).
    expires_in
        TTL in seconds. Hard upper bound is 7 days per R2 v4 signature
        spec; we default to 900s.
    """

    bucket = select_bucket(settings, visibility, reference_type)
    key = compose_r2_key(
        reference_type=reference_type,
        scope_id=scope_id,
        original_filename=original_filename,
        manifest_id=manifest_id,
    )

    conditions: list[Any] = [
        {"bucket": bucket},
        {"key": key},
        {"Content-Type": content_type},
        ["content-length-range", 1, size_bytes],
        {"x-amz-meta-manifest-id": manifest_id},
    ]

    fields: dict[str, str] = {
        "Content-Type": content_type,
        "x-amz-meta-manifest-id": manifest_id,
    }

    signed: dict[str, Any] = r2_client.generate_presigned_post(
        Bucket=bucket,
        Key=key,
        Fields=fields,
        Conditions=conditions,
        ExpiresIn=expires_in,
    )

    return PresignedPost(
        manifest_id=manifest_id,
        r2_bucket=bucket,
        r2_key=key,
        url=signed["url"],
        fields=signed["fields"],
        expires_in=expires_in,
        max_size_bytes=size_bytes,
    )


def generate_private_download_url(
    r2_client: Any,
    *,
    bucket: str,
    key: str,
    expires_in: int = 7 * 24 * 3600,
) -> str:
    """Sign a 7-day GET URL for a private-bucket object.

    Per contract 4.4. 7 days is the R2-documented maximum TTL for an
    S3 v4 signed URL. Caller (download router) is responsible for
    verifying that the requesting user's tenant matches the manifest's
    tenant before invoking this helper.
    """

    return r2_client.generate_presigned_url(
        ClientMethod="get_object",
        Params={"Bucket": bucket, "Key": key},
        ExpiresIn=expires_in,
    )


__all__ = [
    "ALLOWED_MIME",
    "MAX_UPLOAD_BYTES",
    "DEFAULT_UPLOAD_TTL_SECONDS",
    "PresignedPost",
    "Visibility",
    "ReferenceType",
    "validate_upload_request",
    "compose_r2_key",
    "select_bucket",
    "generate_presigned_post",
    "generate_private_download_url",
]
