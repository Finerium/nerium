"""Tests for the static plan catalogue + ``GET /v1/billing/plans``.

Owner: Plutus (W2 NP P4 S1).
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.backend.billing.plans import (
    ALL_TIERS,
    PAID_TIERS,
    plan_by_tier,
    require_paid_tier,
    resolve_plans,
)
from src.backend.errors import register_problem_handlers
from src.backend.routers.v1.billing.plans import plans_router


# ---------------------------------------------------------------------------
# Module-level helpers (no network, no DB)
# ---------------------------------------------------------------------------


def test_plans_count_is_four(billing_settings) -> None:
    plans = resolve_plans()
    assert len(plans) == 4
    assert [p.tier for p in plans] == ["free", "starter", "pro", "team"]


def test_paid_tiers_excludes_free(billing_settings) -> None:
    assert PAID_TIERS == ("starter", "pro", "team")
    assert "free" in ALL_TIERS
    assert "free" not in PAID_TIERS


def test_free_has_no_price_id(billing_settings) -> None:
    plan = plan_by_tier("free")
    assert plan is not None
    assert plan.stripe_price_id is None
    assert plan.is_paid is False
    assert plan.price_usd_monthly == 0


def test_paid_tiers_price_ids_resolve_from_env(billing_settings) -> None:
    starter = plan_by_tier("starter")
    pro = plan_by_tier("pro")
    team = plan_by_tier("team")
    assert starter is not None and starter.stripe_price_id == "price_test_starter"
    assert pro is not None and pro.stripe_price_id == "price_test_pro"
    assert team is not None and team.stripe_price_id == "price_test_team"
    for plan in (starter, pro, team):
        assert plan.is_paid is True


def test_prices_strictly_ascending(billing_settings) -> None:
    prices = [p.price_usd_monthly for p in resolve_plans()]
    assert prices == sorted(prices)
    assert prices == [0, 19, 49, 149]


def test_require_paid_tier_rejects_free(billing_settings) -> None:
    with pytest.raises(ValueError):
        require_paid_tier("free")


def test_require_paid_tier_rejects_unknown(billing_settings) -> None:
    with pytest.raises(ValueError):
        require_paid_tier("enterprise")


def test_require_paid_tier_accepts_paid(billing_settings) -> None:
    for tier in ("starter", "pro", "team"):
        assert require_paid_tier(tier) == tier


def test_features_shape_is_stable(billing_settings) -> None:
    for plan in resolve_plans():
        feats = plan.features
        # Keys asserted so the frontend contract stays stable.
        assert set(feats.keys()) == {
            "max_agents",
            "max_sessions_per_day",
            "max_storage_mb",
            "priority_support",
            "custom_domains",
            "analytics_retention_days",
        }


# ---------------------------------------------------------------------------
# HTTP endpoint
# ---------------------------------------------------------------------------


def _build_app() -> FastAPI:
    app = FastAPI()
    register_problem_handlers(app)
    app.include_router(plans_router, prefix="/v1")
    return app


def test_get_plans_returns_200_and_four(billing_settings) -> None:
    with TestClient(_build_app()) as client:
        resp = client.get("/v1/billing/plans")
    assert resp.status_code == 200
    body = resp.json()
    assert "plans" in body
    assert len(body["plans"]) == 4
    tiers = [p["tier"] for p in body["plans"]]
    assert tiers == ["free", "starter", "pro", "team"]


def test_get_plans_is_stable_shape(billing_settings) -> None:
    with TestClient(_build_app()) as client:
        resp = client.get("/v1/billing/plans")
    body = resp.json()
    plan = body["plans"][0]
    for field in (
        "tier",
        "name",
        "tagline",
        "price_usd_monthly",
        "currency",
        "interval",
        "features",
        "highlights",
        "stripe_price_id",
        "is_paid",
    ):
        assert field in plan, f"missing field {field} on plan {plan['tier']}"
    assert plan["currency"] == "usd"
    assert plan["interval"] == "month"


def test_get_plans_free_has_null_price_id(billing_settings) -> None:
    with TestClient(_build_app()) as client:
        body = client.get("/v1/billing/plans").json()
    free = next(p for p in body["plans"] if p["tier"] == "free")
    assert free["stripe_price_id"] is None
    assert free["is_paid"] is False
