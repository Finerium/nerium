"""MA session state machine.

Owner: Kratos (W2 S1).

Implements the seven-value status enum (locked per Kratos Strategic
Decision Hard-Stop "Adding 8th MA session status beyond 7 locked") and
the transition guard ``assert_transition`` used by the dispatcher + CRUD
router to prevent illegal state hops (e.g. ``completed -> running``).

State machine graph (from ``agent_orchestration_runtime.contract.md``
Section 4.1):

::

    queued
      | pre-call gates pass
      v
    running ---------------------+
      |                          |
      | Anthropic stream opens   |
      v                          |
    streaming --- cancel ------> cancelled (terminal)
      |       |
      |       +-- budget flip --> budget_capped (terminal)
      |       +-- error --------> failed (terminal)
      |
      +-- stop_reason == end_turn -> completed (terminal)

Terminal states are: ``completed``, ``cancelled``, ``failed``,
``budget_capped``. Any attempt to transition FROM a terminal state
raises :class:`InvalidTransitionError`.

Contract references
-------------------
- ``docs/contracts/agent_orchestration_runtime.contract.md`` Section 4.1
  state machine (the fig above mirrors the contract diagram).
- ``docs/contracts/postgres_multi_tenant.contract.md`` Section 3.4 enum
  ``ma_session_status`` values.
- ``docs/contracts/ma_session_lifecycle.contract.md`` Section 3.1 DB
  column ``status ma_session_status NOT NULL DEFAULT 'queued'``.

Design notes
------------
- Pure module: no DB, no Redis. Dispatcher calls ``assert_transition``
  before updating the row so invalid hops surface as HTTP 500 not as a
  silent data-corruption bug.
- :class:`MASessionStatus` is a ``str`` Enum so the value round-trips
  through Postgres ``text`` / enum casts without a custom codec.
- :func:`valid_next_states` is exposed for test discovery + router
  helpers that need to compute "what can I become".
"""

from __future__ import annotations

from enum import Enum
from typing import Final, FrozenSet, Mapping


class MASessionStatus(str, Enum):
    """The seven locked MA session status values.

    Kept as a string enum so Pydantic + asyncpg serialise cleanly to the
    Postgres ``ma_session_status`` enum without a custom codec.

    Locked per ``agent_orchestration_runtime.contract.md`` Section 4.1
    plus Kratos prompt "Strategic Decision Hard-Stops": adding an eighth
    value requires a superseding contract bump + ferry to V4/V5.
    """

    QUEUED = "queued"
    RUNNING = "running"
    STREAMING = "streaming"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    FAILED = "failed"
    BUDGET_CAPPED = "budget_capped"


# Canonical transition map. Keyed by ``from`` state; value is the
# frozenset of legal ``to`` states. Terminal states map to the empty
# frozenset so :func:`assert_transition` rejects any hop out.
_TRANSITIONS: Final[Mapping[MASessionStatus, FrozenSet[MASessionStatus]]] = {
    MASessionStatus.QUEUED: frozenset(
        {
            # Pre-call gates passed, dispatcher begins the Claude SDK loop.
            MASessionStatus.RUNNING,
            # Pre-call budget cap tripped (global or tenant) -> short-circuit.
            MASessionStatus.BUDGET_CAPPED,
            # Pre-call cancel raced the dispatcher pick-up.
            MASessionStatus.CANCELLED,
            # Pre-call infra failure (e.g. Claude SDK missing) counts as failed.
            MASessionStatus.FAILED,
        }
    ),
    MASessionStatus.RUNNING: frozenset(
        {
            # Anthropic stream opened; content deltas flowing.
            MASessionStatus.STREAMING,
            # Fast complete for trivial responses with no streamed text (rare
            # but legal per Anthropic Messages API: ``message_stop`` arrives
            # before any ``content_block_delta``).
            MASessionStatus.COMPLETED,
            MASessionStatus.FAILED,
            MASessionStatus.CANCELLED,
            MASessionStatus.BUDGET_CAPPED,
        }
    ),
    MASessionStatus.STREAMING: frozenset(
        {
            MASessionStatus.COMPLETED,
            MASessionStatus.FAILED,
            MASessionStatus.CANCELLED,
            MASessionStatus.BUDGET_CAPPED,
        }
    ),
    # Terminal states: no outbound edges.
    MASessionStatus.COMPLETED: frozenset(),
    MASessionStatus.CANCELLED: frozenset(),
    MASessionStatus.FAILED: frozenset(),
    MASessionStatus.BUDGET_CAPPED: frozenset(),
}

