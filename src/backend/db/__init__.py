"""NERIUM backend database package.

Owner: Aether (pool, tenant binding, RLS policies, Alembic framework).
Consumer agents access this package via ``src.backend.db.pool`` and
``src.backend.db.tenant``. See ``docs/contracts/postgres_multi_tenant.contract.md``
for the full surface.
"""

from src.backend.db.pool import (
    close_pool,
    create_app_pool,
    create_migration_pool,
    fetch_all,
    fetch_one,
    get_pool,
    ping,
    set_pool,
)
from src.backend.db.tenant import (
    TENANT_SETTING_KEY,
    reset_tenant,
    tenant_scoped,
)

__all__ = [
    "TENANT_SETTING_KEY",
    "close_pool",
    "create_app_pool",
    "create_migration_pool",
    "fetch_all",
    "fetch_one",
    "get_pool",
    "ping",
    "reset_tenant",
    "set_pool",
    "tenant_scoped",
]
