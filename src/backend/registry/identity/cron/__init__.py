"""Tethys identity cron sub-package.

Owner: Tethys (W2 NP P5 Session 2 deferred, T4).

Importing this package fires the ``register_cron_job`` side effect
inside :mod:`key_rotation` so the Arq worker process picks up the
weekly Sunday 03:00 UTC sweep without any extra wiring in
``main.py``. The pattern matches Aether's convention used by
:mod:`src.backend.flags.ttl_sweep` + :mod:`src.backend.budget.daily_reset`:
declare the cron at module import time, then arrange for the worker
boot path to import the module so the registration happens before
``WorkerSettings.cron_jobs`` is consulted by Arq.

Public re-exports
-----------------
The :class:`CronJob` instance + the rotation helpers are re-exported
here so consumers (admin router, tests, observability dashboards)
can write::

    from src.backend.registry.identity.cron import (
        KEY_ROTATION_CRON,
        rotate_single_agent,
        RotationTooRecentError,
    )

without reaching into the file tree.
"""

from src.backend.registry.identity.cron.key_rotation import (
    CRON_SCHEDULE_NAME,
    GRACE_WINDOW_DAYS,
    KEY_ROTATION_CRON,
    PHEME_TEMPLATE_NAME,
    ROTATION_AGE_THRESHOLD_DAYS,
    ROTATION_RECENT_GUARD_DAYS,
    RotationOutcome,
    RotationTargetMissingError,
    RotationTooRecentError,
    rotate_single_agent,
    tethys_key_rotation_sweep,
)

__all__ = [
    "CRON_SCHEDULE_NAME",
    "GRACE_WINDOW_DAYS",
    "KEY_ROTATION_CRON",
    "PHEME_TEMPLATE_NAME",
    "ROTATION_AGE_THRESHOLD_DAYS",
    "ROTATION_RECENT_GUARD_DAYS",
    "RotationOutcome",
    "RotationTargetMissingError",
    "RotationTooRecentError",
    "rotate_single_agent",
    "tethys_key_rotation_sweep",
]
