"""Dispatcher resilience tests: tenacity retry + breaker integration.

Covers the S2 upgrade in :mod:`src.backend.protocol.dispatcher`:
- TransientVendorError retried up to 3 attempts then trips the breaker.
- PermanentVendorError surfaces 502 immediately, breaker stays closed.
- Unexpected exceptions trip the breaker AND propagate.
- Open breaker surfaces 503 with Retry-After header hint.

A throwaway adapter implementation drives the dispatcher with full
control over the failure pattern; the AnthropicAdapter integration is
covered separately in test_anthropic_adapter.py.
"""

from __future__ import annotations

from typing import Any
from uuid import uuid4

import pybreaker
import pytest

from src.backend.errors import ServiceUnavailableProblem
from src.backend.protocol.adapters.base import (
    BaseVendorAdapter,
    VendorResponse,
    VendorTask,
)
from src.backend.protocol.breaker import BreakerRegistry
from src.backend.protocol.dispatcher import BadGatewayProblem, dispatch
from src.backend.protocol.exceptions import (
    PermanentVendorError,
    TransientVendorError,
)
from src.backend.protocol.registry import AdapterRegistry
from src.backend.registry.identity import AgentPrincipal


class _ProgrammableAdapter(BaseVendorAdapter):
    """Adapter whose ``invoke`` raises configured exceptions in sequence.

    ``script`` is a list of values to return / raise on successive
    calls. A callable raises whatever exception it returns; a
    :class:`VendorResponse` is returned. Exhausted scripts raise
    AssertionError so a test never silently passes a stale state.
    """

    vendor_slug: str = "programmable"

    def __init__(self, script: list[Any]) -> None:
        self._script = list(script)
        self.calls = 0

    async def invoke(
        self,
        task: VendorTask,
        agent: AgentPrincipal,
    ) -> VendorResponse:
        self.calls += 1
        if not self._script:
            raise AssertionError(
                "ProgrammableAdapter ran past the end of its script."
            )
        next_value = self._script.pop(0)
        if isinstance(next_value, Exception):
            raise next_value
        return next_value


def _agent() -> AgentPrincipal:
    return AgentPrincipal(
        agent_id=uuid4(),
        owner_user_id=uuid4(),
        tenant_id=uuid4(),
        status="active",
        claims={},
    )


def _success_response() -> VendorResponse:
    return VendorResponse(
        vendor_slug="programmable",
        task_type="chat",
        output={"ok": True},
        usage=None,
        metadata={},
    )


@pytest.fixture(autouse=True)
def _no_kill_switch(monkeypatch: pytest.MonkeyPatch) -> None:
    """Make the Hemera kill switch a no-op for these dispatcher tests."""

    async def _fake_get_flag(name: str, **_kwargs: Any) -> Any:
        return False

    monkeypatch.setattr(
        "src.backend.protocol.dispatcher.get_flag", _fake_get_flag
    )


@pytest.fixture
def fast_breaker_registry() -> BreakerRegistry:
    """Tiny fail_max + zero-jitter so retry exhaust trips the breaker fast."""

    return BreakerRegistry(
        fail_max=1, reset_timeout=1, success_threshold=1
    )


@pytest.fixture(autouse=True)
def _fast_tenacity(monkeypatch: pytest.MonkeyPatch) -> None:
    """Force tenacity wait to zero so the test suite stays fast.

    ``wait_exponential_jitter`` defaults to 0.5s initial; over three
    attempts the cumulative sleep would dominate the test runtime.
    Patching the wait function keeps semantics intact (still 3
    attempts, still retry on TransientVendorError) while running in
    sub-millisecond time.
    """

    from tenacity import wait_none

    monkeypatch.setattr(
        "src.backend.protocol.dispatcher.wait_exponential_jitter",
        lambda **_kwargs: wait_none(),
    )


@pytest.mark.asyncio
async def test_transient_retried_then_succeeds(
    fast_breaker_registry: BreakerRegistry,
) -> None:
    """Two transient failures then a success returns the success response."""

    adapter = _ProgrammableAdapter(
        script=[
            TransientVendorError("boom1", vendor_slug="programmable", status_code=503),
            TransientVendorError("boom2", vendor_slug="programmable", status_code=503),
            _success_response(),
        ]
    )
    registry = AdapterRegistry(adapters=[adapter])

    response = await dispatch(
        vendor_slug="programmable",
        task=VendorTask(task_type="chat", payload={}, metadata={}),
        agent=_agent(),
        registry=registry,
        breaker_registry=fast_breaker_registry,
    )
    assert response.output == {"ok": True}
    assert adapter.calls == 3
    # Breaker stayed closed because the final attempt succeeded.
    assert fast_breaker_registry.state("programmable") == pybreaker.STATE_CLOSED


