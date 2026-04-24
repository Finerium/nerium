"""NERIUM Pydantic v2 row projections.

One module per tenant-scoped table authored by Aether Session 3. Wave 2
agents (Phanes, Plutus, Astraea, Tethys, Crius) extend their respective
modules with the richer columns their contracts define.

Import style
------------
::

    from src.backend.models import User, MarketplaceListing, TrustScore

or for the full typed payload::

    from src.backend.models.user import User, UserCreate, UserUpdate

The ``base`` module exports the shared ``TenantBaseModel`` and
``NeriumModel`` consumers subclass.
"""

from __future__ import annotations

from src.backend.models.agent_identity import (
    AgentIdentity,
    AgentIdentityCreate,
    IdentityStatus,
)
from src.backend.models.base import NeriumModel, TenantBaseModel, dump_row
from src.backend.models.inventory import Inventory, InventoryCreate, ItemType
from src.backend.models.marketplace_listing import (
    ListingCategory,
    ListingStatus,
    MarketplaceListing,
    MarketplaceListingCreate,
)
from src.backend.models.quest_progress import (
    QuestProgress,
    QuestProgressUpdate,
    QuestStatus,
)
from src.backend.models.session import Session, SessionCreate
from src.backend.models.transaction_ledger import (
    Transaction,
    TransactionCreate,
    TransactionStatus,
    TransactionType,
)
from src.backend.models.trust_score import SubjectType, TrustCategory, TrustScore
from src.backend.models.user import (
    User,
    UserCreate,
    UserPublic,
    UserStatus,
    UserTier,
    UserUpdate,
)
from src.backend.models.vendor_adapter import (
    AdapterStatus,
    RequestType,
    Vendor,
    VendorAdapter,
)

__all__ = [
    "AdapterStatus",
    "AgentIdentity",
    "AgentIdentityCreate",
    "IdentityStatus",
    "Inventory",
    "InventoryCreate",
    "ItemType",
    "ListingCategory",
    "ListingStatus",
    "MarketplaceListing",
    "MarketplaceListingCreate",
    "NeriumModel",
    "QuestProgress",
    "QuestProgressUpdate",
    "QuestStatus",
    "RequestType",
    "Session",
    "SessionCreate",
    "SubjectType",
    "TenantBaseModel",
    "Transaction",
    "TransactionCreate",
    "TransactionStatus",
    "TransactionType",
    "TrustCategory",
    "TrustScore",
    "User",
    "UserCreate",
    "UserPublic",
    "UserStatus",
    "UserTier",
    "UserUpdate",
    "Vendor",
    "VendorAdapter",
    "dump_row",
]
