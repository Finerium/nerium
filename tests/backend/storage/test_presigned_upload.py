"""Presigned POST generator tests.

Covers file_storage.contract Section 4.1 + Section 3.3:

- 25 MB hard cap enforcement (``Content-Length-Range`` condition).
- Per-MIME size caps (image/png 10 MB, application/pdf 25 MB, ...).
- Allow-list rejection for unsupported content types.
- Key shape matches Section 7 naming convention.
- Expires_in defaults to 900 seconds.
- Public visibility routes avatars + listing thumbnails to
  ``nerium-public`` bucket; everything else to ``nerium-private``.
- ``x-amz-meta-manifest-id`` echoed into both fields + policy condition
  so the upload-complete handler can reconcile.
"""

from __future__ import annotations

from unittest.mock import MagicMock

from src.backend.storage.presigned import (
    ALLOWED_MIME,
    DEFAULT_UPLOAD_TTL_SECONDS,
    MAX_UPLOAD_BYTES,
    compose_r2_key,
    generate_presigned_post,
    select_bucket,
    validate_upload_request,
)
from src.backend.storage.r2_client import R2Settings


def test_default_upload_ttl_matches_contract() -> None:
    assert DEFAULT_UPLOAD_TTL_SECONDS == 900


def test_max_upload_bytes_is_25mb() -> None:
    assert MAX_UPLOAD_BYTES == 25 * 1024 * 1024


def test_validate_accepts_image_png_under_cap() -> None:
    ok, reason = validate_upload_request("image/png", 5 * 1024 * 1024)
    assert ok is True
    assert reason is None


def test_validate_rejects_unsupported_mime() -> None:
    ok, reason = validate_upload_request(
        "application/x-msdownload", 1024
    )
    assert ok is False
    assert reason == "unsupported_media_type"


def test_validate_rejects_over_per_type_cap_png() -> None:
    # image/png cap is 10 MB per contract 3.3
    ok, reason = validate_upload_request(
        "image/png", 12 * 1024 * 1024
    )
    assert ok is False
    assert reason == "payload_too_large"


def test_validate_rejects_over_hard_cap() -> None:
    # 26 MB exceeds the 25 MB MVP hard cap even for pdf whose per-type
    # cap is also 25 MB.
    ok, reason = validate_upload_request(
        "application/pdf", 26 * 1024 * 1024
    )
    assert ok is False
    assert reason == "payload_too_large"


def test_validate_rejects_zero_size() -> None:
    ok, reason = validate_upload_request("image/png", 0)
    assert ok is False
    assert reason == "validation_failed"


def test_compose_r2_key_follows_convention() -> None:
    key = compose_r2_key(
        reference_type="avatar",
        scope_id="user-uuid-1",
        original_filename="selfie.PNG",
        manifest_id="mid-123",
    )
    # reference_type/scope_id/<manifest_id>.<lowercased ext>
    assert key == "avatar/user-uuid-1/mid-123.png"


def test_compose_r2_key_sanitizes_extension() -> None:
    key = compose_r2_key(
        reference_type="generic",
        scope_id="user-1",
        original_filename="payload.../etc/passwd.JpG!@#",
        manifest_id="mid",
    )
    # Only alphanumerics survive; length capped at 10.
    assert key.endswith(".jpg")
    assert "../" not in key


def test_select_bucket_public_for_avatar() -> None:
    settings = R2Settings(
        account_id="a",
        access_key_id="k",
        secret_access_key="s",
        bucket_public="pub",
        bucket_private="priv",
        bucket_quarantine="q",
        cdn_base_url="https://cdn.x",
        endpoint_url="https://a.r2.cloudflarestorage.com",
    )
    assert select_bucket(settings, "public", "avatar") == "pub"
    assert select_bucket(settings, "private", "avatar") == "priv"
    # Even public visibility for ma_output (not in public ref-type set)
    # stays in private bucket.
    assert select_bucket(settings, "public", "ma_output") == "priv"
    # tenant_shared is private at bucket level.
    assert (
        select_bucket(settings, "tenant_shared", "listing_asset") == "priv"
    )


def test_generate_presigned_post_binds_size_range(
    fake_r2_client: MagicMock, r2_settings: R2Settings
) -> None:
    signed = generate_presigned_post(
        fake_r2_client,
        r2_settings,
        manifest_id="mid-abc",
        reference_type="listing_asset",
        scope_id="listing-1",
        original_filename="pack.zip",
        content_type="application/zip",
        size_bytes=5 * 1024 * 1024,
        visibility="private",
    )

    # boto3 called with the size-range condition.
    call_kwargs = fake_r2_client.generate_presigned_post.call_args.kwargs
    assert call_kwargs["Bucket"] == r2_settings.bucket_private
    assert call_kwargs["Key"].startswith("listing_asset/listing-1/mid-abc.")
    assert call_kwargs["ExpiresIn"] == DEFAULT_UPLOAD_TTL_SECONDS

    conditions = call_kwargs["Conditions"]
    size_range = next(
        c for c in conditions if isinstance(c, list) and c and c[0] == "content-length-range"
    )
    assert size_range == ["content-length-range", 1, 5 * 1024 * 1024]

    # Content-type condition pinned exactly.
    assert {"Content-Type": "application/zip"} in conditions

    # Manifest-id metadata bound in both fields and conditions so the
    # complete handler can reconcile.
    assert signed.fields["x-amz-meta-manifest-id"] == "mid-abc"
    assert {"x-amz-meta-manifest-id": "mid-abc"} in conditions

    # Returned payload shape.
    assert signed.manifest_id == "mid-abc"
    assert signed.r2_bucket == r2_settings.bucket_private
    assert signed.r2_key.startswith("listing_asset/listing-1/mid-abc.")
    assert signed.expires_in == 900
    assert signed.max_size_bytes == 5 * 1024 * 1024


def test_generate_presigned_post_routes_public_avatar_to_cdn_bucket(
    fake_r2_client: MagicMock, r2_settings: R2Settings
) -> None:
    signed = generate_presigned_post(
        fake_r2_client,
        r2_settings,
        manifest_id="mid-avatar",
        reference_type="avatar",
        scope_id="user-42",
        original_filename="me.jpg",
        content_type="image/jpeg",
        size_bytes=2 * 1024 * 1024,
        visibility="public",
    )
    assert signed.r2_bucket == r2_settings.bucket_public
    assert signed.r2_key == "avatar/user-42/mid-avatar.jpg"


def test_allowed_mime_contract_coverage() -> None:
    """Sanity: every MIME in the contract allow-list caps at or below 25 MB."""

    for mime, cap in ALLOWED_MIME.items():
        assert cap <= MAX_UPLOAD_BYTES, (
            f"per-MIME cap for {mime!r} must not exceed hard limit"
        )
