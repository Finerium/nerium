"""Services category_metadata sub-schema.

Contract ref: ``docs/contracts/marketplace_listing.contract.md`` Section 3.5.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import ConfigDict, Field

from src.backend.models.base import NeriumModel

_SERVICE_KIND = Literal["custom_build", "consulting", "integration", "training"]


class ServicesMetadata(NeriumModel):
    """Shape expected at ``category_metadata`` for category=services.

    Covers custom_build_service + consulting_hour subtypes. ``service_kind``
    is independent of the subtype on purpose so a ``consulting_hour``
    listing can still declare itself as ``integration`` work.
    """

    model_config = ConfigDict(extra="forbid")

    service_kind: _SERVICE_KIND = Field(
        ...,
        description="Nature of the billable service.",
    )
    delivery_time_days: int = Field(
        ...,
        ge=0,
        le=365,
        description="Expected turnaround in business days.",
    )
    scope_description: str = Field(
        ...,
        min_length=1,
        max_length=4000,
        description="Plain-English scope that clients see before booking.",
    )
    included_revisions: int = Field(
        default=0,
        ge=0,
        le=20,
        description="How many revision rounds are included in the quoted price.",
    )
    sla: Optional[str] = Field(
        default=None,
        max_length=2000,
        description="Optional SLA narrative; legal review flag post-hackathon.",
    )
