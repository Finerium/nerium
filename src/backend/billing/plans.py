"""Static 4-tier subscription plan catalogue.

Owner: Plutus (W2 NP P4 S1).

Plans are STATIC CONFIG, not user data. They live as a Python dict so
the ``/v1/billing/plans`` endpoint can render the catalogue in <1 ms
without a DB round-trip, and so the pricing landing (Marshall P6) can
import the same constants at build time. Stripe Price IDs bind to live
Stripe objects via env vars; the ``/v1/billing/plans`` read endpoint
returns the resolved Price IDs so the frontend can fire Checkout against
the right object.

Tier semantics (prompt-authoritative, V4 rename from contract)
--------------------------------------------------------------
- ``free``: USD 0. No Stripe Price. Limit-gated features.
- ``starter``: USD 19/month. Small projects.
- ``pro``: USD 49/month. Team-of-one prosumer.
- ``team``: USD 149/month. Collaborative teams with seat scaling.

Contract cross-walk
-------------------
``payment_stripe.contract.md`` Section 3.2 lists the legacy names
free/solo/team/enterprise. The V4 ferry renamed solo to starter, kept
team, replaced enterprise with pro at a lower price point so the
hackathon demo has a coherent middle tier the judges can pay into with
a test card. Enterprise ships post-submit once the Stripe Atlas lane
opens live mode.
"""

from __future__ import annotations

from typing import Final, Literal, TypedDict

from src.backend.config import get_settings
from src.backend.models.base import NeriumModel


Tier = Literal["free", "starter", "pro", "team"]
"""Plan tier enum. Keep in lockstep with the subscription.tier CHECK."""

PAID_TIERS: Final[tuple[Tier, ...]] = ("starter", "pro", "team")
"""Tiers that require a Stripe Checkout Session. Excludes free."""

ALL_TIERS: Final[tuple[Tier, ...]] = ("free", "starter", "pro", "team")


class PlanFeatures(TypedDict):
    """Feature-flag payload baked into the /v1/billing/plans response."""

    max_agents: int
    max_sessions_per_day: int
    max_storage_mb: int
    priority_support: bool
    custom_domains: bool
    analytics_retention_days: int


class _PlanEntry(TypedDict):
    """Internal static plan shape."""

    tier: Tier
    name: str
    tagline: str
    price_usd_monthly: int
    features: PlanFeatures
    highlights: list[str]


# Ordered so the response renders Free leftmost, Team rightmost on the
# pricing landing. Keep the key order stable for pricing-page regression.
_PLAN_CATALOGUE: Final[list[_PlanEntry]] = [
    {
        "tier": "free",
        "name": "Free",
        "tagline": "Explore NERIUM with a single agent.",
        "price_usd_monthly": 0,
        "features": {
            "max_agents": 1,
            "max_sessions_per_day": 20,
            "max_storage_mb": 100,
            "priority_support": False,
            "custom_domains": False,
            "analytics_retention_days": 7,
        },
        "highlights": [
            "1 agent seat",
            "20 Managed Agents sessions per day",
            "7-day analytics retention",
            "Community support",
        ],
    },
    {
        "tier": "starter",
        "name": "Starter",
        "tagline": "Solo builders shipping small projects.",
        "price_usd_monthly": 19,
        "features": {
            "max_agents": 5,
            "max_sessions_per_day": 200,
            "max_storage_mb": 2_000,
            "priority_support": False,
            "custom_domains": False,
            "analytics_retention_days": 30,
        },
        "highlights": [
            "5 agent seats",
            "200 Managed Agents sessions per day",
            "30-day analytics retention",
            "Email support, 48h response",
        ],
    },
    {
        "tier": "pro",
        "name": "Pro",
        "tagline": "Daily drivers who ship production workloads.",
        "price_usd_monthly": 49,
        "features": {
            "max_agents": 20,
            "max_sessions_per_day": 1_000,
            "max_storage_mb": 10_000,
            "priority_support": True,
            "custom_domains": True,
            "analytics_retention_days": 90,
        },
        "highlights": [
            "20 agent seats",
            "1,000 Managed Agents sessions per day",
            "90-day analytics retention",
            "Custom domains",
            "Priority support, 24h response",
        ],
    },
    {
        "tier": "team",
        "name": "Team",
        "tagline": "Collaborative teams with seat scaling + SSO roadmap.",
        "price_usd_monthly": 149,
        "features": {
            "max_agents": 100,
            "max_sessions_per_day": 10_000,
            "max_storage_mb": 100_000,
            "priority_support": True,
            "custom_domains": True,
            "analytics_retention_days": 365,
        },
        "highlights": [
            "100 agent seats",
            "10,000 Managed Agents sessions per day",
            "365-day analytics retention",
            "Custom domains + SSO (roadmap)",
            "Priority support, 4h response",
        ],
    },
]


