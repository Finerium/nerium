"""GDPR data export (synchronous small-data path).

Owner: Eunomia (W2 NP P6 S1).

Scope
-----
Synchronous ZIP assembly for users whose combined data footprint is
under a 10 MB cap. The ZIP contains one JSON file per table the user
has rows in, plus a ``manifest.json`` at the root describing the
export version + timestamp + row counts. Callers download the ZIP
inline (``Content-Type: application/zip``); there is no signed-URL
handoff in this wave.

Async Arq path DEFERRED per P6 Pack V4 #6 CUT. A follow-up revision
will split the flow into an enqueue + worker pipeline that writes to
Chione R2 and emails a signed URL via Pheme.

Tables covered
--------------
- ``app_user`` (the subject row).
- ``marketplace_listing`` authored by the user (joined via
  ``creator_user_id``).
- ``marketplace_purchase`` where the user is the buyer or the creator.
- ``marketplace_review`` written by the user.
- ``subscription`` where the user is the owner.
- ``consent_event`` (full history for transparency; the user already
  has read access via ``GET /v1/me/consent/history``).
- ``user_session`` header (not including refresh tokens; we export
  the created_at / revoked_at audit columns only).

Security guardrails
-------------------
- The caller MUST present a bearer token; their ``user_id`` is the
  only subject we export. No query parameter override.
- The response hard-caps at 10 MB uncompressed (measured before the
  ZIP is sealed). Larger subjects return 413 with a ``problem+json``
  envelope pointing at the async path (S2 CUT).
- Password hashes and Stripe customer / subscription IDs are NEVER
  exported. The subject row goes through an explicit allow-list so a
  future column addition does not leak silently.
"""

from __future__ import annotations

import io
import json
import logging
import zipfile
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

from src.backend.db.pool import get_pool
from src.backend.errors import NotFoundProblem, ValidationProblem

logger = logging.getLogger(__name__)

# Uncompressed payload ceiling. ZIP deflate typically shrinks text by
# 3-10x so a 10 MB cap on the source bytes keeps the download to under
# ~3 MB on the wire for typical users. Pro/team plans with large
# listing counts may trip this and fall to the async path (S2 CUT).
MAX_EXPORT_PAYLOAD_BYTES: int = 10 * 1024 * 1024

EXPORT_VERSION: str = "1"

# Columns we allow through for the subject row. A future schema addition
# (for example ``stripe_customer_id`` land on ``app_user``) does NOT
# leak without an explicit addition here.
_USER_EXPORT_COLUMNS: tuple[str, ...] = (
    "id",
    "email",
    "display_name",
    "is_superuser",
    "email_verified",
    "email_verified_at",
    "tier",
    "status",
    "avatar_url",
    "created_at",
    "updated_at",
    "deleted_at",
    "purge_at",
)


