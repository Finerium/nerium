"""Consent history service.

Owner: Eunomia (W2 NP P6 S1).

Scope
-----
Records user consent grant/revoke events in ``consent_event``. The
table backs three surfaces:

1. ``POST /v1/me/consent``: user toggles a consent slider in the
   settings UI (Session 2 CUT frontend). The endpoint calls
   :func:`record_consent` with the new ``granted`` bool.
2. ``GET /v1/me/consent/history``: paginated read for the account
   settings history view.
3. Signup hook: :func:`record_signup_defaults` seeds the four consent
   types (necessary=True; analytics/marketing/functional=False) so a
   fresh account has an audit trail from day zero.

Consent vocabulary matches the Klaro config namespace:
- ``necessary`` is always granted; user cannot toggle.
- ``functional`` covers session persistence + UI prefs.
- ``analytics`` covers behavioural telemetry (Plausible, Grafana).
- ``marketing`` covers outbound product emails (Pheme campaigns).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal, Optional
from uuid import UUID

from src.backend.db.pool import get_pool
from src.backend.db.tenant import tenant_scoped
from src.backend.errors import ValidationProblem
from src.backend.utils.uuid7 import uuid7

logger = logging.getLogger(__name__)

ConsentType = Literal["analytics", "marketing", "functional", "necessary"]
ConsentSource = Literal["signup", "banner", "settings", "admin", "klaro"]

VALID_CONSENT_TYPES: frozenset[str] = frozenset(
    ("analytics", "marketing", "functional", "necessary")
)
VALID_CONSENT_SOURCES: frozenset[str] = frozenset(
    ("signup", "banner", "settings", "admin", "klaro")
)

DEFAULT_HISTORY_LIMIT: int = 50
MAX_HISTORY_LIMIT: int = 200


@dataclass(frozen=True)
class ConsentEvent:
    """Single consent-history row."""

    id: UUID
    tenant_id: UUID
    user_id: UUID
    consent_type: str
    granted: bool
    source: str
    ip_address: Optional[str]
    user_agent: Optional[str]
    created_at: datetime


async def record_consent(
    *,
    user_id: UUID,
    tenant_id: UUID,
    consent_type: str,
    granted: bool,
    source: str = "banner",
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> ConsentEvent:
    """Append a consent event to ``consent_event``.

    ``source`` defaults to ``"banner"`` so a Klaro-driven banner toggle
    lands correctly without the caller having to spell it out. Necessary
    consent MAY arrive with ``granted=False`` on a signup form that
    rejects the ToS; the helper stores the refusal faithfully so the
    upstream signup flow can decide whether to abort.
    """

    if consent_type not in VALID_CONSENT_TYPES:
        raise ValidationProblem(
            detail=(
                f"consent_type '{consent_type}' is not one of: "
                f"{', '.join(sorted(VALID_CONSENT_TYPES))}."
            ),
        )
    if source not in VALID_CONSENT_SOURCES:
        raise ValidationProblem(
            detail=(
                f"source '{source}' is not one of: "
                f"{', '.join(sorted(VALID_CONSENT_SOURCES))}."
            ),
        )

    new_id = uuid7()
    pool = get_pool()
    async with tenant_scoped(pool, tenant_id) as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO consent_event (
                id, tenant_id, user_id, consent_type, granted,
                source, ip_address, user_agent
            ) VALUES ($1, $2, $3, $4, $5, $6, $7::inet, $8)
            RETURNING id, tenant_id, user_id, consent_type, granted,
                      source, ip_address, user_agent, created_at
            """,
            new_id,
            tenant_id,
            user_id,
            consent_type,
            granted,
            source,
            ip_address,
            user_agent,
        )

    assert row is not None
    logger.info(
        "gdpr.consent.recorded user_id=%s type=%s granted=%s source=%s",
        user_id,
        consent_type,
        granted,
        source,
    )
    return _row_to_event(row)


async def list_consent_history(
    *,
    user_id: UUID,
    tenant_id: UUID,
    limit: int = DEFAULT_HISTORY_LIMIT,
    offset: int = 0,
) -> tuple[list[ConsentEvent], int]:
    """Return ``(events, total)`` for a user's consent history.

    Caller MUST present a tenant-bound request so RLS ensures the user
    cannot read another tenant's rows. The ``tenant_id`` argument is
    forwarded to :func:`tenant_scoped` so the query runs inside a bound
    transaction.
    """

    limit = max(1, min(limit, MAX_HISTORY_LIMIT))
    offset = max(0, offset)

    pool = get_pool()
    async with tenant_scoped(pool, tenant_id) as conn:
        rows = await conn.fetch(
            """
            SELECT id, tenant_id, user_id, consent_type, granted,
                   source, ip_address, user_agent, created_at
            FROM consent_event
            WHERE user_id = $1
            ORDER BY created_at DESC, id DESC
            LIMIT $2 OFFSET $3
            """,
            user_id,
            limit,
            offset,
        )
        total_row = await conn.fetchrow(
            "SELECT COUNT(*)::bigint AS total FROM consent_event WHERE user_id = $1",
            user_id,
        )

    total = int(total_row["total"]) if total_row is not None else 0
    events = [_row_to_event(row) for row in rows]
    return events, total


async def record_signup_defaults(
    *,
    user_id: UUID,
    tenant_id: UUID,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> list[ConsentEvent]:
    """Seed the four consent types at signup.

    Defaults match GDPR Article 7: necessary=True (the site needs it to
    run), everything else=False (opt-in). The caller bumps analytics /
    marketing only after an explicit banner click.
    """

    out: list[ConsentEvent] = []
    for consent_type in ("necessary", "functional", "analytics", "marketing"):
        granted = consent_type == "necessary"
        event = await record_consent(
            user_id=user_id,
            tenant_id=tenant_id,
            consent_type=consent_type,
            granted=granted,
            source="signup",
            ip_address=ip_address,
            user_agent=user_agent,
        )
        out.append(event)
    return out


def _row_to_event(row: Any) -> ConsentEvent:
    ip_raw = row["ip_address"]
    return ConsentEvent(
        id=row["id"],
        tenant_id=row["tenant_id"],
        user_id=row["user_id"],
        consent_type=row["consent_type"],
        granted=bool(row["granted"]),
        source=row["source"],
        ip_address=str(ip_raw) if ip_raw is not None else None,
        user_agent=row["user_agent"],
        created_at=row["created_at"],
    )


__all__ = [
    "ConsentEvent",
    "ConsentSource",
    "ConsentType",
    "DEFAULT_HISTORY_LIMIT",
    "MAX_HISTORY_LIMIT",
    "VALID_CONSENT_SOURCES",
    "VALID_CONSENT_TYPES",
    "list_consent_history",
    "record_consent",
    "record_signup_defaults",
]
