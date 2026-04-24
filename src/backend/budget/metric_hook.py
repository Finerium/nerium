"""Thin budget metric hook shipped by Selene ahead of Moros's daemon.

Owner: Selene (W1 observability) until Moros (W2 budget daemon) subsumes it.
Contract: ``docs/contracts/budget_monitor.contract.md`` Section 5 OTel
metrics list + ``docs/contracts/observability.contract.md`` Section 3.4.

When Moros lands ``src/backend/budget/local_accountant.py`` it should import
and call ``record_session_cost_metric`` as part of ``record_session_cost`` so
the Prometheus counter stays in sync with the Redis incrbyfloat counter.
"""

from __future__ import annotations

from src.backend.obs.logger import get_logger
from src.backend.obs.metrics import record_ma_session_cost

log = get_logger(__name__)


def record_session_cost_metric(
    model: str,
    tenant_id: str,
    cost_usd: float,
    session_id: str | None = None,
) -> None:
    """Emit the MA session cost delta both as a metric counter and a log event.

    The log event shape matches the ``budget.local.recorded`` event signature
    so downstream consumers (Eunomia admin, Nemea-RV-v2 regression) can depend
    on the field names.
    """

    record_ma_session_cost(model=model, tenant_id=tenant_id, cost_usd=cost_usd)
    log.info(
        "budget.local.recorded",
        tenant_id=tenant_id,
        session_id=session_id,
        model=model,
        cost_usd=cost_usd,
    )
