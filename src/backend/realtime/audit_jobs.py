"""Arq registration for realtime audit worker functions.

Owner: Nike (W2 NP P3 S1).

Imported by the Arq WorkerSettings boot path (the Arq CLI imports the
worker module which in turn imports this module so the
:func:`register_job` decorator runs at import time and the function
ends up in :data:`src.backend.workers.arq_worker.REGISTERED_JOBS`).

Kept separate from :mod:`src.backend.realtime.audit` to avoid pulling
the asyncpg pool helpers + Arq registry into the request-time API
process; the API only needs the enqueue helper.
"""

from __future__ import annotations

from src.backend.realtime.audit import (
    ARQ_JOB_NAME,
    realtime_audit_connection_event,
)
from src.backend.workers.arq_worker import register_job

# Rename the bare function so Arq exposes it under the contract name. Arq
# resolves jobs by ``__name__`` on the registered callable; the pretty
# dotted name keeps the worker dashboard legible.
realtime_audit_connection_event.__name__ = ARQ_JOB_NAME
register_job(realtime_audit_connection_event)


__all__ = ["realtime_audit_connection_event"]
