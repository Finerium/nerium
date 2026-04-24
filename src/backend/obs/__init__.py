"""Observability subsystem: logger, tracing, metrics, error tracking, redaction.

Owner: Selene (W1, NP phase). Contract: docs/contracts/observability.contract.md.

Consumer agents should import from the top-level module names, for example::

    from src.backend.obs.logger import configure_logging, get_logger
    from src.backend.obs.tracing import configure_tracing
    from src.backend.obs.metrics import get_registry, record_ma_session_cost

Bootstrap order in ``lifespan`` (Aether main.py): configure_logging ->
configure_tracing -> configure_error_tracking -> configure_metrics ->
register middleware -> mount FastAPI instrumentor.
"""

from src.backend.obs.logger import configure_logging, get_logger
from src.backend.obs.tracing import configure_tracing, get_tracer
from src.backend.obs.metrics import (
    METRICS_CONTENT_TYPE,
    get_registry,
    record_ma_session_cost,
    render_metrics,
)
from src.backend.obs.redact import redact_sensitive
from src.backend.obs.error_tracking import configure_error_tracking

__all__ = [
    "configure_logging",
    "get_logger",
    "configure_tracing",
    "get_tracer",
    "configure_error_tracking",
    "get_registry",
    "render_metrics",
    "record_ma_session_cost",
    "redact_sensitive",
    "METRICS_CONTENT_TYPE",
]
