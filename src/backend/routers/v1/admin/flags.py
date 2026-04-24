"""Admin CRUD for Hemera feature flags.

Mount point: ``/v1/admin/flags`` (prefix applied by ``main.py``).

Contract: ``docs/contracts/feature_flag.contract.md`` Section 4.2.

Auth
----
Every endpoint is gated by :func:`require_admin_scope` with pillar
scope ``admin:flags`` so a principal with the broad ``admin`` scope
or the narrow ``admin:flags`` scope may pass. The dependency raises
403 problem+json on miss.

Audit
-----
Mutations open a transaction, call :func:`flags.actor.set_actor` to
bind ``hemera.actor_id`` from the JWT sub claim, then run the write.
The after-insert/after-update/after-delete triggers capture the audit
row automatically; the router never writes to ``hemera_audit`` directly.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Path, Query, Request, status

from src.backend.db.pool import get_pool
from src.backend.errors import (
    ConflictProblem,
    NotFoundProblem,
    ValidationProblem,
)
from src.backend.flags import audit as flag_audit
from src.backend.flags import override as flag_override
from src.backend.flags import service as flag_service
from src.backend.flags.actor import actor_scoped
from src.backend.flags.cache import invalidate_flag
from src.backend.flags.errors import FlagNotFound, InvalidScope
from src.backend.flags.invalidator import publish_invalidation
from src.backend.flags.schemas import (
    AuditListResponse,
    AuditRow,
    FlagCreate,
    FlagDefinition,
    FlagListResponse,
    FlagUpdate,
    Override,
    OverrideCreate,
    OverrideListResponse,
    _assert_kind,
)
from src.backend.routers.v1.admin.deps import get_actor_id, require_admin_scope

logger = logging.getLogger(__name__)

router = APIRouter(
    # Mounted under ``/v1`` by :func:`mount_v1_routers`; effective URL
    # is ``/v1/admin/flags/*``. The ``/admin`` prefix keeps this router
    # aligned with tenant-binding middleware's cross-tenant exemption
    # (``DEFAULT_CROSS_TENANT_PATHS = ('/admin',)``); admin endpoints
    # do not bind a tenant, and Hemera flag tables are global so that
    # is the correct behaviour.
    prefix="/admin/flags",
    tags=["admin-flags"],
    dependencies=[Depends(require_admin_scope(pillar_scope="admin:flags"))],
)


@router.get("", response_model=FlagListResponse)
async def list_flags(request: Request) -> FlagListResponse:
    """List all registered flags with the caller-effective value.

    ``effective_value`` is resolved per-flag using the caller's user
    (from JWT ``sub``) and tenant (from the tenant-binding middleware).
    Global admins that want to see values for a specific end-user should
    request ``/v1/admin/flags/{flag_name}`` with the user override view
    instead; this list endpoint only answers "what does THIS admin see".
    """

    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT flag_name, default_value, kind, description, owner_agent,
                   tags, created_at, updated_at, created_by
            FROM hemera_flag
            ORDER BY flag_name ASC
            """
        )

    user_id = getattr(request.state, "auth").user_id
    tenant_id = getattr(request.state, "tenant_id", None)

    out: list[FlagDefinition] = []
    for row in rows:
        flag_name = row["flag_name"]
        effective = await flag_service.get_flag(
            flag_name, user_id=user_id, tenant_id=tenant_id
        )
        out.append(
            FlagDefinition(
                flag_name=flag_name,
                default_value=_decode_jsonb(row["default_value"]),
                kind=row["kind"],
                description=row["description"],
                owner_agent=row["owner_agent"],
                tags=list(row["tags"] or ()),
                created_at=row["created_at"],
                updated_at=row["updated_at"],
                created_by=row["created_by"],
                effective_value=effective,
            )
        )
    return FlagListResponse(flags=out)


