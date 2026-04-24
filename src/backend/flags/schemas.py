"""Pydantic v2 DTOs for the Hemera admin + me routers.

Field names mirror the DB columns exactly so the admin router can
``**dict(row)`` results from asyncpg without a translation layer.

Contract: ``docs/contracts/feature_flag.contract.md`` Section 4.2.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

FlagKind = Literal["boolean", "number", "string", "object", "array"]
ScopeKind = Literal["user", "tenant", "global"]
AuditAction = Literal[
    "flag_created",
    "flag_updated",
    "flag_deleted",
    "override_created",
    "override_updated",
    "override_deleted",
    "override_expired",
]


class FlagDefinition(BaseModel):
    """A row in ``hemera_flag`` plus the effective value for the caller.

    ``effective_value`` is populated by :func:`service.get_flag` using the
    request's user + tenant; for list endpoints the field is ``None`` and
    the client sorts by ``default_value``.
    """

    model_config = ConfigDict(from_attributes=True)

    flag_name: str = Field(..., min_length=1, max_length=200)
    default_value: Any
    kind: FlagKind
    description: str | None = None
    owner_agent: str | None = None
    tags: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
    created_by: UUID | None = None
    effective_value: Any | None = None


class FlagCreate(BaseModel):
    """Admin POST /v1/admin/flags body."""

    # Field declaration order matters for the Pydantic v2 field_validator
    # below: ``default_value`` reads ``kind`` from ``info.data`` which is
    # only populated for fields declared BEFORE the validated field.
    # Keeping ``kind`` first means the kind-mismatch check always sees
    # the declared kind.
    flag_name: str = Field(..., pattern=r"^[a-z0-9_]+(\.[a-z0-9_]+){1,3}$")
    kind: FlagKind
    default_value: Any
    description: str | None = None
    owner_agent: str | None = None
    tags: list[str] = Field(default_factory=list)

    @field_validator("default_value")
    @classmethod
    def default_must_match_kind(cls, value: Any, info) -> Any:  # type: ignore[no-untyped-def]
        kind = info.data.get("kind")
        if kind is None:
            return value
        _assert_kind(kind, value)
        return value


class FlagUpdate(BaseModel):
    """Admin PATCH /v1/admin/flags/{flag_name} body. All fields optional."""

    default_value: Any | None = None
    description: str | None = None
    owner_agent: str | None = None
    tags: list[str] | None = None


class Override(BaseModel):
    """A row in ``hemera_override``."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    flag_name: str
    scope_kind: ScopeKind
    scope_id: UUID | None
    value: Any
    expires_at: datetime | None = None
    reason: str | None = None
    created_by: UUID | None = None
    created_at: datetime
    updated_at: datetime


class OverrideCreate(BaseModel):
    """Admin POST /v1/admin/flags/{flag_name}/overrides body."""

    scope_kind: ScopeKind
    scope_id: UUID | None = None
    value: Any
    expires_at: datetime | None = None
    reason: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def _scope_shape(self) -> "OverrideCreate":
        # model_validator runs after all fields (including defaults) are
        # populated; a plain field_validator on ``scope_id`` would skip
        # the check when the caller omits the field and it defaults to
        # None, which is precisely the failure mode we need to catch.
        if self.scope_kind in ("user", "tenant") and self.scope_id is None:
            raise ValueError(
                f"scope_kind={self.scope_kind} requires scope_id"
            )
        if self.scope_kind == "global" and self.scope_id is not None:
            raise ValueError("scope_kind=global must omit scope_id")
        return self


class AuditRow(BaseModel):
    """A row in ``hemera_audit``."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    actor_user_id: UUID | None
    flag_name: str
    scope_kind: ScopeKind | None
    scope_id: UUID | None
    action: AuditAction
    old_value: Any | None = None
    new_value: Any | None = None
    reason: str | None = None
    at: datetime


class EffectiveFlag(BaseModel):
    """Row returned by ``GET /v1/me/flags``.

    Only flags tagged with ``exposed_to_user`` (or ``exposed`` as a shorter
    alias) are included; everything else is server-side only.
    """

    flag_name: str
    value: Any
    kind: FlagKind


class MeFlagsResponse(BaseModel):
    """Payload for ``GET /v1/me/flags``."""

    flags: list[EffectiveFlag]
    evaluated_at: datetime


class FlagListResponse(BaseModel):
    """Payload for ``GET /v1/admin/flags``."""

    flags: list[FlagDefinition]


class OverrideListResponse(BaseModel):
    """Payload for ``GET /v1/admin/flags/{flag_name}/overrides``."""

    overrides: list[Override]


class AuditListResponse(BaseModel):
    """Paginated payload for ``GET /v1/admin/flags/{flag_name}/audit``."""

    entries: list[AuditRow]
    next_cursor: str | None = None


def _assert_kind(kind: FlagKind, value: Any) -> None:
    """Raise ValueError if ``value`` does not match the declared kind.

    Exported only for tests; the runtime validators call into it through
    the Pydantic field_validator wrappers above. Kept at module scope to
    keep the admin router lean.
    """

    if kind == "boolean" and not isinstance(value, bool):
        raise ValueError(f"kind=boolean requires bool, got {type(value).__name__}")
    if kind == "number" and not isinstance(value, (int, float)):
        raise ValueError(f"kind=number requires int|float, got {type(value).__name__}")
    if kind == "number" and isinstance(value, bool):
        # bool is a subclass of int; reject here to avoid silent accept.
        raise ValueError("kind=number must not be bool")
    if kind == "string" and not isinstance(value, str):
        # Allow None as a string flag value? Contract examples show 'null'
        # for unset string flags (e.g. oauth.fallback_client_id). Accept None.
        if value is not None:
            raise ValueError(f"kind=string requires str|None, got {type(value).__name__}")
    if kind == "object" and value is not None and not isinstance(value, dict):
        raise ValueError(f"kind=object requires dict|None, got {type(value).__name__}")
    if kind == "array" and not isinstance(value, list):
        raise ValueError(f"kind=array requires list, got {type(value).__name__}")


__all__ = [
    "AuditAction",
    "AuditListResponse",
    "AuditRow",
    "EffectiveFlag",
    "FlagCreate",
    "FlagDefinition",
    "FlagKind",
    "FlagListResponse",
    "FlagUpdate",
    "MeFlagsResponse",
    "Override",
    "OverrideCreate",
    "OverrideListResponse",
    "ScopeKind",
]
