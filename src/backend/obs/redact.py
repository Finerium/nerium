"""Log redaction processor.

Per observability.contract.md Section 4.4, drop or truncate any log field whose
key indicates a secret or a large free-text payload. Applied as the last
structlog processor before JSON rendering, and also referenced by
``error_tracking.scrub_pii`` so GlitchTip events share the same policy.

Design notes
------------
- Case-insensitive key match. We lower-case each key once per event.
- The sensitive set covers headers, cookies, tokens, API keys, passwords.
- Large-text truncation targets prompt and description fields that can spike
  log line size beyond the Grafana Cloud Free tier 50 GB quota.
- Redaction is conservative by default. Consumer agents that need to log a
  raw value for audit (for example: webhook signature verification) must use
  an explicit opt-out structured logger binding, not a bypass of this module.
"""

from __future__ import annotations

from typing import Any, Mapping

SENSITIVE_KEYS: frozenset[str] = frozenset(
    {
        "api_key",
        "apikey",
        "password",
        "passwd",
        "secret",
        "token",
        "access_token",
        "refresh_token",
        "id_token",
        "client_secret",
        "authorization",
        "cookie",
        "set_cookie",
        "session",
        "session_token",
        "csrf_token",
        "stripe_signature",
        "webhook_signature",
        "x_signature",
        "private_key",
        "signing_key",
        "encryption_key",
        "kek",
        "dek",
    }
)

LARGE_TEXT_KEYS: frozenset[str] = frozenset(
    {
        "prompt",
        "system_prompt",
        "user_prompt",
        "body",
        "content",
        "long_description",
        "description_long",
        "raw_response",
        "raw_request",
        "stacktrace",
    }
)

TRUNCATE_AT = 80
REDACTED_VALUE = "[REDACTED]"
TRUNCATED_SUFFIX = "...[truncated]"


def _truncate(value: str) -> str:
    if len(value) <= TRUNCATE_AT:
        return value
    return value[:TRUNCATE_AT] + TRUNCATED_SUFFIX


def redact_sensitive(
    _logger: Any, _method_name: str, event_dict: dict[str, Any]
) -> dict[str, Any]:
    """structlog processor: strip secrets, truncate large text, in place.

    structlog passes the event dict by reference. We mutate and return it to
    match the processor contract (see structlog.types.Processor).
    """

    for key in list(event_dict.keys()):
        lowered = key.lower()
        if lowered in SENSITIVE_KEYS:
            event_dict[key] = REDACTED_VALUE
            continue
        if lowered in LARGE_TEXT_KEYS:
            value = event_dict[key]
            if isinstance(value, str):
                event_dict[key] = _truncate(value)
            elif isinstance(value, (list, tuple)):
                event_dict[key] = [
                    _truncate(v) if isinstance(v, str) else v for v in value
                ]
    return event_dict


def scrub_mapping(data: Mapping[str, Any]) -> dict[str, Any]:
    """Return a new dict with the same redaction policy applied.

    Used by ``error_tracking.scrub_pii`` on Sentry or GlitchTip events where
    the SDK hands us a plain dict (not a structlog event dict).
    """

    result = dict(data)
    return redact_sensitive(None, "", result)
