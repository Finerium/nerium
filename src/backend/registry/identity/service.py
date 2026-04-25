"""DB service for the ``agent_identity`` row.

Owner: Tethys (W2 NP P5 Session 1).

Holds the small set of ``asyncpg`` queries the CRUD router and the
``require_agent_jwt`` dependency need. Every read + write runs inside
``tenant_scoped`` so PostgreSQL Row-Level Security enforces tenant
isolation in addition to the WHERE clause filters.

Schema
------
The ``agent_identity`` table was scaffolded by 037 and extended by 052
with three additive columns (``display_name``, ``owner_user_id``,
``public_key_pem``). 037 also installed RLS on ``tenant_id``. The
service layer never touches the deferred rotation columns
(``retiring_public_key``, ``retiring_fingerprint``,
``artifact_manifest``); those land in S2 (cut for this session).

Status enum
-----------
037's CHECK constraint accepts ``'active' | 'retiring' | 'revoked'``.
S1 only emits ``'active'`` (on register) and ``'revoked'`` (on
DELETE). The verify path tolerates both ``'active'`` and ``'retiring'``
to honour the 14-day grace window the contract pre-allocates, and
rejects ``'revoked'`` outright.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from src.backend.db.pool import get_pool
from src.backend.db.tenant import tenant_scoped
from src.backend.registry.identity.crypto import public_pem_to_raw_bytes
from src.backend.utils.uuid7 import uuid7

__all__ = [
    "AgentIdentityRow",
    "create_identity",
    "delete_identity",
    "get_identity_by_id",
    "list_identities_for_owner",
    "load_public_pem_for_verify",
]


@dataclass(frozen=True)
class AgentIdentityRow:
    """Trim projection of the ``agent_identity`` row.

    Mirrors the columns the router reads. Excludes ``metadata`` +
    ``public_key bytea`` because neither lands on the API surface this
    session (the bytea is an internal alternate representation; the PEM
    is the canonical wire form).
    """

    id: UUID
    tenant_id: UUID
    owner_user_id: UUID | None
    agent_slug: str
    display_name: str
    public_key_pem: str
    status: str
    created_at: datetime
    retires_at: datetime | None
    revoked_at: datetime | None


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------


async def get_identity_by_id(
    *,
    tenant_id: UUID,
    agent_id: UUID,
    owner_user_id: UUID | None = None,
) -> AgentIdentityRow | None:
    """Return the identity row or ``None`` if invisible to the caller.

    The ``owner_user_id`` filter, when supplied, returns ``None`` for
    rows owned by a different user inside the same tenant. The router
    uses this to surface 404 (not 403) so the existence of a sibling
    user's identity is not leaked.
    """

    pool = get_pool()
    async with tenant_scoped(pool, tenant_id) as conn:
        if owner_user_id is None:
            row = await conn.fetchrow(
                """
                SELECT id, tenant_id, owner_user_id, agent_slug,
                       display_name, public_key_pem, status,
                       created_at, retires_at, revoked_at
                FROM agent_identity
                WHERE id = $1
                """,
                agent_id,
            )
        else:
            row = await conn.fetchrow(
                """
                SELECT id, tenant_id, owner_user_id, agent_slug,
                       display_name, public_key_pem, status,
                       created_at, retires_at, revoked_at
                FROM agent_identity
                WHERE id = $1 AND owner_user_id = $2
                """,
                agent_id,
                owner_user_id,
            )
    if row is None:
        return None
    return _row_to_dataclass(row)


async def list_identities_for_owner(
    *,
    tenant_id: UUID,
    owner_user_id: UUID,
) -> Sequence[AgentIdentityRow]:
    """Return every identity owned by ``owner_user_id`` in the tenant."""

    pool = get_pool()
    async with tenant_scoped(pool, tenant_id) as conn:
        rows = await conn.fetch(
            """
            SELECT id, tenant_id, owner_user_id, agent_slug,
                   display_name, public_key_pem, status,
                   created_at, retires_at, revoked_at
            FROM agent_identity
            WHERE owner_user_id = $1
            ORDER BY created_at DESC
            """,
            owner_user_id,
        )
    return tuple(_row_to_dataclass(row) for row in rows)


async def load_public_pem_for_verify(
    *,
    tenant_id: UUID,
    agent_id: UUID,
) -> tuple[str, str, UUID | None] | None:
    """Return ``(public_pem, status, owner_user_id)`` for the JWT verifier.

    ``status`` lets the middleware reject revoked identities while still
    accepting both ``active`` and ``retiring`` rows during the rotation
    grace window. ``owner_user_id`` flows into the resolved
    :class:`AgentPrincipal` so consumers can author owner-vs-agent
    rules without re-reading the row.

    Returns ``None`` when the row does not exist or is invisible under
    RLS.
    """

    pool = get_pool()
    async with tenant_scoped(pool, tenant_id) as conn:
        row = await conn.fetchrow(
            """
            SELECT public_key_pem, status, owner_user_id
            FROM agent_identity
            WHERE id = $1
            """,
            agent_id,
        )
    if row is None or row["public_key_pem"] is None:
        return None
    return (
        str(row["public_key_pem"]),
        str(row["status"]),
        row["owner_user_id"],
    )


# ---------------------------------------------------------------------------
# Writes
# ---------------------------------------------------------------------------


async def create_identity(
    *,
    tenant_id: UUID,
    owner_user_id: UUID,
    display_name: str,
    public_pem: str,
) -> AgentIdentityRow:
    """Insert a new identity + return the row projection.

    The router generates the keypair via
    :func:`generate_ed25519_keypair` and passes the public PEM here.
    The raw 32-byte form is derived locally so 037's bytea column +
    the new ``public_key_pem`` text column stay in sync.
    """

    new_id = uuid7()
    raw_public_key = public_pem_to_raw_bytes(public_pem)
    # The agent_slug column predates Tethys' schema; we satisfy its
    # NOT NULL + per-tenant UNIQUE invariant by deriving a slug from
    # the new UUID. Display name handles the human-readable surface.
    derived_slug = f"agent_{new_id.hex[:12]}"

    pool = get_pool()
    async with tenant_scoped(pool, tenant_id) as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO agent_identity (
                id, tenant_id, owner_user_id, agent_slug,
                display_name, public_key, public_key_pem,
                status, metadata
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', '{}'::jsonb)
            RETURNING id, tenant_id, owner_user_id, agent_slug,
                      display_name, public_key_pem, status,
                      created_at, retires_at, revoked_at
            """,
            new_id,
            tenant_id,
            owner_user_id,
            derived_slug,
            display_name,
            raw_public_key,
            public_pem,
        )
    assert row is not None
    return _row_to_dataclass(row)


