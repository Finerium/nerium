"""Tests for :mod:`src.backend.trust.service`.

Owner: Astraea (W2 NP P1 S1). Mocks the asyncpg pool via
:fixture:`fake_trust_pool` so the tests run in isolation without a
live Postgres. Covers:

- ``gather_listing_inputs`` row extraction + stopgap markers.
- ``compute_listing_trust`` returning a breakdown.
- ``persist_listing_trust`` writing snapshot + denormalised cache.
- ``read_cached_listing_trust`` cache-hit vs cache-miss routing.
- ``compute_creator_trust`` aggregate arithmetic.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest

from src.backend.trust import service as trust_service
from src.backend.trust.score import FORMULA_VERSION

from tests.backend.trust.conftest import (
    make_listing_trust_row,
    make_user_trust_row,
)


TENANT_ID = UUID("22222222-2222-7222-8222-222222222222")
USER_ID = UUID("11111111-1111-7111-8111-111111111111")
LISTING_ID = UUID("33333333-3333-7333-8333-333333333333")


# ---------------------------------------------------------------------------
# gather_listing_inputs
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_gather_listing_inputs_missing_row_returns_none(
    fake_trust_pool,
) -> None:
    conn = fake_trust_pool._test_conn
    conn.fetchrow = AsyncMock(return_value=None)

    row, inputs, meta = await trust_service.gather_listing_inputs(
        conn, listing_id=LISTING_ID
    )
    assert row is None
    assert inputs is None
    assert meta == {}


@pytest.mark.asyncio
async def test_gather_listing_inputs_surfaces_stopgap_markers(
    fake_trust_pool,
) -> None:
    conn = fake_trust_pool._test_conn
    listing_row = make_listing_trust_row(
        listing_id=LISTING_ID,
        tenant_id=TENANT_ID,
        category="content",
        trust_score_cached=0.85,
    )
    # Iapetus W2 NP P4 S1: gather_listing_inputs now pulls review data
    # between the listing SELECT and the identity SELECT. The mock
    # returns an empty aggregate (count=0) so the stopgap flips to
    # False while the score falls back to the trust_score_cached
    # proxy for the rating-mean bucket.
    empty_aggregate = {
        "review_count": 0,
        "rating_sum": 0,
        "helpful_count": 0,
        "flag_count": 0,
    }
    conn.fetchrow = AsyncMock(
        side_effect=[listing_row, empty_aggregate, {"status": "active"}]
    )

    row, inputs, meta = await trust_service.gather_listing_inputs(
        conn, listing_id=LISTING_ID
    )
    assert row is listing_row
    assert inputs is not None
    # Empty aggregate falls back to the cached proxy for R.
    assert inputs.review_rating_mean_normalised == pytest.approx(0.85)
    assert inputs.review_count == 0
    assert inputs.helpful_count == 0
    assert inputs.flag_count == 0
    # Verified flag driven by identity row presence.
    assert inputs.verified_flag is True
    # P1-to-P2 flip: the table read counted as sourcing from real data
    # so iapetus_p2_pending is now False.
    assert meta["stopgap"]["iapetus_p2_pending"] is False
    assert meta["stopgap"]["verified_flag_from_identity_existence_only"] is True
    # Empty aggregate still sources from the real table so
    # using_real_review_data is True (the meta flag tracks "table
    # read succeeded", not "result non-empty").
    assert meta["using_real_review_data"] is True


@pytest.mark.asyncio
async def test_gather_listing_inputs_null_trust_cached_defaults_to_zero(
    fake_trust_pool,
) -> None:
    conn = fake_trust_pool._test_conn
    listing_row = make_listing_trust_row(
        listing_id=LISTING_ID,
        tenant_id=TENANT_ID,
        trust_score_cached=None,
    )
    # Iapetus W2 NP P4 S1: sequence is listing, aggregate, identity.
    empty_aggregate = {
        "review_count": 0,
        "rating_sum": 0,
        "helpful_count": 0,
        "flag_count": 0,
    }
    conn.fetchrow = AsyncMock(
        side_effect=[listing_row, empty_aggregate, None]
    )

    row, inputs, meta = await trust_service.gather_listing_inputs(
        conn, listing_id=LISTING_ID
    )
    assert row is not None
    assert inputs is not None
    assert inputs.review_rating_mean_normalised == 0.0
    # Without an identity row, not verified.
    assert inputs.verified_flag is False
    assert (
        meta["stopgap"]["review_proxy_from_trust_score_cached"] is False
    )


# ---------------------------------------------------------------------------
# compute_listing_trust
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_compute_listing_trust_missing_returns_none(fake_trust_pool) -> None:
    conn = fake_trust_pool._test_conn
    conn.fetchrow = AsyncMock(return_value=None)

    out = await trust_service.compute_listing_trust(
        listing_id=LISTING_ID, tenant_id=TENANT_ID
    )
    assert out is None


@pytest.mark.asyncio
async def test_compute_listing_trust_returns_breakdown(fake_trust_pool) -> None:
    conn = fake_trust_pool._test_conn
    listing_row = make_listing_trust_row(
        listing_id=LISTING_ID,
        tenant_id=TENANT_ID,
        category="content",
        trust_score_cached=0.9,
        created_at=datetime.now(timezone.utc) - timedelta(days=30),
    )
    empty_aggregate = {
        "review_count": 0,
        "rating_sum": 0,
        "helpful_count": 0,
        "flag_count": 0,
    }
    conn.fetchrow = AsyncMock(
        side_effect=[listing_row, empty_aggregate, None]
    )

    out = await trust_service.compute_listing_trust(
        listing_id=LISTING_ID, tenant_id=TENANT_ID
    )
    assert out is not None
    assert out.formula_version == FORMULA_VERSION
    assert out.category == "content"
    assert 0.0 <= out.score <= 1.0


# ---------------------------------------------------------------------------
# persist_listing_trust
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_persist_listing_trust_writes_snapshot_and_cache(
    fake_trust_pool,
) -> None:
    conn = fake_trust_pool._test_conn
    listing_row = make_listing_trust_row(
        listing_id=LISTING_ID,
        tenant_id=TENANT_ID,
        category="content",
        trust_score_cached=0.8,
        created_at=datetime.now(timezone.utc) - timedelta(days=15),
    )
    empty_aggregate = {
        "review_count": 0,
        "rating_sum": 0,
        "helpful_count": 0,
        "flag_count": 0,
    }
    conn.fetchrow = AsyncMock(
        side_effect=[listing_row, empty_aggregate, {"status": "active"}]
    )
    conn.execute = AsyncMock(return_value="OK")

    out = await trust_service.persist_listing_trust(
        listing_id=LISTING_ID,
        tenant_id=TENANT_ID,
        actor_user_id=USER_ID,
        event_type="on_demand",
    )

    assert out is not None
    # Execute calls: SET LOCAL (from tenant_scoped) + snapshot INSERT + listing UPDATE.
    executes = conn.execute.await_args_list
    insert_calls = [
        c for c in executes if "INSERT INTO trust_score_snapshot" in c.args[0]
    ]
    update_calls = [
        c for c in executes if "UPDATE marketplace_listing" in c.args[0]
    ]
    assert len(insert_calls) == 1
    assert len(update_calls) == 1

    insert_call = insert_calls[0]
    # Tenant + listing + category positional args.
    assert insert_call.args[1] == TENANT_ID
    assert insert_call.args[2] == LISTING_ID
    assert insert_call.args[3] == "content"
    # Score argument (4) matches the breakdown score.
    assert insert_call.args[4] == out.score
    # Event type (11) matches.
    assert insert_call.args[11] == "on_demand"
    # Actor (12) matches.
    assert insert_call.args[12] == USER_ID

    update_call = update_calls[0]
    assert "trust_score_cached" in update_call.args[0]
    assert update_call.args[1] == out.score


@pytest.mark.asyncio
async def test_persist_listing_trust_missing_returns_none(fake_trust_pool) -> None:
    conn = fake_trust_pool._test_conn
    conn.fetchrow = AsyncMock(return_value=None)

    out = await trust_service.persist_listing_trust(
        listing_id=LISTING_ID, tenant_id=TENANT_ID
    )
    assert out is None
    # Only the SET LOCAL from tenant_scoped runs; no INSERT/UPDATE.
    executes = conn.execute.await_args_list
    assert not any(
        "INSERT INTO trust_score_snapshot" in c.args[0] for c in executes
    )
    assert not any(
        "UPDATE marketplace_listing" in c.args[0] for c in executes
    )


# ---------------------------------------------------------------------------
# read_cached_listing_trust
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_read_cached_listing_trust_missing_returns_none(
    fake_trust_pool,
) -> None:
    conn = fake_trust_pool._test_conn
    conn.fetchrow = AsyncMock(return_value=None)

    payload = await trust_service.read_cached_listing_trust(
        listing_id=LISTING_ID, tenant_id=TENANT_ID
    )
    assert payload is None


@pytest.mark.asyncio
async def test_read_cached_listing_trust_fresh_cache_hit(fake_trust_pool) -> None:
    """Fresh cache returns the stored values without triggering a recompute."""

    conn = fake_trust_pool._test_conn
    recent = datetime.now(timezone.utc) - timedelta(hours=1)
    components_json = json.dumps(
        {
            "components": {"base_before_boost": 0.6},
            "boost_components": {"new_agent_boost": 0.0, "verified_boost": 0.0},
            "inputs_summary": {"R": 0.9, "v": 0},
        }
    )
    listing_row = make_listing_trust_row(
        listing_id=LISTING_ID,
        tenant_id=TENANT_ID,
        category="content",
        trust_score_cached=0.75,
        trust_score_cached_at=recent,
        trust_score_components_cached=components_json,
        trust_score_formula_version=FORMULA_VERSION,
        trust_score_band="trusted",
        trust_score_stability="stable",
    )
    conn.fetchrow = AsyncMock(return_value=listing_row)

    payload = await trust_service.read_cached_listing_trust(
        listing_id=LISTING_ID, tenant_id=TENANT_ID
    )
    assert payload is not None
    assert payload["cached"] is True
    assert payload["score"] == pytest.approx(0.75)
    assert payload["band"] == "trusted"
    assert payload["formula_version"] == FORMULA_VERSION
    # No snapshot writes on a cache hit (SET LOCAL from tenant_scoped is fine).
    executes = conn.execute.await_args_list
    assert not any(
        "INSERT INTO trust_score_snapshot" in c.args[0] for c in executes
    )


@pytest.mark.asyncio
async def test_read_cached_listing_trust_stale_triggers_refresh(
    fake_trust_pool,
) -> None:
    """Cache older than TTL triggers persist path."""

    conn = fake_trust_pool._test_conn
    stale = datetime.now(timezone.utc) - timedelta(days=2)
    listing_row_stale = make_listing_trust_row(
        listing_id=LISTING_ID,
        tenant_id=TENANT_ID,
        category="content",
        trust_score_cached=0.75,
        trust_score_cached_at=stale,
        trust_score_band="trusted",
        trust_score_stability="stable",
    )
    # Subsequent reads from persist path: listing row again + identity row.
    listing_row_for_gather = make_listing_trust_row(
        listing_id=LISTING_ID,
        tenant_id=TENANT_ID,
        category="content",
        trust_score_cached=0.75,
    )
    # Iapetus W2 NP P4 S1 adds an aggregate call between listing +
    # identity, so the sequence has an extra empty-aggregate row.
    empty_aggregate = {
        "review_count": 0,
        "rating_sum": 0,
        "helpful_count": 0,
        "flag_count": 0,
    }
    conn.fetchrow = AsyncMock(
        side_effect=[
            listing_row_stale,
            listing_row_for_gather,
            empty_aggregate,
            None,
        ]
    )
    conn.execute = AsyncMock(return_value="OK")

    payload = await trust_service.read_cached_listing_trust(
        listing_id=LISTING_ID, tenant_id=TENANT_ID
    )
    assert payload is not None
    assert payload["cached"] is False
    # persist called an INSERT + UPDATE; SET LOCAL runs too but we check shape.
    executes = conn.execute.await_args_list
    assert any(
        "INSERT INTO trust_score_snapshot" in c.args[0] for c in executes
    )
    assert any(
        "UPDATE marketplace_listing" in c.args[0] for c in executes
    )


@pytest.mark.asyncio
async def test_read_cached_listing_trust_null_cache_triggers_refresh(
    fake_trust_pool,
) -> None:
    """Never-scored listing (cache NULL) triggers recompute."""

    conn = fake_trust_pool._test_conn
    never_scored = make_listing_trust_row(
        listing_id=LISTING_ID,
        tenant_id=TENANT_ID,
        category="content",
        trust_score_cached=None,
        trust_score_cached_at=None,
    )
    gather_row = make_listing_trust_row(
        listing_id=LISTING_ID,
        tenant_id=TENANT_ID,
        category="content",
        trust_score_cached=None,
    )
    empty_aggregate = {
        "review_count": 0,
        "rating_sum": 0,
        "helpful_count": 0,
        "flag_count": 0,
    }
    conn.fetchrow = AsyncMock(
        side_effect=[never_scored, gather_row, empty_aggregate, None]
    )

    payload = await trust_service.read_cached_listing_trust(
        listing_id=LISTING_ID, tenant_id=TENANT_ID
    )
    assert payload is not None
    assert payload["cached"] is False


# ---------------------------------------------------------------------------
# gather_creator_inputs + compute_creator_trust
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_gather_creator_inputs_missing_user(fake_trust_pool) -> None:
    conn = fake_trust_pool._test_conn
    conn.fetchrow = AsyncMock(return_value=None)

    user_row, inputs, listings, meta = await trust_service.gather_creator_inputs(
        conn, user_id=USER_ID
    )
    assert user_row is None
    assert inputs is None
    assert listings == []
    assert meta == {}


@pytest.mark.asyncio
async def test_gather_creator_inputs_weighted_aggregate(fake_trust_pool) -> None:
    """Two published listings -> aggregate weighted by trust_score_cached."""

    conn = fake_trust_pool._test_conn
    user_row = make_user_trust_row(
        user_id=USER_ID, tenant_id=TENANT_ID, display_name="Creator"
    )
    listings = [
        {
            "id": uuid4(),
            "category": "content",
            "trust_score_cached": 0.9,
            "created_at": datetime.now(timezone.utc) - timedelta(days=60),
            "status": "published",
        },
        {
            "id": uuid4(),
            "category": "content",
            "trust_score_cached": 0.5,
            "created_at": datetime.now(timezone.utc) - timedelta(days=5),
            "status": "published",
        },
    ]
    # Iapetus W2 NP P4 S1: per-listing aggregate calls inject extra
    # fetchrows between user_row and identity_row. With 2 listings we
    # need 2 aggregate rows (empty) before the identity row.
    empty_aggregate = {
        "review_count": 0,
        "rating_sum": 0,
        "helpful_count": 0,
        "flag_count": 0,
    }
    conn.fetchrow = AsyncMock(
        side_effect=[
            user_row,
            empty_aggregate,  # listing 1 aggregate
            empty_aggregate,  # listing 2 aggregate
            {"status": "active"},
        ]
    )
    conn.fetch = AsyncMock(return_value=listings)

    user, inputs, summary, meta = await trust_service.gather_creator_inputs(
        conn, user_id=USER_ID
    )
    assert user is user_row
    assert inputs is not None
    # Weighted aggregate (equal weight 1 per listing when aggregate
    # empty): (0.9 + 0.5)/2 = 0.7.
    assert inputs.review_rating_mean_normalised == pytest.approx(0.7)
    # Review count proxied from listing count (aggregate empty).
    assert inputs.review_count == 2
    assert inputs.verified_flag is True
    # Oldest listing age used (60 days, well past cutoff -> no boost).
    assert inputs.age_days >= 60.0 - 0.5
    # Summary includes both listings.
    assert len(summary) == 2
    # Stopgap flags present (total_reviews == 0 so listing_count proxy).
    assert meta["stopgap"]["listing_count_proxies_review_count"] is True
    assert meta["listing_count"] == 2


@pytest.mark.asyncio
async def test_gather_creator_inputs_no_published_listings(fake_trust_pool) -> None:
    """Creator with zero published listings aggregates to R=0 + listing_count=0."""

    conn = fake_trust_pool._test_conn
    user_row = make_user_trust_row(user_id=USER_ID, tenant_id=TENANT_ID)
    conn.fetchrow = AsyncMock(side_effect=[user_row, None])
    conn.fetch = AsyncMock(return_value=[])

    user, inputs, summary, meta = await trust_service.gather_creator_inputs(
        conn, user_id=USER_ID
    )
    assert inputs is not None
    assert inputs.review_rating_mean_normalised == 0.0
    assert inputs.review_count == 0
    assert summary == []
    assert meta["listing_count"] == 0


@pytest.mark.asyncio
async def test_compute_creator_trust_missing_user_returns_none(
    fake_trust_pool,
) -> None:
    conn = fake_trust_pool._test_conn
    conn.fetchrow = AsyncMock(return_value=None)

    out = await trust_service.compute_creator_trust(
        user_id=USER_ID, tenant_id=TENANT_ID
    )
    assert out is None


@pytest.mark.asyncio
async def test_persist_creator_trust_writes_snapshot_and_user_cache(
    fake_trust_pool,
) -> None:
    conn = fake_trust_pool._test_conn
    user_row = make_user_trust_row(user_id=USER_ID, tenant_id=TENANT_ID)
    empty_aggregate = {
        "review_count": 0,
        "rating_sum": 0,
        "helpful_count": 0,
        "flag_count": 0,
    }
    # user_row + 1 listing aggregate + identity_row.
    conn.fetchrow = AsyncMock(
        side_effect=[user_row, empty_aggregate, {"status": "active"}]
    )
    conn.fetch = AsyncMock(
        return_value=[
            {
                "id": uuid4(),
                "category": "content",
                "trust_score_cached": 0.8,
                "created_at": datetime.now(timezone.utc) - timedelta(days=45),
                "status": "published",
            }
        ]
    )
    conn.execute = AsyncMock(return_value="OK")

    out = await trust_service.persist_creator_trust(
        user_id=USER_ID, tenant_id=TENANT_ID, actor_user_id=USER_ID
    )
    assert out is not None
    executes = conn.execute.await_args_list
    insert_calls = [
        c for c in executes if "INSERT INTO trust_score_snapshot" in c.args[0]
    ]
    update_calls = [
        c for c in executes if "UPDATE app_user" in c.args[0]
    ]
    assert len(insert_calls) == 1
    assert len(update_calls) == 1
    assert "creator_trust_score_cached" in update_calls[0].args[0]


# ---------------------------------------------------------------------------
# read_cached_creator_trust
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_read_cached_creator_trust_fresh_hit(fake_trust_pool) -> None:
    conn = fake_trust_pool._test_conn
    recent = datetime.now(timezone.utc) - timedelta(hours=2)
    row = make_user_trust_row(
        user_id=USER_ID,
        tenant_id=TENANT_ID,
        creator_trust_score_cached=0.65,
        creator_trust_score_cached_at=recent,
        creator_trust_score_band="trusted",
        creator_verified_badge=True,
        creator_trust_score_components_cached=json.dumps(
            {"components": {}, "boost_components": {}, "inputs_summary": {}}
        ),
    )
    conn.fetchrow = AsyncMock(return_value=row)

    payload = await trust_service.read_cached_creator_trust(
        user_id=USER_ID, tenant_id=TENANT_ID
    )
    assert payload is not None
    assert payload["cached"] is True
    assert payload["verified_badge"] is True
    assert payload["score"] == pytest.approx(0.65)
    assert payload["band"] == "trusted"
    executes = conn.execute.await_args_list
    assert not any(
        "INSERT INTO trust_score_snapshot" in c.args[0] for c in executes
    )


@pytest.mark.asyncio
async def test_read_cached_creator_trust_missing_returns_none(
    fake_trust_pool,
) -> None:
    conn = fake_trust_pool._test_conn
    conn.fetchrow = AsyncMock(return_value=None)

    payload = await trust_service.read_cached_creator_trust(
        user_id=USER_ID, tenant_id=TENANT_ID
    )
    assert payload is None
