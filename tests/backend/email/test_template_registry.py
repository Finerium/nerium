"""Template registry integrity.

Contract: docs/contracts/email_transactional.contract.md Section 3.2.

Asserts the contract-mandated 13 template names exist and that each
one has a non-empty subject + category + version. Category values
must be from the allow list.
"""

from __future__ import annotations

import pytest

from src.backend.email.templates import (
    TEMPLATES,
    TemplateMeta,
    category_of,
    get_template_meta,
    list_template_names,
)


# Contract Section 3.2 verbatim.
EXPECTED_TEMPLATES = {
    "welcome",
    "email_verify",
    "password_reset",
    "purchase_receipt",
    "marketplace_sale",
    "payout_paid",
    "invoice_receipt",
    "quest_completion",
    "key_rotation_alert",
    "dispute_notification",
    "gdpr_export_ready",
    "maintenance_notice",
    "budget_alert",
}

ALLOWED_CATEGORIES = {
    "marketplace",
    "billing",
    "system_alert",
    "digest",
    "security",
}


def test_all_contract_templates_registered() -> None:
    assert set(TEMPLATES.keys()) == EXPECTED_TEMPLATES


def test_template_count_matches_contract() -> None:
    assert len(TEMPLATES) == 13


@pytest.mark.parametrize("name", sorted(EXPECTED_TEMPLATES))
def test_template_metadata_well_formed(name: str) -> None:
    meta = TEMPLATES[name]
    assert isinstance(meta, TemplateMeta)
    assert meta.name == name
    assert meta.version, f"{name} must declare a semver version"
    assert meta.subject, f"{name} must declare a subject"
    assert meta.category in ALLOWED_CATEGORIES


def test_get_template_meta_raises_on_unknown() -> None:
    with pytest.raises(KeyError):
        get_template_meta("unknown_template_name")


def test_category_of_shortcut_matches_registry() -> None:
    for name, meta in TEMPLATES.items():
        assert category_of(name) == meta.category


def test_list_template_names_returns_sorted_unique() -> None:
    names = list_template_names()
    assert names == sorted(names)
    assert len(names) == len(set(names))


def test_critical_templates_match_contract_section_8() -> None:
    # Contract Section 8 names password_reset + security_alert as the
    # baseline critical bypass set. Our registry extends to the
    # security + billing-critical + dispute_notification flow.
    critical_names = {name for name, meta in TEMPLATES.items() if meta.critical}
    assert "password_reset" in critical_names
    assert "email_verify" in critical_names
    assert "key_rotation_alert" in critical_names
    # Non-critical examples for the inverse assertion.
    assert not TEMPLATES["welcome"].critical
    assert not TEMPLATES["quest_completion"].critical
