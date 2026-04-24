"""Tests for :mod:`src.backend.budget.cap_flag` transitions.

Owner: Moros (W2 NP P3 S1).

Coverage:

- ``trip_global_cap`` ordering: Redis first, Hemera second, broadcast third.
- Idempotency: second trip call with flag already set is a no-op.
- ``clear_global_cap`` restores the Hemera flag only when ``auto_disabled``
  was set by Moros.
- ``evaluate_and_cap`` threshold ladder: under / warn 90 / hard 100 daily /
  hard 100 monthly.
- Nike broadcast failure is swallowed (cron survives).
"""

from __future__ import annotations

import json
from decimal import Decimal
from typing import Any

import pytest

from src.backend.budget import cap_flag
from src.backend.budget.redis_keys import (
    CAP_EVENTS_CHANNEL,
    GLOBAL_AUTO_DISABLED_FLAG,
    GLOBAL_CAP_FLAG,
)


# ---------------------------------------------------------------------------
# trip_global_cap ordering
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_trip_global_cap_sets_redis_first(monkeypatch, fake_redis) -> None:
    """The cap flag must land in Redis before Hemera is touched.

    Kratos's fast-path guard reads the Redis flag synchronously;
    Hemera's cache takes up to 10 s to propagate, so we close the race
    by setting Redis first.
    """

    call_order: list[str] = []

    async def _fake_hemera(value: bool, *, reason: str) -> None:
        call_order.append(f"hemera:{value}:{reason}")
        # Snapshot Redis state at Hemera-write time.
        call_order.append(f"redis_seen:{fake_redis.strings.get(GLOBAL_CAP_FLAG)}")

    async def _fake_broadcast(redis: Any, **kwargs: Any) -> None:
        call_order.append(f"broadcast:{kwargs['event_type']}")

    monkeypatch.setattr(cap_flag, "_set_hemera_flag", _fake_hemera)
    monkeypatch.setattr(cap_flag, "_broadcast_cap_event", _fake_broadcast)

    tripped = await cap_flag.trip_global_cap(
        redis=fake_redis,
        kind="daily",
        spent_usd=Decimal("100"),
        cap_usd=Decimal("100"),
        cycle_id="c1",
    )

    assert tripped is True
    # Redis sees the flag set BEFORE Hemera is called.
    assert call_order[0].startswith("hemera:")
    assert call_order[1] == "redis_seen:1"
    # Broadcast fires LAST.
    assert call_order[-1] == f"broadcast:{cap_flag.PUBLISH_EVENT_TRIPPED}"


@pytest.mark.asyncio
async def test_trip_global_cap_is_idempotent(monkeypatch, fake_redis) -> None:
    """A second trip call with the flag already set returns False + skips work."""

    hemera_calls = 0
    broadcast_calls = 0

    async def _fake_hemera(value: bool, *, reason: str) -> None:
        nonlocal hemera_calls
        hemera_calls += 1

    async def _fake_broadcast(redis: Any, **kwargs: Any) -> None:
        nonlocal broadcast_calls
        broadcast_calls += 1

    monkeypatch.setattr(cap_flag, "_set_hemera_flag", _fake_hemera)
    monkeypatch.setattr(cap_flag, "_broadcast_cap_event", _fake_broadcast)

    # First trip.
    first = await cap_flag.trip_global_cap(
        redis=fake_redis,
        kind="daily",
        spent_usd=Decimal("100"),
        cap_usd=Decimal("100"),
    )
    # Second trip; flag already set.
    second = await cap_flag.trip_global_cap(
        redis=fake_redis,
        kind="daily",
        spent_usd=Decimal("110"),
        cap_usd=Decimal("100"),
    )

    assert first is True
    assert second is False
    assert hemera_calls == 1, "Hemera must not be touched on the idempotent path"
    assert broadcast_calls == 1, "Broadcast must not re-fire on idempotent repeat"


