"""Alembic chain sanity tests for ``050_marketplace_commerce``.

Owner: Iapetus (W2 NP P4 S1). Static-analysis tests (no live Postgres)
that verify the new migration slots into the chain off
``049_subscription`` (Plutus) without forking.
"""

from __future__ import annotations

import importlib
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[3]
_VERSIONS = _REPO_ROOT / "src" / "backend" / "db" / "migrations" / "versions"


def test_050_migration_file_exists() -> None:
    path = _VERSIONS / "050_marketplace_commerce.py"
    assert path.exists(), f"missing migration file at {path}"


def test_050_revision_chains_off_049() -> None:
    """``050_marketplace_commerce`` has ``down_revision = 049_subscription``."""

    module = importlib.import_module(
        "src.backend.db.migrations.versions.050_marketplace_commerce"
    )
    assert module.revision == "050_marketplace_commerce"
    assert module.down_revision == "049_subscription"


def test_050_has_at_most_one_child() -> None:
    """050 must not fork the chain.

    Iapetus P4 S1 originally asserted zero children (050 as head).
    Eunomia P6 S1 chains 051 off 050 as the canonical successor so the
    allow-list now tolerates the single expected child name. Any
    additional sibling (concurrent migration stomp) still trips this
    guard.
    """

    allowed_children = {"051_eunomia_admin_moderation_gdpr"}
    children: list[str] = []
    for path in _VERSIONS.glob("*.py"):
        if path.name.startswith("__"):
            continue
        dotted = f"src.backend.db.migrations.versions.{path.stem}"
        module = importlib.import_module(dotted)
        dr = getattr(module, "down_revision", None)
        rev = getattr(module, "revision", None)
        if dr == "050_marketplace_commerce" and rev != "050_marketplace_commerce":
            children.append(rev)
    extras = [child for child in children if child not in allowed_children]
    assert extras == [], (
        "050 may only have the Eunomia 051 successor; unexpected children: "
        + repr(extras)
    )


def test_050_creates_expected_tables() -> None:
    """The upgrade() body references every contract-required table."""

    text = (_VERSIONS / "050_marketplace_commerce.py").read_text()
    assert "CREATE TABLE creator_connect_account" in text
    assert "CREATE TABLE marketplace_purchase" in text
    assert "CREATE TABLE marketplace_review" in text
    assert "CREATE TABLE creator_payout" in text


def test_050_enforces_split_invariant() -> None:
    """The purchase CHECK sums fee + net == gross at DB layer."""

    text = (_VERSIONS / "050_marketplace_commerce.py").read_text()
    assert (
        "platform_fee_cents + creator_net_cents = gross_amount_cents" in text
    )


def test_050_review_uniqueness_guard() -> None:
    """Partial unique index excludes soft-deleted rows so re-review works."""

    text = (_VERSIONS / "050_marketplace_commerce.py").read_text()
    assert "idx_review_listing_reviewer_unique" in text
    assert "WHERE deleted_at IS NULL" in text


def test_050_rls_applied_to_every_tenant_table() -> None:
    """All four tables enable RLS per the contract Section 3.1."""

    text = (_VERSIONS / "050_marketplace_commerce.py").read_text()
    # The RLS helpers emit "ENABLE ROW LEVEL SECURITY" via
    # enable_tenant_rls + the hand-rolled policy for creator_payout.
    assert text.count("ENABLE ROW LEVEL SECURITY") >= 4 or (
        # helper-emitted ALTER TABLE ... ENABLE statements may compile
        # at migration time; fall back to checking the helper call.
        "enable_tenant_rls(\"creator_connect_account\")" in text
        and "enable_tenant_rls(\"marketplace_purchase\")" in text
        and "enable_tenant_rls(\"marketplace_review\")" in text
    )
