"""Per-vendor pybreaker circuit breaker registry.

Owner: Crius (W2 NP P5 Session 2).

Wraps :class:`pybreaker.CircuitBreaker` with a slug-keyed registry so
the dispatcher can ask for "the breaker for vendor X" without owning
state itself. Configuration matches the Crius agent spec defaults:

- ``fail_max=5`` consecutive failures -> circuit opens.
- ``reset_timeout=30`` seconds -> circuit half-opens.
- ``success_threshold=2`` consecutive successes in half-open -> closes.

State semantics
---------------
- ``closed``: traffic flows. Failures increment ``fail_counter`` toward
  ``fail_max``; a single success resets the counter.
- ``open``: every call raises :class:`pybreaker.CircuitBreakerError`
  immediately. The dispatcher converts that into a 503 problem+json.
- ``half_open``: a single probe call is allowed through. Success
  increments ``success_counter`` toward ``success_threshold``;
  failure flips back to open and resets the timer.

S1 ferry deferral fulfilled
---------------------------
The S1 dispatcher noted "S2 ferry-deferred: pybreaker circuit breaker
around adapter.invoke" + "Tenacity retry with exponential jitter on
transient errors". This module + the dispatcher integration in
:mod:`src.backend.protocol.dispatcher` deliver both.

Cross-worker state
------------------
This S2 implementation keeps state per-process. The Pythia contract
Section 3.3 calls for Redis pub/sub propagation of state changes; that
is the post-S2 hardening described in
``docs/contracts/vendor_adapter.contract.md`` Section 4.4. Per-process
state is sufficient for the hackathon submission because:

- Each Hetzner pod is single-replica during demo.
- Failure budget is small enough that 30 s drift between hypothetical
  replicas does not break the user-visible promise.

The post-hackathon refactor adds Redis-backed pub/sub on this module
without changing the public interface.
"""

from __future__ import annotations

import logging
from threading import Lock

import pybreaker

__all__ = [
    "BreakerRegistry",
    "build_breaker",
    "get_breaker_registry",
    "reset_breaker_registry_for_tests",
]

logger = logging.getLogger(__name__)

DEFAULT_FAIL_MAX = 5
"""Five consecutive failures -> open. Per the Crius agent spec."""

DEFAULT_RESET_TIMEOUT_SECONDS = 30
"""Half-open probe after 30 s in open state."""

DEFAULT_SUCCESS_THRESHOLD = 2
"""Two consecutive half-open successes -> close."""


def build_breaker(
    vendor_slug: str,
    *,
    fail_max: int = DEFAULT_FAIL_MAX,
    reset_timeout: int = DEFAULT_RESET_TIMEOUT_SECONDS,
    success_threshold: int = DEFAULT_SUCCESS_THRESHOLD,
) -> pybreaker.CircuitBreaker:
    """Construct a :class:`pybreaker.CircuitBreaker` named after ``vendor_slug``.

    Naming the breaker is purely cosmetic (pybreaker uses ``name`` in
    its log lines). The registry below is the structural lookup.
    """

    return pybreaker.CircuitBreaker(
        fail_max=fail_max,
        reset_timeout=reset_timeout,
        success_threshold=success_threshold,
        name=f"crius.{vendor_slug}",
    )


class BreakerRegistry:
    """Slug-keyed map of :class:`pybreaker.CircuitBreaker` instances.

    Lazy-instantiating: the first :meth:`get` for a given slug builds
    the breaker with the default thresholds; subsequent calls return
    the same instance so state persists across requests inside the
    process. Tests construct their own :class:`BreakerRegistry` via
    :func:`reset_breaker_registry_for_tests` so per-test failure
    budgets stay isolated.
    """

    def __init__(
        self,
        *,
        fail_max: int = DEFAULT_FAIL_MAX,
        reset_timeout: int = DEFAULT_RESET_TIMEOUT_SECONDS,
        success_threshold: int = DEFAULT_SUCCESS_THRESHOLD,
    ) -> None:
        self._fail_max = fail_max
        self._reset_timeout = reset_timeout
        self._success_threshold = success_threshold
        self._by_slug: dict[str, pybreaker.CircuitBreaker] = {}
        self._lock = Lock()

    def get(self, vendor_slug: str) -> pybreaker.CircuitBreaker:
        """Return the breaker for ``vendor_slug``, building it if needed."""

        breaker = self._by_slug.get(vendor_slug)
        if breaker is not None:
            return breaker
        with self._lock:
            breaker = self._by_slug.get(vendor_slug)
            if breaker is None:
                breaker = build_breaker(
                    vendor_slug,
                    fail_max=self._fail_max,
                    reset_timeout=self._reset_timeout,
                    success_threshold=self._success_threshold,
                )
                self._by_slug[vendor_slug] = breaker
                logger.info(
                    "protocol.breaker.bootstrap vendor=%s fail_max=%d reset=%ds threshold=%d",
                    vendor_slug,
                    self._fail_max,
                    self._reset_timeout,
                    self._success_threshold,
                )
        return breaker

    def state(self, vendor_slug: str) -> str:
        """Return the breaker's current state name (closed / open / half_open).

        Defaults to ``closed`` when no breaker exists yet so admin
        readers see a uniform default rather than KeyError.
        """

        breaker = self._by_slug.get(vendor_slug)
        if breaker is None:
            return "closed"
        return str(breaker.current_state)

    def all_slugs(self) -> list[str]:
        """Return every slug for which a breaker has been instantiated."""

        return list(self._by_slug.keys())


_registry_singleton: BreakerRegistry | None = None
_registry_lock = Lock()


def get_breaker_registry() -> BreakerRegistry:
    """Return the process-wide :class:`BreakerRegistry` singleton."""

    global _registry_singleton
    if _registry_singleton is None:
        with _registry_lock:
            if _registry_singleton is None:
                _registry_singleton = BreakerRegistry()
    return _registry_singleton


def reset_breaker_registry_for_tests() -> None:
    """Drop the singleton so the next access rebuilds with fresh state."""

    global _registry_singleton
    with _registry_lock:
        _registry_singleton = None