@pytest.mark.asyncio
async def test_trip_global_cap_sets_auto_disabled_marker(
    monkeypatch, fake_redis
) -> None:
    """The ``chronos:global_auto_disabled`` marker must be set so the daily
    reset cron knows it safely owns the Hemera flag restoration.
    """

    async def _noop(*args: Any, **kwargs: Any) -> None:
        return None

    monkeypatch.setattr(cap_flag, "_set_hemera_flag", _noop)
    monkeypatch.setattr(cap_flag, "_broadcast_cap_event", _noop)

    await cap_flag.trip_global_cap(
        redis=fake_redis,
        kind="monthly",
        spent_usd=Decimal("500"),
        cap_usd=Decimal("500"),
    )

    assert fake_redis.strings.get(GLOBAL_CAP_FLAG) == "1"
    assert fake_redis.strings.get(GLOBAL_AUTO_DISABLED_FLAG) == "1"
    assert GLOBAL_AUTO_DISABLED_FLAG in fake_redis.expired


# ---------------------------------------------------------------------------
# clear_global_cap inverse
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_clear_global_cap_restores_hemera_only_when_auto(
    monkeypatch, fake_redis
) -> None:
    """Manual operator flip must not be overridden by the daily cron."""

    hemera_calls: list[tuple[bool, str]] = []

    async def _fake_hemera(value: bool, *, reason: str) -> None:
        hemera_calls.append((value, reason))

    async def _noop(*args: Any, **kwargs: Any) -> None:
        return None

    monkeypatch.setattr(cap_flag, "_set_hemera_flag", _fake_hemera)
    monkeypatch.setattr(cap_flag, "_broadcast_cap_event", _noop)

    # Scenario A: admin manually set cap (no auto marker). Clear should
    # remove Redis flag but must NOT touch Hemera.
    fake_redis.strings[GLOBAL_CAP_FLAG] = "1"
    had = await cap_flag.clear_global_cap(redis=fake_redis, cycle_id="r1")
    assert had is True
    assert hemera_calls == []

    # Scenario B: Moros tripped (auto marker set). Clear must restore Hemera.
    fake_redis.strings[GLOBAL_CAP_FLAG] = "1"
    fake_redis.strings[GLOBAL_AUTO_DISABLED_FLAG] = "1"
    await cap_flag.clear_global_cap(redis=fake_redis, cycle_id="r2")
    assert hemera_calls == [(True, cap_flag.REASON_AUTO_RESET)]


@pytest.mark.asyncio
async def test_clear_global_cap_returns_false_when_no_flag(
    monkeypatch, fake_redis
) -> None:
    """No-op clear on a healthy platform returns False."""

    async def _noop(*args: Any, **kwargs: Any) -> None:
        return None

    monkeypatch.setattr(cap_flag, "_set_hemera_flag", _noop)
    monkeypatch.setattr(cap_flag, "_broadcast_cap_event", _noop)

    had = await cap_flag.clear_global_cap(redis=fake_redis)
    assert had is False


# ---------------------------------------------------------------------------
# evaluate_and_cap threshold ladder
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_evaluate_under_threshold_no_action(
    monkeypatch, fake_redis
) -> None:
    """Spend under warn threshold -> no trip, no warn."""

    trips: list[dict[str, Any]] = []
    warns: list[dict[str, Any]] = []

    async def _trip(**kwargs: Any) -> bool:
        trips.append(kwargs)
        return True

    async def _emit(**kwargs: Any) -> None:
        warns.append(kwargs)

    monkeypatch.setattr(cap_flag, "trip_global_cap", _trip)
    monkeypatch.setattr(cap_flag, "emit_warning", _emit)

    decision = await cap_flag.evaluate_and_cap(
        redis=fake_redis,
        mtd_usd=Decimal("200"),
        daily_usd=Decimal("50"),
        daily_cap_usd=Decimal("100"),
        monthly_cap_usd=Decimal("500"),
    )

    assert decision.triggered is False
    assert decision.warn_emitted is False
    assert decision.kind is None
    assert trips == []
    assert warns == []


@pytest.mark.asyncio
async def test_evaluate_warn_threshold_monthly(monkeypatch, fake_redis) -> None:
    """Monthly spend crosses warn threshold -> emit_warning, no trip."""

    trips: list[dict[str, Any]] = []
    warns: list[dict[str, Any]] = []

    async def _trip(**kwargs: Any) -> bool:
        trips.append(kwargs)
        return True

    async def _emit(**kwargs: Any) -> None:
        warns.append(kwargs)

    monkeypatch.setattr(cap_flag, "trip_global_cap", _trip)
    monkeypatch.setattr(cap_flag, "emit_warning", _emit)

    decision = await cap_flag.evaluate_and_cap(
        redis=fake_redis,
        mtd_usd=Decimal("475"),  # 95% of 500
        daily_usd=Decimal("50"),
        daily_cap_usd=Decimal("100"),
        monthly_cap_usd=Decimal("500"),
    )

    assert decision.triggered is False
    assert decision.warn_emitted is True
    assert decision.kind == "monthly"
    assert trips == []
    assert len(warns) == 1
    assert warns[0]["kind"] == "monthly"


