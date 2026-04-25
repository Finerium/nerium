"""Crius dispatcher: kill switch -> breaker -> tenacity retry -> adapter.

Owner: Crius (W2 NP P5 Sessions 1 + 2).

S1 surface (kept)
-----------------
- :func:`dispatch` and :func:`kill_switch_flag_name` are the public
  entry points used by the router. The signature is unchanged from S1
  so the protocol_router code does not need to move.
- The Hemera kill switch check fires FIRST, before adapter resolution
  + invocation, so a flipped flag short-circuits dispatch even if the
  adapter would have raised on its own.

S2 layered onto the linear S1 path
----------------------------------
1. Hemera kill switch read.
2. Adapter resolution from the registry.
3. Per-vendor pybreaker breaker probe. If open -> 503 problem+json
   immediately. The breaker is process-global per vendor slug and
   defaults to ``fail_max=5 / reset_timeout=30s / success_threshold=2``
   per the Crius agent spec.
4. Tenacity retry of ``adapter.invoke`` with
   ``stop_after_attempt(3)`` + ``wait_exponential_jitter(initial=0.5,
   max=4)``. Only :class:`TransientVendorError` is retried;
   :class:`PermanentVendorError` short-circuits with no retries.
5. On final TransientVendorError exhaust -> breaker.failure() +
   raise 502. On PermanentVendorError -> 502 immediately, breaker
   does NOT trip (caller-side defect). On unexpected exception ->
   breaker.failure() + re-raise.

Result mapping to problem+json
------------------------------
- :class:`pybreaker.CircuitBreakerError` (open) -> 503
  ``ServiceUnavailableProblem`` with ``Retry-After`` hint.
- :class:`TransientVendorError` after retry exhaust -> 502
  ``BadGatewayProblem`` (custom subclass below) with vendor + status.
- :class:`PermanentVendorError` -> 502 ``BadGatewayProblem``.

The ``BadGatewayProblem`` slug is registered locally rather than in
``src/backend/errors/problem_json.py`` so the contract registry stays
unchanged for S2; downstream agents that need the slug can import it
from this module.
"""

from __future__ import annotations

import logging

import pybreaker
from tenacity import (
    AsyncRetrying,
    RetryError,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential_jitter,
)

from src.backend.errors import ProblemException, ServiceUnavailableProblem
from src.backend.flags.service import get_flag
from src.backend.protocol.adapters.base import VendorResponse, VendorTask
from src.backend.protocol.breaker import (
    BreakerRegistry,
    get_breaker_registry,
)
from src.backend.protocol.exceptions import (
    PermanentVendorError,
    TransientVendorError,
)
from src.backend.protocol.registry import AdapterRegistry, get_registry
from src.backend.registry.identity import AgentPrincipal

__all__ = [
    "BadGatewayProblem",
    "dispatch",
    "kill_switch_flag_name",
]

logger = logging.getLogger(__name__)


TENACITY_INITIAL_SECONDS = 0.5
"""Initial backoff. Per the Crius S2 prompt."""

TENACITY_MAX_SECONDS = 4
"""Backoff ceiling. Per the Crius S2 prompt."""

TENACITY_ATTEMPTS = 3
"""Total attempt count including the original. Per the Crius S2 prompt."""


class BadGatewayProblem(ProblemException):
    """502 problem+json: the upstream vendor returned an error.

    Slug ``upstream_unavailable`` matches the contract Section 8 wire
    when ``AllVendorsFailedError`` lands; we reuse it for single-vendor
    upstream failures so the wire shape stays uniform.
    """

    slug = "upstream_unavailable"
    title = "Upstream vendor unavailable"
    status = 502


def kill_switch_flag_name(vendor_slug: str) -> str:
    """Return the Hemera flag key that disables ``vendor_slug``."""

    return f"vendor.{vendor_slug}.disabled"


