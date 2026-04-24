"""Premium category_metadata sub-schema.

Contract ref: ``docs/contracts/marketplace_listing.contract.md`` Section 3.5.

Premium creation is Hemera-gated on the ``marketplace.premium_issuance``
flag (default false pre-GA). The sub-schema ships even when the flag is
off so the router can validate incoming bodies uniformly; the 403 from
the gate stops the INSERT before the row hits Postgres.
"""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import ConfigDict, Field

from src.backend.models.base import NeriumModel

_PREMIUM_KIND = Literal[
    "verified_certification",
    "priority_listing",
    "custom_domain_agent",
]


class PremiumMetadata(NeriumModel):
    """Shape expected at ``category_metadata`` for category=premium."""

    model_config = ConfigDict(extra="forbid")

    premium_kind: _PREMIUM_KIND = Field(
        ...,
        description="Sub-product of the Premium category.",
    )
    issuance_workflow: Optional[dict[str, Any]] = Field(
        default=None,
        description=(
            "Free-form issuance procedure. Workflow spec pending per "
            "M1 Open Question 5."
        ),
    )
    validity_days: Optional[int] = Field(
        default=None,
        ge=1,
        le=3650,
        description="Validity window; null means perpetual until revoked.",
    )
    renewal_policy: Optional[str] = Field(
        default=None,
        max_length=2000,
        description="Human-readable renewal narrative.",
    )
