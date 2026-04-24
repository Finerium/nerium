"""NERIUM trust score package.

Owner: Astraea (W2 Registry trust score, NP phase, P1 Pack Session 1).

Public surface
--------------
- :mod:`.bayesian`          Bayesian smoothed mean (primary sort signal).
- :mod:`.wilson`            Wilson score lower bound (binary signal confidence).
- :mod:`.new_agent_boost`   7-day cold-start additive boost with exp decay.
- :mod:`.per_category`      Per-category input gather + formula dispatch.
- :mod:`.score`             Top-level ``compute_trust`` orchestration + band
                            derivation + stability classification.
- :mod:`.service`           DB-backed compute + persist entry points.
- :mod:`.weights`           ``formula_weights`` loader with disk JSON fallback.

Contract refs
-------------
- ``docs/contracts/trust_score.contract.md`` Section 3 (formulas + table
  shape) and Section 4.2 (on-demand recompute signature).
- ``docs/contracts/marketplace_listing.contract.md`` Section 3.3
  (``trust_score_cached`` denormalized column).

Scope of P1 Session 1
---------------------
Ships the math + DB-backed service + read router. The nightly pg_cron
refresh + Arq cron fallback + Verified-badge auto-grant lane is the
Session 2 pack which was CUT per V4 lock #5; the cache columns + audit
table land anyway so a future pg_cron revision can slot in without a
schema change.
"""

from __future__ import annotations

__all__: list[str] = []
