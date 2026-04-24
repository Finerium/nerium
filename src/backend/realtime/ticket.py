"""Realtime JWT ticket primitive (Session 1 stub).

Owner: Nike (W2 NP P3 S1).

S1 ships the verifier surface only. The full mint flow (
``POST /v1/realtime/ticket`` + JTI replay-protection set + EdDSA key
rotation hook) lands in S2 per spawn directive. Browsers cannot set
``Authorization`` headers on WebSocket upgrades, so the verifier path
here is the canonical browser auth route.

S1 verification policy (per spawn directive)
--------------------------------------------
Trivial: signed HS256 JWT issued by the Aether secret key (the same
``settings.secret_key`` Aether's :class:`AuthMiddleware` consumes). The
ticket MUST carry ``sub``, ``tenant_id``, ``exp`` claims; ``exp`` is
checked locally; signature failure / missing claims raise
:class:`UnauthorizedProblem`. S2 swaps in the EdDSA verifier + replay
store and issues live tickets via the mint endpoint.

We deliberately reuse :func:`src.backend.middleware.auth._default_hs256_verifier`
so the S1 wire shape is identical to the bearer fallback Kratos installed
through :mod:`src.backend.ma.ticket_verifier`. When S2 lands, Nike
overrides the installed verifier via ``set_realtime_verifier`` and the
Kratos MA SSE path picks up the upgrade automatically because Kratos'
seam delegates to the same callable.

S2 expansion seams (TODO markers in this file)
----------------------------------------------
- ``mint_ticket`` will materialise a 60 s ticket with audience
  ``wss://nerium.com/v1/realtime/ws`` plus a 22-char JTI nonce, persist
  the JTI in Redis with TTL = ``exp + 60 s``.
- ``verify_ticket_with_replay_check`` will look up the JTI in Redis and
  reject reuse via :class:`UnauthorizedProblem` slug ``ticket_reused``.
- The router endpoint will live at ``src/backend/routers/v1/realtime/
  ticket.py`` per ``realtime_bus.contract.md`` Section 4.5.

Contract references
-------------------
- ``docs/contracts/realtime_bus.contract.md`` Section 4.5 ticket shape.
- ``docs/contracts/oauth_dcr.contract.md`` JWT claim names.
- ``docs/contracts/rest_api_base.contract.md`` Section 4.3 bearer scheme.
"""

from __future__ import annotations

import logging
from typing import Callable

from src.backend.config import Settings, get_settings
from src.backend.errors import UnauthorizedProblem
from src.backend.middleware.auth import AuthPrincipal, _default_hs256_verifier

logger = logging.getLogger(__name__)


RealtimeTicketVerifier = Callable[[str, Settings], AuthPrincipal]
"""Callable signature for the realtime ticket verifier.

Mirrors :data:`src.backend.middleware.auth.TokenVerifier` so Nike can
hand its verifier to ``ma.ticket_verifier.set_ticket_verifier`` without
adapting shapes when S2 wires the mint flow.
"""


_verifier: RealtimeTicketVerifier | None = None
"""Process-wide installed verifier. ``None`` = use the default HS256
fallback so unit tests + the S1 stub path keep working."""


def set_realtime_verifier(verifier: RealtimeTicketVerifier | None) -> None:
    """Install the realtime verifier. Pass ``None`` to reset.

    S2 calls this from the FastAPI lifespan hook once the mint flow
    is live so all subsequent ticket validations route through the new
    EdDSA + JTI replay check pipeline.
    """

    global _verifier
    _verifier = verifier


def get_realtime_verifier() -> RealtimeTicketVerifier:
    """Return the installed verifier or the default HS256 fallback."""

    if _verifier is not None:
        return _verifier
    return _default_hs256_verifier


def verify_ticket(
    raw: str | None,
    *,
    settings: Settings | None = None,
) -> AuthPrincipal:
    """Validate a realtime ticket and return the principal.

    Parameters
    ----------
    raw
        URL-decoded JWT carried in the WebSocket query string. ``None``
        or empty raises :class:`UnauthorizedProblem`.
    settings
        Optional settings override; tests + the S2 mint flow may pass an
        explicit instance to avoid touching the lru-cached default.

    Behaviour
    ---------
    - Missing ticket: 401 with detail ``ticket_missing``.
    - Verifier raises :class:`UnauthorizedProblem`: re-raised unchanged.
    - Verifier raises any other exception: wrapped in 401 with detail
      ``ticket_invalid`` so internal JWT errors do not leak to the wire.

    The S1 stub does NOT enforce audience (the contract sets
    ``aud=wss://nerium.com/ws/realtime``); S2 hardens this once the mint
    endpoint is live and tickets carry the audience claim by default.
    """

    if not raw:
        raise UnauthorizedProblem(detail="ticket_missing")

    cfg = settings or get_settings()
    verifier = get_realtime_verifier()
    try:
        return verifier(raw, cfg)
    except UnauthorizedProblem:
        raise
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("realtime.ticket.verifier_exception", exc_info=exc)
        raise UnauthorizedProblem(detail="ticket_invalid")


def verify_ticket_optional(
    raw: str | None,
    *,
    settings: Settings | None = None,
) -> AuthPrincipal | None:
    """Variant that swallows missing-ticket case and returns ``None``.

    Useful for endpoints that want to fall back to a bearer header when
    a ticket is absent (the SSE shape Kratos already implements).
    """

    if not raw:
        return None
    return verify_ticket(raw, settings=settings)


__all__ = [
    "RealtimeTicketVerifier",
    "get_realtime_verifier",
    "set_realtime_verifier",
    "verify_ticket",
    "verify_ticket_optional",
]
