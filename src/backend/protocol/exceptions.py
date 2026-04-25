"""Crius dispatcher domain exceptions.

Owner: Crius (W2 NP P5 Session 2).

Two kinds matter for the retry + circuit breaker plumbing in
:mod:`src.backend.protocol.dispatcher`:

- :class:`TransientVendorError`: an upstream failure that may succeed
  if retried (HTTP 429, 5xx, transport error). Tenacity retries this
  family with exponential jitter; pybreaker counts the eventual
  exhaustion against the failure window.
- :class:`PermanentVendorError`: an upstream failure that will not
  recover with a retry (HTTP 4xx other than 429, malformed request).
  Tenacity does NOT retry this family; pybreaker DOES NOT trip on it
  either, because it is a caller-side defect rather than a vendor
  health signal.

Concrete adapter implementations raise these exceptions so the
dispatcher's policy (retry vs not, breaker vs not) is decided uniformly
across vendors. Adapters must NOT raise generic ``RuntimeError`` for
upstream failures going forward; the S1 AnthropicAdapter already maps
HTTP errors to ``RuntimeError`` and the S2 dispatcher upgrade re-maps
those to the appropriate subclass via :func:`classify_http_status`.
"""

from __future__ import annotations

__all__ = [
    "PermanentVendorError",
    "TransientVendorError",
    "VendorError",
    "classify_http_status",
]


class VendorError(Exception):
    """Base class for vendor-side dispatch failures.

    Carrying a ``vendor_slug`` lets the dispatcher emit structured logs
    + circuit breaker decisions without re-deriving the slug from the
    exception's repr. The ``status_code`` is None for transport failures
    (DNS, TLS, connection reset) and an int for HTTP-level errors.
    """

    def __init__(
        self,
        message: str,
        *,
        vendor_slug: str,
        status_code: int | None = None,
    ) -> None:
        super().__init__(message)
        self.vendor_slug = vendor_slug
        self.status_code = status_code


class TransientVendorError(VendorError):
    """Retryable upstream failure.

    Raised on:
    - HTTP 429 (rate limit; retry with exponential backoff).
    - HTTP 5xx (server-side, may recover on retry).
    - Transport failures (timeout, connection reset, DNS).

    Tenacity retries this class; the circuit breaker counts the
    eventual exhaustion (after retries) as one failure event.
    """


class PermanentVendorError(VendorError):
    """Non-retryable upstream failure.

    Raised on:
    - HTTP 400, 401, 403, 404, 422 (caller-side defect; retry will not
      change the outcome).
    - Adapter-side validation errors (unsupported task_type, malformed
      payload).

    Tenacity does NOT retry; the circuit breaker does NOT trip. The
    dispatcher returns 502 immediately with the upstream's status code
    embedded in the problem+json detail.
    """


def classify_http_status(status_code: int) -> type[VendorError]:
    """Return :class:`TransientVendorError` or :class:`PermanentVendorError`.

    Heuristic
    ---------
    - 429 -> Transient (rate limit; retry per Retry-After).
    - 5xx -> Transient (server-side fault).
    - 408 -> Transient (request timeout, often transient).
    - everything else -> Permanent.

    Adapters call this when they have an HTTP status code in hand; the
    transport-error path constructs :class:`TransientVendorError`
    directly without going through the classifier.
    """

    if status_code == 408 or status_code == 429:
        return TransientVendorError
    if 500 <= status_code < 600:
        return TransientVendorError
    return PermanentVendorError
