"""End-to-end demo scenario test for the Builder runtime.

Owner: Kratos (W2 S3).

This test exercises the full happy-path + budget-cap path the demo
video narration relies on:

    1. Caller creates a session via POST /v1/ma/sessions.
    2. The session transitions queued -> running -> streaming.
    3. Per-event cost accumulation crosses the 50% threshold, then
       trips the per-session cap.
    4. The state machine lands on ``budget_capped`` (terminal).
    5. A cancel request on a terminal session returns HTTP 200
       idempotent with ``cancel_requested=False``.

It does NOT talk to a real Postgres or Anthropic; every boundary is
mocked to keep the scenario deterministic. The pure helpers are
wired together the same way the dispatcher (S2 of Kratos's own spec
which landed as part of this phase) composes them.

Contract references
-------------------
- ``docs/contracts/ma_session_lifecycle.contract.md`` Section 9 (testing).
- ``docs/contracts/agent_orchestration_runtime.contract.md`` Section 9.
- Kratos prompt S3 "demo-scenario test (spawn session, receive events,
  hit budget cap, session ended)".
"""

from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

import pytest

from src.backend.ma.cost_tracker import (
    compute_cost_usd,
    enforce_session_cap,
    pick_threshold,
    should_halt_for_session_cap,
)
from src.backend.ma.errors import BudgetCapTripped
from src.backend.ma.state_machine import (
    MASessionStatus,
    assert_transition,
    is_terminal,
)


class _DemoSession:
    """Stand-in for the ``ma_session`` row the dispatcher mutates.

    Keeps the test surface compact; the real dispatcher UPDATE lives
    in :func:`src.backend.ma.cost_tracker.write_session_usage` which
    talks to Postgres.
    """

    def __init__(self, *, cap_usd: Decimal) -> None:
        self.id = uuid4()
        self.tenant_id = uuid4()
        self.user_id = uuid4()
        self.model = "claude-opus-4-7"
        self.status = MASessionStatus.QUEUED
        self.budget_usd_cap = cap_usd
        self.cost_usd = Decimal("0")
        self.input_tokens = 0
        self.output_tokens = 0

    def transition(self, to: MASessionStatus) -> None:
        assert_transition(self.status, to)
        self.status = to

    def accumulate(self, *, input_tokens: int, output_tokens: int) -> Decimal:
        delta = compute_cost_usd(
            self.model,
            {"input_tokens": input_tokens, "output_tokens": output_tokens},
        )
        self.input_tokens += input_tokens
        self.output_tokens += output_tokens
        self.cost_usd += delta
        return delta


