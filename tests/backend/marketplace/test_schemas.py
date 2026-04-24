"""Unit tests for marketplace Pydantic projections + sub-schemas.

Owner: Phanes (W2 NP P1 S1). Focus: the shape rules encoded on the
Pydantic models themselves, independent of the DB or the Hemera gate.
"""

from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from pydantic import ValidationError

from src.backend.marketplace.schemas import (
    AssetsMetadata,
    ContentMetadata,
    CoreAgentMetadata,
    DataMetadata,
    InfrastructureMetadata,
    PremiumMetadata,
    ServicesMetadata,
)
from src.backend.marketplace.validator import CATEGORY_SCHEMA_MAP
from src.backend.models.marketplace_listing import (
    ALLOWED_SUBTYPES,
    Category,
    License,
    ListingCreate,
    PricingModel,
    Subtype,
)


# ---------------------------------------------------------------------------
# ALLOWED_SUBTYPES structural invariants
# ---------------------------------------------------------------------------


def test_allowed_subtypes_covers_every_category() -> None:
    """Every Category member maps to at least one Subtype."""

    for cat in Category:
        assert cat in ALLOWED_SUBTYPES, f"missing category {cat!r} in ALLOWED_SUBTYPES"
        assert len(ALLOWED_SUBTYPES[cat]) >= 1


def test_allowed_subtypes_is_partition_of_subtype() -> None:
    """The union of all per-category subtype sets equals every Subtype.

    Regression guard against adding a Subtype without placing it in a
    category, which would make the ListingCreate validator silently
    reject every user submission carrying that subtype.
    """

    union: set[Subtype] = set()
    for subset in ALLOWED_SUBTYPES.values():
        union.update(subset)
    assert union == set(Subtype)


def test_allowed_subtypes_is_disjoint() -> None:
    """No subtype appears in two categories."""

    seen: set[Subtype] = set()
    for subset in ALLOWED_SUBTYPES.values():
        overlap = subset & seen
        assert not overlap, f"overlap {overlap!r} across categories"
        seen.update(subset)


def test_category_schema_map_is_complete() -> None:
    """Every Category has a registered sub-schema class in the dispatch map."""

    for cat in Category:
        assert cat in CATEGORY_SCHEMA_MAP


# ---------------------------------------------------------------------------
# ListingCreate body-validator (subtype in category check)
# ---------------------------------------------------------------------------


def _valid_core_agent_metadata() -> dict:
    return {
        "runtime_requirements": {"model": "claude-opus-4-7", "tools": []},
        "prompt_artifact_id": str(uuid4()),
        "example_inputs": [],
    }


def test_listing_create_accepts_valid_category_subtype_pair() -> None:
    body = ListingCreate(
        category=Category.CORE_AGENT,
        subtype=Subtype.AGENT,
        title="Test Agent",
        short_description="Short",
        long_description="Long",
        category_metadata=_valid_core_agent_metadata(),
    )
    assert body.category == Category.CORE_AGENT
    assert body.subtype == Subtype.AGENT
    # Defaults populate sensibly.
    assert body.pricing_model == PricingModel.FREE
    assert body.license == License.PROPRIETARY
    assert body.version == "0.1.0"


def test_listing_create_rejects_cross_category_subtype() -> None:
    """(category=core_agent, subtype=sprite_pack) must fail validation."""

    with pytest.raises(ValidationError) as excinfo:
        ListingCreate(
            category=Category.CORE_AGENT,
            subtype=Subtype.SPRITE_PACK,
            title="Bad Mix",
            short_description="short",
            long_description="long",
            category_metadata={},
        )
    assert "not permitted for category" in str(excinfo.value)


def test_listing_create_rejects_unknown_extra_fields() -> None:
    """``extra='forbid'`` keeps the wire contract tight."""

    with pytest.raises(ValidationError):
        ListingCreate(
            category=Category.CORE_AGENT,
            subtype=Subtype.AGENT,
            title="Test",
            short_description="s",
            long_description="l",
            category_metadata=_valid_core_agent_metadata(),
            unknown_field="should not pass",  # type: ignore[arg-type]
        )


# ---------------------------------------------------------------------------
# Per-category sub-schema happy paths + required field enforcement
# ---------------------------------------------------------------------------


def test_core_agent_metadata_requires_prompt_artifact() -> None:
    with pytest.raises(ValidationError):
        CoreAgentMetadata(runtime_requirements={"model": "x"})


def test_content_metadata_accepts_defaults() -> None:
    m = ContentMetadata(content_format="markdown")
    assert m.language == "en"
    assert m.word_count is None


def test_infrastructure_metadata_requires_platform_list() -> None:
    with pytest.raises(ValidationError):
        InfrastructureMetadata(platform_compat=[])
    # Valid list passes.
    ok = InfrastructureMetadata(platform_compat=["claude_code"])
    assert "claude_code" in ok.platform_compat


def test_assets_metadata_requires_media_type_and_format() -> None:
    with pytest.raises(ValidationError):
        AssetsMetadata(media_type="image")  # missing file_format
    m = AssetsMetadata(media_type="image", file_format="png")
    assert m.media_type == "image"


def test_services_metadata_requires_scope() -> None:
    with pytest.raises(ValidationError):
        ServicesMetadata(
            service_kind="consulting", delivery_time_days=5, scope_description=""
        )


def test_premium_metadata_accepts_minimal_shape() -> None:
    m = PremiumMetadata(premium_kind="verified_certification")
    assert m.validity_days is None


def test_data_metadata_requires_source_attribution() -> None:
    with pytest.raises(ValidationError):
        DataMetadata(size_mb=10, update_frequency="daily", source_attribution="")


def test_data_metadata_passes_with_minimum_fields() -> None:
    m = DataMetadata(
        size_mb=0, update_frequency="static", source_attribution="self-authored"
    )
    assert m.row_count is None
