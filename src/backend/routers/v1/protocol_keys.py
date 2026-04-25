"""Tenant API key CRUD: ``/v1/protocol/keys``.

Owner: Crius (W2 NP P5 Session 2).

Endpoints
---------
- ``POST   /v1/protocol/keys``         seal + persist a new vendor key.
- ``GET    /v1/protocol/keys``         list metadata (no plaintext, ever).
- ``DELETE /v1/protocol/keys/{vendor_slug}`` remove the row.

Auth model
----------
USER JWT (``request.state.auth`` populated by the Aether middleware), NOT
agent JWT. These keys are tenant operator credentials; they are
configured by humans, not by autonomous agents. Crius's invoke endpoint
keeps the agent JWT requirement; this CRUD is a separate surface.

Cross-tenant isolation
----------------------
Database access goes through :func:`src.backend.db.tenant.tenant_scoped`
so RLS binds ``app.tenant_id`` for every statement; a user inside the
same tenant cannot read another user's secrets because the table's
unique key is ``(tenant_id, vendor_slug)`` and there is no per-user
column at S2. Sharing across users inside the same tenant is the
deliberate behaviour (one tenant operator registers a key, the rest of
the tenant's agents use it).

Plaintext discipline
--------------------
The plaintext secret is accepted on POST over HTTPS, sealed
immediately, and IMMEDIATELY dropped from the request scope. The
response NEVER echoes the plaintext back; instead it surfaces
``last_4`` so operators confirm which key they sealed.

GET responses surface ONLY the metadata shape. Decryption of the
sealed secret is restricted to the dispatcher's adapter call site
(out of scope for S2 because the AnthropicAdapter loads its key from
the env var, not from this table); the post-S2 hardening will add a
dispatcher hook that loads tenant-overridden keys at request time.

Migration 054 ``vendor_adapter_secret`` is the storage table.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Path, Request, Response, status
from pydantic import Field

from src.backend.db.pool import get_pool
from src.backend.db.tenant import tenant_scoped
from src.backend.errors import NotFoundProblem, UnauthorizedProblem, ValidationProblem
from src.backend.middleware.auth import AuthPrincipal
from src.backend.models.base import NeriumModel
from src.backend.protocol.registry import get_registry
from src.backend.protocol.secret_store import seal_secret
from src.backend.utils.uuid7 import uuid7

logger = logging.getLogger(__name__)

protocol_keys_router = APIRouter(
    prefix="/protocol/keys",
    tags=["protocol"],
)


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------


class ProtocolKeyCreateRequest(NeriumModel):
    """POST body. ``secret`` is plaintext over HTTPS; sealed immediately."""

    vendor_slug: str = Field(
        ...,
        min_length=1,
        max_length=64,
        description="Catalogue slug. Must match a row in ``vendor_adapter_catalog``.",
    )
    secret: str = Field(
        ...,
        min_length=8,
        max_length=2048,
        description="Plaintext API key. Sealed immediately; never stored.",
    )


class ProtocolKeySummary(NeriumModel):
    """Read response. NEVER includes plaintext or ciphertext bytes."""

    id: UUID = Field(..., description="UUID v7 row id.")
    vendor_slug: str
    last_4: str = Field(
        ...,
        description="Last four characters of the plaintext secret. Echo "
        "for operator UI confirmation; never sufficient to reconstruct "
        "the key.",
    )
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _require_auth(request: Request) -> AuthPrincipal:
    """Return the authenticated user principal or raise 401.

    Mirrors ``ma/sessions.py``'s pattern. Defensive: the Aether
    middleware fires before this router on every ``/v1`` path so the
    None branch is unreachable in production but guards test harnesses
    that bypass middleware.
    """

    auth = getattr(request.state, "auth", None)
    if auth is None:
        raise UnauthorizedProblem(
            detail="Authenticated user JWT required for /v1/protocol/keys."
        )
    return auth


def _last_4(secret: str) -> str:
    """Return the trailing 4 characters of ``secret`` for the echo field.

    Pads with ``*`` when the secret is shorter than 4 chars so the
    field always has a stable length. Pydantic's min_length=8 keeps
    real keys safely above this floor.
    """

    if len(secret) >= 4:
        return secret[-4:]
    return secret.rjust(4, "*")


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@protocol_keys_router.post(
    "",
    response_model=ProtocolKeySummary,
    status_code=status.HTTP_201_CREATED,
)
async def create_protocol_key(
    body: ProtocolKeyCreateRequest,
    request: Request,
) -> ProtocolKeySummary:
    """Seal + persist a vendor API key for the calling tenant.

    Replaces any existing row at the same ``(tenant_id, vendor_slug)``
    via DELETE + INSERT inside the tenant_scoped transaction so the
    UNIQUE constraint stays unambiguous. Returns 201 with metadata.
    """

    auth = _require_auth(request)

    # Validate vendor_slug against the in-process registry; we reject
    # unknown slugs early so a typo does not write a stranded row that
    # the dispatcher could never use.
    registry = get_registry()
    try:
        registry.get(body.vendor_slug)
    except NotFoundProblem as exc:
        raise ValidationProblem(
            detail=(
                f"vendor_slug={body.vendor_slug!r} is not a registered "
                f"adapter; cannot accept tenant key."
            ),
        ) from exc

    sealed = seal_secret(body.secret.encode("utf-8"))
    last_4 = _last_4(body.secret)
    new_id = uuid7()

    pool = get_pool()
    async with tenant_scoped(pool, auth.tenant_id) as conn:
        # DELETE-then-INSERT so a re-register cleanly replaces the
        # previous key without a follow-up audit row at S2.
        await conn.execute(
            """
            DELETE FROM vendor_adapter_secret
            WHERE tenant_id = $1::uuid AND vendor_slug = $2
            """,
            str(auth.tenant_id),
            body.vendor_slug,
        )
        row = await conn.fetchrow(
            """
            INSERT INTO vendor_adapter_secret (
                id, tenant_id, vendor_slug,
                secret_ciphertext, secret_nonce, secret_wrapped_dek,
                last_4
            )
            VALUES (
                $1::uuid, $2::uuid, $3, $4, $5, $6, $7
            )
            RETURNING id, vendor_slug, last_4, created_at, updated_at
            """,
            str(new_id),
            str(auth.tenant_id),
            body.vendor_slug,
            sealed.ciphertext,
            sealed.nonce,
            sealed.wrapped_dek,
            last_4,
        )

    logger.info(
        "protocol.keys.create user=%s tenant=%s vendor=%s",
        auth.user_id,
        auth.tenant_id,
        body.vendor_slug,
    )

    return _row_to_summary(row)


@protocol_keys_router.get(
    "",
    response_model=list[ProtocolKeySummary],
)
async def list_protocol_keys(request: Request) -> list[ProtocolKeySummary]:
    """List the calling tenant's vendor key configurations.

    Returns only metadata: ``id``, ``vendor_slug``, ``last_4``,
    timestamps. The sealed bytes never leave the database.
    """

    auth = _require_auth(request)

    pool = get_pool()
    async with tenant_scoped(pool, auth.tenant_id) as conn:
        rows = await conn.fetch(
            """
            SELECT id, vendor_slug, last_4, created_at, updated_at
            FROM vendor_adapter_secret
            WHERE tenant_id = $1::uuid
            ORDER BY vendor_slug ASC
            """,
            str(auth.tenant_id),
        )

    return [_row_to_summary(row) for row in rows]


@protocol_keys_router.delete(
    "/{vendor_slug}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_protocol_key(
    request: Request,
    vendor_slug: str = Path(..., min_length=1, max_length=64),
) -> Response:
    """Remove the tenant's sealed key for ``vendor_slug``.

    404 when no row exists; 204 on success. Idempotent in the
    HTTP sense: a second DELETE for the same slug surfaces 404 because
    the row is already gone.
    """

    auth = _require_auth(request)

    pool = get_pool()
    async with tenant_scoped(pool, auth.tenant_id) as conn:
        result = await conn.execute(
            """
            DELETE FROM vendor_adapter_secret
            WHERE tenant_id = $1::uuid AND vendor_slug = $2
            """,
            str(auth.tenant_id),
            vendor_slug,
        )
    # asyncpg returns "DELETE <n>"; n=0 means no row matched.
    affected = 0
    if isinstance(result, str) and result.startswith("DELETE "):
        try:
            affected = int(result.split(" ", 1)[1])
        except ValueError:
            affected = 0
    if affected == 0:
        raise NotFoundProblem(
            detail=f"No tenant key for vendor_slug={vendor_slug!r}."
        )

    logger.info(
        "protocol.keys.delete user=%s tenant=%s vendor=%s",
        auth.user_id,
        auth.tenant_id,
        vendor_slug,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------


def _row_to_summary(row: Any) -> ProtocolKeySummary:
    return ProtocolKeySummary(
        id=row["id"],
        vendor_slug=row["vendor_slug"],
        last_4=row["last_4"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


__all__ = ["protocol_keys_router"]
