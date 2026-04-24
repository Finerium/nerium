"""Unit tests for the pure-function precedence resolver.

The real ``get_flag`` runs a single-query LATERAL join against Postgres;
this test exercises the same precedence rules against the pure Python
:func:`evaluate` helper so the matrix stays covered without a live DB.

The DB-backed end-to-end test lives in ``tests/backend/integration/`` and
is opt-in (requires a live Postgres). Both tests MUST keep the same
scenario matrix so a precedence bug surfaces regardless of path.
"""

from __future__ import annotations

from uuid import UUID

import pytest

from src.backend.flags.service import evaluate


USER_A = UUID("11111111-1111-7111-8111-111111111111")
USER_B = UUID("22222222-2222-7222-8222-222222222222")
TENANT_A = UUID("aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa")
TENANT_B = UUID("bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb")


def test_no_overrides_returns_default() -> None:
    """Empty override list -> default_value wins."""

    value = evaluate(
        default_value=False,
        overrides=[],
        user_id=USER_A,
        tenant_id=TENANT_A,
    )
    assert value is False


def test_global_override_beats_default() -> None:
    """Global override with scope_id=None wins over default."""

    value = evaluate(
        default_value=False,
        overrides=[{"scope_kind": "global", "scope_id": None, "value": True}],
        user_id=USER_A,
        tenant_id=TENANT_A,
    )
    assert value is True


def test_tenant_override_beats_global() -> None:
    """Tenant-scoped override wins over global."""

    value = evaluate(
        default_value=False,
        overrides=[
            {"scope_kind": "global", "scope_id": None, "value": False},
            {"scope_kind": "tenant", "scope_id": TENANT_A, "value": True},
        ],
        user_id=USER_A,
        tenant_id=TENANT_A,
    )
    assert value is True


def test_user_override_beats_tenant() -> None:
    """User-scoped override is the most specific."""

    value = evaluate(
        default_value=False,
        overrides=[
            {"scope_kind": "global", "scope_id": None, "value": True},
            {"scope_kind": "tenant", "scope_id": TENANT_A, "value": True},
            {"scope_kind": "user", "scope_id": USER_A, "value": False},
        ],
        user_id=USER_A,
        tenant_id=TENANT_A,
    )
    assert value is False


def test_tenant_override_does_not_leak_to_other_tenant() -> None:
    """An override on TENANT_A has no effect on TENANT_B."""

    value = evaluate(
        default_value=False,
        overrides=[{"scope_kind": "tenant", "scope_id": TENANT_A, "value": True}],
        user_id=USER_B,
        tenant_id=TENANT_B,
    )
    assert value is False


def test_user_override_does_not_leak_to_other_user() -> None:
    """User-scoped override visible only to the owning user."""

    value = evaluate(
        default_value=False,
        overrides=[{"scope_kind": "user", "scope_id": USER_A, "value": True}],
        user_id=USER_B,
        tenant_id=TENANT_A,
    )
    assert value is False


def test_null_user_id_skips_user_branch() -> None:
    """When the caller has no user context, user overrides never match."""

    value = evaluate(
        default_value="coded",
        overrides=[{"scope_kind": "user", "scope_id": USER_A, "value": "pwned"}],
        user_id=None,
        tenant_id=TENANT_A,
    )
    assert value == "coded"


def test_null_tenant_id_skips_tenant_branch() -> None:
    """When the caller has no tenant context, tenant overrides never match."""

    value = evaluate(
        default_value="coded",
        overrides=[{"scope_kind": "tenant", "scope_id": TENANT_A, "value": "pwned"}],
        user_id=USER_A,
        tenant_id=None,
    )
    assert value == "coded"


def test_object_value_preserved() -> None:
    """Precedence works for complex JSON values (rate-limit override case)."""

    override = {"per_token_per_min": 200, "per_ip_per_min": 600}
    value = evaluate(
        default_value=None,
        overrides=[{"scope_kind": "global", "scope_id": None, "value": override}],
        user_id=USER_A,
        tenant_id=TENANT_A,
    )
    assert value == override


def test_uuid_string_and_uuid_object_compare_equal() -> None:
    """Scope id may be a UUID or str; evaluate normalises both."""

    value = evaluate(
        default_value=False,
        overrides=[
            {"scope_kind": "user", "scope_id": str(USER_A), "value": True},
        ],
        user_id=USER_A,
        tenant_id=None,
    )
    assert value is True


def test_multiple_user_overrides_wrong_user_ignored() -> None:
    """User override for USER_B does not bleed into USER_A evaluation."""

    value = evaluate(
        default_value=False,
        overrides=[
            {"scope_kind": "user", "scope_id": USER_B, "value": True},
        ],
        user_id=USER_A,
        tenant_id=None,
    )
    assert value is False


@pytest.mark.parametrize("default,expected", [
    (True, True),
    (False, False),
    (None, None),
    (42, 42),
    ("hello", "hello"),
    ({"a": 1}, {"a": 1}),
    ([1, 2], [1, 2]),
])
def test_default_value_pass_through(default, expected) -> None:
    """All JSON-shaped defaults pass through unchanged when no override matches."""

    assert evaluate(
        default_value=default,
        overrides=[],
        user_id=USER_A,
        tenant_id=TENANT_A,
    ) == expected
