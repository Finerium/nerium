"""Service-layer tests for marketplace listings.

Owner: Phanes (W2 NP P1 S1). Exercises:

- Hemera gates (marketplace.live + marketplace.premium_issuance).
- Owner-only PATCH + DELETE + publish guards.
- Version history snapshot on publish.
- Row-to-wire projection (:func:`row_to_detail` / :func:`row_to_public`).

These tests mock the asyncpg pool via :fixture:`fake_listing_pool` and
stub ``get_flag`` via :fixture:`flag_patch`; no live Postgres/Redis
needed.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest

from src.backend.errors import (
    ForbiddenProblem,
    NotFoundProblem,
    ServiceUnavailableProblem,
    ValidationProblem,
)
from src.backend.marketplace import listing_service
from src.backend.marketplace.listing_service import (
    create_listing,
    delete_listing,
    derive_slug,
    enforce_marketplace_live,
    enforce_premium_issuance,
    get_listing,
    publish_listing,
    row_to_detail,
    row_to_public,
    update_listing,
)
from src.backend.models.marketplace_listing import (
    Category,
    License,
    ListingCreate,
    ListingUpdate,
    PricingModel,
    Subtype,
)

from tests.backend.marketplace.conftest import make_listing_row


USER_ID = UUID("11111111-1111-7111-8111-111111111111")
TENANT_ID = UUID("22222222-2222-7222-8222-222222222222")
OTHER_USER_ID = UUID("33333333-3333-7333-8333-333333333333")


# ---------------------------------------------------------------------------
# Hemera gate
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_enforce_marketplace_live_raises_when_flag_false(flag_patch) -> None:
    flag_patch({"marketplace.live": False})
    with pytest.raises(ForbiddenProblem) as excinfo:
        await enforce_marketplace_live(user_id=USER_ID, tenant_id=TENANT_ID)
    assert excinfo.value.slug == "forbidden"


@pytest.mark.asyncio
async def test_enforce_marketplace_live_allows_when_true(flag_patch) -> None:
    flag_patch({"marketplace.live": True})
    await enforce_marketplace_live(user_id=USER_ID, tenant_id=TENANT_ID)


@pytest.mark.asyncio
async def test_enforce_marketplace_live_fails_closed_on_outage(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def raising(*args: Any, **kwargs: Any):
        raise RuntimeError("redis down")

    monkeypatch.setattr(listing_service, "get_flag", raising)
    with pytest.raises(ServiceUnavailableProblem):
        await enforce_marketplace_live(user_id=USER_ID, tenant_id=TENANT_ID)


@pytest.mark.asyncio
async def test_enforce_premium_issuance_raises_when_flag_false(flag_patch) -> None:
    flag_patch({"marketplace.premium_issuance": False})
    with pytest.raises(ForbiddenProblem):
        await enforce_premium_issuance(user_id=USER_ID, tenant_id=TENANT_ID)


# ---------------------------------------------------------------------------
# create_listing
# ---------------------------------------------------------------------------


def _minimal_create_body() -> ListingCreate:
    return ListingCreate(
        category=Category.CONTENT,
        subtype=Subtype.PROMPT,
        title="Test Prompt",
        short_description="Short",
        long_description="Longer description",
        category_metadata={"content_format": "markdown"},
        license=License.CC_BY_4,
        pricing_model=PricingModel.FREE,
    )


@pytest.mark.asyncio
async def test_create_listing_hemera_gate_disabled_raises(
    fake_listing_pool,
    flag_patch,
) -> None:
    flag_patch({"marketplace.live": False})
    with pytest.raises(ForbiddenProblem):
        await create_listing(
            body=_minimal_create_body(), tenant_id=TENANT_ID, user_id=USER_ID
        )


@pytest.mark.asyncio
async def test_create_listing_premium_requires_premium_flag(
    fake_listing_pool,
    flag_patch,
) -> None:
    flag_patch(
        {
            "marketplace.live": True,
            "marketplace.premium_issuance": False,  # blocks premium creation
        }
    )
    body = ListingCreate(
        category=Category.PREMIUM,
        subtype=Subtype.VERIFIED_CERTIFICATION,
        title="Premium Cert",
        short_description="Short",
        long_description="Long",
        category_metadata={"premium_kind": "verified_certification"},
    )
    with pytest.raises(ForbiddenProblem):
        await create_listing(body=body, tenant_id=TENANT_ID, user_id=USER_ID)


@pytest.mark.asyncio
async def test_create_listing_insert_happy_path(
    fake_listing_pool,
    flag_patch,
) -> None:
    """Flag on + no slug collision + valid metadata -> inserted row returned."""

    flag_patch({"marketplace.live": True})

    conn = fake_listing_pool._test_conn
    # First fetchrow: select_listing_by_slug for collision check (None = free).
    # Second fetchrow: INSERT ... RETURNING.
    inserted = make_listing_row(
        tenant_id=TENANT_ID,
        creator_user_id=USER_ID,
        slug="test-prompt",
        title="Test Prompt",
        short_description="Short",
        long_description="Longer description",
        category="content",
        subtype="prompt",
        pricing_model="free",
        license_value="CC_BY_4",
    )
    conn.fetchrow = AsyncMock(side_effect=[None, inserted])

    detail = await create_listing(
        body=_minimal_create_body(), tenant_id=TENANT_ID, user_id=USER_ID
    )

    assert detail.title == "Test Prompt"
    assert detail.slug == "test-prompt"
    assert detail.creator_user_id == USER_ID
    assert detail.tenant_id == TENANT_ID
    assert detail.status == "draft"


@pytest.mark.asyncio
async def test_create_listing_slug_collision_appends_suffix(
    fake_listing_pool,
    flag_patch,
) -> None:
    """When the base slug is taken, the service tries ``-2`` etc."""

    flag_patch({"marketplace.live": True})

    conn = fake_listing_pool._test_conn
    taken = make_listing_row(slug="test-prompt")
    inserted = make_listing_row(
        tenant_id=TENANT_ID,
        creator_user_id=USER_ID,
        slug="test-prompt-2",
        title="Test Prompt",
        long_description="Longer description",
    )
    # select_listing_by_slug('test-prompt') -> taken.
    # select_listing_by_slug('test-prompt-2') -> None (free).
    # insert -> inserted.
    conn.fetchrow = AsyncMock(side_effect=[taken, None, inserted])

    detail = await create_listing(
        body=_minimal_create_body(), tenant_id=TENANT_ID, user_id=USER_ID
    )
    assert detail.slug == "test-prompt-2"


@pytest.mark.asyncio
async def test_create_listing_invalid_metadata_raises_validation(
    fake_listing_pool,
    flag_patch,
) -> None:
    """Category metadata that fails the sub-schema yields 422 at create time."""

    flag_patch({"marketplace.live": True})
    body = ListingCreate(
        category=Category.ASSETS,
        subtype=Subtype.SPRITE_PACK,
        title="Broken Pack",
        long_description="long",
        category_metadata={},  # missing media_type + file_format
    )
    with pytest.raises(ValidationProblem) as excinfo:
        await create_listing(body=body, tenant_id=TENANT_ID, user_id=USER_ID)
    errors = excinfo.value.extensions.get("errors", [])
    assert any("media_type" in e["field"] for e in errors)


# ---------------------------------------------------------------------------
# get_listing
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_listing_not_found_raises(fake_listing_pool) -> None:
    conn = fake_listing_pool._test_conn
    conn.fetchrow = AsyncMock(return_value=None)
    with pytest.raises(NotFoundProblem):
        await get_listing(listing_id=uuid4(), tenant_id=TENANT_ID)


@pytest.mark.asyncio
async def test_get_listing_happy_path(fake_listing_pool) -> None:
    conn = fake_listing_pool._test_conn
    lid = uuid4()
    row = make_listing_row(listing_id=lid, tenant_id=TENANT_ID, title="Hello")
    conn.fetchrow = AsyncMock(return_value=row)
    detail = await get_listing(listing_id=lid, tenant_id=TENANT_ID)
    assert detail.id == lid
    assert detail.title == "Hello"


# ---------------------------------------------------------------------------
# update_listing (owner-only + validation)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_listing_owner_only(fake_listing_pool, flag_patch) -> None:
    flag_patch({"marketplace.live": True})
    lid = uuid4()
    row = make_listing_row(listing_id=lid, creator_user_id=OTHER_USER_ID)
    fake_listing_pool._test_conn.fetchrow = AsyncMock(return_value=row)
    with pytest.raises(ForbiddenProblem):
        await update_listing(
            listing_id=lid,
            body=ListingUpdate(title="hack"),
            tenant_id=TENANT_ID,
            user_id=USER_ID,
        )


@pytest.mark.asyncio
async def test_update_listing_applies_fields(fake_listing_pool, flag_patch) -> None:
    flag_patch({"marketplace.live": True})
    lid = uuid4()
    row = make_listing_row(listing_id=lid, creator_user_id=USER_ID, title="before")
    updated = {**row, "title": "after"}
    fake_listing_pool._test_conn.fetchrow = AsyncMock(side_effect=[row, updated])
    detail = await update_listing(
        listing_id=lid,
        body=ListingUpdate(title="after"),
        tenant_id=TENANT_ID,
        user_id=USER_ID,
    )
    assert detail.title == "after"


@pytest.mark.asyncio
async def test_update_listing_validates_category_metadata_override(
    fake_listing_pool, flag_patch
) -> None:
    """PATCH that supplies invalid metadata should 422."""

    flag_patch({"marketplace.live": True})
    lid = uuid4()
    row = make_listing_row(
        listing_id=lid,
        creator_user_id=USER_ID,
        category="assets",
        subtype="sprite_pack",
        category_metadata={"media_type": "image", "file_format": "png"},
    )
    fake_listing_pool._test_conn.fetchrow = AsyncMock(return_value=row)
    with pytest.raises(ValidationProblem):
        await update_listing(
            listing_id=lid,
            body=ListingUpdate(category_metadata={}),  # removes required fields
            tenant_id=TENANT_ID,
            user_id=USER_ID,
        )


# ---------------------------------------------------------------------------
# publish_listing (validation pipeline + version snapshot)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_publish_listing_not_owner_raises(fake_listing_pool, flag_patch) -> None:
    flag_patch({"marketplace.live": True})
    lid = uuid4()
    row = make_listing_row(listing_id=lid, creator_user_id=OTHER_USER_ID)
    fake_listing_pool._test_conn.fetchrow = AsyncMock(return_value=row)
    with pytest.raises(ForbiddenProblem):
        await publish_listing(listing_id=lid, tenant_id=TENANT_ID, user_id=USER_ID)


@pytest.mark.asyncio
async def test_publish_listing_missing_long_description_raises_422(
    fake_listing_pool, flag_patch
) -> None:
    flag_patch({"marketplace.live": True})
    lid = uuid4()
    row = make_listing_row(
        listing_id=lid,
        creator_user_id=USER_ID,
        long_description=None,  # blocks publish
    )
    fake_listing_pool._test_conn.fetchrow = AsyncMock(return_value=row)
    with pytest.raises(ValidationProblem) as excinfo:
        await publish_listing(listing_id=lid, tenant_id=TENANT_ID, user_id=USER_ID)
    codes = {e["code"] for e in excinfo.value.extensions.get("errors", [])}
    assert "description_required_for_public" in codes


@pytest.mark.asyncio
async def test_publish_listing_snapshots_version_history(
    fake_listing_pool, flag_patch
) -> None:
    """On publish the prior (version, status) tuple must land in version_history."""

    flag_patch({"marketplace.live": True})
    lid = uuid4()
    pre = make_listing_row(
        listing_id=lid,
        creator_user_id=USER_ID,
        category="content",
        subtype="prompt",
        category_metadata={"content_format": "markdown"},
        long_description="complete description here",
        status="draft",
        version="1.0.0",
        version_history=[],
    )
    post = {
        **pre,
        "status": "published",
        "published_at": datetime.now(timezone.utc),
        "version_history": [
            {"version": "1.0.0", "status_before": "draft", "title": "Sample Listing"}
        ],
    }
    fake_listing_pool._test_conn.fetchrow = AsyncMock(side_effect=[pre, post])

    detail = await publish_listing(
        listing_id=lid, tenant_id=TENANT_ID, user_id=USER_ID
    )
    assert detail.status == "published"
    assert detail.version_history[0]["version"] == "1.0.0"
    assert detail.version_history[0]["status_before"] == "draft"


# ---------------------------------------------------------------------------
# delete_listing
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_listing_owner_only(fake_listing_pool, flag_patch) -> None:
    flag_patch({"marketplace.live": True})
    lid = uuid4()
    row = make_listing_row(listing_id=lid, creator_user_id=OTHER_USER_ID)
    fake_listing_pool._test_conn.fetchrow = AsyncMock(return_value=row)
    with pytest.raises(ForbiddenProblem):
        await delete_listing(listing_id=lid, tenant_id=TENANT_ID, user_id=USER_ID)


@pytest.mark.asyncio
async def test_delete_listing_happy_path_archives(
    fake_listing_pool, flag_patch
) -> None:
    flag_patch({"marketplace.live": True})
    lid = uuid4()
    row = make_listing_row(
        listing_id=lid, creator_user_id=USER_ID, archived_at=None
    )
    archived = {**row, "archived_at": datetime.now(timezone.utc), "status": "archived"}
    fake_listing_pool._test_conn.fetchrow = AsyncMock(side_effect=[row, archived])
    await delete_listing(listing_id=lid, tenant_id=TENANT_ID, user_id=USER_ID)


@pytest.mark.asyncio
async def test_delete_listing_idempotent_on_already_archived(
    fake_listing_pool, flag_patch
) -> None:
    flag_patch({"marketplace.live": True})
    lid = uuid4()
    already = make_listing_row(
        listing_id=lid,
        creator_user_id=USER_ID,
        archived_at=datetime.now(timezone.utc),
        status="archived",
    )
    fake_listing_pool._test_conn.fetchrow = AsyncMock(return_value=already)
    # No raise; returns None silently.
    await delete_listing(listing_id=lid, tenant_id=TENANT_ID, user_id=USER_ID)


# ---------------------------------------------------------------------------
# Row projections
# ---------------------------------------------------------------------------


def test_row_to_detail_projection_shape() -> None:
    row = make_listing_row(
        pricing_details={"amount_cents": 500, "currency": "USD"},
        category_metadata={"content_format": "markdown"},
    )
    detail = row_to_detail(row)
    assert detail.pricing_details == {"amount_cents": 500, "currency": "USD"}
    assert detail.category_metadata == {"content_format": "markdown"}


def test_row_to_public_excludes_heavy_fields() -> None:
    row = make_listing_row(long_description="A" * 5000)
    pub = row_to_public(row)
    # ``ListingPublic`` deliberately omits long_description.
    assert not hasattr(pub, "long_description")


def test_row_to_detail_decodes_jsonb_text() -> None:
    """asyncpg returns jsonb as str without a custom codec."""

    row = make_listing_row(
        pricing_details='{"amount_cents": 100, "currency": "USD"}',  # type: ignore[arg-type]
        category_metadata='{"content_format": "markdown"}',  # type: ignore[arg-type]
    )
    detail = row_to_detail(row)
    assert detail.pricing_details["amount_cents"] == 100
    assert detail.category_metadata["content_format"] == "markdown"


# ---------------------------------------------------------------------------
# derive_slug monotonic sanity
# ---------------------------------------------------------------------------


def test_derive_slug_maps_to_valid_shape() -> None:
    assert derive_slug("My Nice Title") == "my-nice-title"
