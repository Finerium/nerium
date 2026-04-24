"""Invalidator dispatch tests (no live Redis).

We call the private :func:`_dispatch` with a synthetic message + a
fake ``cache.invalidate_flag`` + ``service.refresh_bootstrap_flag`` so
the subscriber contract is exercised without round-tripping through
Redis. The live pub/sub loop is covered by integration tests opt-in.
"""

from __future__ import annotations

import json
from typing import Any
from unittest.mock import AsyncMock

import pytest

from src.backend.flags import invalidator


@pytest.mark.asyncio
async def test_dispatch_calls_cache_invalidate(monkeypatch) -> None:
    invalidate_mock = AsyncMock()
    refresh_mock = AsyncMock()
    monkeypatch.setattr(
        "src.backend.flags.invalidator.flag_cache.invalidate_flag",
        invalidate_mock,
    )
    monkeypatch.setattr(
        "src.backend.flags.invalidator.flag_service.refresh_bootstrap_flag",
        refresh_mock,
    )

    payload = json.dumps({"flag_names": ["a.b", "c.d"], "source": "test"})
    await invalidator._dispatch(payload)

    assert invalidate_mock.await_count == 2
    assert {c.args[0] for c in invalidate_mock.await_args_list} == {"a.b", "c.d"}
    assert refresh_mock.await_count == 2


@pytest.mark.asyncio
async def test_dispatch_fires_subscribers(monkeypatch) -> None:
    monkeypatch.setattr(
        "src.backend.flags.invalidator.flag_cache.invalidate_flag", AsyncMock()
    )
    monkeypatch.setattr(
        "src.backend.flags.invalidator.flag_service.refresh_bootstrap_flag",
        AsyncMock(),
    )

    captured: list[tuple[list[str], str]] = []

    async def subscriber(flag_names: list[str], source: str) -> None:
        captured.append((list(flag_names), source))

    invalidator.register_subscriber(subscriber)
    payload = json.dumps({"flag_names": ["x.y"], "source": "admin_api"})
    await invalidator._dispatch(payload)
    assert captured == [(["x.y"], "admin_api")]


@pytest.mark.asyncio
async def test_dispatch_bytes_payload(monkeypatch) -> None:
    monkeypatch.setattr(
        "src.backend.flags.invalidator.flag_cache.invalidate_flag", AsyncMock()
    )
    monkeypatch.setattr(
        "src.backend.flags.invalidator.flag_service.refresh_bootstrap_flag",
        AsyncMock(),
    )

    payload = json.dumps({"flag_names": ["b.c"], "source": "ttl"}).encode("utf-8")
    await invalidator._dispatch(payload)
    # no raise is enough; subscribers empty so no other side-effect


@pytest.mark.asyncio
async def test_dispatch_invalid_json_logged_and_returns(monkeypatch, caplog) -> None:
    monkeypatch.setattr(
        "src.backend.flags.invalidator.flag_cache.invalidate_flag", AsyncMock()
    )
    monkeypatch.setattr(
        "src.backend.flags.invalidator.flag_service.refresh_bootstrap_flag",
        AsyncMock(),
    )

    # Should not raise.
    await invalidator._dispatch("not json")


@pytest.mark.asyncio
async def test_dispatch_subscriber_exception_swallowed(monkeypatch) -> None:
    monkeypatch.setattr(
        "src.backend.flags.invalidator.flag_cache.invalidate_flag", AsyncMock()
    )
    monkeypatch.setattr(
        "src.backend.flags.invalidator.flag_service.refresh_bootstrap_flag",
        AsyncMock(),
    )
    ran_second: list[Any] = []

    async def broken(_: list[str], __: str) -> None:
        raise RuntimeError("boom")

    async def second(_: list[str], __: str) -> None:
        ran_second.append(True)

    invalidator.register_subscriber(broken)
    invalidator.register_subscriber(second)
    payload = json.dumps({"flag_names": ["z"], "source": "unit"})
    # One raising subscriber must not prevent the next from running.
    await invalidator._dispatch(payload)
    assert ran_second == [True]


@pytest.mark.asyncio
async def test_dispatch_bad_shape_ignored(monkeypatch) -> None:
    monkeypatch.setattr(
        "src.backend.flags.invalidator.flag_cache.invalidate_flag", AsyncMock()
    )
    monkeypatch.setattr(
        "src.backend.flags.invalidator.flag_service.refresh_bootstrap_flag",
        AsyncMock(),
    )

    payload = json.dumps({"wrong_key": 1})
    await invalidator._dispatch(payload)  # should not raise
