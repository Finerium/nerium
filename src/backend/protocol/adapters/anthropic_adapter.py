"""Anthropic Messages API chat adapter.

Owner: Crius (W2 NP P5 Session 1).

Uses ``httpx`` directly (already a project dependency) rather than
pulling the ``anthropic`` SDK into ``pyproject.toml``. The wire
contract is the same: ``POST {base_url}/v1/messages`` with ``x-api-key``
and ``anthropic-version`` headers. Keeping the call inline lets us
ship S1 without adding a new dependency that the S2 envelope-
encryption + circuit-breaker work would also have to wrap.

S1 scope
--------
Chat only. The Anthropic catalogue row's ``adapter_type='chat'``
matches; embedding / image_gen / tts catalogue rows for Anthropic do
not exist in S1. Calling :meth:`invoke` with any non-chat task type
raises :class:`ValueError` so misrouted requests fail fast in tests.

Authentication
--------------
``ANTHROPIC_API_KEY`` is read from the FastAPI :class:`Settings`
loader (``src.backend.config``). Empty key -> :class:`RuntimeError`
at invocation time so a misconfigured environment surfaces a clear
500 in the router rather than a confusing 401 from the upstream.

Model selection
---------------
Default model is ``claude-opus-4-7`` per the pack prompt's
"Built with Opus 4.7" mandate. ``task.metadata['model']`` overrides
on a per-request basis; the override is forwarded as-is to the
Anthropic API which rejects unknown ids upstream. We intentionally
do not validate model names against a hard-coded allowlist so newly
released models work without a code change.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from src.backend.config import get_settings
from src.backend.protocol.adapters.base import (
    BaseVendorAdapter,
    VendorResponse,
    VendorTask,
)
from src.backend.protocol.exceptions import (
    TransientVendorError,
    classify_http_status,
)
from src.backend.registry.identity import AgentPrincipal

__all__ = ["AnthropicAdapter"]

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "claude-opus-4-7"
"""Default model id when ``task.metadata['model']`` is unset.

