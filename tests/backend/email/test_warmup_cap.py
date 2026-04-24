"""Warmup cap schedule + critical bypass.

Contract Section 4.2 + Section 8.

Confirms:
- Schedule returns 50 on day 0 + day 1, 100 on day 2, then doubles
  per the contract array.
- ``warmup_start=None`` means the cap is disabled (dev mode).
- ``critical=True`` bypasses the cap even when day_sent >= cap.
"""

from __future__ import annotations

from datetime import date, timedelta
from unittest.mock import AsyncMock

import pytest

from src.backend.email import warmup as warmup_module
from src.backend.email.warmup import (
    _UNBOUNDED,
    WarmupDecision,
    compute_warmup_cap,
    within_warmup_cap,
)


def test_compute_warmup_cap_disabled_when_start_none() -> None:
    assert compute_warmup_cap(warmup_start=None) == _UNBOUNDED


def test_compute_warmup_cap_day_0() -> None:
    start = date(2026, 4, 24)
    assert compute_warmup_cap(today=start, warmup_start=start) == 50


def test_compute_warmup_cap_day_1() -> None:
    start = date(2026, 4, 24)
    today = start + timedelta(days=1)
    assert compute_warmup_cap(today=today, warmup_start=start) == 50


def test_compute_warmup_cap_day_2() -> None:
    start = date(2026, 4, 24)
    today = start + timedelta(days=2)
    assert compute_warmup_cap(today=today, warmup_start=start) == 100


def test_compute_warmup_cap_steady_state() -> None:
    start = date(2026, 4, 24)
    today = start + timedelta(days=30)
    assert compute_warmup_cap(today=today, warmup_start=start) == 10_000


def test_compute_warmup_cap_clamps_negative_delta() -> None:
    start = date(2026, 4, 24)
    today = start - timedelta(days=5)
    assert compute_warmup_cap(today=today, warmup_start=start) == 50


@pytest.mark.asyncio
async def test_within_warmup_cap_disabled(
    pheme_settings,  # steady state day 10
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Override to simulate disabled cap (empty warmup_start).
    settings_disabled = pheme_settings.model_copy(update={"email_warmup_start": ""})
    monkeypatch.setattr(warmup_module, "count_sent_today", AsyncMock(return_value=0))

    decision = await within_warmup_cap(critical=False, settings=settings_disabled)
    assert isinstance(decision, WarmupDecision)
    assert decision.allowed is True
    assert decision.reason == "cap_disabled"


@pytest.mark.asyncio
async def test_within_warmup_cap_allows_under_cap(
    pheme_settings_warmup_day_0,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(warmup_module, "count_sent_today", AsyncMock(return_value=10))
    decision = await within_warmup_cap(
        critical=False,
        settings=pheme_settings_warmup_day_0,
    )
    assert decision.allowed is True
    assert decision.reason == "within_cap"
    assert decision.cap == 50
    assert decision.day_sent == 10


@pytest.mark.asyncio
async def test_within_warmup_cap_blocks_at_cap(
    pheme_settings_warmup_day_0,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(warmup_module, "count_sent_today", AsyncMock(return_value=50))
    decision = await within_warmup_cap(
        critical=False,
        settings=pheme_settings_warmup_day_0,
    )
    assert decision.allowed is False
    assert decision.reason == "cap_exceeded"


@pytest.mark.asyncio
async def test_within_warmup_cap_critical_bypasses(
    pheme_settings_warmup_day_0,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(warmup_module, "count_sent_today", AsyncMock(return_value=5_000))
    decision = await within_warmup_cap(
        critical=True,
        settings=pheme_settings_warmup_day_0,
    )
    assert decision.allowed is True
    assert decision.reason == "critical_bypass"
