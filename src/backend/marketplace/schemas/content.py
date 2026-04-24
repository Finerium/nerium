"""Content category_metadata sub-schema.

Contract ref: ``docs/contracts/marketplace_listing.contract.md`` Section 3.5.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import ConfigDict, Field

from src.backend.models.base import NeriumModel


class ContentMetadata(NeriumModel):
    """Shape expected at ``category_metadata`` for category=content.

    Covers prompt / skill / quest_template / dialogue_tree / context_pack
    subtypes. The ``content_format`` discriminator tells the detail page
    renderer whether to surface a syntax-highlighted block, a markdown
    render, or a structured quest-template previewer.
    """

    model_config = ConfigDict(extra="forbid")

    content_format: Literal["markdown", "json", "yaml", "text", "mdx"] = Field(
        ...,
        description="Format of the primary artifact body.",
    )
    language: str = Field(
        default="en",
        max_length=16,
        description="BCP 47 language tag. Default English.",
    )
    word_count: Optional[int] = Field(
        default=None,
        ge=0,
        description="Approximate word count for length signalling.",
    )
    inline_preview: Optional[str] = Field(
        default=None,
        max_length=500,
        description="First 500 chars of the artifact for card preview.",
    )