Locked to Opus 4.7 per the hackathon "Built with Opus 4.7" framing.
Overrideable per-request via ``task.metadata.model`` for tests that
want to exercise an older model id.
"""

DEFAULT_BASE_URL = "https://api.anthropic.com"
DEFAULT_API_VERSION = "2023-06-01"
DEFAULT_MAX_TOKENS = 1024
DEFAULT_TIMEOUT_SECONDS = 30.0


class AnthropicAdapter(BaseVendorAdapter):
    """Live Anthropic Messages API call (chat task type).

    Output shape::

        {
            "role": "assistant",
            "content": "<text reply>"
        }

    Usage shape mirrors Anthropic's wire format::

        {
            "input_tokens": <int>,
            "output_tokens": <int>
        }

    Constructor arguments are exposed for tests so a ``MockTransport``
    can intercept the HTTP call without monkeypatching ``httpx``
    globally.
    """

    vendor_slug: str = "anthropic"

    def __init__(
        self,
        *,
        api_key: str | None = None,
        base_url: str = DEFAULT_BASE_URL,
        api_version: str = DEFAULT_API_VERSION,
        timeout: float = DEFAULT_TIMEOUT_SECONDS,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        # Resolve the key lazily at call time when not injected so
        # tests can construct an instance without provisioning the
        # env var ahead of time.
        self._api_key_override = api_key
        self._base_url = base_url.rstrip("/")
        self._api_version = api_version
        self._timeout = timeout
        self._transport = transport

    async def invoke(
        self,
        task: VendorTask,
        agent: AgentPrincipal,
    ) -> VendorResponse:
        """Dispatch a chat task to the Anthropic Messages API."""

        if task.task_type != "chat":
            raise ValueError(
                f"AnthropicAdapter S1 supports task_type='chat'; "
                f"received task_type={task.task_type!r}"
            )

        api_key = self._resolve_api_key()
        model = str(task.metadata.get("model") or DEFAULT_MODEL)

        body = self._build_messages_body(task, model)

        headers = {
            "x-api-key": api_key,
            "anthropic-version": self._api_version,
            "content-type": "application/json",
        }

        # ``transport`` injection lets the network adapter test hit a
        # ``MockTransport`` while production paths use the default
        # asyncio transport. We pass ``transport=None`` explicitly when
        # not injected so httpx's default applies.
        client_kwargs: dict[str, Any] = {
            "timeout": self._timeout,
            "base_url": self._base_url,
        }
        if self._transport is not None:
            client_kwargs["transport"] = self._transport

        try:
            async with httpx.AsyncClient(**client_kwargs) as client:
                resp = await client.post(
                    "/v1/messages",
                    json=body,
                    headers=headers,
                )
        except httpx.RequestError as exc:
            # Transport-level failure (DNS, TLS, connection reset).
            # Always retryable per the Crius dispatcher's Tenacity
            # policy; the breaker counts the eventual exhaustion.
            logger.warning(
                "anthropic.adapter.transport_error err=%s",
                exc,
            )
            raise TransientVendorError(
                f"Anthropic transport error: {exc}",
                vendor_slug=self.vendor_slug,
                status_code=None,
            ) from exc

        if resp.status_code >= 400:
            # Body is logged at WARN; the upstream error message is
            # safe to forward (Anthropic does not echo the request key).
            logger.warning(
                "anthropic.adapter.upstream_error status=%s body=%s",
                resp.status_code,
                resp.text[:512],
            )
            error_cls = classify_http_status(resp.status_code)
            raise error_cls(
                f"Anthropic Messages API returned HTTP {resp.status_code}",
                vendor_slug=self.vendor_slug,
                status_code=resp.status_code,
            )

        return self._parse_response(resp.json(), task.task_type, model)

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _resolve_api_key(self) -> str:
        """Return the API key from the override or from ``Settings``."""

        if self._api_key_override is not None:
            return self._api_key_override

        settings = get_settings()
        key = settings.anthropic_api_key.get_secret_value()
        if not key:
            raise RuntimeError(
                "ANTHROPIC_API_KEY is empty; AnthropicAdapter cannot "
                "dispatch. Set the env var or use the stub vendor."
            )
        return key

    def _build_messages_body(
        self,
        task: VendorTask,
        model: str,
    ) -> dict[str, Any]:
        """Translate the inbound payload into a Messages API body."""

        payload = task.payload or {}

        messages = payload.get("messages")
        if not messages:
            # Convenience: callers may send a single user prompt under
            # ``payload.input_text`` and we promote it to a one-message
            # conversation. This is a documented S1 shortcut so demo
            # surfaces stay simple.
            text = str(payload.get("input_text") or payload.get("prompt") or "")
            if not text:
                raise ValueError(
                    "AnthropicAdapter requires payload.messages (list) "
                    "or payload.input_text (str)."
                )
            messages = [{"role": "user", "content": text}]

        max_tokens = int(payload.get("max_tokens", DEFAULT_MAX_TOKENS))
        body: dict[str, Any] = {
            "model": model,
            "max_tokens": max_tokens,
            "messages": messages,
        }

        # Optional fields forwarded only when the caller set them so we
        # do not accidentally override Anthropic's defaults with zero.
        if "temperature" in payload:
            body["temperature"] = payload["temperature"]
        if "system" in payload:
            body["system"] = payload["system"]

        return body

    def _parse_response(
        self,
        raw: dict[str, Any],
        task_type: str,
        model: str,
    ) -> VendorResponse:
        """Convert the Messages API JSON into a :class:`VendorResponse`."""

        # Anthropic returns ``content: [{type, text, ...}, ...]``.
        # Concatenate ``type=='text'`` blocks for the canonical
        # ``output.content`` string. Future tool-use payloads land on
        # ``metadata`` rather than ``output`` so the chat surface stays
        # text-only at S1.
        content_blocks = raw.get("content") or []
        text_pieces = [
            block.get("text", "")
            for block in content_blocks
            if isinstance(block, dict) and block.get("type") == "text"
        ]
        content_text = "".join(text_pieces)

        usage_raw = raw.get("usage") or {}
        usage = {
            "input_tokens": int(usage_raw.get("input_tokens", 0)),
            "output_tokens": int(usage_raw.get("output_tokens", 0)),
        }

        metadata = {
            "model": str(raw.get("model") or model),
            "anthropic_message_id": str(raw.get("id") or ""),
            "stop_reason": str(raw.get("stop_reason") or ""),
        }

        return VendorResponse(
            vendor_slug=self.vendor_slug,
            task_type=task_type,
            output={"role": "assistant", "content": content_text},
            usage=usage,
            metadata=metadata,
        )
