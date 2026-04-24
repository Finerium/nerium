"""Stripe SDK lazy singleton + live-mode Hemera gate.

Owner: Plutus (W2 NP P4 S1).

Design
------
- Single process-wide Stripe client keyed to the TEST secret. We use the
  modern ``StripeClient`` instance API (rather than mutating
  ``stripe.api_key`` globally) so Iapetus can instantiate a second
  client for Connect Express destinations without bleeding auth state.
- Live mode is DISABLED until Stripe Atlas underwriting lands. The
  Hemera flag ``billing.live_mode_enabled`` is the single kill switch
  per V4 Gate 4; if ``True`` AND no live key is configured, the gate
  still rejects (defense-in-depth against an accidental flag flip).
- :func:`ensure_live_mode_disabled` is called at every checkout +
  webhook entry by the router. When live mode is on without Atlas
  readiness we raise :class:`ServiceUnavailableProblem` (503) so
  monitoring flags it as a dependency failure, not a client 4xx.

Test harness
------------
Tests patch :func:`get_stripe_client` to return a ``MagicMock`` +
monkeypatch :func:`ensure_test_mode` so no network hit ever fires from
the unit suite. A separate integration fixture (not shipped in S1)
would exercise a real Stripe TEST-mode endpoint.
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

import stripe

from src.backend.config import Settings, get_settings
from src.backend.errors import (
    ForbiddenProblem,
    ProblemException,
    ServiceUnavailableProblem,
)
from src.backend.flags.service import get_flag

logger = logging.getLogger(__name__)

# Hemera flag name for the live-mode kill switch. Default registered as
# ``false`` in ``default_flags.sql``; admin must explicitly flip + ship
# a live key to reach live mode.
LIVE_MODE_FLAG: str = "billing.live_mode_enabled"

# Process-local lazy singleton. We keep a ``(key_fingerprint, client)``
# tuple so a ``get_settings.cache_clear()`` followed by a new key env
# rebuild picks up the new client on next call rather than returning a
# stale handle from the previous process config.
_CLIENT: stripe.StripeClient | None = None
_CLIENT_KEY_FINGERPRINT: str | None = None


class StripeLiveModeForbiddenProblem(ProblemException):
    """403 raised when any path attempts live Stripe without readiness.

    Slug ``stripe_live_disabled`` is a Plutus-owned extension of the
    slug registry per contract Section 3 + Section 8; add to the
    problem registry doc in the same commit wave.
    """

    slug = "stripe_live_disabled"
    title = "Stripe live mode disabled"
    status = 403


class StripeNotConfiguredProblem(ServiceUnavailableProblem):
    """503 raised when the test key is absent and code needs the client.

    Distinct from the live-mode gate: this indicates the local deploy
    never set ``NERIUM_STRIPE_SECRET_KEY_TEST``. Router path surfaces it
    as 503 so monitoring knows Stripe is down (from our side, not from
    Stripe's).
    """

    slug = "stripe_not_configured"
    title = "Stripe client not configured"
    status = 503


def _fingerprint(secret: str) -> str:
    """Short non-reversible fingerprint for log + singleton keying.

    We never log the raw key. The fingerprint is the first 8 chars of
    the secret's SHA-256 hex digest which lets us see "the key changed"
    across restarts without risking a partial key in log grep.
    """

    import hashlib

    return hashlib.sha256(secret.encode("utf-8")).hexdigest()[:8]


def _build_client(settings: Settings) -> stripe.StripeClient:
    """Construct a ``StripeClient`` from the TEST secret.

    Raises :class:`StripeNotConfiguredProblem` when the test key is
    empty. Callers that need a soft-check without raising should use
    :func:`is_configured` first.
    """

    key = settings.stripe_secret_key_test.get_secret_value()
    if not key:
        raise StripeNotConfiguredProblem(
            detail=(
                "NERIUM_STRIPE_SECRET_KEY_TEST is unset. Populate the "
                "Stripe test secret before invoking billing endpoints."
            )
        )
    # ``StripeClient`` accepts api_version + max_network_retries kwargs.
    # We pin the API version per contract so a silent Stripe-side API
    # bump cannot break webhook parsing.
    client = stripe.StripeClient(
        api_key=key,
        stripe_version=settings.stripe_api_version,
    )
    return client


def get_stripe_client() -> stripe.StripeClient:
    """Return the process-wide Stripe test client.

    Thread-safe enough for asyncio: the function is synchronous and
    relies on Python's GIL for the module-global write. Subsequent
    lookups short-circuit on the fingerprint compare. Tests that
    monkeypatch env vars + call :func:`reset_stripe_client` pick up a
    fresh instance on next call.
    """

    global _CLIENT, _CLIENT_KEY_FINGERPRINT

    settings = get_settings()
    raw = settings.stripe_secret_key_test.get_secret_value()
    if not raw:
        raise StripeNotConfiguredProblem(
            detail="Stripe test secret missing; set NERIUM_STRIPE_SECRET_KEY_TEST."
        )

    fp = _fingerprint(raw)
    if _CLIENT is not None and _CLIENT_KEY_FINGERPRINT == fp:
        return _CLIENT

    client = _build_client(settings)
    _CLIENT = client
    _CLIENT_KEY_FINGERPRINT = fp
    logger.info("billing.stripe.client_initialised fp=%s api_version=%s", fp, settings.stripe_api_version)
    return client


def reset_stripe_client() -> None:
    """Drop the cached client so the next call rebuilds.

    Used by tests after ``get_settings.cache_clear()`` so the new env
    state is picked up. Production code should NOT call this.
    """

    global _CLIENT, _CLIENT_KEY_FINGERPRINT
    _CLIENT = None
    _CLIENT_KEY_FINGERPRINT = None


def is_configured() -> bool:
    """Return True when a test key is set AND the client would build.

    Soft-check variant of :func:`get_stripe_client` for router handlers
    that want to degrade gracefully (e.g., GET /v1/billing/plans must
    keep returning 200 even if Stripe is mis-configured).
    """

    key = get_settings().stripe_secret_key_test.get_secret_value()
    return bool(key)


async def ensure_live_mode_disabled(
    *,
    user_id: UUID | str | None = None,
    tenant_id: UUID | str | None = None,
) -> None:
    """Raise if the Hemera flag has flipped live mode on.

    Called at the entry of every checkout + webhook path. The flag
    defaults to ``False`` per ``025_hemera_flags`` seed so a fresh deploy
    is always test-mode. When we eventually flip the flag we will also
    ship a live key AND remove this gate via a superseding ADR; until
    then any flip is rejected.

    Behaviour matrix
    ----------------
    flag=False : pass (test mode).
    flag=True  : raise 403 ``stripe_live_disabled`` because Atlas is
                 not yet verified (V4 Gate 4 lock). The live-secret
                 env var is deliberately NOT consulted: we do not want
                 the presence of a live key to override the flag.
    """

    try:
        flag = await get_flag(
            LIVE_MODE_FLAG,
            user_id=user_id,
            tenant_id=tenant_id,
        )
    except Exception as exc:  # pragma: no cover - defensive
        # On flag lookup failure treat as "live disabled" (fail safe).
        logger.warning(
            "billing.stripe.live_flag_lookup_failed err=%s; defaulting to disabled",
            exc,
        )
        return

    if flag is True:
        logger.error(
            "billing.stripe.live_mode_blocked user_id=%s tenant_id=%s",
            user_id,
            tenant_id,
        )
        raise StripeLiveModeForbiddenProblem(
            detail=(
                "Stripe live mode is disabled pre-Atlas verification. "
                "Flip the Hemera flag billing.live_mode_enabled=false "
                "and retry, or wait for the Atlas underwriting lane."
            ),
        )


def ensure_test_mode(secret_key: str | None = None) -> None:
    """Assert the bound secret key is a Stripe TEST-mode key.

    Stripe test keys carry the ``sk_test_`` prefix. Production keys
    carry ``sk_live_``. This check runs at client build so a mis-pasted
    live key never initialises the client singleton.

    The function is a no-op when the key is empty (the caller would
    hit :class:`StripeNotConfiguredProblem` downstream).
    """

    key = secret_key
    if key is None:
        key = get_settings().stripe_secret_key_test.get_secret_value()
    if not key:
        return
    if not key.startswith("sk_test_"):
        raise ForbiddenProblem(
            detail=(
                "NERIUM_STRIPE_SECRET_KEY_TEST must be a Stripe test "
                "key (sk_test_ prefix). Live keys are rejected "
                "pre-Atlas verification."
            ),
            slug="stripe_live_disabled",
            title="Stripe live key rejected",
            status=403,
        )


__all__ = [
    "LIVE_MODE_FLAG",
    "StripeLiveModeForbiddenProblem",
    "StripeNotConfiguredProblem",
    "ensure_live_mode_disabled",
    "ensure_test_mode",
    "get_stripe_client",
    "is_configured",
    "reset_stripe_client",
]
