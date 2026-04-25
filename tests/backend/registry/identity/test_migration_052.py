"""Static-analysis tests for the Tethys 052 migration."""

from __future__ import annotations

import importlib
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[4]
_VERSIONS = _REPO_ROOT / "src" / "backend" / "db" / "migrations" / "versions"


def test_052_file_exists() -> None:
    path = _VERSIONS / "052_tethys_agent_identity_ed25519.py"
    assert path.exists(), f"missing migration file at {path}"


def test_052_chains_off_051() -> None:
    module = importlib.import_module(
        "src.backend.db.migrations.versions."
        "052_tethys_agent_identity_ed25519"
    )
    assert module.revision == "052_tethys_agent_identity_ed25519"
    assert module.down_revision == "051_eunomia_admin_moderation_gdpr"


def test_052_is_current_single_head() -> None:
    """No concurrent migration has parented off 052."""

    children: list[str] = []
    for path in _VERSIONS.glob("*.py"):
        if path.name.startswith("__"):
            continue
        dotted = f"src.backend.db.migrations.versions.{path.stem}"
        module = importlib.import_module(dotted)
        dr = getattr(module, "down_revision", None)
        rev = getattr(module, "revision", None)
        if (
            dr == "052_tethys_agent_identity_ed25519"
            and rev != "052_tethys_agent_identity_ed25519"
        ):
            children.append(rev)
    assert children == [], (
        "052 must be the single current head. Found children: "
        + repr(children)
    )


def test_052_adds_three_columns() -> None:
    text = (
        _VERSIONS / "052_tethys_agent_identity_ed25519.py"
    ).read_text()
    assert "ADD COLUMN IF NOT EXISTS display_name text" in text
    assert "ADD COLUMN IF NOT EXISTS owner_user_id uuid" in text
    assert "ADD COLUMN IF NOT EXISTS public_key_pem text" in text


def test_052_creates_owner_status_index() -> None:
    text = (
        _VERSIONS / "052_tethys_agent_identity_ed25519.py"
    ).read_text()
    assert "idx_agent_identity_owner_status" in text
    assert "(owner_user_id, status)" in text


def test_052_owner_user_id_is_fk_to_app_user() -> None:
    text = (
        _VERSIONS / "052_tethys_agent_identity_ed25519.py"
    ).read_text()
    assert "REFERENCES app_user(id) ON DELETE CASCADE" in text


def test_052_downgrade_is_reversible() -> None:
    text = (
        _VERSIONS / "052_tethys_agent_identity_ed25519.py"
    ).read_text()
    assert "DROP COLUMN IF EXISTS public_key_pem" in text
    assert "DROP COLUMN IF EXISTS owner_user_id" in text
    assert "DROP COLUMN IF EXISTS display_name" in text
    assert "DROP INDEX IF EXISTS idx_agent_identity_owner_status" in text
