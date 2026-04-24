"""Budget subsystem.

Owner: Moros (W2 budget daemon). Selene (W1 observability) lands a thin
metric-emission hook here so the observability dashboard can render the
``ma_session_cost_usd_total`` counter before Moros's full daemon ships.
"""

from src.backend.budget.metric_hook import record_session_cost_metric

__all__ = ["record_session_cost_metric"]