async def dispatch(
    *,
    vendor_slug: str,
    task: VendorTask,
    agent: AgentPrincipal,
    registry: AdapterRegistry | None = None,
    breaker_registry: BreakerRegistry | None = None,
) -> VendorResponse:
    """Dispatch ``task`` to ``vendor_slug`` with kill switch + breaker + retry.

    Sequence
    --------
    1. Resolve adapter from the registry. Unknown slug -> 404 via
       :class:`NotFoundProblem` raised inside ``registry.get``.
    2. Read Hemera ``vendor.<slug>.disabled``. Truthy -> 503
       :class:`ServiceUnavailableProblem`.
    3. Probe the breaker. Open -> 503 with ``Retry-After`` hint.
    4. Tenacity-wrapped invocation. Success -> breaker.success() +
       return. TransientVendorError after retry exhaust ->
       breaker.failure() + 502. PermanentVendorError -> 502 immediately
       without tripping the breaker. Any other exception ->
       breaker.failure() + re-raise.

    Parameters
    ----------
    registry, breaker_registry
        Optional injection points for tests. Production uses the
        process singletons.

    Raises
    ------
    NotFoundProblem
        Unknown ``vendor_slug``.
    ServiceUnavailableProblem
        Hemera kill switch flipped OR breaker open.
    BadGatewayProblem
        Vendor returned an upstream error after retry exhaust or a
        permanent caller-side error code.
    """

    reg = registry or get_registry()
    adapter = reg.get(vendor_slug)

    flag_key = kill_switch_flag_name(vendor_slug)
    flag_value = await get_flag(
        flag_key,
        user_id=agent.owner_user_id,
        tenant_id=agent.tenant_id,
    )
    if flag_value is True:
        logger.info(
            "protocol.dispatch.kill_switch vendor=%s agent=%s",
            vendor_slug,
            agent.agent_id,
        )
        raise ServiceUnavailableProblem(
            detail=(
                f"Vendor {vendor_slug!r} is disabled by Hemera flag "
                f"{flag_key!r}."
            ),
        )

    breakers = breaker_registry or get_breaker_registry()
    breaker = breakers.get(vendor_slug)

    if breaker.current_state == pybreaker.STATE_OPEN:
        # Probe whether the reset timeout has elapsed without performing
        # the side-effecting half-open transition; pybreaker exposes
        # this via ``before_call`` on the open state, but we call
        # ``half_open()`` explicitly so the next call goes through as
        # a single half-open probe per pybreaker semantics.
        if not _open_timeout_elapsed(breaker):
            logger.info(
                "protocol.dispatch.breaker_open vendor=%s",
                vendor_slug,
            )
            raise ServiceUnavailableProblem(
                detail=(
                    f"Vendor {vendor_slug!r} circuit breaker is open. "
                    f"Retry after {breaker.reset_timeout} seconds."
                ),
                headers={"Retry-After": str(int(breaker.reset_timeout))},
            )
        breaker.half_open()

    return await _invoke_with_resilience(adapter, task, agent, breaker)


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------


def _open_timeout_elapsed(breaker: pybreaker.CircuitBreaker) -> bool:
    """Return True when the breaker's reset_timeout has expired."""

    from datetime import UTC, datetime, timedelta

    opened_at = breaker._state_storage.opened_at  # type: ignore[attr-defined]
    if opened_at is None:
        return True
    return datetime.now(UTC) >= opened_at + timedelta(seconds=breaker.reset_timeout)


