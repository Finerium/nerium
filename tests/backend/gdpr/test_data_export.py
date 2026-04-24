"""Tests for the synchronous GDPR export path.

Exercises the happy path (ZIP assembled with manifest + table files),
the 404 path, and the 413 cap path.
"""

from __future__ import annotations

import io
import json
import zipfile
from datetime import datetime, timezone
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from src.backend.errors import NotFoundProblem, ValidationProblem
from src.backend.gdpr import export as export_service


def _user_row(user_id) -> dict:
    now = datetime.now(timezone.utc)
    return {
        "id": user_id,
        "email": "subject@example.com",
        "display_name": "Subject",
        "is_superuser": False,
        "email_verified": True,
        "email_verified_at": now,
        "tier": "free",
        "status": "active",
        "avatar_url": None,
        "created_at": now,
        "updated_at": now,
        "deleted_at": None,
        "purge_at": None,
    }


async def test_export_returns_zip_with_manifest(fake_gdpr_pool) -> None:
    conn = fake_gdpr_pool._test_conn
    user_id = uuid4()

    conn.fetchrow = AsyncMock(return_value=_user_row(user_id))
    # Every table fetch returns empty; the ZIP still contains the
    # manifest plus the empty JSON arrays.
    conn.fetch = AsyncMock(return_value=[])

    blob = await export_service.build_user_export(user_id)
    assert blob[:2] == b"PK", "expected a ZIP magic header"

    with zipfile.ZipFile(io.BytesIO(blob)) as zf:
        names = set(zf.namelist())
        assert "manifest.json" in names
        assert "tables/app_user.json" in names
        assert "tables/marketplace_listing.json" in names
        assert "tables/consent_event.json" in names

        manifest = json.loads(zf.read("manifest.json"))
        assert manifest["version"] == export_service.EXPORT_VERSION
        assert manifest["user_id"] == str(user_id)

        subject_rows = json.loads(zf.read("tables/app_user.json"))
        assert len(subject_rows) == 1
        subject = subject_rows[0]
        # Password hash MUST NOT appear in the export.
        assert "password_hash" not in subject


async def test_export_missing_user_raises_404(fake_gdpr_pool) -> None:
    conn = fake_gdpr_pool._test_conn
    conn.fetchrow = AsyncMock(return_value=None)

    with pytest.raises(NotFoundProblem):
        await export_service.build_user_export(uuid4())


async def test_export_too_large_raises_413(fake_gdpr_pool, monkeypatch) -> None:
    conn = fake_gdpr_pool._test_conn
    conn.fetchrow = AsyncMock(return_value=_user_row(uuid4()))

    # Tighten the cap to force the 413 branch with tiny data.
    monkeypatch.setattr(export_service, "MAX_EXPORT_PAYLOAD_BYTES", 16)

    with pytest.raises(ValidationProblem) as excinfo:
        await export_service.build_user_export(uuid4())

    assert excinfo.value.status == 413
    assert "export_too_large" in excinfo.value.slug
