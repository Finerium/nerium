"""Unsubscribe HMAC tokens + opt-out persistence.

Per ``docs/contracts/email_transactional.contract.md`` Section 4.3 every
transactional email carries a one-click unsubscribe link in the footer
AND a ``List-Unsubscribe`` header pair (HTTPS + mailto) per RFC 8058.
The link resolves to ``POST /v1/email/unsubscribe`` which verifies the
HMAC and inserts a row into ``email_unsubscribe``.

Token shape
-----------
The token is a Base64URL-encoded JSON payload plus an HMAC-SHA256
signature over the payload. Layout::

    token = b64url(payload_json) + '.' + b64url(hmac_digest)

    payload_json = {
        "e": "<email>",             # target recipient
        "c": "<category>",          # marketplace | billing | system_alert | security
        "v": 1,                     # schema version
        "t": <unix_ts>,             # issued-at (seconds)
    }

Why not JWT
-----------
JWT would have worked; we ship a lighter signed-dict so Pheme does not
introduce ``python-jose`` purely for email opt-outs (JWT lib is
already present via Aether's auth module, but the extra surface area
and claim ambiguity are not worth it for a 2-field token).

Security notes
--------------
- Signature uses ``hmac.compare_digest`` for constant-time compare.
- Payload ``t`` (issued-at) is validated to be within the last 180 days
  so a leaked footer link cannot be replayed indefinitely. Users who
  want to unsubscribe after the window re-request a fresh token via
  the account settings UI.
- The secret is derived from ``settings.secret_key`` combined with a
  namespace string so an unsubscribe token cannot be replayed as a
  CSRF token on an unrelated endpoint.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import time
from dataclasses import dataclass
from urllib.parse import urlencode
from uuid import UUID

from src.backend.config import Settings, get_settings
from src.backend.db.pool import get_pool
from src.backend.utils.uuid7 import uuid7

logger = logging.getLogger(__name__)

TOKEN_VERSION = 1
TOKEN_MAX_AGE_SECONDS = 180 * 24 * 3600  # 180 days
_HMAC_NAMESPACE = b"nerium.email.unsubscribe.v1"


@dataclass(frozen=True)
class UnsubscribePayload:
    """Parsed token contents."""

    email: str
    category: str
    issued_at: int


class InvalidUnsubscribeToken(ValueError):
    """Raised when a token fails signature, shape, or age verification."""


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64url_decode(encoded: str) -> bytes:
    padding = "=" * (-len(encoded) % 4)
    return base64.urlsafe_b64decode(encoded + padding)


def _derive_secret(settings: Settings) -> bytes:
    """Derive the HMAC key from the app secret + a fixed namespace.

    HKDF would be overkill for a 2-field token; we use plain HMAC of
    the namespace with the secret as the key, which yields a 32-byte
    uniform derived key suitable for HMAC-SHA256.
    """

    base = settings.secret_key.get_secret_value().encode("utf-8")
    return hmac.new(base, _HMAC_NAMESPACE, hashlib.sha256).digest()


def build_unsubscribe_token(
    *,
    email: str,
    category: str,
    settings: Settings | None = None,
    issued_at: int | None = None,
) -> str:
    """Build a signed opt-out token for ``(email, category)``.

    ``issued_at`` is exposed for tests; production callers omit it so
    the function stamps ``int(time.time())``.
    """

    resolved = settings or get_settings()
    payload = {
        "e": email.strip().lower(),
        "c": category,
        "v": TOKEN_VERSION,
        "t": int(issued_at if issued_at is not None else time.time()),
    }
    payload_json = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    mac = hmac.new(_derive_secret(resolved), payload_json, hashlib.sha256).digest()
    return f"{_b64url_encode(payload_json)}.{_b64url_encode(mac)}"


def verify_unsubscribe_token(
    token: str,
    *,
    settings: Settings | None = None,
    now_ts: int | None = None,
) -> UnsubscribePayload:
    """Verify the HMAC + age and return the decoded payload.

    Raises
    ------
    InvalidUnsubscribeToken
        On shape, signature, version, or age failure.
    """

    resolved = settings or get_settings()
    if not token or "." not in token:
        raise InvalidUnsubscribeToken("malformed_token")
    try:
        payload_b64, mac_b64 = token.split(".", 1)
        payload_bytes = _b64url_decode(payload_b64)
        provided_mac = _b64url_decode(mac_b64)
    except (ValueError, base64.binascii.Error) as exc:
        raise InvalidUnsubscribeToken("decode_error") from exc

    expected_mac = hmac.new(
        _derive_secret(resolved),
        payload_bytes,
        hashlib.sha256,
    ).digest()
    if not hmac.compare_digest(expected_mac, provided_mac):
        raise InvalidUnsubscribeToken("signature_mismatch")

    try:
        payload = json.loads(payload_bytes.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise InvalidUnsubscribeToken("payload_decode_error") from exc

    if payload.get("v") != TOKEN_VERSION:
        raise InvalidUnsubscribeToken("unsupported_token_version")

    email = payload.get("e")
    category = payload.get("c")
    issued_at = payload.get("t")
    if not isinstance(email, str) or not email:
        raise InvalidUnsubscribeToken("missing_email")
    if not isinstance(category, str) or not category:
        raise InvalidUnsubscribeToken("missing_category")
    if not isinstance(issued_at, int):
        raise InvalidUnsubscribeToken("missing_issued_at")

    ts_now = now_ts if now_ts is not None else int(time.time())
    age = ts_now - issued_at
    if age < 0:
        # Tolerate small clock skew but reject tokens from > 5 min in
        # the future which would otherwise extend the replay window.
        if -age > 300:
            raise InvalidUnsubscribeToken("token_from_future")
    elif age > TOKEN_MAX_AGE_SECONDS:
        raise InvalidUnsubscribeToken("token_expired")

    return UnsubscribePayload(email=email, category=category, issued_at=issued_at)


def build_unsubscribe_url(
    *,
    email: str,
    category: str,
    settings: Settings | None = None,
) -> str:
    """Return the absolute URL to embed in email footers + List-Unsubscribe.

    Uses :func:`build_unsubscribe_token` and prefixes the configured
    ``email_unsubscribe_base_url``.
    """

    resolved = settings or get_settings()
    token = build_unsubscribe_token(
        email=email,
        category=category,
        settings=resolved,
    )
    qs = urlencode({"token": token})
    base = resolved.email_unsubscribe_base_url.rstrip("/")
    return f"{base}/unsubscribe?{qs}"


def build_list_unsubscribe_headers(
    *,
    email: str,
    category: str,
    settings: Settings | None = None,
) -> dict[str, str]:
    """Return the two RFC 8058 headers for one-click compliance.

    ``List-Unsubscribe`` carries an HTTPS link + mailto pair.
    ``List-Unsubscribe-Post`` signals Gmail + Yahoo that the HTTPS
    endpoint accepts a one-click POST body.
    """

    url = build_unsubscribe_url(
        email=email,
        category=category,
        settings=settings,
    )
    return {
        "List-Unsubscribe": f"<{url}>, <mailto:unsubscribe@nerium.com?subject=unsubscribe>",
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    }


# ---------------------------------------------------------------------------
# DB surface
# ---------------------------------------------------------------------------


async def is_unsubscribed(email: str, category: str) -> bool:
    """Return True when the address has opted out of ``category`` or globally.

    A row in ``email_unsubscribe`` with an empty ``categories`` array
    indicates a GLOBAL opt-out: the address refuses all transactional
    mail that respects opt-outs (security + billing-critical still
    flow through per RFC 8058 + CAN-SPAM narrow definitions, gated by
    the template's ``critical`` flag upstream).
    """

    try:
        pool = get_pool()
    except RuntimeError:
        logger.debug("email.unsubscribe.check_no_pool")
        return False

    query = (
        "SELECT categories FROM email_unsubscribe WHERE email = $1 LIMIT 1"
    )
    async with pool.acquire() as conn:
        row = await conn.fetchrow(query, email.strip().lower())
    if row is None:
        return False
    categories = row["categories"] or []
    if not categories:
        return True
    return category in categories


async def record_unsubscribe(
    *,
    email: str,
    category: str,
    reason: str | None = None,
    source: str = "link_click",
) -> UUID:
    """Upsert an opt-out row and return the row id.

    ``source`` values (logged via Selene):
    - ``link_click``   : user clicked the footer link.
    - ``auto_bounce``  : hard bounce auto-unsubscribe.
    - ``complaint``    : Resend ``email.complained`` webhook.
    - ``admin_action`` : Eunomia admin UI.

    Idempotent: if the row exists we append ``category`` to the
    existing ``categories`` array and refresh ``unsubscribed_at``.
    """

    normalised = email.strip().lower()

    try:
        pool = get_pool()
    except RuntimeError as exc:
        raise RuntimeError(
            "record_unsubscribe called before pool initialization"
        ) from exc

    row_id = uuid7()
    upsert = (
        "INSERT INTO email_unsubscribe (id, email, categories, reason) "
        "VALUES ($1, $2, ARRAY[$3]::text[], $4) "
        "ON CONFLICT (email) DO UPDATE SET "
        "  categories = (SELECT ARRAY(SELECT DISTINCT unnest("
        "      email_unsubscribe.categories || EXCLUDED.categories"
        "  ))), "
        "  reason = COALESCE(EXCLUDED.reason, email_unsubscribe.reason), "
        "  unsubscribed_at = now() "
        "RETURNING id"
    )
    async with pool.acquire() as conn:
        existing_id = await conn.fetchval(upsert, row_id, normalised, category, reason)

    logger.info(
        "email.unsubscribe.recorded email=%s category=%s source=%s",
        normalised,
        category,
        source,
    )
    return existing_id if isinstance(existing_id, UUID) else UUID(str(existing_id))


__all__ = [
    "InvalidUnsubscribeToken",
    "TOKEN_MAX_AGE_SECONDS",
    "TOKEN_VERSION",
    "UnsubscribePayload",
    "build_list_unsubscribe_headers",
    "build_unsubscribe_token",
    "build_unsubscribe_url",
    "is_unsubscribed",
    "record_unsubscribe",
    "verify_unsubscribe_token",
]
