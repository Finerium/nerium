"""Pydantic v2 model roundtrip tests for every Aether Session 3 projection.

Every row projection must survive ``model_validate`` + ``model_dump(mode='json')``
without precision loss on UUID, datetime, Decimal, or bytes fields.
These tests do not require a live Postgres; they exercise the pure
Pydantic surface so CI without the NERIUM_TEST_DATABASE_URL env var
still covers the model contract.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

import pytest

from src.backend.models import (
    AdapterStatus,
    AgentIdentity,
    AgentIdentityCreate,
    Inventory,
    InventoryCreate,
    MarketplaceListing,
    MarketplaceListingCreate,
    QuestProgress,
    QuestProgressUpdate,
    Session,
    SessionCreate,
    Transaction,
    TransactionCreate,
    TrustScore,
    User,
    UserCreate,
    UserPublic,
    UserUpdate,
    VendorAdapter,
)


# Reference constants reused across cases.
UID_TENANT = UUID("01926f00-0000-7a00-8000-00000000000a")
UID_USER = UUID("01926f00-1111-7a11-8111-000000000001")
UID_ROW = UUID("01926f00-2222-7a22-8222-000000000001")

NOW = datetime(2026, 4, 24, 19, 0, 0, tzinfo=timezone.utc)


def _base_row() -> dict:
    """Shared ``id``, ``tenant_id``, ``created_at``, ``updated_at`` scaffold."""

    return {
        "id": UID_ROW,
        "tenant_id": UID_TENANT,
        "created_at": NOW,
        "updated_at": NOW,
    }


def _assert_roundtrip(model) -> None:
    """Serialize to JSON and validate the result; equality enforced."""

    dumped = model.model_dump(mode="json")
    as_json = json.dumps(dumped)
    reloaded = type(model).model_validate(json.loads(as_json))
    assert reloaded == model


# ---- Base class smoke ------------------------------------------------


def test_tenant_base_requires_common_fields() -> None:
    """Missing common fields raise a validation error."""

    with pytest.raises(Exception):
        User.model_validate({"email": "x@example.com"})


# ---- User ------------------------------------------------------------


def test_user_roundtrip() -> None:
    row = {
        **_base_row(),
        "email": "alice@example.com",
        "display_name": "Alice",
        "password_hash": None,
        "is_superuser": False,
        "email_verified": True,
        "email_verified_at": NOW,
        "tier": "solo",
        "status": "active",
        "avatar_url": None,
        "deleted_at": None,
        "purge_at": None,
    }
    user = User.model_validate(row)
    assert user.email == "alice@example.com"
    assert user.tier == "solo"
    _assert_roundtrip(user)


def test_user_rejects_invalid_tier() -> None:
    row = {
        **_base_row(),
        "email": "alice@example.com",
        "display_name": "Alice",
        "is_superuser": False,
        "email_verified": False,
        "tier": "platinum",
        "status": "active",
    }
    with pytest.raises(Exception):
        User.model_validate(row)


def test_user_create_rejects_bad_email() -> None:
    with pytest.raises(Exception):
        UserCreate.model_validate(
            {"email": "not-an-email", "display_name": "x"}
        )


def test_user_update_accepts_partial_payload() -> None:
    patch = UserUpdate.model_validate({"display_name": "Renamed"})
    assert patch.display_name == "Renamed"
    assert patch.tier is None


def test_user_public_strips_secrets() -> None:
    public = UserPublic.model_validate(
        {
            "id": UID_USER,
            "display_name": "Alice",
            "avatar_url": None,
            "tier": "solo",
            "created_at": NOW,
        }
    )
    dumped = public.model_dump()
    assert "password_hash" not in dumped
    assert "email" not in dumped


# ---- Session ---------------------------------------------------------


def test_session_roundtrip() -> None:
    row = {
        **_base_row(),
        "user_id": UID_USER,
        "token_hash": "a" * 64,
        "user_agent": "Mozilla/5.0",
        "ip_address": "192.0.2.1",
        "expires_at": NOW,
        "revoked_at": None,
        "last_seen_at": NOW,
        "metadata": {"device": "mac"},
    }
    session = Session.model_validate(row)
    _assert_roundtrip(session)


def test_session_create_validates_min_fields() -> None:
    payload = SessionCreate.model_validate(
        {
            "user_id": UID_USER,
            "token_hash": "a" * 64,
            "expires_at": NOW,
        }
    )
    assert payload.metadata == {}


# ---- Quest progress --------------------------------------------------


def test_quest_progress_roundtrip() -> None:
    row = {
        **_base_row(),
        "user_id": UID_USER,
        "quest_id": "lumio_onboarding",
        "status": "in_progress",
        "current_step": 3,
        "state": {"prompt_draft": "hello"},
        "started_at": NOW,
        "completed_at": None,
    }
    quest = QuestProgress.model_validate(row)
    _assert_roundtrip(quest)


def test_quest_progress_update_allows_status_only() -> None:
    patch = QuestProgressUpdate.model_validate({"status": "completed"})
    assert patch.status == "completed"
    assert patch.current_step is None


# ---- Inventory -------------------------------------------------------


def test_inventory_roundtrip() -> None:
    row = {
        **_base_row(),
        "user_id": UID_USER,
        "item_type": "agent_instance",
        "item_ref": "apollo_demo",
        "quantity": 2,
        "metadata": {"variant": "desert"},
        "acquired_at": NOW,
        "expires_at": None,
    }
    inv = Inventory.model_validate(row)
    _assert_roundtrip(inv)


def test_inventory_create_rejects_negative_quantity() -> None:
    with pytest.raises(Exception):
        InventoryCreate.model_validate(
            {
                "user_id": UID_USER,
                "item_type": "token",
                "item_ref": "foo",
                "quantity": -1,
            }
        )


# ---- Marketplace listing --------------------------------------------


def test_marketplace_listing_roundtrip() -> None:
    row = {
        **_base_row(),
        "creator_user_id": UID_USER,
        "category": "core_agent",
        "subtype": "agent",
        "title": "Apollo Advisor",
        "description": "Friendly advisor.",
        "pricing": {"model": "free"},
        "license": "MIT",
        "status": "published",
        "version": "1.0.0",
        "metadata": {"tags": ["demo"]},
        "published_at": NOW,
    }
    listing = MarketplaceListing.model_validate(row)
    _assert_roundtrip(listing)


def test_marketplace_listing_create_rejects_bad_category() -> None:
    with pytest.raises(Exception):
        MarketplaceListingCreate.model_validate(
            {
                "category": "not_a_category",
                "subtype": "agent",
                "title": "x",
            }
        )


# ---- Transaction ledger ---------------------------------------------


def test_transaction_roundtrip() -> None:
    row = {
        **_base_row(),
        "user_id": UID_USER,
        "transaction_ref": "ch_abc123",
        "transaction_type": "purchase",
        "amount_cents": 1999,
        "currency": "USD",
        "status": "posted",
        "metadata": {"stripe": True},
        "posted_at": NOW,
    }
    tx = Transaction.model_validate(row)
    assert tx.amount_cents == 1999
    _assert_roundtrip(tx)


def test_transaction_create_accepts_amount_usd_decimal() -> None:
    payload = TransactionCreate.model_validate(
        {
            "transaction_ref": "ch_abc123",
            "transaction_type": "purchase",
            "amount_cents": 1999,
            "amount_usd": "19.99",
        }
    )
    assert payload.amount_usd == Decimal("19.99")


# ---- Trust score -----------------------------------------------------


def test_trust_score_roundtrip() -> None:
    row = {
        **_base_row(),
        "subject_type": "agent",
        "subject_id": UID_USER,
        "category": "overall",
        "score": Decimal("0.8472"),
        "signal_count": 23,
        "precomputed_at": NOW,
        "metadata": {"formula": "bayesian_wilson_v1"},
    }
    ts = TrustScore.model_validate(row)
    _assert_roundtrip(ts)


def test_trust_score_rejects_out_of_range() -> None:
    row = {
        **_base_row(),
        "subject_type": "agent",
        "subject_id": UID_USER,
        "category": "overall",
        "score": Decimal("1.5"),
        "signal_count": 0,
    }
    with pytest.raises(Exception):
        TrustScore.model_validate(row)


# ---- Agent identity --------------------------------------------------


def test_agent_identity_roundtrip() -> None:
    row = {
        **_base_row(),
        "agent_slug": "apollo_cyber",
        "public_key": bytes(range(32)),
        "status": "active",
        "retires_at": None,
        "revoked_at": None,
        "metadata": {"kind": "advisor"},
    }
    ident = AgentIdentity.model_validate(row)
    _assert_roundtrip(ident)


def test_agent_identity_rejects_wrong_key_length() -> None:
    row = {
        **_base_row(),
        "agent_slug": "bad_key",
        "public_key": b"\x00" * 16,
        "status": "active",
    }
    with pytest.raises(Exception):
        AgentIdentity.model_validate(row)


def test_agent_identity_create_validates_slug_pattern() -> None:
    with pytest.raises(Exception):
        AgentIdentityCreate.model_validate(
            {
                "agent_slug": "HAS UPPERCASE",
                "public_key": bytes(32),
            }
        )


# ---- Vendor adapter --------------------------------------------------


def test_vendor_adapter_roundtrip() -> None:
    row = {
        **_base_row(),
        "vendor": "anthropic",
        "request_type": "chat",
        "priority": 10,
        "status": "active",
        "kill_switch_flag": "crius.emergency_disable",
        "metadata": {"note": "primary"},
    }
    va = VendorAdapter.model_validate(row)
    _assert_roundtrip(va)


def test_vendor_adapter_rejects_unknown_status() -> None:
    row = {
        **_base_row(),
        "vendor": "anthropic",
        "request_type": "chat",
        "priority": 10,
        "status": "melting_down",
    }
    with pytest.raises(Exception):
        VendorAdapter.model_validate(row)


def test_adapter_status_values() -> None:
    # Literal typing sanity; enumerate by hand since Literal has no .values.
    allowed: tuple[AdapterStatus, ...] = ("active", "disabled", "circuit_open")
    assert "active" in allowed
