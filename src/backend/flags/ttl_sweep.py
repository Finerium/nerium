"""Arq cron that expires ``hemera_override`` rows nightly.

Runs at 00:00 UTC. Deletes overrides whose ``expires_at`` has passed,
writes audit rows with ``action='override_expired'`` (via the
``hemera.audit_action`` GUC), and publishes cache invalidation for each
affected flag on the ``flag:invalidate`` channel.

The cron is registered via :func:`register_cron_job` at module import
time; the Arq worker picks it up from
:data:`src.backend.workers.arq_worker.REGISTERED_CRONS`. Importing this
module from the worker entrypoint (see ``main.py``'s lifespan + the
worker module's ``__init__`` side-effect import) is sufficient; no
separate hook needed.
"""

from __future__ import annotations

import logging
from typing import Any

from arq.cron import cron

from src.backend.flags.override import sweep_expired_overrides
from src.backend.workers.arq_worker import register_cron_job

logger = logging.getLogger(__name__)


async def hemera_ttl_sweep(ctx: dict[str, Any]) -> dict[str, Any]:
    """Arq cron body.

    Signature matches Arq's function contract: first positional arg is
    the ``ctx`` dict. The cron registrar discards the return value so we
    return a small summary purely for observability / testability.

    Returns
    -------
    dict
        ``{'expired_flags': list[str]}`` on success. The count = len().
    """

    del ctx  # unused; keeps the Arq contract
    logger.info("flags.ttl_sweep.begin")
    flag_names = await sweep_expired_overrides()
    logger.info("flags.ttl_sweep.complete count=%d", len(flag_names))
    return {"expired_flags": flag_names}


# Register the cron at import time. Schedule: 00:00 UTC daily.
# ``cron`` accepts hour/minute as ``{0}`` style sets; passing an int matches
# the scalar overload (runs when hour == 0 AND minute == 0).
register_cron_job(
    cron(
        hemera_ttl_sweep,
        name="hemera.ttl_sweep",
        hour={0},
        minute={0},
        run_at_startup=False,
    )
)


__all__ = ["hemera_ttl_sweep"]
