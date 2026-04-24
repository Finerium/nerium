"""Alembic async environment for NERIUM.

Runs migrations as the ``nerium_migration`` role (BYPASSRLS granted) so
``CREATE POLICY`` statements and schema-level DDL can be applied without
tenant binding. The app role (``nerium_api``) never runs migrations.

Target metadata is set to ``None`` because NERIUM uses asyncpg raw SQL
rather than SQLAlchemy ORM. Autogenerate is therefore disabled; every
revision is authored by hand. This is intentional per M1 Section A.5 and
``postgres_multi_tenant.contract.md``.

Invocation
----------
Synchronous Alembic driver wrapped around an async SQLAlchemy engine so
that the same DSN used by asyncpg works without a separate sync driver.
See https://alembic.sqlalchemy.org/en/latest/cookbook.html#using-asyncio-with-alembic.
"""

from __future__ import annotations

import asyncio
import logging
from logging.config import fileConfig
from typing import Any

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from src.backend.config import get_settings

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

logger = logging.getLogger("alembic.env")

# Autogenerate disabled: NERIUM does not use SQLAlchemy ORM models. Every
# revision is hand-authored and declares explicit ``op.execute`` statements.
target_metadata = None


def _settings_to_url() -> str:
    """Resolve the migration DSN.

    Priority:

    1. ``-x sqlalchemy.url=<dsn>`` on the command line.
    2. ``NERIUM_DATABASE_MIGRATION_URL`` env var (via pydantic-settings).
    3. ``alembic.ini`` ``sqlalchemy.url`` (intentionally a placeholder).

    Postgres URLs are normalized to the ``postgresql+asyncpg://`` driver
    for SQLAlchemy async.
    """

    x = context.get_x_argument(as_dictionary=True)
    override = x.get("sqlalchemy.url")
    if override:
        return _as_async_dsn(override)

    settings = get_settings()
    return _as_async_dsn(settings.database_migration_url)


def _as_async_dsn(dsn: str) -> str:
    if dsn.startswith("postgresql://"):
        return "postgresql+asyncpg://" + dsn[len("postgresql://"):]
    if dsn.startswith("postgres://"):
        return "postgresql+asyncpg://" + dsn[len("postgres://"):]
    return dsn


def run_migrations_offline() -> None:
    """Offline mode: emit SQL to stdout without a live DB connection."""

    url = _settings_to_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def _do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online_async() -> None:
    """Online mode: run migrations via an async SQLAlchemy engine."""

    url = _settings_to_url()
    configuration: dict[str, Any] = config.get_section(config.config_ini_section, {})
    configuration["sqlalchemy.url"] = url

    engine = async_engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        future=True,
    )
    async with engine.connect() as connection:
        await connection.run_sync(_do_run_migrations)
    await engine.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_migrations_online_async())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
