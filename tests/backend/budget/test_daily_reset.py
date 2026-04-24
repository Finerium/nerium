"""Tests for :mod:`src.backend.budget.daily_reset`.

Owner: Moros (W2 NP P3 S1).

Covers the 00:00 UTC Arq cron body:

- Redis global cap flag + auto_disabled marker cleared only when Moros
  had tripped the cap.
- Per-tenant ``chronos:tenant:*:usd_today`` counters swept.
- ``chronos:last_poll`` touched so the admin endpoint reflects the
  reset turn-over instead of a day-old poll.
- Hemera ``builder.live`` is restored only when auto_disabled was set
  (never fights a manual operator flip).
"""

from __future__ import annotations

from typing import Any

import pytest

from src.backend.budget import cap_flag, daily_reset
from src.backend.budget.redis_keys import (
    GLOBAL_AUTO_DISABLED_FLAG,
    GLOBAL_CAP_FLAG,
    LAST_POLL_HASH,
    LAST_RECONCILE_TS,
    TENANT_CAP_FLAG_FMT,
    TENANT_SPENT_TODAY_FMT,
)


@pytest.mark.asyncio
async def test_daily_reset_clears_flag_and_restores_hemera(
    monkeypatch, fake_redis
) -> None:
    """Auto-disabled + capped flags in place -> Hemera restoration fires."""

    hemera_calls: list[tuple[bool, str]] = []

    async def _fake_hemera(value: bool, *, reason: str) -> None:
        hemera_calls.append((value, reason))

    async def _noop(*args: Any, **kwargs: Any) -> None:
        return None

    monkeypatch.setattr(cap_flag, "_set_hemera_flag", _fake_hemera)
    monkeypatch.setattr(cap_flag, "_broadcast_cap_event", _noop)

    fake_redis.strings[GLOBAL_CAP_FLAG] = "1"
    fake_redis.strings[GLOBAL_AUTO_DISABLED_FLAG] = "1"

    summary = await daily_reset.chronos_daily_reset(redis=fake_redis)

    assert summary["global_cap_cleared"] is True
    assert GLOBAL_CAP_FLAG not in fake_redis.strings
    assert GLOBAL_AUTO_DISABLED_FLAG not in fake_redis.strings
    assert hemera_calls == [(True, cap_flag.REASON_AUTO_RESET)]


@pytest.mark.asyncio
async def test_daily_reset_leaves_manual_flag_alone(
    monkeypatch, fake_redis
) -> None:
    """Manual operator flip on builder.live is never clobbered by the cron."""

    hemera_calls: list[tuple[bool, str]] = []

    async def _fake_hemera(value: bool, *, reason: str) -> None:
        hemera_calls.append((value, reason))

    async def _noop(*args: Any, **kwargs: Any) -> None:
        return None

    monkeypatch.setattr(cap_flag, "_set_hemera_flag", _fake_hemera)
    monkeypatch.setattr(cap_flag, "_broadcast_cap_event", _noop)

    # Manual cap: flag set but auto_disabled marker absent.
    fake_redis.strings[GLOBAL_CAP_FLAG] = "1"

    summary = await daily_reset.chronos_daily_reset(redis=fake_redis)

    assert summary["global_cap_cleared"] is True
    # Redis flag cleared (safe) but Hemera untouched (never fight operator).
    assert GLOBAL_CAP_FLAG not in fake_redis.strings
    assert hemera_calls == []


@pytest.mark.asyncio
async def test_daily_reset_sweeps_tenant_counters(
    monkeypatch, fake_redis
) -> None:
    """``chronos:tenant:*:usd_today`` keys must be removed by the sweep."""

    async def _noop(*args: Any, **kwargs: Any) -> None:
        return None

    monkeypatch.setattr(cap_flag, "_set_hemera_flag", _noop)
    monkeypatch.setattr(cap_flag, "_broadcast_cap_event", _noop)

    tenant_a = TENANT_SPENT_TODAY_FMT.format(tenant_id="aaa")
    tenant_b = TENANT_SPENT_TODAY_FMT.format(tenant_id="bbb")
    tenant_flag = TENANT_CAP_FLAG_FMT.format(tenant_id="ccc")
    fake_redis.strings[tenant_a] = "42.50"
    fake_redis.strings[tenant_b] = "9.99"
    fake_redis.strings[tenant_flag] = "1"

    summary = await daily_reset.chronos_daily_reset(redis=fake_redis)

    # Both counter keys + the tenant flag must be gone.
    assert tenant_a not in fake_redis.strings
    assert tenant_b not in fake_redis.strings
    assert tenant_flag not in fake_redis.strings
    assert summary["tenant_counter_keys_cleared"] >= 3


@pytest.mark.asyncio
async def test_daily_reset_refreshes_last_poll_snapshot(
    monkeypatch, fake_redis
) -> None:
    """The cron rewrites ``chronos:last_poll`` so admin UI reflects the reset."""

    async def _noop(*args: Any, **kwargs: Any) -> None:
        return None

    monkeypatch.setattr(cap_flag, "_set_hemera_flag", _noop)
    monkeypatch.setattr(cap_flag, "_broadcast_cap_event", _noop)

    # Stale previous poll snapshot.
    fake_redis.hashes[LAST_POLL_HASH] = {
        "cycle_id": "old-cycle",
        "mtd_usd": "500",
        "daily_usd": "100",
        "ts": "2026-04-23T12:00:00Z",
    }

    await daily_reset.chronos_daily_reset(redis=fake_redis)

    fresh = fake_redis.hashes[LAST_POLL_HASH]
    assert fresh["decision_kind"] == "daily_reset"
    assert fresh["mtd_usd"] == "0"
    assert fresh["daily_usd"] == "0"
    assert fresh["cycle_id"] != "old-cycle"
    assert fake_redis.strings.get(LAST_RECONCILE_TS)
