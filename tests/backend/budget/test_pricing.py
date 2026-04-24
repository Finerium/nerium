"""Tests for :mod:`src.backend.budget.pricing`.

Owner: Moros (W2 NP P3 S1).

Locks the Anthropic pricing map + the ``compute_cost_usd`` formula so
a silent price sheet drift does not roll up at zero cost.
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from src.backend.budget import pricing


def test_known_models_includes_opus_sonnet_haiku() -> None:
    models = pricing.known_models()
    assert "claude-opus-4-7" in models
    assert "claude-sonnet-4-6" in models
    assert "claude-haiku-4-5" in models


def test_price_for_opus_4_7_matches_contract_snapshot() -> None:
    prices = pricing.price_for("claude-opus-4-7")
    # Numbers match the contract Section 3.3 snapshot dated 2026-04-24.
    # Any upstream price rotation MUST bump the contract version + this
    # test together so the drift surfaces as a review diff.
    assert prices["input"] == Decimal("5")
    assert prices["output"] == Decimal("25")
    assert prices["cache_read"] == Decimal("0.50")
    assert prices["cache_write"] == Decimal("6.25")


def test_price_for_unknown_model_raises() -> None:
    with pytest.raises(KeyError):
        pricing.price_for("claude-pterodactyl-9-0")


def test_compute_cost_usd_simple_input_output() -> None:
    """1M input + 1M output on Opus 4.7 = $5 + $25."""

    cost = pricing.compute_cost_usd(
        "claude-opus-4-7",
        input_tokens=1_000_000,
        output_tokens=1_000_000,
    )
    assert cost == Decimal("30.000000")


def test_compute_cost_usd_subtracts_cache_tokens_from_input() -> None:
    """Uncached input = input_tokens - cache_read - cache_write.

    Formula: ``(uncached_input * $5 + cache_read * $0.50 + cache_write * $6.25 +
    output * $25) / 1M``.

    With 1M total input of which 200k are cache_read and 100k are cache_write,
    uncached = 700k. Cost = (700k * 5 + 200k * 0.5 + 100k * 6.25 + 1M * 25) / 1M
    = (3.5M + 100k + 625k + 25M) / 1M = 29.225 USD.
    """

    cost = pricing.compute_cost_usd(
        "claude-opus-4-7",
        input_tokens=1_000_000,
        output_tokens=1_000_000,
        cache_read_tokens=200_000,
        cache_write_tokens=100_000,
    )
    assert cost == Decimal("29.225000")


def test_compute_cost_usd_clamps_negative_uncached_to_zero() -> None:
    """cache_read > input_tokens does not produce a negative uncached base."""

    cost = pricing.compute_cost_usd(
        "claude-opus-4-7",
        input_tokens=100_000,
        output_tokens=0,
        cache_read_tokens=200_000,
    )
    # uncached clamps to 0; only cache_read contributes.
    expected = Decimal("200000") * Decimal("0.50") / Decimal("1000000")
    assert cost == expected.quantize(Decimal("0.000001"))


def test_compute_cost_usd_haiku_cheaper_than_opus() -> None:
    """Haiku 1M/1M is cheaper than Opus 1M/1M; sanity of the ordering."""

    opus = pricing.compute_cost_usd(
        "claude-opus-4-7", input_tokens=1_000_000, output_tokens=1_000_000
    )
    haiku = pricing.compute_cost_usd(
        "claude-haiku-4-5", input_tokens=1_000_000, output_tokens=1_000_000
    )
    assert haiku < opus


def test_compute_cost_usd_unknown_model_raises() -> None:
    with pytest.raises(KeyError):
        pricing.compute_cost_usd(
            "mystery-model", input_tokens=1, output_tokens=1
        )
