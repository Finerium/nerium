"""Tests for :mod:`src.backend.ma.budget_guard`.

Owner: Kratos (W2 S1).

The guard is the second pre-call gate; it refuses to let the
dispatcher burn tokens when Chronos (Moros-owned) says we are capped.

Scenarios covered:

- Global cap flag set -> :class:`BudgetCapTripped` with scope=global.
- Tenant cap flag set -> raise with scope=tenant.
- Headroom exhausted -> raise with ``remaining_usd``.
- Redis outage on either read -> fail closed (raise).
- Healthy spend + cap -> no raise.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

import pytest

from src.backend.ma.budget_guard import (
    CHRONOS_GLOBAL_CAP_KEY,
    CHRONOS_TENANT_CAP_KEY_FMT,
    CHRONOS_TENANT_CAP_USD_KEY_FMT,
    CHRONOS_TENANT_SPENT_KEY_FMT,
    enforce_budget_cap,
)
from src.backend.ma.errors import BudgetCapTripped

TENANT = "bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb"


class _FakeRedis:
    """Minimal async Redis stand-in for the guard tests.

    Exposes ``get`` + ``mget`` so the guard can choose either path.
    Storage is a plain dict so tests assert on reads + writes easily.
    """

    def __init__(self, store: dict[str, str] | None = None) -> None:
        self.store: dict[str, str] = dict(store or {})
        self.raises: dict[str, Exception] = {}

    async def get(self, key: str) -> Any:
        if key in self.raises:
            raise self.raises[key]
        return self.store.get(key)

    async def mget(self, *keys: str) -> list[Any]:
        values: list[Any] = []
        for key in keys:
            if key in self.raises:
                raise self.raises[key]
            values.append(self.store.get(key))
        return values


@pytest.mark.asyncio
async def test_global_cap_flag_short_circuits() -> None:
    """Scope=global when ``chronos:ma_capped`` is set."""

    redis = _FakeRedis({CHRONOS_GLOBAL_CAP_KEY: "1"})
    with pytest.raises(BudgetCapTripped) as excinfo:
        await enforce_budget_cap(TENANT, Decimal("1.00"), redis=redis)
    assert excinfo.value.reason == "global_cap_tripped"
    assert excinfo.value.scope == "global"


@pytest.mark.asyncio
async def test_tenant_cap_flag_short_circuits() -> None:
    """Scope=tenant when ``chronos:tenant:<id>:capped`` is set."""

    redis = _FakeRedis(
        {CHRONOS_TENANT_CAP_KEY_FMT.format(tenant_id=TENANT): "1"}
    )
    with pytest.raises(BudgetCapTripped) as excinfo:
        await enforce_budget_cap(TENANT, Decimal("1.00"), redis=redis)
    assert excinfo.value.reason == "tenant_cap_tripped"
    assert excinfo.value.scope == "tenant"


@pytest.mark.asyncio
async def test_insufficient_remaining() -> None:
    """Projected spend exceeds cap -> raise with remaining_usd."""

    redis = _FakeRedis(
        {
            CHRONOS_TENANT_SPENT_KEY_FMT.format(tenant_id=TENANT): "95.00",
            CHRONOS_TENANT_CAP_USD_KEY_FMT.format(tenant_id=TENANT): "100.00",
        }
    )
    with pytest.raises(BudgetCapTripped) as excinfo:
        await enforce_budget_cap(TENANT, Decimal("10.00"), redis=redis)
    assert excinfo.value.reason == "insufficient_remaining"
    assert excinfo.value.scope == "tenant"
    assert excinfo.value.remaining_usd == pytest.approx(5.0)


@pytest.mark.asyncio
async def test_healthy_headroom_allows() -> None:
    """No raise when spend + requested is under the tenant cap."""

    redis = _FakeRedis(
        {
            CHRONOS_TENANT_SPENT_KEY_FMT.format(tenant_id=TENANT): "10.00",
            CHRONOS_TENANT_CAP_USD_KEY_FMT.format(tenant_id=TENANT): "100.00",
        }
    )
    await enforce_budget_cap(TENANT, Decimal("5.00"), redis=redis)


@pytest.mark.asyncio
async def test_default_cap_when_tenant_cap_missing() -> None:
    """Missing ``:cap_usd`` falls back to :data:`DEFAULT_TENANT_DAILY_CAP_USD`."""

    redis = _FakeRedis(
        {
            CHRONOS_TENANT_SPENT_KEY_FMT.format(tenant_id=TENANT): "0.00",
        }
    )
    # USD 100 default; requesting USD 50 passes.
    await enforce_budget_cap(TENANT, Decimal("50.00"), redis=redis)


@pytest.mark.asyncio
async def test_redis_outage_on_global_fails_closed() -> None:
    """Raising Redis client on first read -> raise with scope=global."""

    redis = _FakeRedis()
    redis.raises[CHRONOS_GLOBAL_CAP_KEY] = RuntimeError("redis dead")
    with pytest.raises(BudgetCapTripped) as excinfo:
        await enforce_budget_cap(TENANT, Decimal("1.00"), redis=redis)
    assert excinfo.value.scope == "global"
    assert excinfo.value.reason == "redis_unavailable_global"


@pytest.mark.asyncio
async def test_redis_outage_on_tenant_mget_fails_closed() -> None:
    """Raising on tenant-bucket mget -> raise with scope=tenant."""

    redis = _FakeRedis()
    # global ok, tenant mget raises
    redis.raises[CHRONOS_TENANT_CAP_KEY_FMT.format(tenant_id=TENANT)] = (
        RuntimeError("redis dead")
    )
    with pytest.raises(BudgetCapTripped) as excinfo:
        await enforce_budget_cap(TENANT, Decimal("1.00"), redis=redis)
    assert excinfo.value.scope == "tenant"
    assert excinfo.value.reason == "redis_unavailable_tenant"
