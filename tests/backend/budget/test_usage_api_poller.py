"""Tests for :mod:`src.backend.budget.usage_api_poller`.

Owner: Moros (W2 NP P3 S1).

Covers:

- Successful poll records mtd / daily / cycle_id to Redis + resets the
  consecutive-failures counter.
- 429 + 5xx responses bump the failures counter + write ``last_error``.
- Network timeout path lands in the same failure branch.
- Redis single-runner lock prevents a second concurrent poll in the
  same minute.
- Missing Admin API key short-circuits with ``skipped_reason``.
- Cost-report body parser handles nested ``results`` + missing
  ``amount_cents`` gracefully.
- Exponential backoff ladder is deterministic.
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

import httpx
import pytest

from src.backend.budget import cap_flag
from src.backend.budget import usage_api_poller as poller
from src.backend.budget.redis_keys import (
    CONSECUTIVE_FAILURES,
    LAST_ERROR,
    LAST_POLL_HASH,
    LAST_RECONCILE_TS,
    POLL_LOCK,
)
from src.backend.config import Settings


class _FakeSettings:
    """Minimal stand-in for ``src.backend.config.Settings``."""

    def __init__(self, *, admin_key: str = "sk-admin-test") -> None:
        class _Secret:
            def __init__(self, v: str) -> None:
                self._v = v

            def get_secret_value(self) -> str:
                return self._v

        self.anthropic_admin_api_key = _Secret(admin_key)
        self.anthropic_admin_api_base_url = "https://api.test"
        self.chronos_poll_interval_seconds = 600
        self.chronos_backoff_base_seconds = 30.0
        self.chronos_backoff_max_seconds = 600.0
        self.chronos_consecutive_failure_alert = 5
        self.chronos_admin_api_timeout_seconds = 1.0


def _install_fake_settings(monkeypatch, *, admin_key: str = "sk-admin-test") -> None:
    fake = _FakeSettings(admin_key=admin_key)
    monkeypatch.setattr(poller, "get_settings", lambda: fake)


def _install_stub_load_policy(monkeypatch) -> None:
    async def _policy() -> tuple[float, Decimal, Decimal]:
        return 0.90, Decimal("100"), Decimal("500")

    monkeypatch.setattr(poller, "_load_policy", _policy)


def _install_cap_noop(monkeypatch) -> None:
    async def _evaluate(**kwargs: Any):
        return cap_flag.CapDecision(
            triggered=False,
            warn_emitted=False,
            kind=None,
            spent_usd=Decimal("0"),
            cap_usd=Decimal("0"),
            pct=0.0,
        )

    monkeypatch.setattr(cap_flag, "evaluate_and_cap", _evaluate)


# ---------------------------------------------------------------------------
# parse_cost_report
# ---------------------------------------------------------------------------


def test_parse_cost_report_flat_buckets() -> None:
    """Cost report with ``amount_cents`` at the bucket level sums cleanly."""

    today = datetime(2026, 4, 24, 12, 0, tzinfo=timezone.utc)
    body = {
        "data": [
            {"starting_at": "2026-04-01T00:00:00Z", "amount_cents": 500},  # $5
            {"starting_at": "2026-04-24T00:00:00Z", "amount_cents": 2500},  # $25 today
        ]
    }

    mtd, daily, buckets, per_model = poller.parse_cost_report(body, today=today)
    assert mtd == Decimal("30.000000")
    assert daily == Decimal("25.000000")
    assert buckets == 2
    assert per_model == {}


def test_parse_cost_report_nested_results_per_model() -> None:
    """Nested ``results`` attributes USD per model into ``per_model``."""

    today = datetime(2026, 4, 24, 12, 0, tzinfo=timezone.utc)
    body = {
        "data": [
            {
                "starting_at": "2026-04-24T00:00:00Z",
                "amount_cents": 1500,  # $15 total
                "results": [
                    {"model": "claude-opus-4-7", "amount_cents": 1000},
                    {"model": "claude-sonnet-4-6", "amount_cents": 500},
                ],
            }
        ]
    }

    mtd, daily, _, per_model = poller.parse_cost_report(body, today=today)
    assert mtd == Decimal("15.000000")
    assert daily == Decimal("15.000000")
    assert per_model["claude-opus-4-7"] == Decimal("10.000000")
    assert per_model["claude-sonnet-4-6"] == Decimal("5.000000")


def test_parse_cost_report_missing_amount_falls_back_to_results() -> None:
    """Bucket without ``amount_cents`` still sums via nested results."""

    today = datetime(2026, 4, 24, tzinfo=timezone.utc)
    body = {
        "data": [
            {
                "starting_at": "2026-04-24T00:00:00Z",
                "results": [
                    {"model": "claude-opus-4-7", "amount_cents": 2500}
                ],
            }
        ]
    }

    mtd, daily, _, per_model = poller.parse_cost_report(body, today=today)
    assert mtd == Decimal("25.000000")
    assert daily == Decimal("25.000000")
    assert per_model == {"claude-opus-4-7": Decimal("25.000000")}


def test_parse_cost_report_silently_skips_malformed() -> None:
    today = datetime(2026, 4, 24, tzinfo=timezone.utc)
    body = {
        "data": [
            "not-a-dict",
            {"starting_at": "2026-04-24T00:00:00Z"},  # no amount, no results
            {"starting_at": "2026-04-24T00:00:00Z", "amount_cents": 100},
        ]
    }

    mtd, daily, buckets, _ = poller.parse_cost_report(body, today=today)
    assert mtd == Decimal("1.000000")
    assert daily == Decimal("1.000000")
    # Only the valid bucket counts.
    assert buckets == 1


# ---------------------------------------------------------------------------
# compute_backoff_delay
# ---------------------------------------------------------------------------


def test_compute_backoff_delay_ladder() -> None:
    """Exponential doubling with ceiling."""

    assert poller.compute_backoff_delay(0, base_seconds=30, max_seconds=600) == 0
    assert poller.compute_backoff_delay(1, base_seconds=30, max_seconds=600) == 30
    assert poller.compute_backoff_delay(2, base_seconds=30, max_seconds=600) == 60
    assert poller.compute_backoff_delay(3, base_seconds=30, max_seconds=600) == 120
    # 30 * 2 ** 5 = 960, capped at 600.
    assert poller.compute_backoff_delay(6, base_seconds=30, max_seconds=600) == 600


# ---------------------------------------------------------------------------
# poll_anthropic_usage
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_poll_skips_when_admin_key_missing(
    monkeypatch, fake_redis
) -> None:
    _install_fake_settings(monkeypatch, admin_key="")
    _install_stub_load_policy(monkeypatch)
    _install_cap_noop(monkeypatch)

    result = await poller.poll_anthropic_usage(redis=fake_redis)
    assert result.success is False
    assert result.skipped_reason == "admin_key_missing"


@pytest.mark.asyncio
async def test_poll_single_runner_lock_blocks_concurrent(
    monkeypatch, fake_redis
) -> None:
    """Second poll in the same minute is skipped via ``chronos:poll_lock``."""

    _install_fake_settings(monkeypatch)
    _install_stub_load_policy(monkeypatch)
    _install_cap_noop(monkeypatch)

    # Pre-set the lock so the acquire NX returns None.
    fake_redis.strings[POLL_LOCK] = "1"

    result = await poller.poll_anthropic_usage(redis=fake_redis)
    assert result.success is False
    assert result.skipped_reason == "locked"


@pytest.mark.asyncio
async def test_poll_success_writes_state(monkeypatch, fake_redis) -> None:
    """Happy path populates ``chronos:last_poll`` + clears last_error."""

    _install_fake_settings(monkeypatch)
    _install_stub_load_policy(monkeypatch)
    _install_cap_noop(monkeypatch)

    today = datetime.now(timezone.utc).date().isoformat()
    body = {
        "data": [
            {"starting_at": f"{today}T00:00:00Z", "amount_cents": 1500},
        ]
    }

    def _handler(request: httpx.Request) -> httpx.Response:
        assert request.headers.get("x-api-key") == "sk-admin-test"
        assert request.url.path == poller.ADMIN_API_COST_PATH
        return httpx.Response(200, json=body)

    transport = httpx.MockTransport(_handler)
    async with httpx.AsyncClient(
        transport=transport, base_url="https://api.test"
    ) as client:
        result = await poller.poll_anthropic_usage(
            redis=fake_redis, http_client=client
        )

    assert result.success is True
    assert result.daily_usd == Decimal("15.000000")
    assert fake_redis.hashes.get(LAST_POLL_HASH)
    assert fake_redis.strings.get(LAST_RECONCILE_TS)
    # consecutive_failures cleared.
    assert fake_redis.strings.get(CONSECUTIVE_FAILURES) == "0"
    # Poll lock released.
    assert POLL_LOCK not in fake_redis.strings


@pytest.mark.asyncio
async def test_poll_http_429_increments_failure_counter(
    monkeypatch, fake_redis
) -> None:
    _install_fake_settings(monkeypatch)
    _install_stub_load_policy(monkeypatch)
    _install_cap_noop(monkeypatch)

    def _handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(429, json={"error": "rate_limited"})

    transport = httpx.MockTransport(_handler)
    async with httpx.AsyncClient(
        transport=transport, base_url="https://api.test"
    ) as client:
        result = await poller.poll_anthropic_usage(
            redis=fake_redis, http_client=client
        )

    assert result.success is False
    assert result.last_error
    assert fake_redis.strings.get(CONSECUTIVE_FAILURES) == "1"
    assert fake_redis.strings.get(LAST_ERROR)
    # Lock released even on failure.
    assert POLL_LOCK not in fake_redis.strings


@pytest.mark.asyncio
async def test_poll_http_500_increments_failure_counter(
    monkeypatch, fake_redis
) -> None:
    _install_fake_settings(monkeypatch)
    _install_stub_load_policy(monkeypatch)
    _install_cap_noop(monkeypatch)

    def _handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"error": "server_down"})

    transport = httpx.MockTransport(_handler)
    async with httpx.AsyncClient(
        transport=transport, base_url="https://api.test"
    ) as client:
        result = await poller.poll_anthropic_usage(
            redis=fake_redis, http_client=client
        )

    assert result.success is False
    assert fake_redis.strings.get(CONSECUTIVE_FAILURES) == "1"


@pytest.mark.asyncio
async def test_poll_network_timeout_is_recorded(
    monkeypatch, fake_redis
) -> None:
    _install_fake_settings(monkeypatch)
    _install_stub_load_policy(monkeypatch)
    _install_cap_noop(monkeypatch)

    def _handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectTimeout("connect timeout")

    transport = httpx.MockTransport(_handler)
    async with httpx.AsyncClient(
        transport=transport, base_url="https://api.test"
    ) as client:
        result = await poller.poll_anthropic_usage(
            redis=fake_redis, http_client=client
        )

    assert result.success is False
    assert fake_redis.strings.get(CONSECUTIVE_FAILURES) == "1"
    stored_error = fake_redis.strings.get(LAST_ERROR, "")
    assert "Timeout" in stored_error or "timeout" in stored_error


@pytest.mark.asyncio
async def test_poll_sanitises_error_redacts_api_key(
    monkeypatch, fake_redis
) -> None:
    """A raised error whose repr includes the api-key is redacted."""

    _install_fake_settings(monkeypatch)
    _install_stub_load_policy(monkeypatch)
    _install_cap_noop(monkeypatch)

    def _handler(request: httpx.Request) -> httpx.Response:
        raise RuntimeError("x-api-key sk-admin-test leaked")

    transport = httpx.MockTransport(_handler)
    async with httpx.AsyncClient(
        transport=transport, base_url="https://api.test"
    ) as client:
        result = await poller.poll_anthropic_usage(
            redis=fake_redis, http_client=client
        )

    assert result.last_error is not None
    assert "sk-admin-test" not in result.last_error
    assert "[redacted]" in result.last_error


@pytest.mark.asyncio
async def test_poll_evaluates_cap_with_fresh_spend(
    monkeypatch, fake_redis
) -> None:
    """Successful poll forwards ``mtd_usd`` + ``daily_usd`` to ``evaluate_and_cap``."""

    _install_fake_settings(monkeypatch)
    _install_stub_load_policy(monkeypatch)

    captured: list[dict[str, Any]] = []

    async def _evaluate(**kwargs: Any):
        captured.append(kwargs)
        return cap_flag.CapDecision(
            triggered=False,
            warn_emitted=False,
            kind=None,
            spent_usd=Decimal("0"),
            cap_usd=Decimal("0"),
            pct=0.0,
        )

    monkeypatch.setattr(cap_flag, "evaluate_and_cap", _evaluate)

    today = datetime.now(timezone.utc).date().isoformat()
    body = {
        "data": [
            {"starting_at": f"{today}T00:00:00Z", "amount_cents": 12345}
        ]
    }

    def _handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=body)

    transport = httpx.MockTransport(_handler)
    async with httpx.AsyncClient(
        transport=transport, base_url="https://api.test"
    ) as client:
        await poller.poll_anthropic_usage(redis=fake_redis, http_client=client)

    assert captured, "evaluate_and_cap must be invoked on success"
    kwargs = captured[0]
    # 12345 cents = $123.45
    assert kwargs["daily_usd"] == Decimal("123.450000")
    assert kwargs["mtd_usd"] == Decimal("123.450000")
    assert kwargs["daily_cap_usd"] == Decimal("100")
    assert kwargs["monthly_cap_usd"] == Decimal("500")