async def delete_identity(
    *,
    tenant_id: UUID,
    owner_user_id: UUID,
    agent_id: UUID,
) -> bool:
    """Mark an identity revoked. Returns ``True`` on success.

    Uses the existing ``status`` text column + ``revoked_at`` timestamp
    column from 037 so no schema change is required. The caller filters
    the returned bool to send 204 vs 404.
    """

    now = datetime.now(UTC)
    pool = get_pool()
    async with tenant_scoped(pool, tenant_id) as conn:
        result = await conn.execute(
            """
            UPDATE agent_identity
            SET status = 'revoked', revoked_at = $3
            WHERE id = $1 AND owner_user_id = $2 AND status <> 'revoked'
            """,
            agent_id,
            owner_user_id,
            now,
        )
    # asyncpg returns the command tag; "UPDATE 1" indicates success.
    return result.endswith(" 1")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _row_to_dataclass(row: Any) -> AgentIdentityRow:
    return AgentIdentityRow(
        id=row["id"],
        tenant_id=row["tenant_id"],
        owner_user_id=row["owner_user_id"],
        agent_slug=row["agent_slug"],
        display_name=row["display_name"],
        public_key_pem=row["public_key_pem"] or "",
        status=row["status"],
        created_at=row["created_at"],
        retires_at=row["retires_at"],
        revoked_at=row["revoked_at"],
    )
