"""Pydantic validator tests for Hemera DTOs."""

from __future__ import annotations

from uuid import UUID

import pytest
from pydantic import ValidationError

from src.backend.flags.schemas import (
    FlagCreate,
    OverrideCreate,
    _assert_kind,
)


class TestAssertKind:
    def test_boolean_accepts_true_false(self) -> None:
        _assert_kind("boolean", True)
        _assert_kind("boolean", False)

    def test_boolean_rejects_int(self) -> None:
        with pytest.raises(ValueError):
            _assert_kind("boolean", 1)

    def test_number_accepts_int_float(self) -> None:
        _assert_kind("number", 1)
        _assert_kind("number", 3.14)

    def test_number_rejects_bool(self) -> None:
        # bool is a subclass of int; we still reject it as a number.
        with pytest.raises(ValueError):
            _assert_kind("number", True)

    def test_string_accepts_str_and_none(self) -> None:
        _assert_kind("string", "hello")
        _assert_kind("string", None)

    def test_string_rejects_int(self) -> None:
        with pytest.raises(ValueError):
            _assert_kind("string", 42)

    def test_object_accepts_dict_or_none(self) -> None:
        _assert_kind("object", {"a": 1})
        _assert_kind("object", None)

    def test_object_rejects_list(self) -> None:
        with pytest.raises(ValueError):
            _assert_kind("object", [1, 2])

    def test_array_accepts_list(self) -> None:
        _assert_kind("array", [1, 2, 3])

    def test_array_rejects_dict(self) -> None:
        with pytest.raises(ValueError):
            _assert_kind("array", {"a": 1})


class TestFlagCreateValidation:
    def test_valid_boolean(self) -> None:
        FlagCreate(
            flag_name="demo.gate",
            default_value=True,
            kind="boolean",
        )

    def test_flag_name_pattern_rejects_uppercase(self) -> None:
        with pytest.raises(ValidationError):
            FlagCreate(
                flag_name="Demo.Gate",
                default_value=True,
                kind="boolean",
            )

    def test_flag_name_pattern_requires_dot(self) -> None:
        with pytest.raises(ValidationError):
            FlagCreate(
                flag_name="demogate",
                default_value=True,
                kind="boolean",
            )

    def test_kind_mismatch_rejected(self) -> None:
        with pytest.raises(ValidationError):
            FlagCreate(
                flag_name="demo.gate",
                default_value="not-a-bool",
                kind="boolean",
            )


class TestOverrideCreateValidation:
    def test_global_without_scope_id(self) -> None:
        OverrideCreate(
            scope_kind="global",
            value=True,
        )

    def test_global_rejects_scope_id(self) -> None:
        with pytest.raises(ValidationError):
            OverrideCreate(
                scope_kind="global",
                scope_id=UUID("11111111-1111-7111-8111-111111111111"),
                value=True,
            )

    def test_user_requires_scope_id(self) -> None:
        with pytest.raises(ValidationError):
            OverrideCreate(
                scope_kind="user",
                value=True,
            )

    def test_tenant_requires_scope_id(self) -> None:
        with pytest.raises(ValidationError):
            OverrideCreate(
                scope_kind="tenant",
                value=True,
            )

    def test_user_with_scope_id_ok(self) -> None:
        OverrideCreate(
            scope_kind="user",
            scope_id=UUID("11111111-1111-7111-8111-111111111111"),
            value=True,
        )
