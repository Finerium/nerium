"""Static-analysis tests for migration 047_marketplace_search.

Owner: Hyperion (W2 NP P1 S1). Verifies the chain linkage, that the
required DDL primitives are present, and that the downgrade reverses
the upgrade without touching the shared extensions.

A real-Postgres integration test that executes ``alembic upgrade head``
lives alongside the other migration smoke tests and is gated on
``NERIUM_TEST_DATABASE_URL`` (see :mod:`tests.backend.conftest`).
"""

from __future__ import annotations

import importlib
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[3]
_VERSIONS = _REPO_ROOT / "src" / "backend" / "db" / "migrations" / "versions"
_MIGRATION_PATH = _VERSIONS / "047_marketplace_search.py"


def test_047_migration_file_exists() -> None:
    assert _MIGRATION_PATH.exists(), f"missing migration file at {_MIGRATION_PATH}"


def test_047_chains_off_046() -> None:
    module = importlib.import_module(
        "src.backend.db.migrations.versions.047_marketplace_search"
    )
    assert module.revision == "047_marketplace_search"
    assert module.down_revision == "046_marketplace_listing_schema"


def test_047_has_exactly_one_child() -> None:
    """047 parents exactly one child: ``048_trust_score_snapshot`` (Astraea).

    This test originally asserted 047 was the single head until the next
    W2 pillar landed. Astraea's 048 trust_score_snapshot migration is
    that next pillar; the invariant narrows to "exactly one child so the
    chain does not fork".
    """

    children: list[str] = []
    for path in _VERSIONS.glob("*.py"):
        if path.name.startswith("__"):
            continue
        dotted = f"src.backend.db.migrations.versions.{path.stem}"
        module = importlib.import_module(dotted)
        dr = getattr(module, "down_revision", None)
        rev = getattr(module, "revision", None)
        if dr == "047_marketplace_search" and rev != "047_marketplace_search":
            children.append(rev)
    assert children == ["048_trust_score_snapshot"], (
        "047 must have exactly one direct child (048_trust_score_snapshot). "
        "Found children: " + repr(children)
    )


def test_047_enables_pgvector_and_trgm_extensions() -> None:
    text = _MIGRATION_PATH.read_text()
    assert "CREATE EXTENSION IF NOT EXISTS pg_trgm" in text
    assert "CREATE EXTENSION IF NOT EXISTS vector" in text


def test_047_adds_tsvector_and_embedding_columns() -> None:
    text = _MIGRATION_PATH.read_text()
    assert "listing_search_doc tsvector" in text
    assert "listing_embedding vector(1024)" in text


def test_047_creates_required_indexes() -> None:
    text = _MIGRATION_PATH.read_text()
    assert "idx_listing_search_doc" in text
    assert "USING GIN (listing_search_doc)" in text
    assert "idx_listing_title_trgm" in text
    assert "gin_trgm_ops" in text
    assert "idx_listing_embedding" in text
    assert "vector_cosine_ops" in text
    assert "lists = 100" in text


def test_047_registers_trigger_and_function() -> None:
    text = _MIGRATION_PATH.read_text()
    assert "marketplace_listing_search_doc_fn" in text
    assert "marketplace_listing_search_doc_update" in text
    assert "BEFORE INSERT OR UPDATE" in text
    # Sanity: the function uses the 'simple' tsvector config per contract.
    assert "to_tsvector('simple'" in text


def test_047_downgrade_does_not_drop_extensions() -> None:
    """Shared extensions must survive downgrade."""

    text = _MIGRATION_PATH.read_text()
    # Find the downgrade() body and assert no DROP EXTENSION inside it.
    down_idx = text.find("def downgrade()")
    assert down_idx > 0
    downgrade_body = text[down_idx:]
    assert "DROP EXTENSION" not in downgrade_body


def test_047_downgrade_drops_columns_indexes_trigger() -> None:
    text = _MIGRATION_PATH.read_text()
    down_idx = text.find("def downgrade()")
    assert down_idx > 0
    body = text[down_idx:]
    assert "DROP INDEX IF EXISTS idx_listing_embedding" in body
    assert "DROP INDEX IF EXISTS idx_listing_title_trgm" in body
    assert "DROP INDEX IF EXISTS idx_listing_search_doc" in body
    assert "DROP TRIGGER IF EXISTS marketplace_listing_search_doc_update" in body
    assert "DROP FUNCTION IF EXISTS marketplace_listing_search_doc_fn" in body
    assert "DROP COLUMN IF EXISTS listing_embedding" in body
    assert "DROP COLUMN IF EXISTS listing_search_doc" in body


def test_047_vector_dim_constant_matches_embedding_module() -> None:
    """Keep the migration's dimension constant in sync with the embedder."""

    migration = importlib.import_module(
        "src.backend.db.migrations.versions.047_marketplace_search"
    )
    embedding = importlib.import_module("src.backend.marketplace.embedding")
    assert migration.VECTOR_DIM == embedding.EMBEDDING_DIM == 1024