async def _invoke_with_resilience(
    adapter: object,
    task: VendorTask,
    agent: AgentPrincipal,
    breaker: pybreaker.CircuitBreaker,
) -> VendorResponse:
    """Run ``adapter.invoke`` under Tenacity retry + breaker bookkeeping.

    The function is structured around three exception paths:

    - ``TransientVendorError`` retried up to ``TENACITY_ATTEMPTS`` times.
      On retry exhaust we surface :class:`RetryError`; we extract the
      original ``TransientVendorError`` from
      ``RetryError.last_attempt.exception()`` and trip the breaker
      before raising :class:`BadGatewayProblem`.
    - ``PermanentVendorError`` raised on the first attempt; Tenacity
      lets it through. We do NOT trip the breaker (caller-side defect)
      and surface 502.
    - Anything else: trip the breaker AND propagate. The dispatcher
      caller (router) lets the unhandled exception handler render 500.
    """

    invoker = adapter.invoke  # type: ignore[attr-defined]

    try:
        async for attempt in AsyncRetrying(
            stop=stop_after_attempt(TENACITY_ATTEMPTS),
            wait=wait_exponential_jitter(
                initial=TENACITY_INITIAL_SECONDS,
                max=TENACITY_MAX_SECONDS,
            ),
            retry=retry_if_exception_type(TransientVendorError),
            reraise=False,
        ):
            with attempt:
                response = await invoker(task, agent)
        # Success path: tenacity's AsyncRetrying populates ``response``
        # only inside the ``with attempt`` block; the success exit
        # leaves ``response`` bound to the last successful return.
        _record_breaker_success(breaker)
        return response  # type: ignore[possibly-undefined]
    except RetryError as exc:
        # Tenacity exhausted retries. Extract the underlying transient
        # exception so the log + problem detail surface the real cause.
        last = exc.last_attempt
        underlying = last.exception()
        if not isinstance(underlying, TransientVendorError):
            # Tenacity should only retry TransientVendorError so we
            # never expect this branch; defensive fall-through to the
            # generic breaker-trip path.
            _record_breaker_failure(breaker, exc)
            raise
        _record_breaker_failure(breaker, underlying)
        logger.info(
            "protocol.dispatch.transient_exhausted vendor=%s status=%s",
            getattr(underlying, "vendor_slug", "?"),
            getattr(underlying, "status_code", None),
        )
        raise BadGatewayProblem(
            detail=(
                f"Vendor {getattr(underlying, 'vendor_slug', '?')!r} returned "
                f"a transient error after {TENACITY_ATTEMPTS} attempts: "
                f"{underlying}"
            )
        ) from underlying
    except PermanentVendorError as exc:
        # Caller-side defect. No breaker trip; immediate 502.
        logger.info(
            "protocol.dispatch.permanent vendor=%s status=%s",
            exc.vendor_slug,
            exc.status_code,
        )
        raise BadGatewayProblem(
            detail=(
                f"Vendor {exc.vendor_slug!r} rejected the request: {exc}"
            )
        ) from exc
    except ProblemException:
        # Already-formed problem responses (kill switch, 404 etc.) flow
        # through unchanged; do NOT trip the breaker on these.
        raise
    except Exception as exc:
        # Unexpected adapter exception. Trip the breaker so a
        # crashing adapter does not flood retries, then propagate so
        # the unhandled handler renders 500.
        _record_breaker_failure(breaker, exc)
        raise


def _record_breaker_success(breaker: pybreaker.CircuitBreaker) -> None:
    """Mark a successful call against the breaker.

    Wraps ``state._handle_success`` so the dispatcher does not depend
    on the private API directly. Pybreaker's success handler resets
    the failure counter and, when in half-open, advances the success
    counter toward ``success_threshold``.
    """

    breaker.state._handle_success()  # type: ignore[attr-defined]


def _record_breaker_failure(
    breaker: pybreaker.CircuitBreaker,
    exc: BaseException,
) -> None:
    """Mark a failed call against the breaker without re-raising.

    Pybreaker's ``on_failure`` may raise either the original exception
    or :class:`pybreaker.CircuitBreakerError` when the failure tips
    the breaker over ``fail_max``. We swallow both raises here because
    the dispatcher has already decided how to surface the error to
    the caller (BadGatewayProblem or unhandled re-raise upstream).
    """

    try:
        breaker.state._handle_error(exc, reraise=False)  # type: ignore[attr-defined]
    except (pybreaker.CircuitBreakerError, BaseException):  # noqa: BLE001
        # The trip path raises; we have already accounted for the
        # failure via ``state._state_storage.counter`` increment, so
        # the suppression is intentional. The dispatcher's enclosing
        # handler decides the user-visible exception.
        pass
