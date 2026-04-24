"""Alembic chain sanity tests for ``046_marketplace_listing_schema``.

Owner: Phanes (W2 NP P1 S1). These are static-analysis tests (no live
Postgres) that verify the new migration slots into the single head of
the Alembic chain without creating a fork.

An integration test that actually runs ``alembic upgrade head`` against
a real cluster lives in :mod:`tests.backend.test_migrations_030_to_038`
and is gated on ``NERIUM_TEST_DATABASE_URL``.
"""

from __future__ import annotations

import importlib
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[3]
_VERSIONS = _REPO_ROOT / "src" / "backend" / "db" / "migrations" / "versions"


def test_046_migration_file_exists() -> None:
    path = _VERSIONS / "046_marketplace_listing_schema.py"
    assert path.exists(), f"missing migration file at {path}"


def test_046_revision_chains_off_045() -> None:
    """``046_marketplace_listing_schema`` has ``down_revision = 045_realtime_...``."""

    module = importlib.import_module(
        "src.backend.db.migrations.versions.046_marketplace_listing_schema"
    )
    assert module.revision == "046_marketplace_listing_schema"
    assert module.down_revision == "045_realtime_connection_audit"


def test_046_is_single_head_after_apply() -> None:
    """No other migration in the tree declares ``down_revision=046_...``.

    Regression guard: if a future revision silently parents off 046 we
    want the test to fail loudly so the author can decide whether to
    chain further or introduce a merge.
    """

    # We iterate the versions directory and parse each file's
    # ``down_revision`` string via import. A module that fails to import
    # is NOT silently skipped; we surface the error.
    children: list[str] = []
    for path in _VERSIONS.glob("*.py"):
        if path.name.startswith("__"):
            continue
        dotted = f"src.backend.db.migrations.versions.{path.stem}"
        module = importlib.import_module(dotted)
        dr = getattr(module, "down_revision", None)
        rev = getattr(module, "revision", None)
        if dr == "046_marketplace_listing_schema" and rev != "046_marketplace_listing_schema":
            children.append(rev)
    assert children == [], (
        "046_marketplace_listing_schema must remain the single head until the "
        "next W2 pillar migration lands. Found children: "
        + repr(children)
    )


def test_marketplace_live_flag_referenced_in_migration() -> None:
    """046 registers ``marketplace.live`` so the gate has a row to read."""

    text = (_VERSIONS / "046_marketplace_listing_schema.py").read_text()
    assert "'marketplace.live'" in text
    assert "INSERT INTO hemera_flag" in text
