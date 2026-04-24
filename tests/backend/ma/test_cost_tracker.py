"""Tests for :mod:`src.backend.ma.cost_tracker`.

Owner: Kratos (W2 S3).

Covers the pure cost computation + threshold helpers. The DB-touching
``write_session_usage`` integration path is exercised by the demo
scenario test once a real Postgres fixture is online; the unit tests
here pin the pricing arithmetic + threshold ladder so Moros P3 can
diff against identical expected values.
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from src.backend.ma.cost_tracker import (
    build_budget_alert_payload,
    compute_cost_usd,
    enforce_session_cap,
    pick_threshold,
    should_halt_for_session_cap,
)
from src.backend.ma.errors import BudgetCapTripped


# Pricing reference (USD per million tokens) mirrored from
# ``budget_monitor.contract.md`` Section 3.3.
# Opus 4.7: input 5, output 25, cache read 0.50, cache write 6.25.


def test_opus_basic_cost() -> None:
    """Classic uncached input + output.

    1000 input + 500 output on Opus =
      1000 * 5/1e6 + 500 * 25/1e6 = 0.005 + 0.0125 = 0.0175 USD.
    """

    cost = compute_cost_usd(
        "claude-opus-4-7",
        {"input_tokens": 1000, "output_tokens": 500},
    )
    assert cost == Decimal("0.017500")


def test_opus_with_cache_read_discount() -> None:
    """Cache-read tokens replace full-price input at 0.50 USD/M.

    2000 input total, 1500 from cache_read, 500 fresh; 100 output.
      uncached_input = 2000 - 1500 - 0 = 500
      cost = 500*5/1e6 + 100*25/1e6 + 1500*0.50/1e6
           = 0.0025 + 0.0025 + 0.00075
           = 0.00575 USD.
    """

    cost = compute_cost_usd(
        "claude-opus-4-7",
        {
            "input_tokens": 2000,
            "output_tokens": 100,
            "cache_read_input_tokens": 1500,
            "cache_creation_input_tokens": 0,
        },
    )
    assert cost == Decimal("0.005750")


def test_opus_with_cache_write_premium() -> None:
    """Cache-write tokens are billed at 6.25 USD/M (5-min TTL).

    1000 input total, 1000 cache_write, 0 cache_read, 0 output.
      uncached_input = 1000 - 0 - 1000 = 0
      cost = 0 + 0 + 0 + 1000 * 6.25 / 1e6 = 0.00625 USD.
    """

    cost = compute_cost_usd(
        "claude-opus-4-7",
        {
            "input_tokens": 1000,
            "output_tokens": 0,
            "cache_creation_input_tokens": 1000,
        },
    )
    assert cost == Decimal("0.006250")


def test_sonnet_is_cheaper_than_opus() -> None:
    usage = {"input_tokens": 10000, "output_tokens": 5000}
    opus = compute_cost_usd("claude-opus-4-7", usage)
    sonnet = compute_cost_usd("claude-sonnet-4-6", usage)
    assert sonnet < opus


def test_haiku_is_cheapest() -> None:
    usage = {"input_tokens": 10000, "output_tokens": 5000}
    haiku = compute_cost_usd("claude-haiku-4-5", usage)
    sonnet = compute_cost_usd("claude-sonnet-4-6", usage)
    assert haiku < sonnet


def test_unknown_model_raises() -> None:
    with pytest.raises(KeyError):
        compute_cost_usd("claude-not-a-model", {"input_tokens": 1})


# ---------------------------------------------------------------------
# Session cap enforcement
# ---------------------------------------------------------------------


@pytest.mark.parametrize(
    "cost,cap,expected",
    [
        (Decimal("4.99"), Decimal("5.00"), False),
        (Decimal("5.00"), Decimal("5.00"), True),
        (Decimal("5.01"), Decimal("5.00"), True),
        (Decimal("0"), Decimal("5.00"), False),
    ],
)
def test_should_halt_for_session_cap(cost, cap, expected) -> None:
    assert should_halt_for_session_cap(cost_usd=cost, cap_usd=cap) is expected


def test_enforce_session_cap_raises_when_tripped() -> None:
    import uuid

    session_id = uuid.uuid4()
    with pytest.raises(BudgetCapTripped) as excinfo:
        enforce_session_cap(
            session_id=session_id,
            cost_usd=Decimal("5.00"),
            cap_usd=Decimal("5.00"),
        )
    assert excinfo.value.scope == "session"
    assert excinfo.value.reason == "session_cap_tripped"


def test_enforce_session_cap_silent_below_cap() -> None:
    import uuid

    enforce_session_cap(
        session_id=uuid.uuid4(),
        cost_usd=Decimal("2.50"),
        cap_usd=Decimal("5.00"),
    )


# ---------------------------------------------------------------------
# Threshold ladder
# ---------------------------------------------------------------------


@pytest.mark.parametrize(
    "spent,cap,expected",
    [
        (Decimal("0"), Decimal("100"), None),
        (Decimal("49.99"), Decimal("100"), None),
        (Decimal("50"), Decimal("100"), 50),
        (Decimal("74.99"), Decimal("100"), 50),
        (Decimal("75"), Decimal("100"), 75),
        (Decimal("89.99"), Decimal("100"), 75),
        (Decimal("90"), Decimal("100"), 90),
        (Decimal("99.99"), Decimal("100"), 90),
        (Decimal("100"), Decimal("100"), 100),
        (Decimal("150"), Decimal("100"), 100),
    ],
)
def test_pick_threshold_ladder(spent, cap, expected) -> None:
    assert pick_threshold(spent_usd=spent, cap_usd=cap) == expected


def test_pick_threshold_zero_cap_is_safe() -> None:
    """Zero cap yields ``None`` instead of DivisionByZero."""

    assert pick_threshold(spent_usd=Decimal("10"), cap_usd=Decimal("0")) is None


# ---------------------------------------------------------------------
# Payload shape
# ---------------------------------------------------------------------


def test_build_budget_alert_payload_shape() -> None:
    payload = build_budget_alert_payload(
        tenant_id="tenant-1",
        session_id="sess-1",
        spent_usd_today=12.5,
        cap_usd_today=100.0,
        threshold_pct=75,
        builder_disabled=False,
    )
    assert payload == {
        "tenant_id": "tenant-1",
        "session_id": "sess-1",
        "threshold_pct": 75,
        "spent_usd_today": 12.5,
        "cap_usd_today": 100.0,
        "builder_disabled": False,
    }
