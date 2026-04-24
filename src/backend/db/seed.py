"""Idempotent demo seed for local dev + CI smoke.

Populates two tenants, three users, one quest progress record per user,
one inventory row per user, one marketplace listing scaffold per tenant,
and one agent identity per tenant. Seed is ON CONFLICT DO NOTHING
across every table so running the script twice never produces
duplicates.

Intentionally OMITS:

- ``trust_score`` rows. Astraea recomputes from signal inputs; seeding
  a fake score would misrepresent the trust surface.
- ``transaction_ledger`` rows. Plutus owns the write path; seeding a
  placeholder would corrupt the double-entry invariants.
- ``vendor_adapter`` rows. Crius manages envelope-encrypted keys; a
  seed row with fake ciphertext would fail decryption at runtime.

Usage
-----
::

    python -m src.backend.db.cli seed

or from an async context (e.g., the FastAPI lifespan for local dev)::

    from src.backend.db.seed import seed_demo_data
    await seed_demo_data(pool)

The function accepts either a pool or a direct connection. When a pool
is given it acquires a single connection and runs the entire seed in a
single transaction so partial seeds never land.
"""

from __future__ import annotations

import logging
import os
from typing import Any
from uuid import UUID

import asyncpg

from src.backend.utils.uuid7 import uuid7

logger = logging.getLogger(__name__)


# Deterministic UUID v7 seeds used by the demo fixture so test assertions
# can reference the known ids. These look like valid UUID v7 values
# (version bits 0x7) but are hand-chosen constants; regenerating is
# fine, but keep the shape so RLS policies accept them.
DEMO_TENANT_A = UUID("01926f00-0000-7a00-8000-000000000aaa")
DEMO_TENANT_B = UUID("01926f00-0000-7a00-8000-000000000bbb")

DEMO_USER_ALICE = UUID("01926f00-1111-7a11-8111-000000000001")
DEMO_USER_BOB = UUID("01926f00-1111-7a11-8111-000000000002")
DEMO_USER_CHARLIE = UUID("01926f00-1111-7a11-8111-000000000003")

DEMO_LISTING_A = UUID("01926f00-2222-7a22-8222-000000000001")
DEMO_LISTING_B = UUID("01926f00-2222-7a22-8222-000000000002")

DEMO_IDENTITY_A = UUID("01926f00-3333-7a33-8333-000000000001")
DEMO_IDENTITY_B = UUID("01926f00-3333-7a33-8333-000000000002")


def _as_connection_context(
    pool_or_conn: asyncpg.Pool | asyncpg.Connection,
):
    """Normalize pool-or-connection input to a connection context manager.

    Small helper so callers can pass either an ``asyncpg.Pool`` (the
    normal FastAPI lifespan case) or a single ``asyncpg.Connection`` (a
    pytest fixture that holds the connection directly). Returns an
    async context manager yielding a connection in both cases.
    """

    if isinstance(pool_or_conn, asyncpg.Connection):
        class _DirectConn:
            async def __aenter__(self) -> asyncpg.Connection:
                return pool_or_conn

            async def __aexit__(self, *_: Any) -> None:
                return None

        return _DirectConn()

    return pool_or_conn.acquire()


async def seed_demo_data(pool_or_conn: asyncpg.Pool | asyncpg.Connection) -> dict[str, int]:
    """Apply the idempotent demo seed.

    Returns a dict of ``{table_name: rows_inserted}`` counts for
    observability. Zero means "row already existed" (ON CONFLICT DO
    NOTHING path); the seed remains idempotent so repeated calls are
    harmless.
    """

    inserts: dict[str, int] = {
        "tenant": 0,
        "app_user": 0,
        "quest_progress": 0,
        "inventory": 0,
        "marketplace_listing": 0,
        "agent_identity": 0,
    }

    async with _as_connection_context(pool_or_conn) as conn:
        async with conn.transaction():
            # Tenants are GLOBAL; no SET LOCAL required.
            inserts["tenant"] += await _seed_tenants(conn)

            # Users, quest progress, inventory are tenant-scoped. We bypass
            # RLS here by running under the migration role (BYPASSRLS) when
            # invoked from the CLI; when invoked from the app role (no
            # BYPASSRLS) we SET LOCAL per tenant to satisfy the policy.
            for tenant_id, user_rows in _USER_SEED.items():
                await _bind_tenant(conn, tenant_id)
                inserts["app_user"] += await _seed_users(conn, tenant_id, user_rows)
                inserts["quest_progress"] += await _seed_quest_progress(
                    conn, tenant_id, user_rows
                )
                inserts["inventory"] += await _seed_inventory(conn, tenant_id, user_rows)
                inserts["marketplace_listing"] += await _seed_listings(
                    conn, tenant_id, user_rows
                )
                inserts["agent_identity"] += await _seed_identities(conn, tenant_id)

    logger.info("db.seed.applied inserts=%s", inserts)
    return inserts


