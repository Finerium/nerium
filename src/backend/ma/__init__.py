"""NERIUM Managed Agent (MA) runtime package.

Owner: Kratos (W2 Builder runtime orchestration).

This package implements the Builder runtime surface: MA session CRUD +
state machine (Session 1), Claude Agent SDK inner loop + tool_use
handling (Session 2), and SSE streaming + resume + cancel (Session 3).

Public surface (Session 1)
--------------------------
::

    from src.backend.ma import (
        MASessionStatus,
        assert_transition,
        InvalidTransitionError,
        sessions_router,
    )

Contract references
-------------------
- ``docs/contracts/agent_orchestration_runtime.contract.md`` state machine.
- ``docs/contracts/ma_session_lifecycle.contract.md`` wire CRUD + SSE.
- ``docs/contracts/realtime_bus.contract.md`` SSE envelope format.
- ``docs/contracts/budget_monitor.contract.md`` pre-call cap check.
- ``docs/contracts/feature_flag.contract.md`` ``builder.live`` gate.
- ``docs/contracts/postgres_multi_tenant.contract.md`` RLS + enum.
"""

from src.backend.ma.state_machine import (
    InvalidTransitionError,
    MASessionStatus,
    assert_transition,
    is_terminal,
    valid_next_states,
)

__all__ = [
    "InvalidTransitionError",
    "MASessionStatus",
    "assert_transition",
    "is_terminal",
    "valid_next_states",
]
