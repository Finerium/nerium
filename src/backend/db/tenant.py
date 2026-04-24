"""Tenant binding helpers.

Every authenticated request must scope its Postgres session to a single
tenant so Row-Level Security policies can enforce isolation. The binding is
done via ``SET LOCAL app.tenant_id = $1`` inside a transaction block so the
setting is cleared automatically when the transaction ends (no connection
bleed between pool checkouts).

Contract references
-------------------
- ``docs/contracts/postgres_multi_tenant.contract.md`` Section 4.2 tenant
  binding helper.
- ``docs/contracts/postgres_multi_tenant.contract.md`` Section 3.2 RLS policy
  reads ``current_setting('app.tenant_id', true)::uuid``.
- ``docs/contracts/rest_api_base.contract.md`` Section 4.1 TenantBinding is
  the innermost middleware, so every authenticated request runs inside a
  tenant-scoped transaction.

Usage
-----
::

    from src.backend.db import get_pool, tenant_scoped

    async with tenant_scoped(get_pool(), tenant_id) as conn:
        row = await conn.fetchrow("SELECT * FROM marketplace_listing WHERE id = $1", lid)

The helper yields the same ``asyncpg.Connection`` used for the SET LOCAL so
subsequent queries inherit the binding. Do not reuse the connection outside
the ``async with`` block.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator
from uuid import UUID

import asyncpg

TENANT_SETTING_KEY = "app.tenant_id"
"""GUC key read by RLS policies. Matches ``current_setting('app.tenant_id', true)``."""


@asynccontextmanager
async def tenant_scoped(
    pool: asyncpg.Pool,
    tenant_id: UUID | str,
) -> AsyncIterator[asyncpg.Connection]:
    """Acquire a connection and bind ``app.tenant_id`` for the block.

    Behavior
    --------
    - Opens an asyncpg connection from the pool.
    - Starts an implicit transaction via ``conn.transaction()``.
    - Issues ``SET LOCAL app.tenant_id = $1`` so RLS policies see the tenant
      for every subsequent statement inside the transaction.
    - On exit, the transaction commits (or rolls back on exception) and the
      GUC is cleared by Postgres automatically.

    Parameters
    ----------
    pool
        The asyncpg pool returned by :func:`src.backend.db.pool.get_pool`.
    tenant_id
        UUID identifying the tenant. Accepts both ``uuid.UUID`` and string
        representations; the helper normalizes to the canonical hyphenated
        form before binding.

    Raises
    ------
    ValueError
        If ``tenant_id`` is neither a UUID nor a parseable string.
    """

    normalized = _normalize_tenant_id(tenant_id)
    async with pool.acquire() as conn:
        async with conn.transaction():
            # ``SET LOCAL`` parameters cannot be templated through $N, so we
            # must inline the UUID. We validated the shape above which makes
            # SQL injection impossible (UUID has a closed character set).
            await conn.execute(f"SET LOCAL app.tenant_id = '{normalized}'")
            yield conn


async def reset_tenant(conn: asyncpg.Connection) -> None:
    """Explicitly reset ``app.tenant_id`` on a connection.

    Useful for pytest fixtures that share a connection across tests. The
    normal request path does NOT need this because ``SET LOCAL`` is scoped
    to the transaction; however if tests run without a transaction (for
    example when using ``conn.execute`` directly) they should call this at
    teardown to avoid bleed into the next test.
    """

    await conn.execute("RESET app.tenant_id")


def _normalize_tenant_id(tenant_id: UUID | str) -> str:
    if isinstance(tenant_id, UUID):
        return str(tenant_id)
    if isinstance(tenant_id, str):
        # Round-trip through uuid.UUID() to reject anything that is not a
        # syntactically valid UUID. This preserves safety of the inlined
        # SET LOCAL statement above.
        parsed = UUID(tenant_id)
        return str(parsed)
    raise ValueError(
        f"tenant_id must be uuid.UUID or str, got {type(tenant_id).__name__}"
    )


__all__ = ["TENANT_SETTING_KEY", "reset_tenant", "tenant_scoped"]
