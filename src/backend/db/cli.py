"""Thin command-line entry point for NERIUM database administration.

Invoked via ``python -m src.backend.db.cli <subcommand>``. Wraps the
alembic async runner + demo seed function into a single friendly CLI
so operators + CI scripts do not hand-roll alembic calls.

Subcommands
-----------
- ``upgrade`` : ``alembic upgrade head`` (accepts ``--target`` revision).
- ``downgrade`` : ``alembic downgrade --to <rev>``.
- ``current`` : print the current revision (useful for smoke tests).
- ``heads``   : list all Alembic heads; useful during Wave 1 where the
                three migration chains (Aether 030+, Chione 010, Pheme
                020) produce more than one head until V4 merges them.
- ``seed``    : apply :func:`src.backend.db.seed.seed_demo_data`.

Design notes
------------
- Alembic's Python API is used directly rather than shelling out to the
  ``alembic`` binary so the CLI inherits the settings resolution path
  we already wired in ``src/backend/db/migrations/env.py``.
- ``seed`` opens a short-lived migration pool (BYPASSRLS) because the
  seed spans multiple tenants in a single transaction.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from pathlib import Path
from typing import Sequence

import asyncpg
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory

logger = logging.getLogger("nerium.db.cli")

REPO_ROOT = Path(__file__).resolve().parents[3]
ALEMBIC_INI = REPO_ROOT / "src" / "backend" / "db" / "migrations" / "alembic.ini"


def _load_alembic_config() -> Config:
    """Load the alembic.ini sitting next to the migration versions tree."""

    if not ALEMBIC_INI.exists():
        raise FileNotFoundError(
            f"alembic.ini not found at {ALEMBIC_INI}; run from repo root."
        )
    cfg = Config(str(ALEMBIC_INI))
    cfg.set_main_option(
        "script_location",
        str(ALEMBIC_INI.parent),
    )
    return cfg


def _cmd_upgrade(args: argparse.Namespace) -> int:
    cfg = _load_alembic_config()
    target = args.target or "head"
    logger.info("db.cli.upgrade target=%s", target)
    command.upgrade(cfg, target)
    return 0


def _cmd_downgrade(args: argparse.Namespace) -> int:
    cfg = _load_alembic_config()
    logger.info("db.cli.downgrade to=%s", args.to)
    command.downgrade(cfg, args.to)
    return 0


def _cmd_current(_: argparse.Namespace) -> int:
    cfg = _load_alembic_config()
    command.current(cfg, verbose=True)
    return 0


def _cmd_heads(_: argparse.Namespace) -> int:
    cfg = _load_alembic_config()
    script = ScriptDirectory.from_config(cfg)
    heads = list(script.get_heads())
    if not heads:
        print("(no heads; empty migrations tree)")
        return 0
    for rev in heads:
        entry = script.get_revision(rev)
        print(f"{entry.revision}\t{entry.doc or ''}")
    return 0


def _cmd_seed(_: argparse.Namespace) -> int:
    from src.backend.config import get_settings
    from src.backend.db.pool import create_migration_pool
    from src.backend.db.seed import seed_demo_data

    async def _run() -> int:
        settings = get_settings()
        pool: asyncpg.Pool = await create_migration_pool(settings)
        try:
            report = await seed_demo_data(pool)
            logger.info("db.cli.seed.applied inserts=%s", report)
            for table, count in report.items():
                print(f"{table}: {count} inserted")
        finally:
            await pool.close()
        return 0

    return asyncio.run(_run())


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m src.backend.db.cli",
        description="NERIUM database administration CLI.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    p_upgrade = subparsers.add_parser("upgrade", help="Run alembic upgrade.")
    p_upgrade.add_argument(
        "--target",
        default=None,
        help="Target revision; default 'head'.",
    )
    p_upgrade.set_defaults(fn=_cmd_upgrade)

    p_downgrade = subparsers.add_parser("downgrade", help="Run alembic downgrade.")
    p_downgrade.add_argument(
        "--to",
        required=True,
        help="Target revision (e.g., -1, base, or explicit revision id).",
    )
    p_downgrade.set_defaults(fn=_cmd_downgrade)

    p_current = subparsers.add_parser(
        "current",
        help="Print current revision.",
    )
    p_current.set_defaults(fn=_cmd_current)

    p_heads = subparsers.add_parser(
        "heads",
        help="List all Alembic heads (pending V4 merge in Wave 1).",
    )
    p_heads.set_defaults(fn=_cmd_heads)

    p_seed = subparsers.add_parser(
        "seed",
        help="Apply idempotent demo seed.",
    )
    p_seed.set_defaults(fn=_cmd_seed)

    return parser


def main(argv: Sequence[str] | None = None) -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(name)s %(levelname)s %(message)s",
    )
    parser = _build_parser()
    args = parser.parse_args(argv)
    return int(args.fn(args) or 0)


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