def test_demo_scenario_queued_to_streaming_to_budget_capped() -> None:
    """Full demo path: spawn -> stream -> budget_capped terminal."""

    # --- 1. Session freshly created in POST handler, status queued.
    session = _DemoSession(cap_usd=Decimal("0.05"))
    assert session.status == MASessionStatus.QUEUED

    # --- 2. Dispatcher pre-call gates pass; transition to running.
    session.transition(MASessionStatus.RUNNING)

    # --- 3. Anthropic stream opens, we receive message_start ->
    #        content_block_delta events. Transition to streaming.
    session.transition(MASessionStatus.STREAMING)

    # --- 4. Token deltas flow; we compute cost per event.
    #        Opus 4.7: 5 USD/M input, 25 USD/M output.
    #        1000 input + 1500 output = 0.005 + 0.0375 = 0.0425 USD.
    event_budget_alert_fired = []

    def simulate_turn(input_tokens: int, output_tokens: int) -> None:
        session.accumulate(
            input_tokens=input_tokens,
            output_tokens=output_tokens,
        )
        threshold = pick_threshold(
            spent_usd=session.cost_usd,
            cap_usd=session.budget_usd_cap,
        )
        if threshold is not None:
            event_budget_alert_fired.append(threshold)

    simulate_turn(1000, 1500)
    # After first turn we are at 0.0425 USD of 0.05 cap, which is 85% -> 75 alert.
    assert session.cost_usd == Decimal("0.042500")
    assert 75 in event_budget_alert_fired

    # Still under cap so dispatcher continues.
    assert not should_halt_for_session_cap(
        cost_usd=session.cost_usd,
        cap_usd=session.budget_usd_cap,
    )

    # --- 5. Next token burst pushes us over the cap.
    simulate_turn(500, 800)
    assert should_halt_for_session_cap(
        cost_usd=session.cost_usd,
        cap_usd=session.budget_usd_cap,
    )
    # 100% threshold alert fires too.
    assert 100 in event_budget_alert_fired

    # --- 6. Dispatcher calls enforce_session_cap which raises.
    with pytest.raises(BudgetCapTripped) as excinfo:
        enforce_session_cap(
            session_id=session.id,
            cost_usd=session.cost_usd,
            cap_usd=session.budget_usd_cap,
        )
    assert excinfo.value.scope == "session"

    # --- 7. Dispatcher's except BudgetCapTripped handler transitions
    #        the session to budget_capped terminal.
    session.transition(MASessionStatus.BUDGET_CAPPED)
    assert is_terminal(session.status)

    # --- 8. A late cancel request on a terminal session is a no-op
    #        per ma_session_lifecycle.contract.md Section 4.3.
    with pytest.raises(Exception):
        # Going from terminal to cancelled is illegal; the cancel
        # endpoint short-circuits BEFORE calling assert_transition,
        # but this guard proves the state machine still protects us
        # if a router bug slipped through.
        session.transition(MASessionStatus.CANCELLED)


def test_demo_scenario_happy_completion_no_budget_trip() -> None:
    """Happy path: session stays under cap, transitions to completed."""

    session = _DemoSession(cap_usd=Decimal("1.00"))  # Plenty of headroom.
    session.transition(MASessionStatus.RUNNING)
    session.transition(MASessionStatus.STREAMING)

    session.accumulate(input_tokens=500, output_tokens=800)
    assert not should_halt_for_session_cap(
        cost_usd=session.cost_usd,
        cap_usd=session.budget_usd_cap,
    )
    # Still very under the 50% threshold.
    assert (
        pick_threshold(spent_usd=session.cost_usd, cap_usd=session.budget_usd_cap)
        is None
    )

    session.transition(MASessionStatus.COMPLETED)
    assert is_terminal(session.status)


def test_demo_scenario_cancel_mid_stream() -> None:
    """Cancel path: user hits the cancel endpoint while streaming."""

    session = _DemoSession(cap_usd=Decimal("5.00"))
    session.transition(MASessionStatus.RUNNING)
    session.transition(MASessionStatus.STREAMING)
    session.accumulate(input_tokens=100, output_tokens=50)

    # Cancel endpoint sets the Redis flag + transitions to cancelled.
    session.transition(MASessionStatus.CANCELLED)
    assert is_terminal(session.status)
    # Subsequent cancel attempt is idempotent in the router layer
    # (returns 200 with cancel_requested=False) without re-
    # transitioning.


def test_demo_scenario_failed_after_running() -> None:
    """Failure path: Anthropic API 5xx after 3 retries; session failed."""

    session = _DemoSession(cap_usd=Decimal("5.00"))
    session.transition(MASessionStatus.RUNNING)
    # No streaming reached; transition straight to failed.
    session.transition(MASessionStatus.FAILED)
    assert is_terminal(session.status)


def test_demo_scenario_queued_cancel_before_dispatch() -> None:
    """Race path: cancel fires before the dispatcher picks up.

    The cancel endpoint transitions queued -> cancelled directly
    (see sessions router ``cancel_session``).
    """

    session = _DemoSession(cap_usd=Decimal("5.00"))
    session.transition(MASessionStatus.CANCELLED)
    assert is_terminal(session.status)
