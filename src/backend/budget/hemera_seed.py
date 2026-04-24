"""Idempotent Moros-owned Hemera flag seed.

Owner: Moros (W2 NP P3 S1).

Moros depends on three Hemera flags:

- ``ma.daily_budget_usd``      : platform daily spend cap in USD
- ``ma.monthly_budget_usd``    : platform month-to-date cap in USD
- ``ma.budget_cap_threshold``  : warn threshold fraction (0.0 to 1.0)

``default_flags.sql`` already seeds these at migration time, but a
fresh dev DB or a previously-migrated environment that predates the
Moros flags needs a belt-and-braces runtime check. This helper runs
during the FastAPI lifespan (see :mod:`src.backend.main`) + is
idempotent: existing rows are never overwritten. The function is safe
to call repeatedly.

The helper uses ``INSERT ... ON CONFLICT DO NOTHING`` so the existing
row's ``default_value`` is preserved when an admin has tuned it via
``POST /v1/admin/flags/{name}`` (Hemera admin router).
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class FlagSeed:
    """Declarative flag row for :func:`ensure_moros_flags`."""

    flag_name: str
    default_value: Any
    kind: str
    description: str
    tags: tuple[str, ...] = ("budget",)
    owner_agent: str = "moros"


MOROS_FLAG_SEEDS: tuple[FlagSeed, ...] = (
    FlagSeed(
        flag_name="ma.daily_budget_usd",
        default_value=100,
        kind="number",
        description=(
            "Per-tenant daily Managed Agents spend cap in USD. Moros hard-cap "
            "threshold; crossing flips chronos:ma_capped + auto-disables builder.live."
        ),
    ),
    FlagSeed(
        flag_name="ma.monthly_budget_usd",
        default_value=500,
        kind="number",
        description=(
            "Platform month-to-date Managed Agents spend cap in USD (authoritative "
            "source: Anthropic Admin cost_report)."
        ),
    ),
    FlagSeed(
        flag_name="ma.budget_cap_threshold",
        default_value=0.90,
        kind="number",
        description=(
            "Warn threshold (fraction 0.0 to 1.0) at which Moros emits a non-blocking "
            "budget alert before the hard cap trips."
        ),
    ),
)


async def ensure_moros_flags(pool: Any | None = None) -> dict[str, str]:
    """Create any missing Moros flags with their default values.

    Returns a mapping of ``flag_name -> ("created" | "exists" | "skipped")``
    so the lifespan can log the state transition without raising when the
    hemera_flag table is not yet migrated.

    Parameters
    ----------
    pool
        Optional asyncpg pool override. Tests pass a :class:`FakePool`
        stand-in; production resolves via :func:`get_pool` lazily so the
        import path stays free of the DB pool module until call time.
    """

    try:
        from src.backend.db.pool import get_pool
    except Exception as exc:  # pragma: no cover - defensive import guard
        logger.warning("chronos.flag_seed.pool_import_failed err=%s", exc)
        return {seed.flag_name: "skipped" for seed in MOROS_FLAG_SEEDS}

    resolved_pool = pool if pool is not None else get_pool()
    report: dict[str, str] = {}

    try:
        async with resolved_pool.acquire() as conn:
            for seed in MOROS_FLAG_SEEDS:
                status_tag = await conn.execute(
                    """
                    INSERT INTO hemera_flag (
                        flag_name, default_value, kind, description,
                        owner_agent, tags, created_by
                    )
                    VALUES ($1, $2::jsonb, $3, $4, $5, $6, NULL)
                    ON CONFLICT (flag_name) DO NOTHING
                    """,
                    seed.flag_name,
                    json.dumps(seed.default_value),
                    seed.kind,
                    seed.description,
                    seed.owner_agent,
                    list(seed.tags),
                )
                # asyncpg returns "INSERT 0 1" on new row, "INSERT 0 0" on
                # conflict. We cannot simply read .endswith(" 1") because the
                # ON CONFLICT path still returns "INSERT 0 0". Use substring.
                if isinstance(status_tag, str) and status_tag.strip().endswith(" 1"):
                    report[seed.flag_name] = "created"
                else:
                    report[seed.flag_name] = "exists"
    except Exception as exc:
        # The lifespan wrapper swallows this so app boot proceeds even when
        # the hemera_flag table is missing (fresh dev DB). Log at warn so
        # the operator knows to run alembic + default_flags.sql.
        logger.warning("chronos.flag_seed.failed err=%s", exc)
        return {seed.flag_name: "skipped" for seed in MOROS_FLAG_SEEDS}

    logger.info("chronos.flag_seed.applied report=%s", report)

    # Refresh bootstrap cache so the poller sees the freshly-seeded values
    # without waiting for the next full bootstrap.
    try:
        from src.backend.flags.service import refresh_bootstrap_flag

        for seed in MOROS_FLAG_SEEDS:
            await refresh_bootstrap_flag(seed.flag_name)
    except Exception as exc:  # pragma: no cover - defensive
        logger.debug("chronos.flag_seed.refresh_skipped err=%s", exc)

    return report


__all__ = ["FlagSeed", "MOROS_FLAG_SEEDS", "ensure_moros_flags"]
