"""Anthropic model pricing (USD per million tokens).

Owner: Moros (W2 NP P3 S1). Authoritative copy per
``docs/contracts/budget_monitor.contract.md`` Section 3.3. The Kratos
cost tracker keeps a read-only mirror at
``src/backend/ma/cost_tracker.py``; keep both synchronised when the
Anthropic price sheet moves (contract bump + Alembic migration + this
constant + the Kratos mirror all in the same commit).

Why this module lives under ``budget/`` and not ``ma/``
--------------------------------------------------------
The pricing map is the cross-cutting cost-computation concern. Moros
owns the daemon so the canonical copy sits next to the local
accountant. Kratos holds a private mirror only because the MA
cost-tracker landed before this module in the contract order; a
post-hackathon refactor collapses the mirror into a one-line import.

Snapshot date
-------------
2026-04-24 per the NP Wave-1 contract revision. Values taken from the
Anthropic public pricing page at that time. The contract version bump
to 0.2.x will land when Anthropic rotates prices.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Final


# -- Canonical per-million pricing map ---------------------------------------
#
# Columns match the contract:
#   input        uncached input tokens
#   output       all output tokens
#   cache_read   cached-hit input tokens
#   cache_write  5-minute cache-write input tokens
#
# Keep the keys identical to the literal ``model`` values Anthropic
# reports in ``message_delta.usage`` + the ``cost_report`` response.

MODEL_PRICING_USD_PER_M: Final[dict[str, dict[str, Decimal]]] = {
    "claude-opus-4-7": {
        "input": Decimal("5"),
        "output": Decimal("25"),
        "cache_read": Decimal("0.50"),
        "cache_write": Decimal("6.25"),
    },
    "claude-opus-4-6": {
        "input": Decimal("5"),
        "output": Decimal("25"),
        "cache_read": Decimal("0.50"),
        "cache_write": Decimal("6.25"),
    },
    "claude-sonnet-4-6": {
        "input": Decimal("3"),
        "output": Decimal("15"),
        "cache_read": Decimal("0.30"),
        "cache_write": Decimal("3.75"),
    },
    "claude-haiku-4-5": {
        "input": Decimal("1"),
        "output": Decimal("5"),
        "cache_read": Decimal("0.10"),
        "cache_write": Decimal("1.25"),
    },
}
"""Authoritative pricing map. Read by the poller (to sum per-model USD
from the raw ``usage_report`` buckets) and by :func:`compute_cost_usd`
below for the local accountant fallback path when ``cost_report`` is
unavailable."""


PER_MILLION: Final[Decimal] = Decimal("1000000")
"""Divisor used to normalise raw token counts to USD at the per-million
price points above."""


def known_models() -> list[str]:
    """Return the sorted list of model keys recognised by the pricing map.

    Used by the poller's drift detector so unknown models surface in
    logs instead of silently rolling up at zero cost.
    """

    return sorted(MODEL_PRICING_USD_PER_M.keys())


def price_for(model: str) -> dict[str, Decimal]:
    """Return the per-million price quartet for ``model``.

    Raises
    ------
    KeyError
        When the model is not in the map. The poller maps this to a
        ``budget.admin_api.unknown_model`` warning log; it never trips
        the cap path by itself.
    """

    return MODEL_PRICING_USD_PER_M[model]


def compute_cost_usd(
    model: str,
    *,
    input_tokens: int = 0,
    output_tokens: int = 0,
    cache_read_tokens: int = 0,
    cache_write_tokens: int = 0,
) -> Decimal:
    """Apply the pricing formula from ``budget_monitor.contract.md``.

    The contract formula treats ``input_tokens`` as the *total*
    input count including cached reads + writes; we subtract both to
    get the uncached-input portion. Negative remainders clamp to zero
    so a stream that reports only cache reads (cache_read == input)
    does not return a negative base cost.

    The Kratos mirror at :func:`ma.cost_tracker.compute_cost_usd` has
    the same shape; keep both in sync.
    """

    if model not in MODEL_PRICING_USD_PER_M:
        raise KeyError(model)

    prices = MODEL_PRICING_USD_PER_M[model]
    uncached_input = Decimal(int(input_tokens)) - Decimal(int(cache_read_tokens)) - Decimal(int(cache_write_tokens))
    if uncached_input < 0:
        uncached_input = Decimal(0)

    cost = (
        uncached_input * prices["input"]
        + Decimal(int(output_tokens)) * prices["output"]
        + Decimal(int(cache_read_tokens)) * prices["cache_read"]
        + Decimal(int(cache_write_tokens)) * prices["cache_write"]
    ) / PER_MILLION

    return cost.quantize(Decimal("0.000001"))


__all__ = [
    "MODEL_PRICING_USD_PER_M",
    "PER_MILLION",
    "compute_cost_usd",
    "known_models",
    "price_for",
]
