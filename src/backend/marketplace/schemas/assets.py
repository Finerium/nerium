"""Assets category_metadata sub-schema.

Contract ref: ``docs/contracts/marketplace_listing.contract.md`` Section 3.5.
"""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import ConfigDict, Field

from src.backend.models.base import NeriumModel

_MEDIA = Literal["image", "audio", "video", "font", "3d_model", "animation"]


class AssetsMetadata(NeriumModel):
    """Shape expected at ``category_metadata`` for category=assets.

    Covers voice_profile / visual_theme / sprite_pack / sound_pack. We
    mandate ``media_type`` + ``file_format`` so the detail page can pick
    the right player component (img preview, audio element, three.js
    viewer). The actual binary lives at ``asset_refs[0]`` via Chione.
    """

    model_config = ConfigDict(extra="forbid")

    media_type: _MEDIA = Field(
        ...,
        description="Primary media class; drives which player renders the preview.",
    )
    file_format: str = Field(
        ...,
        min_length=1,
        max_length=32,
        description="Extension-style format hint: 'png', 'mp3', 'ttf', 'fbx'.",
    )
    dimensions: Optional[dict[str, Any]] = Field(
        default=None,
        description=(
            "Image dims as {width, height} or audio dims as "
            "{duration_s}. Free-form dict keeps it additive."
        ),
    )
    license_notes: Optional[str] = Field(
        default=None,
        description="Attribution hint for CC_BY_* licenses.",
    )