TERMINAL_STATES: Final[FrozenSet[MASessionStatus]] = frozenset(
    {
        MASessionStatus.COMPLETED,
        MASessionStatus.CANCELLED,
        MASessionStatus.FAILED,
        MASessionStatus.BUDGET_CAPPED,
    }
)
"""The four terminal states. Used by CRUD cancel-when-terminal idempotency."""


class InvalidTransitionError(ValueError):
    """Raised when ``assert_transition`` rejects a hop.

    Carries ``from_status`` + ``to_status`` attributes so callers can
    surface a structured log entry + problem+json detail without regex
    parsing the message. Subclass of :class:`ValueError` so call sites
    that only catch "bad input" still work.
    """

    def __init__(
        self, from_status: MASessionStatus, to_status: MASessionStatus
    ) -> None:
        self.from_status = from_status
        self.to_status = to_status
        super().__init__(
            f"Invalid MA session transition: {from_status.value} -> "
            f"{to_status.value}. Legal targets from {from_status.value}: "
            f"{sorted(s.value for s in _TRANSITIONS.get(from_status, frozenset()))}"
        )


def assert_transition(
    from_status: MASessionStatus | str,
    to_status: MASessionStatus | str,
) -> None:
    """Guard the dispatcher + router against illegal status hops.

    Raises :class:`InvalidTransitionError` when the hop is not in the
    canonical transition map. Accepts both :class:`MASessionStatus`
    enum values and their string equivalents so callers that read the
    raw Postgres column do not have to pre-convert.

    Parameters
    ----------
    from_status
        Current ``ma_session.status``.
    to_status
        Desired next status.
    """

    src = _coerce(from_status)
    dst = _coerce(to_status)
    allowed = _TRANSITIONS.get(src, frozenset())
    if dst not in allowed:
        raise InvalidTransitionError(src, dst)


def is_terminal(status: MASessionStatus | str) -> bool:
    """Return ``True`` when ``status`` is one of the four terminal states.

    Used by the CRUD cancel endpoint to return HTTP 200 idempotent
    instead of HTTP 202 when the session has already reached a
    terminal state (per ``ma_session_lifecycle.contract.md`` Section 4.3).
    """

    return _coerce(status) in TERMINAL_STATES


def valid_next_states(status: MASessionStatus | str) -> frozenset[MASessionStatus]:
    """Return the frozenset of legal transitions out of ``status``.

    Returns an empty frozenset for terminal states. Used by tests that
    sweep the transition matrix and by the admin dashboard's future
    "force transition" affordance.
    """

    return _TRANSITIONS.get(_coerce(status), frozenset())


def _coerce(value: MASessionStatus | str) -> MASessionStatus:
    """Return the enum form, accepting either enum or raw string."""

    if isinstance(value, MASessionStatus):
        return value
    try:
        return MASessionStatus(value)
    except ValueError as exc:
        raise InvalidTransitionError(
            from_status=MASessionStatus.QUEUED,  # placeholder for message only
            to_status=MASessionStatus.QUEUED,
        ) from exc


__all__ = [
    "InvalidTransitionError",
    "MASessionStatus",
    "TERMINAL_STATES",
    "assert_transition",
    "is_terminal",
    "valid_next_states",
]
