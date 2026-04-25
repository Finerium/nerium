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


def test_052_has_single_linear_child() -> None:
    """052 must have at most one child to keep the migration chain linear.

    Originally Tethys asserted 052 was the head; Crius (W2 NP P5
    Session 1) chained 053 off 052 per the pack prompt's
    ``down_revision='052_tethys_agent_identity_ed25519'`` mandate. The
    assertion now guards the linearity invariant rather than the head
    identity: no two siblings may parent off 052.
    """

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
    assert len(children) <= 1, (
        "052 must have a linear chain (zero or one child). Found: "
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