@pytest.mark.asyncio
async def test_transient_exhaust_trips_breaker_and_502(
    fast_breaker_registry: BreakerRegistry,
) -> None:
    """All 3 attempts transient -> 502 + breaker opens (fail_max=1)."""

    adapter = _ProgrammableAdapter(
        script=[
            TransientVendorError("a", vendor_slug="programmable", status_code=502),
            TransientVendorError("b", vendor_slug="programmable", status_code=502),
            TransientVendorError("c", vendor_slug="programmable", status_code=502),
        ]
    )
    registry = AdapterRegistry(adapters=[adapter])

    with pytest.raises(BadGatewayProblem) as excinfo:
        await dispatch(
            vendor_slug="programmable",
            task=VendorTask(task_type="chat", payload={}, metadata={}),
            agent=_agent(),
            registry=registry,
            breaker_registry=fast_breaker_registry,
        )
    assert "transient" in str(excinfo.value).lower()
    assert adapter.calls == 3
    assert fast_breaker_registry.state("programmable") == pybreaker.STATE_OPEN


@pytest.mark.asyncio
async def test_permanent_no_retry_no_breaker_trip(
    fast_breaker_registry: BreakerRegistry,
) -> None:
    """4xx-shaped permanent error: single attempt, breaker stays closed."""

    adapter = _ProgrammableAdapter(
        script=[
            PermanentVendorError(
                "bad request", vendor_slug="programmable", status_code=400
            ),
            # Extra entries unused; assertion below confirms only one call fired.
            _success_response(),
        ]
    )
    registry = AdapterRegistry(adapters=[adapter])

    with pytest.raises(BadGatewayProblem):
        await dispatch(
            vendor_slug="programmable",
            task=VendorTask(task_type="chat", payload={}, metadata={}),
            agent=_agent(),
            registry=registry,
            breaker_registry=fast_breaker_registry,
        )
    assert adapter.calls == 1
    assert fast_breaker_registry.state("programmable") == pybreaker.STATE_CLOSED


@pytest.mark.asyncio
async def test_open_breaker_returns_503(
    fast_breaker_registry: BreakerRegistry,
) -> None:
    """When the breaker is open the dispatcher short-circuits with 503."""

    # Trip the breaker manually via a single transient exhaust.
    adapter = _ProgrammableAdapter(
        script=[
            TransientVendorError("a", vendor_slug="programmable", status_code=502),
            TransientVendorError("b", vendor_slug="programmable", status_code=502),
            TransientVendorError("c", vendor_slug="programmable", status_code=502),
        ]
    )
    registry = AdapterRegistry(adapters=[adapter])

    with pytest.raises(BadGatewayProblem):
        await dispatch(
            vendor_slug="programmable",
            task=VendorTask(task_type="chat", payload={}, metadata={}),
            agent=_agent(),
            registry=registry,
            breaker_registry=fast_breaker_registry,
        )
    assert fast_breaker_registry.state("programmable") == pybreaker.STATE_OPEN

    # Now a fresh adapter would have a clean script but the breaker
    # blocks the call before the adapter is touched at all.
    fresh_adapter = _ProgrammableAdapter(script=[_success_response()])
    fresh_registry = AdapterRegistry(adapters=[fresh_adapter])

    with pytest.raises(ServiceUnavailableProblem) as excinfo:
        await dispatch(
            vendor_slug="programmable",
            task=VendorTask(task_type="chat", payload={}, metadata={}),
            agent=_agent(),
            registry=fresh_registry,
            breaker_registry=fast_breaker_registry,
        )
    detail = str(excinfo.value)
    assert "circuit breaker" in detail.lower()
    # Adapter never ran.
    assert fresh_adapter.calls == 0


@pytest.mark.asyncio
async def test_unexpected_exception_trips_breaker_and_propagates(
    fast_breaker_registry: BreakerRegistry,
) -> None:
    """Adapter-side bug: trip the breaker AND let the exception propagate.

    The dispatcher does NOT swallow unexpected exceptions because the
    unhandled handler is responsible for rendering 500. We verify the
    breaker state changed even though the exception bubbled up.
    """

    class _AdapterBug(RuntimeError):
        pass

    adapter = _ProgrammableAdapter(script=[_AdapterBug("oops")])
    registry = AdapterRegistry(adapters=[adapter])

    with pytest.raises(_AdapterBug):
        await dispatch(
            vendor_slug="programmable",
            task=VendorTask(task_type="chat", payload={}, metadata={}),
            agent=_agent(),
            registry=registry,
            breaker_registry=fast_breaker_registry,
        )
    assert fast_breaker_registry.state("programmable") == pybreaker.STATE_OPEN
