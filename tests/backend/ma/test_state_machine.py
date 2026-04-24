"""Transition matrix tests for :mod:`src.backend.ma.state_machine`.

Owner: Kratos (W2 S1).

The state machine is the single source of truth for legal status hops
(``agent_orchestration_runtime.contract.md`` Section 4.1). Tests here
sweep the full matrix so a typo in the transition map surfaces
immediately.

Properties tested:

- Every defined status appears in the transition map keys.
- Terminal states yield an empty legal-target set.
- Each non-terminal hop listed in the contract resolves to PASS.
- Each hop NOT listed resolves to :class:`InvalidTransitionError`.
- ``is_terminal`` agrees with the ``TERMINAL_STATES`` constant.
- String-form arguments coerce correctly.
"""

from __future__ import annotations

import pytest

from src.backend.ma.state_machine import (
    InvalidTransitionError,
    MASessionStatus,
    TERMINAL_STATES,
    assert_transition,
    is_terminal,
    valid_next_states,
)


# Expected legal transitions per ``agent_orchestration_runtime.contract.md``
# Section 4.1 + Kratos prompt Session 1. Pair form keeps the assertion
# loops compact; parametrize the happy + sad paths separately.
_LEGAL_HOPS: tuple[tuple[MASessionStatus, MASessionStatus], ...] = (
    (MASessionStatus.QUEUED, MASessionStatus.RUNNING),
    (MASessionStatus.QUEUED, MASessionStatus.CANCELLED),
    (MASessionStatus.QUEUED, MASessionStatus.BUDGET_CAPPED),
    (MASessionStatus.QUEUED, MASessionStatus.FAILED),
    (MASessionStatus.RUNNING, MASessionStatus.STREAMING),
    (MASessionStatus.RUNNING, MASessionStatus.COMPLETED),
    (MASessionStatus.RUNNING, MASessionStatus.CANCELLED),
    (MASessionStatus.RUNNING, MASessionStatus.FAILED),
    (MASessionStatus.RUNNING, MASessionStatus.BUDGET_CAPPED),
    (MASessionStatus.STREAMING, MASessionStatus.COMPLETED),
    (MASessionStatus.STREAMING, MASessionStatus.CANCELLED),
    (MASessionStatus.STREAMING, MASessionStatus.FAILED),
    (MASessionStatus.STREAMING, MASessionStatus.BUDGET_CAPPED),
)


@pytest.mark.parametrize("src,dst", _LEGAL_HOPS)
def test_legal_transitions_pass(
    src: MASessionStatus, dst: MASessionStatus
) -> None:
    """Every hop in the contract matrix resolves without raising."""

    assert_transition(src, dst)


def _illegal_pairs() -> list[tuple[MASessionStatus, MASessionStatus]]:
    """Enumerate every status pair NOT in ``_LEGAL_HOPS`` (excluding self-loops)."""

    legal = set(_LEGAL_HOPS)
    illegal: list[tuple[MASessionStatus, MASessionStatus]] = []
    for src in MASessionStatus:
        for dst in MASessionStatus:
            if src == dst:
                continue
            if (src, dst) in legal:
                continue
            illegal.append((src, dst))
    return illegal


@pytest.mark.parametrize("src,dst", _illegal_pairs())
def test_illegal_transitions_raise(
    src: MASessionStatus, dst: MASessionStatus
) -> None:
    """Any hop outside the canonical matrix raises :class:`InvalidTransitionError`."""

    with pytest.raises(InvalidTransitionError) as excinfo:
        assert_transition(src, dst)
    assert excinfo.value.from_status == src
    assert excinfo.value.to_status == dst


def test_terminal_states_match_constant() -> None:
    """``is_terminal`` agrees with :data:`TERMINAL_STATES`."""

    for status in MASessionStatus:
        assert is_terminal(status) is (status in TERMINAL_STATES)


@pytest.mark.parametrize(
    "terminal",
    sorted(TERMINAL_STATES, key=lambda s: s.value),
)
def test_terminal_states_have_no_outbound(terminal: MASessionStatus) -> None:
    """``valid_next_states(terminal)`` is empty for all four terminals."""

    assert valid_next_states(terminal) == frozenset()


def test_self_loop_rejected() -> None:
    """Self-loops are not listed in the contract, so they must raise."""

    for status in MASessionStatus:
        with pytest.raises(InvalidTransitionError):
            assert_transition(status, status)


def test_string_coercion() -> None:
    """Callers can pass raw string values (e.g. from a Postgres row)."""

    assert_transition("queued", "running")
    with pytest.raises(InvalidTransitionError):
        assert_transition("completed", "queued")


def test_enum_values_are_seven_locked() -> None:
    """Guardrail against an accidental 8th status value landing."""

    assert len(MASessionStatus) == 7
    assert {s.value for s in MASessionStatus} == {
        "queued",
        "running",
        "streaming",
        "completed",
        "cancelled",
        "failed",
        "budget_capped",
    }
