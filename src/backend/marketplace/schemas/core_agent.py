"""CoreAgent category_metadata sub-schema.

Contract ref: ``docs/contracts/marketplace_listing.contract.md`` Section 3.5.
"""

from __future__ import annotations

from typing import Any, Optional
from uuid import UUID

from pydantic import ConfigDict, Field

from src.backend.models.base import NeriumModel


class CoreAgentMetadata(NeriumModel):
    """Shape expected at ``category_metadata`` for category=core_agent.

    Fields
    ------
    runtime_requirements
        Free-form dict carrying ``model`` + ``tools`` + ``mcp_servers``.
        The validator only requires its presence; deeper shape checks
        land in a follow-on revision.
    prompt_artifact_id
        File manifest reference (Chione) to the ``.md`` system prompt
        artifact. Required: a core agent without its prompt cannot be
        reproduced by buyers.
    example_inputs
        List of dict examples. Rendered in the detail page to give
        buyers a preview of expected usage shapes.
    success_criteria
        Optional freeform string describing what a successful run looks
        like. Used by Astraea trust score Phase-2.
    """

    model_config = ConfigDict(extra="forbid")

    runtime_requirements: dict[str, Any] = Field(
        ...,
        description="Runtime shape: model id, tool allowlist, MCP servers.",
    )
    prompt_artifact_id: UUID = Field(
        ...,
        description="file_storage_manifest id pointing at the prompt .md blob.",
    )
    example_inputs: list[dict[str, Any]] = Field(
        default_factory=list,
        description="Preview examples; rendered verbatim on detail page.",
    )
    success_criteria: Optional[str] = Field(
        default=None,
        description="Optional narrative of a successful run shape.",
    )