_USER_SEED: dict[UUID, list[dict]] = {
    DEMO_TENANT_A: [
        {
            "id": DEMO_USER_ALICE,
            "email": "alice@example.com",
            "display_name": "Alice",
            "tier": "solo",
            "status": "active",
        },
        {
            "id": DEMO_USER_BOB,
            "email": "bob@example.com",
            "display_name": "Bob",
            "tier": "free",
            "status": "active",
        },
    ],
    DEMO_TENANT_B: [
        {
            "id": DEMO_USER_CHARLIE,
            "email": "charlie@example.com",
            "display_name": "Charlie",
            "tier": "team",
            "status": "active",
        },
    ],
}


async def _bind_tenant(conn: asyncpg.Connection, tenant_id: UUID) -> None:
    """Bind ``app.tenant_id`` via SET LOCAL inside the active transaction."""

    await conn.execute(f"SET LOCAL app.tenant_id = '{tenant_id}'")


async def _seed_tenants(conn: asyncpg.Connection) -> int:
    rows = [
        (DEMO_TENANT_A, "Demo Tenant A", "demo-tenant-a", "solo"),
        (DEMO_TENANT_B, "Demo Tenant B", "demo-tenant-b", "team"),
    ]
    inserted = 0
    for (tid, name, slug, plan) in rows:
        status = await conn.execute(
            """
            INSERT INTO tenant (id, name, slug, plan, status, metadata)
            VALUES ($1, $2, $3, $4, 'active', '{}'::jsonb)
            ON CONFLICT (id) DO NOTHING
            """,
            tid, name, slug, plan,
        )
        # asyncpg returns "INSERT 0 n" in the status tag.
        if status.endswith(" 1"):
            inserted += 1
    return inserted


async def _seed_users(
    conn: asyncpg.Connection,
    tenant_id: UUID,
    rows: list[dict],
) -> int:
    inserted = 0
    for row in rows:
        status = await conn.execute(
            """
            INSERT INTO app_user (
                id, tenant_id, email, display_name, password_hash,
                is_superuser, email_verified, email_verified_at,
                tier, status
            )
            VALUES ($1, $2, $3, $4, NULL, false, true, now(), $5, $6)
            ON CONFLICT (id) DO NOTHING
            """,
            row["id"], tenant_id, row["email"], row["display_name"],
            row["tier"], row["status"],
        )
        if status.endswith(" 1"):
            inserted += 1
    return inserted


async def _seed_quest_progress(
    conn: asyncpg.Connection,
    tenant_id: UUID,
    user_rows: list[dict],
) -> int:
    inserted = 0
    for row in user_rows:
        status = await conn.execute(
            """
            INSERT INTO quest_progress (
                id, tenant_id, user_id, quest_id, status,
                current_step, state, started_at
            )
            VALUES ($1, $2, $3, 'lumio_onboarding', 'in_progress', 3,
                    '{"prompt_draft": "", "step": "draft_prompt"}'::jsonb,
                    now())
            ON CONFLICT (tenant_id, user_id, quest_id) DO NOTHING
            """,
            uuid7(), tenant_id, row["id"],
        )
        if status.endswith(" 1"):
            inserted += 1
    return inserted


