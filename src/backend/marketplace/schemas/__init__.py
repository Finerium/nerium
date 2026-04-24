"""Per-category ``category_metadata`` Pydantic models.

Each category owns its own module so the shape evolves independently
without churn on unrelated categories. The validator entry point in
``src.backend.marketplace.validator`` imports every symbol below and
dispatches by :class:`src.backend.models.marketplace_listing.Category`.
"""

from src.backend.marketplace.schemas.assets import AssetsMetadata
from src.backend.marketplace.schemas.content import ContentMetadata
from src.backend.marketplace.schemas.core_agent import CoreAgentMetadata
from src.backend.marketplace.schemas.data import DataMetadata
from src.backend.marketplace.schemas.infrastructure import InfrastructureMetadata
from src.backend.marketplace.schemas.premium import PremiumMetadata
from src.backend.marketplace.schemas.services import ServicesMetadata

__all__ = [
    "AssetsMetadata",
    "ContentMetadata",
    "CoreAgentMetadata",
    "DataMetadata",
    "InfrastructureMetadata",
    "PremiumMetadata",
    "ServicesMetadata",
]
