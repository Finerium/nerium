"""Row-Level Security policy SQL helpers.

Downstream agents (Phanes, Iapetus, Astraea, Plutus, ...) author migrations
that declare new tenant-scoped tables. Every such migration MUST apply the
canonical RLS policy so multi-tenant isolation is defense-in-depth (app
filter plus RLS policy). This module centralizes the SQL so consumers do
not hand-roll divergent policy names or bodies.

Contract references
-------------------
- ``docs/contracts/postgres_multi_tenant.contract.md`` Section 3.2 policy
  body (``USING + WITH CHECK`` on ``tenant_id = current_setting(...)::uuid``).
- ``docs/contracts/postgres_multi_tenant.contract.md`` Section 4.3 role
  hierarchy (``nerium_api``, ``nerium_migration``, ``nerium_admin``).

Usage
-----
Inside an Alembic migration::

    from alembic import op
    from src.backend.db.rls import enable_tenant_rls

    def upgrade() -> None:
        op.execute(\"\"\"
            CREATE TABLE marketplace_listing (
                id uuid PRIMARY KEY,
                tenant_id uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
                -- other columns ...
                created_at timestamptz NOT NULL DEFAULT now(),
                updated_at timestamptz NOT NULL DEFAULT now()
            )
        \"\"\")
        for sql in enable_tenant_rls('marketplace_listing'):
            op.execute(sql)

The helper returns a list of statements so callers can log them or apply
them one by one. Order matters: ENABLE then FORCE then CREATE POLICY.
"""

from __future__ import annotations

from typing import Iterable

POLICY_NAME = "tenant_isolation"
"""Canonical policy name. DO NOT vary across tables."""

DEFAULT_ROLE_APP = "nerium_api"
DEFAULT_ROLE_MIGRATION = "nerium_migration"
DEFAULT_ROLE_ADMIN = "nerium_admin"


def enable_tenant_rls(
    table_name: str,
    *,
    tenant_column: str = "tenant_id",
    policy_name: str = POLICY_NAME,
) -> list[str]:
    """Return SQL statements to enable the canonical tenant RLS policy.

    Parameters
    ----------
    table_name
        The target table. Expected to already exist with a ``tenant_id``
        column referencing ``tenant(id)``.
    tenant_column
        Column name, default ``tenant_id`` per the contract. Exposed for
        rare exceptions (none in the NP schema as shipped).
    policy_name
        Policy identifier, default :data:`POLICY_NAME`. Do not change.

    Returns
    -------
    list[str]
        One statement per logical step: ENABLE, FORCE, CREATE POLICY.
    """

    return [
        f"ALTER TABLE {table_name} ENABLE ROW LEVEL SECURITY",
        f"ALTER TABLE {table_name} FORCE ROW LEVEL SECURITY",
        (
            f"CREATE POLICY {policy_name} ON {table_name} "
            f"USING ({tenant_column} = current_setting('app.tenant_id', true)::uuid) "
            f"WITH CHECK ({tenant_column} = current_setting('app.tenant_id', true)::uuid)"
        ),
    ]


def disable_tenant_rls(
    table_name: str,
    *,
    policy_name: str = POLICY_NAME,
) -> list[str]:
    """Return SQL statements to remove the canonical tenant RLS policy.

    Used by ``downgrade()`` paths and by tests that tear down isolation.
    Order is the reverse of :func:`enable_tenant_rls`.
    """

    return [
        f"DROP POLICY IF EXISTS {policy_name} ON {table_name}",
        f"ALTER TABLE {table_name} NO FORCE ROW LEVEL SECURITY",
        f"ALTER TABLE {table_name} DISABLE ROW LEVEL SECURITY",
    ]


def grant_app_role_crud(
    table_name: str,
    *,
    app_role: str = DEFAULT_ROLE_APP,
) -> list[str]:
    """Return SQL granting SELECT/INSERT/UPDATE/DELETE to the app role.

    Postgres RLS is enforced regardless of grants, but the app role still
    needs explicit table privileges (it does not own the schema). This
    helper standardizes the grant list for consumer migrations.
    """

    return [
        f"GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE {table_name} TO {app_role}",
    ]


def bootstrap_roles_sql() -> list[str]:
    """Return SQL to create the three NERIUM roles.

    Safe to re-run (``DO $$ BEGIN ... EXCEPTION ... END $$`` guards against
    duplicate role errors). Called from migration ``000_baseline`` so that
    downstream schema migrations can GRANT without a separate setup step.
    """

    return [
        _role_ddl(DEFAULT_ROLE_APP, bypass_rls=False),
        _role_ddl(DEFAULT_ROLE_MIGRATION, bypass_rls=True),
        _role_ddl(DEFAULT_ROLE_ADMIN, bypass_rls=False),
    ]


def _role_ddl(role: str, *, bypass_rls: bool) -> str:
    bypass = "BYPASSRLS" if bypass_rls else "NOBYPASSRLS"
    return (
        "DO $$ BEGIN "
        f"CREATE ROLE {role} NOLOGIN {bypass}; "
        "EXCEPTION WHEN duplicate_object THEN "
        f"ALTER ROLE {role} {bypass}; "
        "END $$"
    )


def join_sql(statements: Iterable[str]) -> str:
    """Join statements into a single semicolon-separated block.

    Convenience for Alembic revisions that want to call ``op.execute`` once
    rather than looping. Note: asyncpg does not accept multi-statement text
    via ``execute``; Alembic's ``op.execute`` does via SQLAlchemy.
    """

    return ";\n".join(statement.rstrip(";") for statement in statements) + ";"


__all__ = [
    "DEFAULT_ROLE_ADMIN",
    "DEFAULT_ROLE_APP",
    "DEFAULT_ROLE_MIGRATION",
    "POLICY_NAME",
    "bootstrap_roles_sql",
    "disable_tenant_rls",
    "enable_tenant_rls",
    "grant_app_role_crud",
    "join_sql",
]
