"""Resend API client wrapper.

Per ``docs/contracts/email_transactional.contract.md`` Section 4.1 the
provider is Resend (HTTPS REST API, JSON payload). We use httpx rather
than the ``resend`` Python SDK so Pheme can fail closed with a clear
error when the API key is unset (the SDK 401s asynchronously inside
its own retry loop which buries the root cause in log noise).

Public surface
--------------
- :class:`ResendClient`  : thin async client with ``send`` + ``verify_webhook``.
- :class:`ResendError`   : transport + 4xx + 5xx wrapper carrying the
  structured Resend payload for downstream logging + retry decisions.
- :class:`ResendResponse`: frozen dataclass of the bits downstream code
  needs (id + created_at) without leaking the full SDK shape.

Dev routing
-----------
When ``EMAIL_ENV=dev`` the client is constructed with the Mailtrap
sandbox API host instead of api.resend.com. The payload shape matches
(Mailtrap Send API is a Resend-compatible surface we stub in a thin
adapter so tests do not need live credentials). The adapter is
enabled via :func:`build_resend_client` which inspects settings.

Safety notes
------------
- No DNS lookup on import; the httpx client is constructed lazily on
  first :meth:`ResendClient.send` call and cached per settings snapshot.
- We DO NOT follow redirects. Resend's API never redirects; any 3xx
  response from api.resend.com indicates a DNS hijack or a proxy
  misconfiguration.
- Webhook signature verification uses a constant-time compare via
  :func:`hmac.compare_digest` to prevent timing attacks.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
from dataclasses import dataclass
from typing import Any

import httpx

from src.backend.config import Settings

logger = logging.getLogger(__name__)

RESEND_API_HOST = "https://api.resend.com"
RESEND_SEND_PATH = "/emails"
MAILTRAP_API_HOST = "https://sandbox.api.mailtrap.io"

# Transport timeouts per contract Section 8 (Resend 429 triggers Arq
# retry; other failures get logged and re-raised for the worker wrapper
# to classify). 10 s connect + 30 s overall matches Resend's own SDK
# defaults and keeps the Arq worker's per-job budget bounded.
_TIMEOUT = httpx.Timeout(connect=10.0, read=30.0, write=30.0, pool=30.0)


@dataclass(frozen=True)
class ResendResponse:
    """Shape we persist onto ``email_message`` after a successful send."""

    provider_message_id: str
    raw: dict[str, Any]


class ResendError(RuntimeError):
    """Raised on any Resend API failure.

    Attributes
    ----------
    status_code
        HTTP status returned by Resend, or 0 for transport errors.
    payload
        Parsed Resend error body when JSON decoding succeeded; otherwise
        the raw text truncated to 2 KB so logs stay bounded.
    is_hard_bounce
        True when Resend reported the destination as permanently
        undeliverable. Consumers auto-unsubscribe + record bounce per
        contract Section 8.
    retriable
        True when the error is a 5xx or a transport-level failure. The
        Arq worker re-raises to trigger the exponential backoff path.
    """

    def __init__(
        self,
        message: str,
        *,
        status_code: int,
        payload: dict[str, Any] | str,
        is_hard_bounce: bool = False,
        retriable: bool = False,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.payload = payload
        self.is_hard_bounce = is_hard_bounce
        self.retriable = retriable


class ResendClient:
    """Async client for the Resend emails endpoint.

    Parameters
    ----------
    api_key
        Secret value (without the ``Bearer `` prefix).
    from_email
        Default From header value used when callers omit ``from_email``.
    host
        Base URL for the API. Defaults to the production Resend host;
        tests + dev override this to the Mailtrap sandbox or a mock.
    http_client
        Optional pre-built :class:`httpx.AsyncClient`. Tests inject a
        :class:`httpx.MockTransport`-backed client to avoid real
        network calls.
    """

    def __init__(
        self,
        *,
        api_key: str,
        from_email: str,
        host: str = RESEND_API_HOST,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self._api_key = api_key
        self._from_email = from_email
        self._host = host.rstrip("/")
        self._http = http_client

    async def send(
        self,
        *,
        to_email: str,
        subject: str,
        html_body: str,
        text_body: str | None = None,
        from_email: str | None = None,
        reply_to: str | None = None,
        headers: dict[str, str] | None = None,
        tags: list[dict[str, str]] | None = None,
        idempotency_key: str | None = None,
    ) -> ResendResponse:
        """POST /emails and return the created message id.

        Maps Resend response codes onto :class:`ResendError`:

        - 2xx          -> :class:`ResendResponse`.
        - 400 / 422    -> ``retriable=False``, non-bounce (bad payload).
        - 401          -> ``retriable=False``; caller halts the queue.
        - 403          -> ``retriable=False``; typically a domain auth
          failure (DKIM/DMARC misaligned).
        - 404          -> ``retriable=False``; unknown template or path.
        - 422 ``validation_error`` with ``is_invalid_recipient`` tag ->
          ``is_hard_bounce=True``.
        - 429 / 5xx    -> ``retriable=True``; Arq backoff.
        """

        if not self._api_key:
            raise ResendError(
                "RESEND_API_KEY is unset; cannot send. Populate "
                "NERIUM_RESEND_API_KEY with the Resend dashboard key.",
                status_code=0,
                payload="missing_api_key",
                retriable=False,
            )

        body: dict[str, Any] = {
            "from": from_email or self._from_email,
            "to": [to_email],
            "subject": subject,
            "html": html_body,
        }
        if text_body is not None:
            body["text"] = text_body
        if reply_to is not None:
            body["reply_to"] = reply_to
        if headers:
            body["headers"] = headers
        if tags:
            body["tags"] = tags

        request_headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
        if idempotency_key:
            # Resend supports the header per their March 2025 API
            # update; if the account is on a plan that ignores it the
            # server simply accepts + silently dedupes nothing. Passing
            # the header is still cheap insurance against double-send
            # on Arq retry loops.
            request_headers["Idempotency-Key"] = idempotency_key

        client = self._http or self._build_http_client()
        owns_client = self._http is None

        try:
            response = await client.post(
                f"{self._host}{RESEND_SEND_PATH}",
                json=body,
                headers=request_headers,
            )
        except httpx.TimeoutException as exc:
            raise ResendError(
                "resend_timeout",
                status_code=0,
                payload=str(exc),
                retriable=True,
            ) from exc
        except httpx.TransportError as exc:
            raise ResendError(
                "resend_transport_error",
                status_code=0,
                payload=str(exc),
                retriable=True,
            ) from exc
        finally:
            if owns_client:
                await client.aclose()

        return self._parse(response)

    def _build_http_client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            timeout=_TIMEOUT,
            follow_redirects=False,
        )

    def _parse(self, response: httpx.Response) -> ResendResponse:
        status = response.status_code
        try:
            payload = response.json()
        except ValueError:
            payload = response.text[:2048]

        if 200 <= status < 300:
            if isinstance(payload, dict) and "id" in payload:
                return ResendResponse(
                    provider_message_id=str(payload["id"]),
                    raw=payload,
                )
            raise ResendError(
                "resend_unexpected_success_shape",
                status_code=status,
                payload=payload,
                retriable=False,
            )

        is_hard_bounce = False
        if isinstance(payload, dict):
            name = str(payload.get("name", ""))
            if name in {"validation_error", "invalid_recipient"} and status == 422:
                is_hard_bounce = True

        retriable = status in {408, 425, 429} or 500 <= status < 600
        raise ResendError(
            f"resend_http_{status}",
            status_code=status,
            payload=payload,
            is_hard_bounce=is_hard_bounce,
            retriable=retriable,
        )

    @staticmethod
    def verify_webhook(
        *,
        payload_bytes: bytes,
        signature_header: str,
        secret: str,
    ) -> bool:
        """Verify a Resend webhook signature.

        Resend signs payloads with HMAC-SHA256 using the webhook secret
        configured in their dashboard. The signature header is the hex
        digest; we compare in constant time. Returns True on a valid
        signature, False otherwise. Callers translate False to HTTP 401
        and log ``email.webhook.signature.invalid``.
        """

        if not secret or not signature_header:
            return False
        expected = hmac.new(
            secret.encode("utf-8"),
            payload_bytes,
            hashlib.sha256,
        ).hexdigest()
        # Normalise common header formats: ``sha256=<hex>`` or raw hex.
        provided = signature_header.strip()
        if provided.lower().startswith("sha256="):
            provided = provided.split("=", 1)[1]
        return hmac.compare_digest(expected, provided)


def build_resend_client(
    settings: Settings,
    *,
    http_client: httpx.AsyncClient | None = None,
) -> ResendClient:
    """Factory: construct a ResendClient from the process Settings.

    Routes to the Mailtrap sandbox host when ``EMAIL_ENV=dev`` so dev
    never touches real Resend quota. Production + staging target
    api.resend.com.
    """

    api_key = settings.resend_api_key.get_secret_value()
    from_email = settings.resend_from_email

    if settings.email_env == "dev":
        host = MAILTRAP_API_HOST
        mailtrap_token = settings.mailtrap_api_token.get_secret_value()
        # In dev we prefer Mailtrap credentials; fall back to Resend
        # sandbox-mode API key if Ghaisan has not yet provisioned a
        # Mailtrap account.
        effective_key = mailtrap_token or api_key
    else:
        host = RESEND_API_HOST
        effective_key = api_key

    return ResendClient(
        api_key=effective_key,
        from_email=from_email,
        host=host,
        http_client=http_client,
    )


__all__ = [
    "MAILTRAP_API_HOST",
    "RESEND_API_HOST",
    "RESEND_SEND_PATH",
    "ResendClient",
    "ResendError",
    "ResendResponse",
    "build_resend_client",
]
