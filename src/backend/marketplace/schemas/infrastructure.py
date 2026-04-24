"""Infrastructure category_metadata sub-schema.

Contract ref: ``docs/contracts/marketplace_listing.contract.md`` Section 3.5.
"""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import ConfigDict, Field

from src.backend.models.base import NeriumModel

_PLATFORM = Literal[
    "claude_code",
    "anthropic_api",
    "openai_api",
    "mcp_remote",
    "mcp_local",
]


class InfrastructureMetadata(NeriumModel):
    """Shape expected at ``category_metadata`` for category=infrastructure.

    Covers mcp_config / connector / workflow / eval_suite subtypes. The
    ``platform_compat`` list lets buyers filter to the runtime they
    actually use; ``config_schema`` is a plain JSON-Schema-ish dict the
    submission wizard can render as a form.
    """

    model_config = ConfigDict(extra="forbid")

    platform_compat: list[_PLATFORM] = Field(
        ...,
        min_length=1,
        description="Runtimes the artifact is known to work with.",
    )
    config_schema: dict[str, Any] = Field(
        default_factory=dict,
        description="JSON-Schema-style shape of user-provided config.",
    )
    install_instructions_md: Optional[str] = Field(
        default=None,
        description="Optional markdown install steps.",
    )
