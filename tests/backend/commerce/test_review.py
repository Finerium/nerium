"""Review CRUD + purchased-only gate + Astraea integration hook."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import asyncpg
import pytest

from src.backend.commerce import review as review_module
from src.backend.commerce.review import (
    DuplicateReviewProblem,
    PurchasedOnlyProblem,
    ReviewOwnerOnlyProblem,
    aggregate_listing_reviews,
    create_review,
    delete_review,
    list_reviews_for_listing,
    update_review,
)
from src.backend.errors import NotFoundProblem, ValidationProblem

from tests.backend.commerce.conftest import make_review_row


TENANT_ID = UUID("22222222-2222-7222-8222-222222222222")
LISTING_ID = UUID("44444444-4444-7444-8444-444444444444")
BUYER_ID = UUID("11111111-1111-7111-8111-111111111111")
OTHER_USER = UUID("55555555-5555-7555-8555-555555555555")


# ---------------------------------------------------------------------------
# create_review
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_rejects_rating_out_of_range(
    fake_commerce_pool, commerce_settings
) -> None:
    with pytest.raises(ValidationProblem):
        await create_review(
            tenant_id=TENANT_ID,
            reviewer_user_id=BUYER_ID,
            listing_id=LISTING_ID,
            rating=6,
        )


@pytest.mark.asyncio
async def test_create_rejects_when_no_completed_purchase(
    fake_commerce_pool, commerce_settings, monkeypatch
) -> None:
    # Patch get_completed_purchase_id to return None (no purchase).
    async def fake_get_purchase_id(**kw):
        return None

    monkeypatch.setattr(
        "src.backend.commerce.review.get_completed_purchase_id",
        fake_get_purchase_id,
    )

    with pytest.raises(PurchasedOnlyProblem):
        await create_review(
            tenant_id=TENANT_ID,
            reviewer_user_id=BUYER_ID,
            listing_id=LISTING_ID,
            rating=5,
        )


@pytest.mark.asyncio
async def test_create_happy_path_emits_recompute(
    fake_commerce_pool, commerce_settings, monkeypatch
) -> None:
    purchase_uuid = uuid4()

    async def fake_get_purchase_id(**kw):
        return purchase_uuid

    monkeypatch.setattr(
        "src.backend.commerce.review.get_completed_purchase_id",
        fake_get_purchase_id,
    )

    # Track Astraea recompute invocation.
    recompute_calls: list[dict] = []

    async def fake_persist(listing_id, tenant_id, actor_user_id=None, event_type=""):
        recompute_calls.append(
            {
                "listing_id": listing_id,
                "tenant_id": tenant_id,
                "event_type": event_type,
            }
        )
        return object()

    # The review module imports persist_listing_trust lazily inside the
    # emit helper; patch via the trust.service module so the lazy import
    # picks up the fake.
    import src.backend.trust.service as trust_service_mod

    monkeypatch.setattr(
        trust_service_mod, "persist_listing_trust", fake_persist
    )

    review_row = make_review_row(
        tenant_id=TENANT_ID,
        listing_id=LISTING_ID,
        reviewer_user_id=BUYER_ID,
        purchase_id=purchase_uuid,
        rating=5,
        title="Great",
        body="Worked well",
    )
    conn = fake_commerce_pool._test_conn
    conn.fetchrow = AsyncMock(return_value=review_row)

    review = await create_review(
        tenant_id=TENANT_ID,
        reviewer_user_id=BUYER_ID,
        listing_id=LISTING_ID,
        rating=5,
        title="Great",
        body="Worked well",
    )
    assert review.rating == 5
    assert review.title == "Great"
    # Astraea recompute invoked with real tenant + listing.
    assert len(recompute_calls) == 1
    assert recompute_calls[0]["listing_id"] == LISTING_ID
    assert recompute_calls[0]["tenant_id"] == TENANT_ID
    assert recompute_calls[0]["event_type"] == "review_trigger"


@pytest.mark.asyncio
async def test_create_duplicate_raises_409(
    fake_commerce_pool, commerce_settings, monkeypatch
) -> None:
    purchase_uuid = uuid4()

    async def fake_get_purchase_id(**kw):
        return purchase_uuid

    monkeypatch.setattr(
        "src.backend.commerce.review.get_completed_purchase_id",
        fake_get_purchase_id,
    )

    conn = fake_commerce_pool._test_conn
    # Simulate the partial unique index violation.
    conn.fetchrow = AsyncMock(
        side_effect=asyncpg.UniqueViolationError("dup")
    )

    with pytest.raises(DuplicateReviewProblem):
        await create_review(
            tenant_id=TENANT_ID,
            reviewer_user_id=BUYER_ID,
            listing_id=LISTING_ID,
            rating=4,
        )


# ---------------------------------------------------------------------------
# list + aggregate
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_filters_soft_deleted(
    fake_commerce_pool, commerce_settings
) -> None:
    row = make_review_row(
        tenant_id=TENANT_ID,
        listing_id=LISTING_ID,
        reviewer_user_id=BUYER_ID,
        rating=4,
    )
    conn = fake_commerce_pool._test_conn
    conn.fetch = AsyncMock(return_value=[row])

    reviews, has_more = await list_reviews_for_listing(
        tenant_id=TENANT_ID,
        listing_id=LISTING_ID,
        sort="recent",
        limit=20,
    )
    assert len(reviews) == 1
    assert has_more is False
    # Verify the SQL issued only visible + not-deleted filter (heuristic:
    # the fetch call carries the listing_id as first arg).
    call = conn.fetch.call_args
    assert call.args[0].find("deleted_at IS NULL") >= 0
    assert call.args[0].find("status = 'visible'") >= 0


@pytest.mark.asyncio
async def test_aggregate_computes_mean_count(
    fake_commerce_pool, commerce_settings
) -> None:
    conn = fake_commerce_pool._test_conn
    conn.fetchrow = AsyncMock(
        return_value={
            "review_count": 4,
            "rating_sum": 16,  # mean 4.0
            "helpful_count": 7,
            "flag_count": 1,
        }
    )

    agg = await aggregate_listing_reviews(
        tenant_id=None,
        listing_id=LISTING_ID,
        conn=conn,
    )
    assert agg.review_count == 4
    assert agg.rating_sum == 16
    # 4.0 / 5.0 = 0.8
    assert agg.rating_mean_normalised == pytest.approx(0.8)
    assert agg.helpful_count == 7
    assert agg.flag_count == 1


@pytest.mark.asyncio
async def test_aggregate_empty_returns_zero_mean(
    fake_commerce_pool, commerce_settings
) -> None:
    conn = fake_commerce_pool._test_conn
    conn.fetchrow = AsyncMock(
        return_value={
            "review_count": 0,
            "rating_sum": 0,
            "helpful_count": 0,
            "flag_count": 0,
        }
    )

    agg = await aggregate_listing_reviews(
        tenant_id=None,
        listing_id=LISTING_ID,
        conn=conn,
    )
    assert agg.review_count == 0
    assert agg.rating_mean_normalised == 0.0


# ---------------------------------------------------------------------------
# update + delete owner-only
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_owner_only(
    fake_commerce_pool, commerce_settings, monkeypatch
) -> None:
    # reviewer is BUYER_ID; actor is OTHER_USER -> 403.
    row = make_review_row(
        tenant_id=TENANT_ID,
        listing_id=LISTING_ID,
        reviewer_user_id=BUYER_ID,
    )
    conn = fake_commerce_pool._test_conn
    conn.fetchrow = AsyncMock(return_value=row)

    with pytest.raises(ReviewOwnerOnlyProblem):
        await update_review(
            tenant_id=TENANT_ID,
            review_id=row["id"],
            actor_user_id=OTHER_USER,
            rating=4,
        )


@pytest.mark.asyncio
async def test_update_happy_path(
    fake_commerce_pool, commerce_settings, monkeypatch
) -> None:
    row = make_review_row(
        tenant_id=TENANT_ID,
        listing_id=LISTING_ID,
        reviewer_user_id=BUYER_ID,
    )
    updated = dict(row)
    updated["rating"] = 3

    conn = fake_commerce_pool._test_conn
    conn.fetchrow = AsyncMock(side_effect=[row, updated])

    # Patch Astraea recompute to no-op.
    import src.backend.trust.service as trust_service_mod

    async def fake_persist(**kw):
        return object()

    monkeypatch.setattr(
        trust_service_mod, "persist_listing_trust", fake_persist
    )

    result = await update_review(
        tenant_id=TENANT_ID,
        review_id=row["id"],
        actor_user_id=BUYER_ID,
        rating=3,
    )
    assert result.rating == 3


@pytest.mark.asyncio
async def test_update_rejects_no_fields(
    fake_commerce_pool, commerce_settings
) -> None:
    with pytest.raises(ValidationProblem):
        await update_review(
            tenant_id=TENANT_ID,
            review_id=uuid4(),
            actor_user_id=BUYER_ID,
        )


@pytest.mark.asyncio
async def test_delete_owner_only(
    fake_commerce_pool, commerce_settings
) -> None:
    row = make_review_row(
        tenant_id=TENANT_ID,
        listing_id=LISTING_ID,
        reviewer_user_id=BUYER_ID,
    )
    conn = fake_commerce_pool._test_conn
    conn.fetchrow = AsyncMock(return_value=row)

    with pytest.raises(ReviewOwnerOnlyProblem):
        await delete_review(
            tenant_id=TENANT_ID,
            review_id=row["id"],
            actor_user_id=OTHER_USER,
        )


@pytest.mark.asyncio
async def test_delete_happy_path(
    fake_commerce_pool, commerce_settings, monkeypatch
) -> None:
    row = make_review_row(
        tenant_id=TENANT_ID,
        listing_id=LISTING_ID,
        reviewer_user_id=BUYER_ID,
    )
    conn = fake_commerce_pool._test_conn
    conn.fetchrow = AsyncMock(return_value=row)

    # Patch Astraea recompute to no-op.
    import src.backend.trust.service as trust_service_mod

    async def fake_persist(**kw):
        return object()

    monkeypatch.setattr(
        trust_service_mod, "persist_listing_trust", fake_persist
    )

    await delete_review(
        tenant_id=TENANT_ID,
        review_id=row["id"],
        actor_user_id=BUYER_ID,
    )
    # Soft-delete UPDATE executed.
    assert conn.execute.called