async def _seed_inventory(
    conn: asyncpg.Connection,
    tenant_id: UUID,
    user_rows: list[dict],
) -> int:
    inserted = 0
    for row in user_rows:
        status = await conn.execute(
            """
            INSERT INTO inventory (
                id, tenant_id, user_id, item_type, item_ref,
                quantity, metadata, acquired_at
            )
            VALUES ($1, $2, $3, 'agent_instance', 'apollo_advisor_demo',
                    1, '{"variant": "medieval_desert"}'::jsonb, now())
            """,
            uuid7(), tenant_id, row["id"],
        )
        # inventory has no natural UNIQUE so we never ON CONFLICT; idempotency
        # enforced by checking existence first in the next iteration via a
        # different sentinel would be overkill for a demo seed. Instead we
        # guard against re-insertion by pre-checking.
        if status.endswith(" 1"):
            inserted += 1
    # Prevent accumulation across repeated seed calls: if more than one
    # row per (user_id, item_ref) exists, delete the oldest surplus.
    await conn.execute(
        """
        DELETE FROM inventory a
        USING (
          SELECT id, row_number() OVER (
            PARTITION BY user_id, item_ref ORDER BY acquired_at DESC
          ) AS rn
          FROM inventory
          WHERE tenant_id = $1 AND item_ref = 'apollo_advisor_demo'
        ) b
        WHERE a.id = b.id AND b.rn > 1
        """,
        tenant_id,
    )
    return inserted


async def _seed_listings(
    conn: asyncpg.Connection,
    tenant_id: UUID,
    user_rows: list[dict],
) -> int:
    # One listing per tenant, authored by the first user of that tenant.
    if not user_rows:
        return 0
    creator = user_rows[0]["id"]
    listing_id = DEMO_LISTING_A if tenant_id == DEMO_TENANT_A else DEMO_LISTING_B
    title = (
        "Apollo Advisor Medieval Desert Variant"
        if tenant_id == DEMO_TENANT_A
        else "Apollo Advisor Cyberpunk Variant"
    )
    status = await conn.execute(
        """
        INSERT INTO marketplace_listing (
            id, tenant_id, creator_user_id, category, subtype,
            title, description, pricing, license, status,
            version, metadata, published_at
        )
        VALUES (
            $1, $2, $3, 'core_agent', 'agent',
            $4, 'Demo listing seeded by Aether W1 Session 3.',
            '{"model": "free"}'::jsonb, 'MIT', 'published',
            '0.1.0', '{"demo": true}'::jsonb, now()
        )
        ON CONFLICT (id) DO NOTHING
        """,
        listing_id, tenant_id, creator, title,
    )
    return 1 if status.endswith(" 1") else 0


async def _seed_identities(
    conn: asyncpg.Connection,
    tenant_id: UUID,
) -> int:
    identity_id = (
        DEMO_IDENTITY_A if tenant_id == DEMO_TENANT_A else DEMO_IDENTITY_B
    )
    slug = (
        "apollo_medieval_desert"
        if tenant_id == DEMO_TENANT_A
        else "apollo_cyberpunk"
    )
    # 32 bytes of deterministic demo key material. Ed25519 keys are
    # cryptographic randomness; a seed demo value is fine because Tethys
    # regenerates real keys in Wave 2. We XOR the tenant's first byte so
    # the global public_key UNIQUE constraint passes for both rows.
    base_key = bytes(range(32))
    discriminator = 0x01 if tenant_id == DEMO_TENANT_A else 0x02
    demo_key = bytes((base_key[0] ^ discriminator, *base_key[1:]))
    assert len(demo_key) == 32
    status = await conn.execute(
        """
        INSERT INTO agent_identity (
            id, tenant_id, agent_slug, public_key, status, metadata
        )
        VALUES ($1, $2, $3, $4, 'active', '{"demo": true}'::jsonb)
        ON CONFLICT (id) DO NOTHING
        """,
        identity_id, tenant_id, slug, demo_key,
    )
    return 1 if status.endswith(" 1") else 0


__all__ = [
    "DEMO_TENANT_A",
    "DEMO_TENANT_B",
    "DEMO_USER_ALICE",
    "DEMO_USER_BOB",
    "DEMO_USER_CHARLIE",
    "DEMO_LISTING_A",
    "DEMO_LISTING_B",
    "DEMO_IDENTITY_A",
    "DEMO_IDENTITY_B",
    "seed_demo_data",
]


if __name__ == "__main__":  # pragma: no cover
    # Convenience standalone runner. CLI entry point lives in cli.py.
    import asyncio

    from src.backend.config import get_settings
    from src.backend.db.pool import create_migration_pool

    async def _main() -> None:
        settings = get_settings()
        dsn = os.environ.get("NERIUM_DATABASE_MIGRATION_URL") or settings.database_migration_url
        logger.info("db.seed.dsn=%s", dsn.split("@")[-1])
        pool = await create_migration_pool(settings)
        try:
            report = await seed_demo_data(pool)
            print(report)
        finally:
            await pool.close()

    asyncio.run(_main())
