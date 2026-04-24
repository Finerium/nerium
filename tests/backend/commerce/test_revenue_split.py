"""Pure-math tests for revenue split rounding + Hemera resolution."""

from __future__ import annotations

from uuid import uuid4

import pytest

from src.backend.commerce import revenue_split


# ---------------------------------------------------------------------------
# compute_split
# ---------------------------------------------------------------------------


def test_split_clean_20pct() -> None:
    result = revenue_split.compute_split(
        gross_amount_cents=1000, take_rate_percent=20
    )
    assert result.platform_fee_cents == 200
    assert result.creator_net_cents == 800
    assert result.platform_fee_cents + result.creator_net_cents == 1000
    assert result.minimum_floor_applied is False


def test_split_clean_15pct() -> None:
    result = revenue_split.compute_split(
        gross_amount_cents=10000, take_rate_percent=15
    )
    assert result.platform_fee_cents == 1500
    assert result.creator_net_cents == 8500


def test_split_rounding_creator_gets_remainder() -> None:
    # 999 * 20 / 100 = 199.8 -> truncate to 199 platform + 800 creator.
    result = revenue_split.compute_split(
        gross_amount_cents=999, take_rate_percent=20
    )
    assert result.platform_fee_cents == 199
    assert result.creator_net_cents == 800
    assert result.platform_fee_cents + result.creator_net_cents == 999


def test_split_minimum_floor_applied() -> None:
    # USD 1.00 at 20% = 20 cents; floor bumps to 50.
    result = revenue_split.compute_split(
        gross_amount_cents=100, take_rate_percent=20
    )
    assert result.platform_fee_cents == 50
    assert result.creator_net_cents == 50
    assert result.minimum_floor_applied is True


def test_split_minimum_floor_not_above_ceiling() -> None:
    # USD 3.00 at 20% = 60 cents; above 50-cent floor so no bump.
    result = revenue_split.compute_split(
        gross_amount_cents=300, take_rate_percent=20
    )
    assert result.platform_fee_cents == 60
    assert result.creator_net_cents == 240
    assert result.minimum_floor_applied is False


def test_split_zero_gross() -> None:
    result = revenue_split.compute_split(
        gross_amount_cents=0, take_rate_percent=20
    )
    assert result.platform_fee_cents == 0
    assert result.creator_net_cents == 0
    assert result.minimum_floor_applied is False


def test_split_invariant_always_holds() -> None:
    # Fuzz a range of amounts + rates. The two legs must always sum to
    # the gross so the DB CHECK constraint never rejects an insert.
    for gross in [1, 49, 50, 99, 100, 249, 250, 999, 1000, 9999, 12345]:
        for rate in [0, 10, 15, 20, 25, 33, 50, 100]:
            result = revenue_split.compute_split(
                gross_amount_cents=gross, take_rate_percent=rate
            )
            assert (
                result.platform_fee_cents + result.creator_net_cents == gross
            ), f"invariant broken at gross={gross} rate={rate}"


def test_split_rejects_negative_gross() -> None:
    with pytest.raises(ValueError):
        revenue_split.compute_split(
            gross_amount_cents=-1, take_rate_percent=20
        )


def test_split_rejects_rate_out_of_range() -> None:
    with pytest.raises(ValueError):
        revenue_split.compute_split(
            gross_amount_cents=1000, take_rate_percent=101
        )
    with pytest.raises(ValueError):
        revenue_split.compute_split(
            gross_amount_cents=1000, take_rate_percent=-1
        )


# ---------------------------------------------------------------------------
# resolve_take_rate_percent
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_resolve_default_from_hemera(monkeypatch) -> None:
    async def fake_get_flag(name, **kw):
        if name == "marketplace.platform_fee_pct":
            return 20
        return None

    monkeypatch.setattr(
        "src.backend.commerce.revenue_split.get_flag", fake_get_flag
    )
    rate = await revenue_split.resolve_take_rate_percent(
        category="content",
        user_id=uuid4(),
        tenant_id=uuid4(),
    )
    assert rate == 20


@pytest.mark.asyncio
async def test_resolve_premium_override(monkeypatch) -> None:
    # Category-specific override beats the Hemera default.
    async def fake_get_flag(name, **kw):
        return 20

    monkeypatch.setattr(
        "src.backend.commerce.revenue_split.get_flag", fake_get_flag
    )
    rate = await revenue_split.resolve_take_rate_percent(
        category="premium",
    )
    assert rate == revenue_split.PREMIUM_TAKE_RATE_PCT == 25


@pytest.mark.asyncio
async def test_resolve_services_lowers(monkeypatch) -> None:
    async def fake_get_flag(name, **kw):
        return 20

    monkeypatch.setattr(
        "src.backend.commerce.revenue_split.get_flag", fake_get_flag
    )
    rate = await revenue_split.resolve_take_rate_percent(
        category="services",
    )
    assert rate == revenue_split.SERVICES_TAKE_RATE_PCT == 15


@pytest.mark.asyncio
async def test_resolve_verified_creator_lowers_to_15(monkeypatch) -> None:
    async def fake_get_flag(name, **kw):
        if name == "commerce.verified_take_rate":
            return 15
        return 20

    monkeypatch.setattr(
        "src.backend.commerce.revenue_split.get_flag", fake_get_flag
    )
    rate = await revenue_split.resolve_take_rate_percent(
        category="content",
        verified_creator=True,
    )
    assert rate == 15


@pytest.mark.asyncio
async def test_resolve_revenue_split_override_beats_everything(
    monkeypatch,
) -> None:
    async def fake_get_flag(name, **kw):
        return 20

    monkeypatch.setattr(
        "src.backend.commerce.revenue_split.get_flag", fake_get_flag
    )
    # Creator share = 0.9 so platform keeps 10 percent regardless of
    # category or verified status.
    rate = await revenue_split.resolve_take_rate_percent(
        category="premium",  # would normally be 25
        verified_creator=True,  # would normally be 15
        revenue_split_override=0.9,
    )
    assert rate == 10


@pytest.mark.asyncio
async def test_resolve_override_clamps_to_valid_range(monkeypatch) -> None:
    async def fake_get_flag(name, **kw):
        return 20

    monkeypatch.setattr(
        "src.backend.commerce.revenue_split.get_flag", fake_get_flag
    )
    # Creator share = 1.5 -> clamp to 1.0 -> take_rate = 0.
    rate = await revenue_split.resolve_take_rate_percent(
        category="content",
        revenue_split_override=1.5,
    )
    assert rate == 0


@pytest.mark.asyncio
async def test_resolve_flag_outage_falls_back_to_default(monkeypatch) -> None:
    async def broken_get_flag(name, **kw):
        raise RuntimeError("hemera outage")

    monkeypatch.setattr(
        "src.backend.commerce.revenue_split.get_flag", broken_get_flag
    )
    rate = await revenue_split.resolve_take_rate_percent(category="content")
    assert rate == revenue_split.DEFAULT_TAKE_RATE_PCT == 20
