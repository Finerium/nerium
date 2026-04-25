"""Astraea trust cron package.

Owner: Astraea (W2 Registry trust score, NP phase, V4 S2 pack).

Public surface
--------------
- :mod:`.refresh_scores`  Nightly Arq cron that recomputes
  ``trust_score_cached`` for every published listing whose snapshot is
  older than 24 hours, using the existing pure-math + service layer.

Importing this module is the side-effect hook that registers the cron
with :data:`src.backend.workers.arq_worker.REGISTERED_CRONS`. The Arq
worker entrypoint reaches this package via
``src.backend.workers.arq_worker`` -> ``REGISTERED_CRONS`` after an
``import src.backend.trust.cron.refresh_scores`` somewhere in the
worker boot path.

Contract refs
-------------
- ``docs/contracts/trust_score.contract.md`` Section 4.1 (pg_cron
  nightly refresh + Arq cron fallback at 02:00 UTC).
"""

from __future__ import annotations

# Side-effect import: registers the cron at module import time so the
# Arq worker picks it up from REGISTERED_CRONS without a manual wiring
# step in src.backend.main.
from src.backend.trust.cron import refresh_scores as refresh_scores  # noqa: F401

__all__ = ["refresh_scores"]