@router.get("/{flag_name}", response_model=FlagDefinition)
async def get_flag_detail(
    request: Request,
    flag_name: str = Path(..., min_length=1, max_length=200),
) -> FlagDefinition:
    """Return a single flag definition + the caller's effective value."""

    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT flag_name, default_value, kind, description, owner_agent,
                   tags, created_at, updated_at, created_by
            FROM hemera_flag WHERE flag_name = $1
            """,
            flag_name,
        )
    if row is None:
        raise NotFoundProblem(detail=f"Flag '{flag_name}' not found.")

    user_id = getattr(request.state, "auth").user_id
    tenant_id = getattr(request.state, "tenant_id", None)
    effective = await flag_service.get_flag(
        flag_name, user_id=user_id, tenant_id=tenant_id
    )
    return FlagDefinition(
        flag_name=row["flag_name"],
        default_value=_decode_jsonb(row["default_value"]),
        kind=row["kind"],
        description=row["description"],
        owner_agent=row["owner_agent"],
        tags=list(row["tags"] or ()),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        created_by=row["created_by"],
        effective_value=effective,
    )


@router.post("", response_model=FlagDefinition, status_code=status.HTTP_201_CREATED)
async def create_flag(
    request: Request,
    payload: FlagCreate = Body(...),
) -> FlagDefinition:
    """Register a new flag. Default value must match declared kind."""

    actor_id = get_actor_id(request)
    pool = get_pool()
    encoded = json.dumps(payload.default_value)
    try:
        async with actor_scoped(pool, user_id=actor_id) as conn:
            try:
                row = await conn.fetchrow(
                    """
                    INSERT INTO hemera_flag (
                        flag_name, default_value, kind, description,
                        owner_agent, tags, created_by
                    ) VALUES ($1, $2::jsonb, $3, $4, $5, $6, $7::uuid)
                    RETURNING flag_name, default_value, kind, description,
                              owner_agent, tags, created_at, updated_at, created_by
                    """,
                    payload.flag_name,
                    encoded,
                    payload.kind,
                    payload.description,
                    payload.owner_agent,
                    list(payload.tags),
                    actor_id,
                )
            except Exception as exc:  # asyncpg UniqueViolationError subclass
                if "hemera_flag_pkey" in str(exc):
                    raise ConflictProblem(
                        detail=f"Flag '{payload.flag_name}' already exists."
                    ) from exc
                raise
    except ConflictProblem:
        raise
    except Exception as exc:  # pragma: no cover - defensive
        logger.exception("flags.admin.create_failed")
        raise ValidationProblem(detail=str(exc)) from exc

    await flag_service.refresh_bootstrap_flag(payload.flag_name)
    await publish_invalidation([payload.flag_name], source="flag_create")
    assert row is not None  # satisfied by INSERT ... RETURNING
    return FlagDefinition(
        flag_name=row["flag_name"],
        default_value=_decode_jsonb(row["default_value"]),
        kind=row["kind"],
        description=row["description"],
        owner_agent=row["owner_agent"],
        tags=list(row["tags"] or ()),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        created_by=row["created_by"],
    )


@router.patch("/{flag_name}", response_model=FlagDefinition)
async def update_flag(
    request: Request,
    payload: FlagUpdate = Body(...),
    flag_name: str = Path(..., min_length=1, max_length=200),
) -> FlagDefinition:
    """Update default_value / description / tags on an existing flag."""

    actor_id = get_actor_id(request)
    pool = get_pool()

    async with actor_scoped(pool, user_id=actor_id) as conn:
        existing = await conn.fetchrow(
            "SELECT kind FROM hemera_flag WHERE flag_name = $1", flag_name
        )
        if existing is None:
            raise NotFoundProblem(detail=f"Flag '{flag_name}' not found.")
        current_kind = existing["kind"]

        if payload.default_value is not None:
            try:
                _assert_kind(current_kind, payload.default_value)
            except ValueError as exc:
                raise ValidationProblem(detail=str(exc)) from exc

        row = await conn.fetchrow(
            """
            UPDATE hemera_flag SET
                default_value = COALESCE($2::jsonb, default_value),
                description   = COALESCE($3, description),
                owner_agent   = COALESCE($4, owner_agent),
                tags          = COALESCE($5, tags),
                updated_at    = now()
            WHERE flag_name = $1
            RETURNING flag_name, default_value, kind, description, owner_agent,
                      tags, created_at, updated_at, created_by
            """,
            flag_name,
            json.dumps(payload.default_value) if payload.default_value is not None else None,
            payload.description,
            payload.owner_agent,
            list(payload.tags) if payload.tags is not None else None,
        )

    await invalidate_flag(flag_name)
    await flag_service.refresh_bootstrap_flag(flag_name)
    await publish_invalidation([flag_name], source="flag_update")

    assert row is not None
    return FlagDefinition(
        flag_name=row["flag_name"],
        default_value=_decode_jsonb(row["default_value"]),
        kind=row["kind"],
        description=row["description"],
        owner_agent=row["owner_agent"],
        tags=list(row["tags"] or ()),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        created_by=row["created_by"],
    )


@router.delete("/{flag_name}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_flag(
    request: Request,
    flag_name: str = Path(..., min_length=1, max_length=200),
) -> None:
    """Delete the flag. Overrides cascade via the FK constraint."""

    actor_id = get_actor_id(request)
    pool = get_pool()
    async with actor_scoped(pool, user_id=actor_id) as conn:
        status_tag = await conn.execute(
            "DELETE FROM hemera_flag WHERE flag_name = $1", flag_name
        )
    if not status_tag.endswith(" 1"):
        raise NotFoundProblem(detail=f"Flag '{flag_name}' not found.")

    await invalidate_flag(flag_name)
    await flag_service.refresh_bootstrap_flag(flag_name)
    await publish_invalidation([flag_name], source="flag_delete")


@router.get(
    "/{flag_name}/overrides",
    response_model=OverrideListResponse,
)
async def list_overrides(
    flag_name: str = Path(..., min_length=1, max_length=200),
) -> OverrideListResponse:
    rows = await flag_override.list_overrides(flag_name)
    if not rows:
        # Distinguish "no overrides" from "unknown flag" so UI can hint.
        registered = await flag_service.is_flag_registered(flag_name)
        if not registered:
            raise NotFoundProblem(detail=f"Flag '{flag_name}' not found.")
    out = [
        Override(
            id=int(row["id"]),
            flag_name=row["flag_name"],
            scope_kind=row["scope_kind"],
            scope_id=row["scope_id"],
            value=_decode_jsonb(row["value"]),
            expires_at=row["expires_at"],
            reason=row["reason"],
            created_by=row["created_by"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )
        for row in rows
    ]
    return OverrideListResponse(overrides=out)


@router.post(
    "/{flag_name}/overrides",
    response_model=Override,
    status_code=status.HTTP_201_CREATED,
)
async def create_override(
    request: Request,
    payload: OverrideCreate = Body(...),
    flag_name: str = Path(..., min_length=1, max_length=200),
) -> Override:
    """Upsert an override for ``(flag_name, scope_kind, scope_id)``."""

    actor_id = get_actor_id(request)

    pool = get_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow(
            "SELECT kind FROM hemera_flag WHERE flag_name = $1", flag_name
        )
    if existing is None:
        raise NotFoundProblem(detail=f"Flag '{flag_name}' not found.")
    try:
        _assert_kind(existing["kind"], payload.value)
    except ValueError as exc:
        raise ValidationProblem(detail=str(exc)) from exc

    try:
        override_id = await flag_override.upsert_override(
            actor_id=actor_id,
            flag_name=flag_name,
            scope_kind=payload.scope_kind,
            scope_id=payload.scope_id,
            value=payload.value,
            expires_at=payload.expires_at,
            reason=payload.reason,
        )
    except FlagNotFound as exc:
        raise NotFoundProblem(detail=str(exc)) from exc
    except InvalidScope as exc:
        raise ValidationProblem(detail=str(exc)) from exc

    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, flag_name, scope_kind, scope_id, value, expires_at,
                   reason, created_by, created_at, updated_at
            FROM hemera_override WHERE id = $1
            """,
            override_id,
        )
    assert row is not None
    return Override(
        id=int(row["id"]),
        flag_name=row["flag_name"],
        scope_kind=row["scope_kind"],
        scope_id=row["scope_id"],
        value=_decode_jsonb(row["value"]),
        expires_at=row["expires_at"],
        reason=row["reason"],
        created_by=row["created_by"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


@router.delete(
    "/{flag_name}/overrides/{override_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_override(
    request: Request,
    flag_name: str = Path(..., min_length=1, max_length=200),
    override_id: int = Path(..., gt=0),
) -> None:
    """Remove a specific override row."""

    actor_id = get_actor_id(request)
    deleted = await flag_override.delete_override_by_id(
        actor_id=actor_id,
        override_id=override_id,
    )
    if not deleted:
        raise NotFoundProblem(
            detail=f"Override {override_id} not found for '{flag_name}'."
        )


@router.get(
    "/{flag_name}/audit",
    response_model=AuditListResponse,
)
async def list_audit(
    flag_name: str = Path(..., min_length=1, max_length=200),
    limit: int = Query(default=50, ge=1, le=200),
    cursor: str | None = Query(default=None),
) -> AuditListResponse:
    """Paginated audit trail for a flag, newest first."""

    try:
        rows, next_cursor = await flag_audit.list_audit_for_flag(
            flag_name, limit=limit, cursor=cursor
        )
    except ValueError as exc:
        raise ValidationProblem(detail=str(exc)) from exc
    out = [
        AuditRow(
            id=int(row["id"]),
            actor_user_id=row["actor_user_id"],
            flag_name=row["flag_name"],
            scope_kind=row["scope_kind"],
            scope_id=row["scope_id"],
            action=row["action"],
            old_value=_decode_jsonb(row["old_value"]),
            new_value=_decode_jsonb(row["new_value"]),
            reason=row["reason"],
            at=row["at"],
        )
        for row in rows
    ]
    return AuditListResponse(entries=out, next_cursor=next_cursor)


def _decode_jsonb(raw: Any) -> Any:
    """Decode a jsonb column returned as a string by asyncpg."""

    if raw is None:
        return None
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except ValueError:
            return raw
    return raw


__all__ = ["router"]