@pytest.mark.asyncio
async def test_evaluate_hard_cap_daily(monkeypatch, fake_redis) -> None:
    """Daily spend >= daily cap -> trip daily."""

    trips: list[dict[str, Any]] = []

    async def _trip(**kwargs: Any) -> bool:
        trips.append(kwargs)
        return True

    async def _emit(**kwargs: Any) -> None:
        raise AssertionError("Warn path must not run when hard cap is crossed")

    monkeypatch.setattr(cap_flag, "trip_global_cap", _trip)
    monkeypatch.setattr(cap_flag, "emit_warning", _emit)

    decision = await cap_flag.evaluate_and_cap(
        redis=fake_redis,
        mtd_usd=Decimal("400"),
        daily_usd=Decimal("100"),
        daily_cap_usd=Decimal("100"),
        monthly_cap_usd=Decimal("500"),
    )

    assert decision.triggered is True
    assert decision.kind == "daily"
    assert len(trips) == 1
    assert trips[0]["kind"] == "daily"


@pytest.mark.asyncio
async def test_evaluate_hard_cap_daily_wins_over_monthly(
    monkeypatch, fake_redis
) -> None:
    """Daily cap preference: when both cross the daily kind wins."""

    trips: list[dict[str, Any]] = []

    async def _trip(**kwargs: Any) -> bool:
        trips.append(kwargs)
        return True

    monkeypatch.setattr(cap_flag, "trip_global_cap", _trip)
    monkeypatch.setattr(cap_flag, "emit_warning", lambda **_: None)

    decision = await cap_flag.evaluate_and_cap(
        redis=fake_redis,
        mtd_usd=Decimal("500"),
        daily_usd=Decimal("100"),
        daily_cap_usd=Decimal("100"),
        monthly_cap_usd=Decimal("500"),
    )

    assert decision.kind == "daily"
    assert trips[0]["kind"] == "daily"


@pytest.mark.asyncio
async def test_evaluate_hard_cap_monthly_only(monkeypatch, fake_redis) -> None:
    """Only monthly crosses -> trip monthly."""

    trips: list[dict[str, Any]] = []

    async def _trip(**kwargs: Any) -> bool:
        trips.append(kwargs)
        return True

    monkeypatch.setattr(cap_flag, "trip_global_cap", _trip)
    monkeypatch.setattr(cap_flag, "emit_warning", lambda **_: None)

    decision = await cap_flag.evaluate_and_cap(
        redis=fake_redis,
        mtd_usd=Decimal("500"),
        daily_usd=Decimal("50"),
        daily_cap_usd=Decimal("100"),
        monthly_cap_usd=Decimal("500"),
    )

    assert decision.kind == "monthly"
    assert trips[0]["kind"] == "monthly"


# ---------------------------------------------------------------------------
# Broadcast seam
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_broadcast_publishes_to_pubsub_channel(
    monkeypatch, fake_redis
) -> None:
    """The Redis pub/sub publish must fire even when Nike manager is absent."""

    # Stub Hemera out so the broadcast is the only observable side effect.
    async def _noop_hemera(value: bool, *, reason: str) -> None:
        return None

    monkeypatch.setattr(cap_flag, "_set_hemera_flag", _noop_hemera)

    # Do NOT install a ConnectionManager; the broadcast helper falls back
    # to pub/sub only.
    await cap_flag.trip_global_cap(
        redis=fake_redis,
        kind="daily",
        spent_usd=Decimal("100"),
        cap_usd=Decimal("100"),
        cycle_id="c1",
    )

    assert fake_redis.published, "publish must fire even without Nike"
    channel, payload = fake_redis.published[0]
    assert channel == CAP_EVENTS_CHANNEL
    decoded = json.loads(payload)
    assert decoded["builder_disabled"] is True
    assert decoded["kind"] == "daily"
    assert decoded["cycle_id"] == "c1"
