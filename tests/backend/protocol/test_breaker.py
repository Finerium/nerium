"""pybreaker circuit breaker state machine tests.

Covers the closed -> open -> half-open -> closed state transitions
exposed by :mod:`src.backend.protocol.breaker`. We drive the breaker
synchronously here (pybreaker's ``call`` API) to keep state assertions
ergonomic; the dispatcher's async wrapper is exercised separately in
``test_dispatcher_resilience.py``.
"""

from __future__ import annotations

import time

import pybreaker
import pytest

from src.backend.protocol.breaker import (
    DEFAULT_FAIL_MAX,
    DEFAULT_RESET_TIMEOUT_SECONDS,
    DEFAULT_SUCCESS_THRESHOLD,
    BreakerRegistry,
    build_breaker,
    get_breaker_registry,
    reset_breaker_registry_for_tests,
)


class _BoomError(RuntimeError):
    """Distinct exception type for the failing call paths."""


def _failing() -> None:
    raise _BoomError("boom")


def _ok() -> str:
    return "ok"


def test_defaults_match_agent_spec() -> None:
    """Spec-mandated defaults: fail_max=5 reset=30 success_threshold=2."""

    assert DEFAULT_FAIL_MAX == 5
    assert DEFAULT_RESET_TIMEOUT_SECONDS == 30
    assert DEFAULT_SUCCESS_THRESHOLD == 2


def test_breaker_opens_after_fail_max_failures() -> None:
    """Five consecutive failures flip closed -> open.

    pybreaker semantics: the Nth failure that trips the breaker
    re-raises the underlying exception wrapped as a
    :class:`pybreaker.CircuitBreakerError` (subclass of Exception).
    The first ``fail_max - 1`` failures surface the original
    ``_BoomError``; the trip-call swaps the type. We catch both via
    a tuple to assert the state transition without depending on
    pybreaker's internal raise sequence.
    """

    breaker = build_breaker("test", fail_max=5, reset_timeout=30)
    for _ in range(5):
        with pytest.raises((_BoomError, pybreaker.CircuitBreakerError)):
            breaker.call(_failing)
    assert breaker.current_state == pybreaker.STATE_OPEN


def test_open_breaker_rejects_calls() -> None:
    """Calls in the open state raise CircuitBreakerError immediately."""

    breaker = build_breaker("test", fail_max=2, reset_timeout=30)
    for _ in range(2):
        with pytest.raises((_BoomError, pybreaker.CircuitBreakerError)):
            breaker.call(_failing)
    assert breaker.current_state == pybreaker.STATE_OPEN

    with pytest.raises(pybreaker.CircuitBreakerError):
        breaker.call(_ok)


def test_open_breaker_half_opens_after_reset_timeout() -> None:
    """After ``reset_timeout`` elapses the next call probes (half-open)."""

    breaker = build_breaker("test", fail_max=1, reset_timeout=1)
    with pytest.raises((_BoomError, pybreaker.CircuitBreakerError)):
        breaker.call(_failing)
    assert breaker.current_state == pybreaker.STATE_OPEN

    # Wait past reset_timeout. We use a real 1.1s sleep because the
    # breaker reads UTC datetime; freezegun would also work but a
    # short real sleep keeps the test self-contained.
    time.sleep(1.1)

    # The next call probes through; because _ok succeeds, the breaker
    # transitions to half-open and starts the success_threshold count.
    result = breaker.call(_ok)
    assert result == "ok"
    # success_threshold default is 2; one success leaves us in
    # half-open, not yet closed.
    assert breaker.current_state == pybreaker.STATE_HALF_OPEN


def test_half_open_two_successes_closes_circuit() -> None:
    """``success_threshold=2`` consecutive successes flip half-open -> closed."""

    breaker = build_breaker(
        "test", fail_max=1, reset_timeout=1, success_threshold=2
    )
    with pytest.raises((_BoomError, pybreaker.CircuitBreakerError)):
        breaker.call(_failing)
    assert breaker.current_state == pybreaker.STATE_OPEN

    time.sleep(1.1)
    breaker.call(_ok)  # 1st half-open success
    assert breaker.current_state == pybreaker.STATE_HALF_OPEN
    breaker.call(_ok)  # 2nd half-open success -> close
    assert breaker.current_state == pybreaker.STATE_CLOSED


def test_half_open_failure_returns_to_open() -> None:
    """A failure during half-open probe trips the breaker back to open."""

    breaker = build_breaker("test", fail_max=1, reset_timeout=1)
    with pytest.raises((_BoomError, pybreaker.CircuitBreakerError)):
        breaker.call(_failing)
    assert breaker.current_state == pybreaker.STATE_OPEN

    time.sleep(1.1)
    with pytest.raises((_BoomError, pybreaker.CircuitBreakerError)):
        breaker.call(_failing)  # half-open probe -> fails
    assert breaker.current_state == pybreaker.STATE_OPEN


def test_registry_returns_same_breaker_for_same_slug() -> None:
    """:meth:`BreakerRegistry.get` lazy-builds + memoizes per slug."""

    registry = BreakerRegistry()
    a = registry.get("anthropic")
    b = registry.get("anthropic")
    c = registry.get("openai")
    assert a is b
    assert a is not c
    assert set(registry.all_slugs()) == {"anthropic", "openai"}


def test_registry_state_default_is_closed() -> None:
    """``state`` for an unseen slug returns 'closed' without instantiation."""

    registry = BreakerRegistry()
    assert registry.state("never_seen") == "closed"
    # ``state`` MUST NOT auto-instantiate a breaker for an unseen slug;
    # otherwise admin readers would leak slugs into the registry.
    assert registry.all_slugs() == []


def test_registry_singleton_reset() -> None:
    """The process singleton rebuilds after :func:`reset_breaker_registry_for_tests`."""

    a = get_breaker_registry()
    a.get("foo")
    reset_breaker_registry_for_tests()
    b = get_breaker_registry()
    assert a is not b
    assert b.all_slugs() == []