# ---------------------------------------------------------------------------
# Wire shapes
# ---------------------------------------------------------------------------


class PlanResponse(NeriumModel):
    """Plan entry as surfaced by ``GET /v1/billing/plans``.

    ``stripe_price_id`` is ``None`` for Free (no Stripe Price) and any
    paid tier where the env knob is unset (dev / local boot without the
    Stripe dashboard). The UI falls back to a "Configure in dashboard"
    state rather than a 500 so the pricing landing still renders.
    """

    tier: Tier
    name: str
    tagline: str
    price_usd_monthly: int
    currency: str
    interval: str
    features: PlanFeatures
    highlights: list[str]
    stripe_price_id: str | None
    is_paid: bool


class PlansListResponse(NeriumModel):
    """Top-level envelope for the catalogue."""

    plans: list[PlanResponse]


# ---------------------------------------------------------------------------
# Resolution helpers
# ---------------------------------------------------------------------------


def _resolve_price_id(tier: Tier) -> str | None:
    """Return the Stripe Price id for ``tier`` or ``None``.

    ``free`` has no Stripe object so we always return None. Paid tiers
    read the live env value via the Settings singleton so test harnesses
    that monkeypatch ``get_settings`` see the override without a cache
    rebuild.
    """

    if tier == "free":
        return None
    settings = get_settings()
    key = {
        "starter": settings.stripe_price_id_starter,
        "pro": settings.stripe_price_id_pro,
        "team": settings.stripe_price_id_team,
    }[tier]
    return key or None


def resolve_plans() -> list[PlanResponse]:
    """Return the full plan catalogue with env-resolved Stripe Price IDs."""

    resolved: list[PlanResponse] = []
    for entry in _PLAN_CATALOGUE:
        tier = entry["tier"]
        resolved.append(
            PlanResponse(
                tier=tier,
                name=entry["name"],
                tagline=entry["tagline"],
                price_usd_monthly=entry["price_usd_monthly"],
                currency="usd",
                interval="month",
                features=entry["features"],
                highlights=list(entry["highlights"]),
                stripe_price_id=_resolve_price_id(tier),
                is_paid=tier in PAID_TIERS,
            )
        )
    return resolved


def plan_by_tier(tier: Tier) -> PlanResponse | None:
    """Lookup a single plan by tier enum. ``None`` on unknown tier."""

    for entry in resolve_plans():
        if entry.tier == tier:
            return entry
    return None


def require_paid_tier(tier: str) -> Tier:
    """Validate ``tier`` is in :data:`PAID_TIERS`; return the typed value.

    Raises :class:`ValueError` for Free or unknown tiers so router code
    can convert to a 400 problem+json without leaking internal enum.
    """

    if tier not in PAID_TIERS:
        raise ValueError(
            f"tier must be one of {PAID_TIERS}; got {tier!r}"
        )
    return tier  # type: ignore[return-value]


__all__ = [
    "ALL_TIERS",
    "PAID_TIERS",
    "PlanFeatures",
    "PlanResponse",
    "PlansListResponse",
    "Tier",
    "plan_by_tier",
    "require_paid_tier",
    "resolve_plans",
]
