"""Static-analysis tests for the Eunomia 051 migration."""

from __future__ import annotations

import importlib
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[3]
_VERSIONS = _REPO_ROOT / "src" / "backend" / "db" / "migrations" / "versions"


def test_051_file_exists() -> None:
    path = _VERSIONS / "051_eunomia_admin_moderation_gdpr.py"
    assert path.exists(), f"missing migration file at {path}"


def test_051_chains_off_050() -> None:
    module = importlib.import_module(
        "src.backend.db.migrations.versions."
        "051_eunomia_admin_moderation_gdpr"
    )
    assert module.revision == "051_eunomia_admin_moderation_gdpr"
    assert module.down_revision == "050_marketplace_commerce"


_CANONICAL_051_CHILDREN: frozenset[str] = frozenset(
    {
        # Tethys W2 NP P5 Session 1 extends agent_identity with the
        # display_name / owner_user_id / public_key_pem columns the
        # CRUD surface needs. Single canonical successor; any *other*
        # child off 051 is still a branch error and fails the test.
        "052_tethys_agent_identity_ed25519",
    }
)


def test_051_has_only_canonical_children() -> None:
    """Only whitelisted migrations may parent off 051.

    The original guard asserted 051 was the single head, but Tethys'
    052 legitimately chains off it. Replace the strict equality with
    a whitelist set so unauthorised concurrent branches still fail.
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
            dr == "051_eunomia_admin_moderation_gdpr"
            and rev != "051_eunomia_admin_moderation_gdpr"
        ):
            children.append(rev)
    unknown = [child for child in children if child not in _CANONICAL_051_CHILDREN]
    assert unknown == [], (
        "Unauthorised concurrent migration parented off 051. "
        f"Add to whitelist or rebase: {unknown!r}"
    )


def test_051_creates_expected_tables() -> None:
    text = (_VERSIONS / "051_eunomia_admin_moderation_gdpr.py").read_text()
    assert "CREATE TABLE moderation_event" in text
    assert "CREATE TABLE consent_event" in text


def test_051_moderation_event_has_action_check() -> None:
    text = (_VERSIONS / "051_eunomia_admin_moderation_gdpr.py").read_text()
    assert "CHECK (action IN ('approve', 'reject'))" in text


def test_051_consent_event_has_type_check() -> None:
    text = (_VERSIONS / "051_eunomia_admin_moderation_gdpr.py").read_text()
    assert "'analytics'" in text
    assert "'marketing'" in text
    assert "'functional'" in text
    assert "'necessary'" in text


def test_051_applies_rls_to_consent_event() -> None:
    text = (_VERSIONS / "051_eunomia_admin_moderation_gdpr.py").read_text()
    assert "enable_tenant_rls(\"consent_event\")" in text


def test_051_downgrade_is_reversible() -> None:
    """The ``downgrade()`` body must drop both tables + policies."""

    text = (_VERSIONS / "051_eunomia_admin_moderation_gdpr.py").read_text()
    assert "DROP TABLE IF EXISTS moderation_event" in text
    assert "DROP TABLE IF EXISTS consent_event" in text
    assert "DROP POLICY IF EXISTS tenant_isolation ON moderation_event" in text