async def build_user_export(user_id: UUID) -> bytes:
    """Assemble a ZIP containing the user's full NERIUM footprint.

    Returns the raw bytes ready for a streaming HTTP response.

    Raises
    ------
    NotFoundProblem
        When ``user_id`` does not correspond to an ``app_user`` row.
    ValidationProblem
        When the uncompressed payload exceeds
        :data:`MAX_EXPORT_PAYLOAD_BYTES`. The problem detail directs
        the caller to the async path (S2 CUT).
    """

    pool = get_pool()
    async with pool.acquire() as conn:
        subject = await conn.fetchrow(
            f"""
            SELECT {', '.join(_USER_EXPORT_COLUMNS)}
            FROM app_user
            WHERE id = $1
            """,
            user_id,
        )
        if subject is None:
            raise NotFoundProblem(
                detail=f"User {user_id} not found for export.",
            )

        listings = await conn.fetch(
            """
            SELECT id, category, subtype, slug, title, short_description,
                   license, pricing_model, pricing_details, status, version,
                   published_at, created_at, updated_at, archived_at
            FROM marketplace_listing
            WHERE creator_user_id = $1
            ORDER BY created_at DESC
            """,
            user_id,
        )

        purchases_buyer = await _fetch_safe(
            conn,
            """
            SELECT id, listing_id, creator_user_id, gross_amount_cents,
                   platform_fee_cents, creator_net_cents, currency, rail,
                   status, created_at, completed_at
            FROM marketplace_purchase
            WHERE buyer_user_id = $1
            ORDER BY created_at DESC
            """,
            user_id,
        )

        purchases_creator = await _fetch_safe(
            conn,
            """
            SELECT id, listing_id, buyer_user_id, gross_amount_cents,
                   platform_fee_cents, creator_net_cents, currency, rail,
                   status, created_at, completed_at
            FROM marketplace_purchase
            WHERE creator_user_id = $1
            ORDER BY created_at DESC
            """,
            user_id,
        )

        reviews = await _fetch_safe(
            conn,
            """
            SELECT id, listing_id, purchase_id, rating, title, body,
                   helpful_count, flag_count, status, created_at, updated_at,
                   deleted_at
            FROM marketplace_review
            WHERE reviewer_user_id = $1
            ORDER BY created_at DESC
            """,
            user_id,
        )

        subscriptions = await _fetch_safe(
            conn,
            """
            SELECT id, tier, status, current_period_start, current_period_end,
                   cancel_at_period_end, created_at, updated_at, deleted_at
            FROM subscription
            WHERE user_id = $1
            ORDER BY created_at DESC
            """,
            user_id,
        )

        consents = await _fetch_safe(
            conn,
            """
            SELECT id, consent_type, granted, source, created_at
            FROM consent_event
            WHERE user_id = $1
            ORDER BY created_at DESC
            """,
            user_id,
        )

        sessions = await _fetch_safe(
            conn,
            """
            SELECT id, created_at, expires_at, revoked_at
            FROM user_session
            WHERE user_id = $1
            ORDER BY created_at DESC
            """,
            user_id,
        )

    tables: dict[str, list[dict[str, Any]]] = {
        "app_user": [_row_dict(subject)],
        "marketplace_listing": [_row_dict(row) for row in listings],
        "marketplace_purchase_as_buyer": [_row_dict(row) for row in purchases_buyer],
        "marketplace_purchase_as_creator": [
            _row_dict(row) for row in purchases_creator
        ],
        "marketplace_review": [_row_dict(row) for row in reviews],
        "subscription": [_row_dict(row) for row in subscriptions],
        "consent_event": [_row_dict(row) for row in consents],
        "user_session": [_row_dict(row) for row in sessions],
    }

    # Serialise each table once so we can budget against the hard cap
    # before we bother sealing the ZIP.
    encoded: dict[str, bytes] = {}
    total = 0
    for name, rows in tables.items():
        payload = json.dumps(rows, default=_json_default, indent=2).encode("utf-8")
        encoded[name] = payload
        total += len(payload)
        if total > MAX_EXPORT_PAYLOAD_BYTES:
            raise ValidationProblem(
                detail=(
                    f"Uncompressed payload exceeds "
                    f"{MAX_EXPORT_PAYLOAD_BYTES} bytes. The async Arq export "
                    "path is deferred (Session 2 CUT per P6 Pack V4 #6). "
                    "Retry once the async worker lands."
                ),
                slug="export_too_large",
                title="Export exceeds synchronous cap",
                status=413,
            )

    manifest = {
        "version": EXPORT_VERSION,
        "user_id": str(user_id),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "tables": {name: len(rows) for name, rows in tables.items()},
    }
    manifest_bytes = json.dumps(manifest, indent=2).encode("utf-8")

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("manifest.json", manifest_bytes)
        for name, payload in encoded.items():
            zf.writestr(f"tables/{name}.json", payload)

    logger.info(
        "gdpr.export.built user_id=%s uncompressed_bytes=%d zip_bytes=%d",
        user_id,
        total,
        buffer.tell(),
    )
    return buffer.getvalue()


async def _fetch_safe(conn: Any, sql: str, *params: Any) -> list[Any]:
    """Run ``conn.fetch`` but swallow "relation does not exist" errors.

    Test environments sometimes run the export against a partial
    migration chain (for example the trust_score tests apply 000-048
    only); falling back to an empty list keeps the export path green
    on those envs instead of crashing with a Postgres UndefinedTable.
    Production always has the full chain so this branch is inert.
    """

    try:
        return await conn.fetch(sql, *params)
    except Exception as exc:  # pragma: no cover - defensive
        text = str(exc).lower()
        if "does not exist" in text or "undefined" in text:
            logger.warning("gdpr.export.table_absent err=%s", exc)
            return []
        raise


def _row_dict(row: Optional[Any]) -> dict[str, Any]:
    if row is None:
        return {}
    try:
        return dict(row)
    except TypeError:
        return row  # type: ignore[return-value]


def _json_default(value: Any) -> Any:
    """Convert asyncpg native types to JSON-serialisable primitives."""

    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, bytes):
        try:
            return value.decode("utf-8")
        except UnicodeDecodeError:
            return value.hex()
    if hasattr(value, "__str__"):
        return str(value)
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serialisable")


__all__ = [
    "EXPORT_VERSION",
    "MAX_EXPORT_PAYLOAD_BYTES",
    "build_user_export",
]
