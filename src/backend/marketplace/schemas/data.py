"""Data category_metadata sub-schema.

Contract ref: ``docs/contracts/marketplace_listing.contract.md`` Section 3.5.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import ConfigDict, Field

from src.backend.models.base import NeriumModel

_UPDATE_FREQ = Literal["static", "daily", "weekly", "monthly", "on_demand"]


class DataMetadata(NeriumModel):
    """Shape expected at ``category_metadata`` for category=data.

    Covers dataset + analytics_dashboard subtypes. ``size_mb`` is
    required so buyers can gauge download cost; ``row_count`` is optional
    because analytics_dashboards have no rows.
    """

    model_config = ConfigDict(extra="forbid")

    size_mb: int = Field(
        ...,
        ge=0,
        le=1024 * 1024,
        description="Payload size in MB (cap at 1 TB defensive).",
    )
    update_frequency: _UPDATE_FREQ = Field(
        ...,
        description="How often the dataset / dashboard refreshes.",
    )
    source_attribution: str = Field(
        ...,
        min_length=1,
        max_length=2000,
        description="Provenance statement; required for license compliance.",
    )
    row_count: Optional[int] = Field(
        default=None,
        ge=0,
        description="Null for dashboards; row count for datasets.",
    )
    schema_json_url: Optional[str] = Field(
        default=None,
        max_length=2048,
        description="Pointer to a JSON-Schema preview of the dataset columns.",
    )
