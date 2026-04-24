"""Static-analysis tests for migration ``048_trust_score_snapshot``.

Owner: Astraea (W2 NP P1 S1). Mirrors Hyperion's
``tests/backend/marketplace/test_migration_047.py`` pattern: verifies
the chain linkage, presence of required DDL primitives, and the
downgrade reversal. A real-Postgres integration test lives alongside
other migration smoke tests gated on ``NERIUM_TEST_DATABASE_URL``.
"""

from __future__ import annotations

import importlib
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[3]
_VERSIONS = _REPO_ROOT / "src" / "backend" / "db" / "migrations" / "versions"
_MIGRATION_PATH = _VERSIONS / "048_trust_score_snapshot.py"


def test_048_migration_file_exists() -> None:
    assert _MIGRATION_PATH.exists(), f"missing migration file at {_MIGRATION_PATH}"


def test_048_chains_off_047() -> None:
    module = importlib.import_module(
        "src.backend.db.migrations.versions.048_trust_score_snapshot"
    )
    assert module.revision == "048_trust_score_snapshot"
    assert module.down_revision == "047_marketplace_search"


def test_048_is_the_new_head() -> None:
    """No migration in the tree parents off 048. Regression guard."""

    children: list[str] = []
    for path in _VERSIONS.glob("*.py"):
        if path.name.startswith("__"):
            continue
        dotted = f"src.backend.db.migrations.versions.{path.stem}"
        module = importlib.import_module(dotted)
        dr = getattr(module, "down_revision", None)
        rev = getattr(module, "revision", None)
        if dr == "048_trust_score_snapshot" and rev != "048_trust_score_snapshot":
            children.append(rev)
    assert children == [], (
        "048_trust_score_snapshot must remain the head until the next "
        "pillar revision lands. Found children: " + repr(children)
    )


def test_048_creates_snapshot_table() -> None:
    text = _MIGRATION_PATH.read_text()
    assert "CREATE TABLE trust_score_snapshot" in text
    assert "subject_kind" in text
    # Contract CHECK enumerates three subject kinds.
    assert "identity" in text
    assert "listing" in text


def test_048_snapshot_has_band_and_stability_checks() -> None:
    text = _MIGRATION_PATH.read_text()
    # Band CHECK covers the five contract bands.
    for band in ("unverified", "emerging", "established", "trusted", "elite"):
        assert band in text
    # Stability CHECK covers the two contract values.
    assert "provisional" in text
    assert "stable" in text


def test_048_snapshot_has_formula_version_column() -> None:
    text = _MIGRATION_PATH.read_text()
    assert "formula_version    text NOT NULL" in text


def test_048_snapshot_has_event_type_check() -> None:
    text = _MIGRATION_PATH.read_text()
    for event in (
        "manual_recompute",
        "pg_cron_refresh",
        "arq_refresh",
        "initial_seed",
        "on_demand",
    ):
        assert event in text


def test_048_creates_formula_weights_table_with_seed() -> None:
    text = _MIGRATION_PATH.read_text()
    assert "CREATE TABLE trust_formula_weights" in text
    assert "bayesian_wilson_v1" in text
    # Seed row includes the default m, C, z, boost numbers.
    assert '"m": 15' in text
    assert '"C": 0.7' in text
    assert '"z": 1.96' in text


def test_048_extends_marketplace_listing_with_audit_cols() -> None:
    text = _MIGRATION_PATH.read_text()
    assert "trust_score_components_cached jsonb" in text
    assert "trust_score_cached_at timestamptz" in text
    assert "trust_score_formula_version text" in text
    assert "trust_score_band text" in text
    assert "trust_score_stability text" in text


def test_048_extends_app_user_with_creator_cache() -> None:
    text = _MIGRATION_PATH.read_text()
    assert "creator_trust_score_cached numeric(5, 4)" in text
    assert "creator_trust_score_components_cached jsonb" in text
    assert "creator_trust_score_cached_at timestamptz" in text
    assert "creator_verified_badge boolean" in text


def test_048_adds_listing_stale_index() -> None:
    text = _MIGRATION_PATH.read_text()
    assert "idx_listing_trust_stale" in text


def test_048_adds_snapshot_latest_per_subject_indexes() -> None:
    text = _MIGRATION_PATH.read_text()
    assert "idx_trust_snapshot_listing_latest" in text
    assert "idx_trust_snapshot_identity_latest" in text
    assert "idx_trust_snapshot_user_latest" in text


def test_048_downgrade_reverses_tables_and_columns() -> None:
    text = _MIGRATION_PATH.read_text()
    down_idx = text.find("def downgrade()")
    assert down_idx > 0
    body = text[down_idx:]
    # Snapshot table + indexes dropped.
    assert "DROP TABLE IF EXISTS trust_score_snapshot" in body
    assert "DROP INDEX IF EXISTS idx_trust_snapshot_listing_latest" in body
    # Weights table dropped.
    assert "DROP TABLE IF EXISTS trust_formula_weights" in body
    # Listing + user columns dropped.
    assert "DROP COLUMN IF EXISTS trust_score_components_cached" in body
    assert "DROP COLUMN IF EXISTS creator_verified_badge" in body


def test_048_grants_sequence_and_table_to_nerium_api() -> None:
    """App role needs INSERT on snapshot + SELECT on weights for the service."""

    text = _MIGRATION_PATH.read_text()
    assert "GRANT SELECT, INSERT ON TABLE trust_score_snapshot" in text
    assert "GRANT SELECT ON TABLE trust_formula_weights" in text
    # Sequence grant for the bigserial PK so INSERTs land.
    assert "GRANT USAGE, SELECT ON SEQUENCE trust_score_snapshot_id_seq" in text


def test_048_does_not_touch_the_036_trust_score_table() -> None:
    """The 036 polymorphic ``trust_score`` scaffold is kept intact."""

    text = _MIGRATION_PATH.read_text()
    assert "DROP TABLE trust_score" not in text
    assert "DROP TABLE IF EXISTS trust_score\n" not in text
