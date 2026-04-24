"""NERIUM backend Arq worker package.

Aether (W1 Session 2) owns the Arq redis handle installed during the
FastAPI lifespan (see :mod:`src.backend.workers.arq_redis`) and the
Arq ``WorkerSettings`` class + job registry (see
:mod:`src.backend.workers.arq_worker`).

Worker task modules co-exist alongside:

- ``email_sender`` (Pheme) : send queued transactional email.
- ``storage_scanner`` (Chione) : scan R2 uploads with ClamAV (W1 Chione).
- ``storage_sweep`` (Chione) : GDPR expiry sweep.
- ``pheme_virus_alert`` (Chione->Pheme dormant) : only fires once
  Pheme registers the template; safely drops until then.

Per-agent modules call :func:`src.backend.workers.arq_worker.register_job`
(or the ``register_cron_job`` sibling) at import time; ``main.py`` does
not need to be edited when a new job type is added.
"""

from src.backend.workers.arq_redis import get_arq_redis, set_arq_redis
from src.backend.workers.arq_worker import (
    DLQ_KEY,
    REGISTERED_CRONS,
    REGISTERED_JOBS,
    WorkerSettings,
    build_redis_settings,
    register_cron_job,
    register_job,
)

__all__ = [
    "DLQ_KEY",
    "REGISTERED_CRONS",
    "REGISTERED_JOBS",
    "WorkerSettings",
    "build_redis_settings",
    "get_arq_redis",
    "register_cron_job",
    "register_job",
    "set_arq_redis",
]
