"""Hemera feature flag service.

Public surface is deliberately narrow so consumers import from one path:

    from src.backend.flags import get_flag

Submodules
----------
- :mod:`service`      Core evaluation with precedence + Redis cache.
- :mod:`override`     Override CRUD (set / delete / upsert).
- :mod:`audit`        Read-side helpers for the append-only audit trail.
- :mod:`cache`        Redis key convention + get / set / invalidate.
- :mod:`invalidator`  Pub/sub producer + consumer on ``flag:invalidate``.
- :mod:`ttl_sweep`    Arq cron sweep of expired overrides (nightly).
- :mod:`actor`        ``SET LOCAL hemera.actor_id`` helper.
- :mod:`schemas`      Pydantic v2 DTOs for the admin router.
- :mod:`errors`       Typed exceptions (unknown flag, kind mismatch).

Contract reference: docs/contracts/feature_flag.contract.md (Pythia-v3).
Owner: Hemera (W1, NP phase).
"""

from __future__ import annotations

from src.backend.flags.errors import (
    FlagKindMismatch,
    FlagNotFound,
    HemeraError,
    InvalidScope,
)
from src.backend.flags.service import (
    bootstrap_all_flags,
    evaluate,
    get_flag,
)

__all__ = [
    "FlagKindMismatch",
    "FlagNotFound",
    "HemeraError",
    "InvalidScope",
    "bootstrap_all_flags",
    "evaluate",
    "get_flag",
]
