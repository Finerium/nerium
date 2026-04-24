"""Unit tests for :mod:`src.backend.marketplace.validator`.

Owner: Phanes (W2 NP P1 S1). The validator module is pure Python (no
async, no DB) so every assertion here runs in-process.
"""

from __future__ import annotations

from uuid import uuid4

from src.backend.marketplace.validator import (
    validate_category_metadata,
    validate_for_publish,
    validate_pricing_details,
    validate_subtype_for_category,
)
from src.backend.models.marketplace_listing import (
    Category,
    PricingModel,
    Subtype,
)


# ---------------------------------------------------------------------------
# validate_subtype_for_category
# ---------------------------------------------------------------------------


def test_validate_subtype_for_category_happy_path() -> None:
    issues = validate_subtype_for_category(
        category=Category.ASSETS, subtype=Subtype.SPRITE_PACK
    )
    assert issues == []


def test_validate_subtype_for_category_cross_bucket_fails() -> None:
    issues = validate_subtype_for_category(
        category=Category.CORE_AGENT, subtype=Subtype.SPRITE_PACK
    )
    assert len(issues) == 1
    assert issues[0].code == "subtype_not_in_category"
    assert issues[0].field == "subtype"


# ---------------------------------------------------------------------------
# validate_category_metadata dispatch
# ---------------------------------------------------------------------------


def test_validate_category_metadata_assets_passes_minimal() -> None:
    issues = validate_category_metadata(
        category=Category.ASSETS,
        category_metadata={"media_type": "image", "file_format": "png"},
    )
    assert issues == []


def test_validate_category_metadata_assets_rejects_missing_media_type() -> None:
    issues = validate_category_metadata(
        category=Category.ASSETS,
        category_metadata={"file_format": "png"},
    )
    assert len(issues) >= 1
    assert any(i.field.startswith("category_metadata.media_type") for i in issues)


def test_validate_category_metadata_core_agent_rejects_missing_prompt() -> None:
    issues = validate_category_metadata(
        category=Category.CORE_AGENT,
        category_metadata={"runtime_requirements": {"model": "claude-opus-4-7"}},
    )
    assert any("prompt_artifact_id" in i.field for i in issues)


def test_validate_category_metadata_core_agent_accepts_full_shape() -> None:
    issues = validate_category_metadata(
        category=Category.CORE_AGENT,
        category_metadata={
            "runtime_requirements": {"model": "claude-opus-4-7"},
            "prompt_artifact_id": str(uuid4()),
            "example_inputs": [],
        },
    )
    assert issues == []


# ---------------------------------------------------------------------------
# validate_pricing_details
# ---------------------------------------------------------------------------


def test_validate_pricing_free_is_permissive() -> None:
    assert (
        validate_pricing_details(
            pricing_model=PricingModel.FREE, pricing_details={"any": "thing"}
        )
        == []
    )


def test_validate_pricing_one_time_requires_amount_and_currency() -> None:
    issues = validate_pricing_details(
        pricing_model=PricingModel.ONE_TIME, pricing_details={}
    )
    codes = {i.code for i in issues}
    assert "amount_cents_required" in codes
    assert "currency_required" in codes


def test_validate_pricing_one_time_passes_with_valid_shape() -> None:
    issues = validate_pricing_details(
        pricing_model=PricingModel.ONE_TIME,
        pricing_details={"amount_cents": 1500, "currency": "USD"},
    )
    assert issues == []


def test_validate_pricing_usage_based_requires_meter() -> None:
    issues = validate_pricing_details(
        pricing_model=PricingModel.USAGE_BASED,
        pricing_details={"rate_cents": 5, "currency": "USD"},
    )
    assert any(i.code == "meter_required" for i in issues)


def test_validate_pricing_usage_based_accepts_per_token() -> None:
    issues = validate_pricing_details(
        pricing_model=PricingModel.USAGE_BASED,
        pricing_details={"meter": "per_token", "rate_cents": 1, "currency": "USD"},
    )
    assert issues == []


def test_validate_pricing_tiered_requires_tiers_list() -> None:
    issues = validate_pricing_details(
        pricing_model=PricingModel.TIERED, pricing_details={}
    )
    codes = {i.code for i in issues}
    assert "tiers_required" in codes


def test_validate_pricing_tiered_tiers_must_be_objects() -> None:
    issues = validate_pricing_details(
        pricing_model=PricingModel.TIERED,
        pricing_details={"tiers": ["not-a-dict"], "currency": "USD"},
    )
    assert any(i.code == "tier_not_object" for i in issues)


def test_validate_pricing_tiered_accepts_full_shape() -> None:
    issues = validate_pricing_details(
        pricing_model=PricingModel.TIERED,
        pricing_details={
            "tiers": [
                {"name": "Starter", "max_units": 1000, "amount_cents": 500},
                {"name": "Pro", "max_units": 10000, "amount_cents": 2000},
            ],
            "currency": "USD",
        },
    )
    assert issues == []


# ---------------------------------------------------------------------------
# validate_for_publish composition
# ---------------------------------------------------------------------------


def test_validate_for_publish_requires_long_description() -> None:
    issues = validate_for_publish(
        category=Category.ASSETS,
        subtype=Subtype.SPRITE_PACK,
        pricing_model=PricingModel.FREE,
        pricing_details={},
        category_metadata={"media_type": "image", "file_format": "png"},
        long_description=None,
    )
    codes = {i.code for i in issues}
    assert "description_required_for_public" in codes


def test_validate_for_publish_accumulates_multiple_issues() -> None:
    issues = validate_for_publish(
        category=Category.CORE_AGENT,
        subtype=Subtype.SPRITE_PACK,  # wrong category
        pricing_model=PricingModel.ONE_TIME,
        pricing_details={},  # missing amount + currency
        category_metadata={},  # missing required fields
        long_description="",  # empty triggers description rule
    )
    codes = {i.code for i in issues}
    assert "subtype_not_in_category" in codes
    assert "amount_cents_required" in codes
    assert "currency_required" in codes
    assert "description_required_for_public" in codes


def test_validate_for_publish_asset_scan_rule_opts_in_via_param() -> None:
    issues = validate_for_publish(
        category=Category.ASSETS,
        subtype=Subtype.SPRITE_PACK,
        pricing_model=PricingModel.FREE,
        pricing_details={},
        category_metadata={"media_type": "image", "file_format": "png"},
        long_description="good long description",
        asset_refs_clean=[True, False, True],
    )
    dirty_issues = [i for i in issues if i.code == "asset_not_scanned_clean"]
    assert len(dirty_issues) == 1
    assert dirty_issues[0].field == "asset_refs[1]"


def test_validate_for_publish_happy_path() -> None:
    issues = validate_for_publish(
        category=Category.CONTENT,
        subtype=Subtype.PROMPT,
        pricing_model=PricingModel.ONE_TIME,
        pricing_details={"amount_cents": 500, "currency": "USD"},
        category_metadata={"content_format": "markdown"},
        long_description="Rich long-form description that publishes fine.",
    )
    assert issues == []
