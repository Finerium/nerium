"""Static-analysis tests for migration ``049_subscription``.

Owner: Plutus (W2 NP P4 S1). Mirrors the pattern used in
``tests/backend/trust/test_migration_048.py``: parse the Python file as
text + import it as a module, then assert the chain linkage + required
DDL + downgrade reversal. A live-Postgres integration run is gated on
``NERIUM_TEST_DATABASE_URL`` under the shared ``pg_test_pool`` fixture
(not exercised here).
"""

from __future__ import annotations

import importlib
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[3]
_VERSIONS = _REPO_ROOT / "src" / "backend" / "db" / "migrations" / "versions"
_MIGRATION_PATH = _VERSIONS / "049_subscription.py"


def test_049_migration_file_exists() -> None:
    assert _MIGRATION_PATH.exists(), f"missing migration file at {_MIGRATION_PATH}"


def test_049_chains_off_048() -> None:
    module = importlib.import_module(
        "src.backend.db.migrations.versions.049_subscription"
    )
    assert module.revision == "049_subscription"
    assert module.down_revision == "048_trust_score_snapshot"


def test_049_creates_subscription_table() -> None:
    text = _MIGRATION_PATH.read_text()
    assert "CREATE TABLE subscription (" in text
    # Contract: 4-tier enum matches plans.Tier.
    for tier in ("free", "starter", "pro", "team"):
        assert f"'{tier}'" in text
    # Stripe lifecycle status enum.
    for status_value in (
        "incomplete",
        "trialing",
        "active",
        "past_due",
        "canceled",
        "unpaid",
    ):
        assert f"'{status_value}'" in text


def test_049_creates_subscription_event_table_with_unique_idempotency() -> None:
    text = _MIGRATION_PATH.read_text()
    assert "CREATE TABLE subscription_event" in text
    # Idempotency anchor is the UNIQUE stripe_event_id column.
    assert "stripe_event_id   text UNIQUE NOT NULL" in text


def test_049_creates_ledger_triple() -> None:
    text = _MIGRATION_PATH.read_text()
    assert "CREATE TABLE billing_ledger_account" in text
    assert "CREATE TABLE billing_ledger_transaction" in text
    assert "CREATE TABLE billing_ledger_entry" in text
    # BIGINT minor units non-negotiable per V4 lock.
    assert "amount_minor_units  bigint" in text
    # Direction is char(1) D/C per contract Section 7.
    assert "direction           char(1)" in text
    assert "CHECK (direction IN ('D','C'))" in text


def test_049_creates_sum_to_zero_trigger() -> None:
    text = _MIGRATION_PATH.read_text()
    assert "CREATE OR REPLACE FUNCTION billing_ledger_check_sum_to_zero" in text
    assert "CREATE CONSTRAINT TRIGGER trg_billing_ledger_sum_to_zero" in text
    assert "DEFERRABLE INITIALLY DEFERRED" in text


def test_049_seeds_platform_accounts() -> None:
    text = _MIGRATION_PATH.read_text()
    assert "asset:stripe_balance_usd" in text
    assert "revenue:subscription_usd" in text


def test_049_enables_rls_on_subscription() -> None:
    text = _MIGRATION_PATH.read_text()
    assert "enable_tenant_rls(\"subscription\")" in text


def test_049_grants_append_only_on_ledger_tx_and_entry() -> None:
    text = _MIGRATION_PATH.read_text()
    # We grant SELECT + INSERT but NOT UPDATE / DELETE so the ledger
    # stays append-only at the grant layer too.
    assert (
        "GRANT SELECT, INSERT ON TABLE billing_ledger_transaction"
        in text
    )
    assert "GRANT SELECT, INSERT ON TABLE billing_ledger_entry" in text


def test_049_downgrade_reverses_everything() -> None:
    text = _MIGRATION_PATH.read_text()
    down_idx = text.find("def downgrade()")
    assert down_idx > 0
    body = text[down_idx:]
    assert "DROP TABLE IF EXISTS billing_ledger_entry" in body
    assert "DROP TABLE IF EXISTS billing_ledger_transaction" in body
    assert "DROP TABLE IF EXISTS billing_ledger_account" in body
    assert "DROP TABLE IF EXISTS subscription_event" in body
    assert "DROP TABLE IF EXISTS subscription" in body
    assert "DROP FUNCTION IF EXISTS billing_ledger_check_sum_to_zero" in body
