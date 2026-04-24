"""Astraea P1 stopgap resolution via marketplace_review table.

This test is the central proof that Iapetus P4 S1 closes the P1 gap:
``iapetus_p2_pending`` flips to ``False`` on any recompute where the
gather path sources from the real ``marketplace_review`` aggregate
(even when review_count == 0 because that counts as a valid read).
"""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import pytest

from src.backend.trust import service as trust_service


TENANT_ID = UUID("22222222-2222-7222-8222-222222222222")
LISTING_ID = UUID("44444444-4444-7444-8444-444444444444")


@pytest.mark.asyncio
async def test_stopgap_flips_when_review_data_real(
    fake_commerce_pool, commerce_settings
) -> None:
    """When aggregate_listing_reviews returns data, stopgap flips False."""

    conn = fake_commerce_pool._test_conn

    # Listing row readback.
    listing_row = {
        "id": LISTING_ID,
        "tenant_id": TENANT_ID,
        "creator_user_id": uuid4(),
        "category": "content",
        "trust_score_cached": 0.7,
        "created_at": datetime.now(timezone.utc),
    }
    # review aggregate returns real counts.
    agg_row = {
        "review_count": 4,
        "rating_sum": 16,  # mean 4.0
        "helpful_count": 2,
        "flag_count": 0,
    }
    # identity row (for verified flag).
    identity_row = {"status": "active"}

    # gather_listing_inputs sequence:
    #   1. SELECT listing
    #   2. aggregate_listing_reviews internal SELECT (via conn path)
    #   3. SELECT agent_identity
    conn.fetchrow = AsyncMock(
        side_effect=[listing_row, agg_row, identity_row]
    )

    row, inputs, meta = await trust_service.gather_listing_inputs(
        conn, listing_id=LISTING_ID
    )
    assert inputs is not None
    assert inputs.review_count == 4
    assert inputs.review_rating_mean_normalised == pytest.approx(0.8)
    assert inputs.helpful_count == 2
    assert meta["stopgap"]["iapetus_p2_pending"] is False
    assert meta["using_real_review_data"] is True


@pytest.mark.asyncio
async def test_stopgap_flips_even_with_zero_reviews(
    fake_commerce_pool, commerce_settings
) -> None:
    """Zero reviews still counts as a valid read, so stopgap flips False.

    Rationale: the P1 marker flagged "review data source not wired",
    not "review count non-zero". A listing with zero reviews is a
    legitimate empty result from the real table and no longer a
    stopgap. The Bayesian prior + new-agent boost still handle the
    score.
    """

    conn = fake_commerce_pool._test_conn

    listing_row = {
        "id": LISTING_ID,
        "tenant_id": TENANT_ID,
        "creator_user_id": uuid4(),
        "category": "content",
        "trust_score_cached": 0.5,
        "created_at": datetime.now(timezone.utc),
    }
    agg_row = {
        "review_count": 0,
        "rating_sum": 0,
        "helpful_count": 0,
        "flag_count": 0,
    }
    identity_row = None  # no agent_identity yet

    conn.fetchrow = AsyncMock(
        side_effect=[listing_row, agg_row, identity_row]
    )

    row, inputs, meta = await trust_service.gather_listing_inputs(
        conn, listing_id=LISTING_ID
    )
    assert inputs is not None
    assert inputs.review_count == 0
    # review_aggregate_available True AND using_real_review_data True
    # (empty aggregate still sourced from the real table).
    assert meta["review_aggregate_available"] is True
    assert meta["stopgap"]["iapetus_p2_pending"] is False


@pytest.mark.asyncio
async def test_stopgap_stays_true_when_aggregate_raises(
    fake_commerce_pool, commerce_settings, monkeypatch
) -> None:
    """Belt-and-braces: if the real aggregate call fails, fall back + keep flag."""

    # Patch aggregate_listing_reviews to raise so the except branch
    # triggers. The gather function catches + logs.
    async def broken_aggregate(**kw):
        raise RuntimeError("db down")

    monkeypatch.setattr(
        "src.backend.commerce.review.aggregate_listing_reviews",
        broken_aggregate,
    )

    conn = fake_commerce_pool._test_conn
    listing_row = {
        "id": LISTING_ID,
        "tenant_id": TENANT_ID,
        "creator_user_id": uuid4(),
        "category": "content",
        "trust_score_cached": 0.6,
        "created_at": datetime.now(timezone.utc),
    }
    identity_row = None
    conn.fetchrow = AsyncMock(side_effect=[listing_row, identity_row])

    row, inputs, meta = await trust_service.gather_listing_inputs(
        conn, listing_id=LISTING_ID
    )
    assert inputs is not None
    # Stopgap stays True because the aggregate call failed; we fall
    # back to the trust_score_cached proxy.
    assert meta["stopgap"]["iapetus_p2_pending"] is True
    assert meta["review_aggregate_available"] is False
    assert meta["stopgap"]["review_proxy_from_trust_score_cached"] is True
