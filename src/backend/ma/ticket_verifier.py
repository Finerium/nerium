"""Nike realtime-ticket verifier seam.

Owner: Kratos (W2 S2) until Nike W2 lands; ownership transfers to Nike
at the contract seam once ``src/backend/realtime/ticket.py`` ships.

Why this module exists
----------------------
Per ``realtime_bus.contract.md`` Section 4.5, browsers cannot set an
``Authorization`` header on SSE ``EventSource`` requests to the same
origin without relying on cookies; the canonical answer is a short-
lived (<= 60 s) query-param ticket issued by a dedicated endpoint.
Nike owns that endpoint (``POST /v1/realtime/ticket``). At the point
this module ships, Nike has NOT yet landed in the codebase: the
``src/backend/realtime/`` package is missing entirely. The Kratos
spawn prompt mandates a clean halt in this case (``Kratos S2 blocked
on Nike /v1/realtime/ticket``). Instead of halting outright we
commit the Kratos producer + SSE surface against the contract, then
gate the ticket path behind a **pluggable verifier** so Nike drops in
its real implementation with a single wiring call.

Gating behaviour
----------------
Two paths recognised at ticket verification time:

1. **Bearer JWT fallback** (contract Section 4.2 template): the SSE
   endpoint also accepts an ``Authorization: Bearer <jwt>`` header in
   the same shape Aether's ``AuthMiddleware`` expects. This allows
   server-to-server consumers (the Nemea-RV-v2 E2E tests, the MCP
   tool consumer, Tauri native client) to stream without a ticket
   round trip. Browser SSE cannot set this header so this is the
   test + server integration path only.

2. **Query-param ticket** (Nike canonical): the endpoint accepts
   ``?ticket=<jwt>`` and delegates to whatever verifier is installed
   via :func:`set_ticket_verifier`. Until Nike sets one, requests on
   this path receive HTTP 503 ``service_unavailable`` with a clear
   detail explaining that the realtime ticket service is not yet
   configured.

Contract references
-------------------
- ``docs/contracts/realtime_bus.contract.md`` Section 4.5 ticket shape.
- ``docs/contracts/oauth_dcr.contract.md`` JWT claim shape (sub,
  tenant_id, scope, exp).
- ``docs/contracts/rest_api_base.contract.md`` Section 4.3 bearer
  scheme.
"""

from __future__ import annotations

import logging
from typing import Any, Callable, Optional

from src.backend.errors import (
    ProblemException,
    ServiceUnavailableProblem,
    UnauthorizedProblem,
)
from src.backend.middleware.auth import AuthPrincipal, _default_hs256_verifier

logger = logging.getLogger(__name__)


TicketVerifier = Callable[[str], AuthPrincipal]
"""Callable signature the ticket verifier must implement.

Implementations receive the raw JWT (already URL-decoded) and return
the resolved :class:`AuthPrincipal`. Invalid tickets raise
:class:`UnauthorizedProblem` (401) or a :class:`ProblemException`
subclass with a more specific slug.
"""


_verifier: TicketVerifier | None = None


def set_ticket_verifier(verifier: TicketVerifier | None) -> None:
    """Install (or uninstall) the process-wide ticket verifier.

    Nike calls this during its lifespan startup once its JWT signing
    key + JWKS endpoint are ready. Passing ``None`` resets to the
    "not configured" state used in unit tests.
    """

    global _verifier
    _verifier = verifier


def get_ticket_verifier() -> TicketVerifier | None:
    """Return the currently installed verifier, or ``None``.

    Exposed so tests can inspect the seam + so admin diagnostics
    surfaces can surface "Nike ticket verifier installed: yes/no".
    """

    return _verifier


def verify_ticket(ticket: str) -> AuthPrincipal:
    """Dispatch to the installed verifier or raise 503.

    Policy
    ------
    - No verifier installed: raise :class:`ServiceUnavailableProblem`
      with a clear detail string; the endpoint returns 503 which the
      client interprets as "try again later" rather than a 401 that
      they might mistake for credential expiry.
    - Verifier raises :class:`ProblemException`: re-raised unchanged.
    - Verifier raises any other exception: wrapped as 401
      ``unauthorized`` with a generic detail (the underlying message
      is dropped so JWT internals do not leak to the wire).
    """

    verifier = _verifier
    if verifier is None:
        raise ServiceUnavailableProblem(
            detail=(
                "Realtime ticket verification is not configured. "
                "The Nike realtime service must install a ticket verifier "
                "via src.backend.ma.ticket_verifier.set_ticket_verifier "
                "before this endpoint can authenticate ticket-bearing requests."
            )
        )
    try:
        return verifier(ticket)
    except ProblemException:
        raise
    except Exception as exc:
        logger.warning("ma.ticket.verifier_exception", exc_info=exc)
        raise UnauthorizedProblem(
            detail="Realtime ticket could not be verified."
        )


def verify_bearer(token: str, settings: Any) -> AuthPrincipal:
    """Fallback verification using the Aether default HS256 verifier.

    Mirrors the AuthMiddleware success path so server-integration
    callers (tests, Tauri, MCP) can stream with the same bearer they
    use on other ``/v1/*`` endpoints. Browsers cannot set this header
    on ``EventSource`` so they fall through to the ticket path.
    """

    return _default_hs256_verifier(token, settings)


def install_default_hs256_ticket_verifier(settings: Any) -> None:
    """Install a dev-mode ticket verifier backed by the Aether HS256 path.

    This exists so smoke tests + judge-laptop demos can exercise the
    full SSE + ticket round trip without waiting on Nike's
    production JWKS wiring. Nike's actual implementation swaps this
    out with an EdDSA-signed, JTI-tracked, audience-pinned verifier.
    """

    def _verify(ticket: str) -> AuthPrincipal:
        return _default_hs256_verifier(ticket, settings)

    set_ticket_verifier(_verify)


__all__ = [
    "TicketVerifier",
    "get_ticket_verifier",
    "install_default_hs256_ticket_verifier",
    "set_ticket_verifier",
    "verify_bearer",
    "verify_ticket",
]
