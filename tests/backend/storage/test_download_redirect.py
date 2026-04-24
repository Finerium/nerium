"""Download router tests.

Covers file_storage.contract Section 4.4:

- Public manifests redirect to the Cloudflare CDN base URL (zero-egress).
- Private manifests redirect to a 7-day signed R2 URL.
- Quarantined (infected) manifests return 403.
- Missing manifests return 404 (not 403) per contract 8 to block
  enumeration attacks.
- Pending scans return 409 conflict.

These tests exercise the router in isolation using FastAPI's
``dependency_overrides`` so we do not need to bring up the full
Aether lifespan (Postgres + Redis + R2 + auth middleware).
"""

from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock

from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.backend.routers.v1.storage.download import (
    PRIVATE_SIGNED_URL_TTL_SECONDS,
)
from src.backend.routers.v1.storage.download import (
    router as download_router,
)
from src.backend.routers.v1.storage.upload import (
    get_current_tenant_id,
    get_db_pool_dep,
    get_r2_client_dep,
    get_r2_settings_dep,
)
from src.backend.storage.r2_client import R2Settings


def _build_app(
    manifest_row: dict[str, Any] | None,
    *,
    r2_client: MagicMock,
    r2_settings: R2Settings,
) -> FastAPI:
    """Build a FastAPI app wired to the download router with doubles."""

    class _Conn:
        async def execute(self, *a: Any, **k: Any) -> str:
            return "OK"

        async def fetchrow(self, *a: Any, **k: Any) -> dict[str, Any] | None:
            return manifest_row

        def transaction(self) -> _Conn:
            return self

        async def __aenter__(self) -> _Conn:
            return self

        async def __aexit__(self, *a: Any) -> None:
            return None

    class _Acquire:
        def __init__(self, conn: _Conn) -> None:
            self._conn = conn

        async def __aenter__(self) -> _Conn:
            return self._conn

        async def __aexit__(self, *a: Any) -> None:
            return None

    class _Pool:
        def acquire(self) -> _Acquire:
            return _Acquire(_Conn())

    app = FastAPI()
    app.include_router(download_router)

    app.dependency_overrides[get_current_tenant_id] = (
        lambda: "00000000-0000-0000-0000-000000000001"
    )
    app.dependency_overrides[get_db_pool_dep] = lambda: _Pool()
    app.dependency_overrides[get_r2_client_dep] = lambda: r2_client
    app.dependency_overrides[get_r2_settings_dep] = lambda: r2_settings

    return app


def test_redirect_public_goes_to_cdn(
    fake_r2_client: MagicMock, r2_settings: R2Settings
) -> None:
    row = {
        "id": "mid-pub",
        "r2_bucket": r2_settings.bucket_public,
        "r2_key": "avatar/user-1/mid-pub.png",
        "content_type": "image/png",
        "size_bytes": 1024,
        "sha256": "deadbeef",
        "visibility": "public",
        "virus_scan_status": "clean",
    }
    app = _build_app(row, r2_client=fake_r2_client, r2_settings=r2_settings)

    with TestClient(app) as client:
        r = client.get(
            "/v1/storage/files/mid-pub", follow_redirects=False
        )
        assert r.status_code == 302
        assert r.headers["location"].startswith(r2_settings.cdn_base_url)
        assert r.headers["location"].endswith(
            "avatar/user-1/mid-pub.png"
        )
    # Public bucket means NO presigned GET call was issued (zero egress).
    fake_r2_client.generate_presigned_url.assert_not_called()


def test_redirect_private_goes_to_signed_url(
    fake_r2_client: MagicMock, r2_settings: R2Settings
) -> None:
    row = {
        "id": "mid-priv",
        "r2_bucket": r2_settings.bucket_private,
        "r2_key": "listing_asset/listing-1/mid-priv.zip",
        "content_type": "application/zip",
        "size_bytes": 5 * 1024 * 1024,
        "sha256": "deadbeef",
        "visibility": "private",
        "virus_scan_status": "clean",
    }
    app = _build_app(row, r2_client=fake_r2_client, r2_settings=r2_settings)

    with TestClient(app) as client:
        r = client.get(
            "/v1/storage/files/mid-priv", follow_redirects=False
        )
        assert r.status_code == 302
        assert (
            f"X-Amz-Expires={PRIVATE_SIGNED_URL_TTL_SECONDS}"
            in r.headers["location"]
        )
    # Signed GET was indeed issued against the private bucket.
    fake_r2_client.generate_presigned_url.assert_called_once()
    kwargs = fake_r2_client.generate_presigned_url.call_args.kwargs
    assert kwargs["Params"]["Bucket"] == r2_settings.bucket_private
    assert kwargs["Params"]["Key"] == "listing_asset/listing-1/mid-priv.zip"


def test_redirect_infected_returns_403(
    fake_r2_client: MagicMock, r2_settings: R2Settings
) -> None:
    row = {
        "id": "mid-inf",
        "r2_bucket": r2_settings.bucket_quarantine,
        "r2_key": "quarantine/listing_asset/listing-1/mid-inf.zip",
        "content_type": "application/zip",
        "size_bytes": 1024,
        "sha256": "",
        "visibility": "private",
        "virus_scan_status": "infected",
    }
    app = _build_app(row, r2_client=fake_r2_client, r2_settings=r2_settings)

    with TestClient(app) as client:
        r = client.get(
            "/v1/storage/files/mid-inf", follow_redirects=False
        )
        assert r.status_code == 403


def test_redirect_pending_returns_409(
    fake_r2_client: MagicMock, r2_settings: R2Settings
) -> None:
    row = {
        "id": "mid-pend",
        "r2_bucket": r2_settings.bucket_private,
        "r2_key": "listing_asset/listing-1/mid-pend.zip",
        "content_type": "application/zip",
        "size_bytes": 1024,
        "sha256": "",
        "visibility": "private",
        "virus_scan_status": "pending",
    }
    app = _build_app(row, r2_client=fake_r2_client, r2_settings=r2_settings)

    with TestClient(app) as client:
        r = client.get(
            "/v1/storage/files/mid-pend", follow_redirects=False
        )
        assert r.status_code == 409


def test_redirect_missing_returns_404_not_403(
    fake_r2_client: MagicMock, r2_settings: R2Settings
) -> None:
    """Per contract Section 8 anti-enumeration guidance."""

    app = _build_app(None, r2_client=fake_r2_client, r2_settings=r2_settings)

    with TestClient(app) as client:
        r = client.get(
            "/v1/storage/files/missing", follow_redirects=False
        )
        assert r.status_code == 404


def test_signed_url_json_endpoint_public_far_future_expiry(
    fake_r2_client: MagicMock, r2_settings: R2Settings
) -> None:
    row = {
        "id": "mid-pub2",
        "r2_bucket": r2_settings.bucket_public,
        "r2_key": "listing_thumbnail/listing-1/mid-pub2.jpg",
        "content_type": "image/jpeg",
        "size_bytes": 4096,
        "sha256": "abc",
        "visibility": "public",
        "virus_scan_status": "clean",
    }
    app = _build_app(row, r2_client=fake_r2_client, r2_settings=r2_settings)

    with TestClient(app) as client:
        r = client.get("/v1/storage/files/mid-pub2/signed-url")
        assert r.status_code == 200
        payload = r.json()
        assert payload["url"].startswith(r2_settings.cdn_base_url)
        assert payload["visibility"] == "public"
        assert payload["content_type"] == "image/jpeg"
