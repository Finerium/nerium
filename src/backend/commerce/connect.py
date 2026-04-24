"""Stripe Connect Express creator onboarding (Iapetus W2 NP P4 S1).

Contract refs:
    - docs/contracts/marketplace_commerce.contract.md Section 4.1-4.2
      (onboard + refresh + status endpoints), Section 4.4 ``account.
      updated`` webhook sync.

Responsibilities
----------------
- :func:`create_or_get_connect_account`: find-or-create the Stripe
  ``Account`` row, persist to ``creator_connect_account``. Idempotent
  on the ``(tenant, user)`` pair so repeat onboard calls return the
  same ``acct_...`` id.
- :func:`create_onboarding_link`: mint a Stripe AccountLink URL that
  the frontend redirects to. Refresh endpoint reuses this helper.
- :func:`sync_account_from_stripe`: pull the current account state
  from Stripe and write it back to the row (charges_enabled,
  payouts_enabled, details_submitted, requirements). Called from the
  webhook on ``account.updated`` and from the status endpoint on
  first read.
- :func:`get_connect_account_by_user`: lookup helper used by the
  purchase flow + review service to resolve the creator's Stripe
  destination id.

Stripe SDK usage
----------------
The Plutus ``get_stripe_client()`` singleton is the authoritative
client. Connect account + link API calls go through the same client
so the test key stays single-threaded. Test-mode guard runs at the
router entry; this module does not re-gate so a cron that calls
:func:`sync_account_from_stripe` without a user context also passes.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

import asyncpg

from src.backend.billing.stripe_client import get_stripe_client
from src.backend.db.pool import get_pool
from src.backend.db.tenant import tenant_scoped
from src.backend.errors import (
    ForbiddenProblem,
    NotFoundProblem,
    ProblemException,
    ServiceUnavailableProblem,
    ValidationProblem,
)
from src.backend.utils.uuid7 import uuid7

logger = logging.getLogger(__name__)


# Problem-JSON slug for the commerce surface. Registered here per the
# Plutus convention of namespacing slugs to the pillar module.
SLUG_CREATOR_NOT_ONBOARDED: str = "marketplace_creator_not_onboarded"
SLUG_CONNECT_NOT_CONFIGURED: str = "marketplace_connect_not_configured"


@dataclass(frozen=True)
class ConnectAccountRow:
    """Projection of ``creator_connect_account``.

    Frozen dataclass rather than pydantic to keep the inner service
    layer free of HTTP serialisation concerns. Router wraps this into
    a pydantic response model.
    """

    id: UUID
    tenant_id: UUID
    user_id: UUID
    stripe_account_id: str
    onboarding_status: str
    charges_enabled: bool
    payouts_enabled: bool
    details_submitted: bool
    requirements: dict[str, Any]
    country: Optional[str]
    default_currency: Optional[str]
    last_synced_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime


class CreatorNotOnboardedProblem(ForbiddenProblem):
    """403 raised when a creator has not completed Connect onboarding.

    Slug namespaced under the marketplace_ prefix per the
    problem-JSON slug registry (contract Section 7).
    """

    slug = SLUG_CREATOR_NOT_ONBOARDED
    title = "Creator Stripe onboarding incomplete"
    status = 403


async def create_or_get_connect_account(
    *,
    tenant_id: UUID,
    user_id: UUID,
    email: Optional[str] = None,
    country: str = "US",
    default_currency: str = "USD",
) -> ConnectAccountRow:
    """Find or create the Connect Express account for a creator.

    Returns the persisted row. Idempotent on ``(tenant_id, user_id)``:
    a second call after onboarding returns the same ``acct_...`` id
    without re-hitting Stripe.

    Parameters
    ----------
    email
        Optional email to seed the Stripe Account. Stripe collects
        the real email during hosted onboarding so this is advisory.
    country
        ISO 3166 alpha-2. Defaults to US. Stripe Connect Express
        requires this at create time; onboarding flow collects the
        real address.
    default_currency
        ISO 4217 alpha-3. Defaults to USD.
    """

    pool = get_pool()
    async with tenant_scoped(pool, tenant_id) as conn:
        existing = await _fetch_by_user(conn, user_id=user_id)
        if existing is not None:
            return existing

        client = get_stripe_client()
        account_params: dict[str, Any] = {
            "type": "express",
            "country": country,
            "default_currency": default_currency.lower(),
            "capabilities": {
                "card_payments": {"requested": True},
                "transfers": {"requested": True},
            },
            "metadata": {
                "nerium_user_id": str(user_id),
                "nerium_tenant_id": str(tenant_id),
            },
        }
        if email:
            account_params["email"] = email

        try:
            stripe_account = client.accounts.create(params=account_params)
        except Exception as exc:  # pragma: no cover - defensive
            logger.exception(
                "commerce.connect.account_create_failed user_id=%s err=%s",
                user_id,
                exc,
            )
            raise ServiceUnavailableProblem(
                detail=(
                    "Stripe Connect account create failed. "
                    "Retry in a moment."
                ),
            ) from exc

        account_id = getattr(stripe_account, "id", None) or stripe_account["id"]
        new_id = uuid7()
        row = await conn.fetchrow(
            """
            INSERT INTO creator_connect_account (
                id, tenant_id, user_id, stripe_account_id,
                onboarding_status, charges_enabled, payouts_enabled,
                details_submitted, requirements, country, default_currency,
                last_synced_at
            )
            VALUES ($1, $2, $3, $4, 'pending', false, false, false,
                    '{}'::jsonb, $5, $6, now())
            ON CONFLICT (user_id) DO NOTHING
            RETURNING *
            """,
            new_id,
            tenant_id,
            user_id,
            account_id,
            country,
            default_currency.upper(),
        )
        if row is None:
            # Race: another request created the row between our SELECT
            # and INSERT. Re-read so the caller sees the winning row.
            existing = await _fetch_by_user(conn, user_id=user_id)
            if existing is None:  # pragma: no cover - defensive
                raise ServiceUnavailableProblem(
                    detail="connect account create race: please retry",
                )
            return existing

        logger.info(
            "commerce.connect.account_created user_id=%s stripe_account=%s",
            user_id,
            account_id,
        )
        return _row_to_dataclass(row)


async def create_onboarding_link(
    *,
    stripe_account_id: str,
    return_url: str,
    refresh_url: str,
) -> dict[str, Any]:
    """Mint a Stripe AccountLink URL for the onboarding flow.

    Parameters
    ----------
    return_url
        Where Stripe redirects the browser on onboarding completion.
    refresh_url
        Where Stripe redirects on link expiry (default 5 min TTL) so
        the frontend can request a fresh link.

    Returns
    -------
    dict
        ``{"url": "...", "expires_at": 1700000000, "created": ...}``.
    """

    client = get_stripe_client()
    try:
        link = client.account_links.create(
            params={
                "account": stripe_account_id,
                "refresh_url": refresh_url,
                "return_url": return_url,
                "type": "account_onboarding",
            }
        )
    except Exception as exc:  # pragma: no cover - defensive
        logger.exception(
            "commerce.connect.link_create_failed stripe_account=%s err=%s",
            stripe_account_id,
            exc,
        )
        raise ServiceUnavailableProblem(
            detail="Stripe AccountLink create failed. Retry in a moment.",
        ) from exc

    return {
        "url": getattr(link, "url", None) or link.get("url"),
        "expires_at": getattr(link, "expires_at", None) or link.get("expires_at"),
        "created": getattr(link, "created", None) or link.get("created"),
    }


async def sync_account_from_stripe(
    *,
    stripe_account_id: str,
    tenant_id: Optional[UUID] = None,
) -> Optional[ConnectAccountRow]:
    """Pull the live Stripe Account state and persist to our row.

    Called on ``account.updated`` webhook + on the status read path.
    Returns the updated row. If the account id is not found in our
    DB we log and return None (the webhook path treats that as a
    benign no-op).

    When ``tenant_id`` is None we bypass the tenant scope so the
    webhook + admin paths can sync without a principal.
    """

    client = get_stripe_client()
    try:
        account = client.accounts.retrieve(stripe_account_id)
    except Exception as exc:  # pragma: no cover - defensive
        logger.exception(
            "commerce.connect.account_retrieve_failed acct=%s err=%s",
            stripe_account_id,
            exc,
        )
        raise ServiceUnavailableProblem(
            detail=(
                "Stripe Connect account retrieve failed. "
                "The onboarding view is temporarily degraded."
            ),
        ) from exc

    charges_enabled = bool(_attr(account, "charges_enabled"))
    payouts_enabled = bool(_attr(account, "payouts_enabled"))
    details_submitted = bool(_attr(account, "details_submitted"))
    requirements_raw = _attr(account, "requirements")
    requirements = (
        requirements_raw.to_dict_recursive()  # type: ignore[attr-defined]
        if hasattr(requirements_raw, "to_dict_recursive")
        else dict(requirements_raw or {})
    )
    country_val = _attr(account, "country")
    currency_val = _attr(account, "default_currency")

    # Derive an onboarding_status hint for UI consumers. Stripe does
    # not return a single status field; we infer from the flags.
    if charges_enabled and payouts_enabled and details_submitted:
        status = "verified"
    elif details_submitted:
        status = "incomplete"
    else:
        status = "pending"

    pool = get_pool()
    if tenant_id is None:
        # Webhook path: use the pool directly without RLS scoping.
        async with pool.acquire() as conn:
            row = await _update_account_row(
                conn,
                stripe_account_id=stripe_account_id,
                onboarding_status=status,
                charges_enabled=charges_enabled,
                payouts_enabled=payouts_enabled,
                details_submitted=details_submitted,
                requirements=requirements,
                country=country_val,
                default_currency=(currency_val or "").upper() if currency_val else None,
            )
    else:
        async with tenant_scoped(pool, tenant_id) as conn:
            row = await _update_account_row(
                conn,
                stripe_account_id=stripe_account_id,
                onboarding_status=status,
                charges_enabled=charges_enabled,
                payouts_enabled=payouts_enabled,
                details_submitted=details_submitted,
                requirements=requirements,
                country=country_val,
                default_currency=(currency_val or "").upper() if currency_val else None,
            )

    if row is None:
        logger.info(
            "commerce.connect.sync_unknown_account stripe_account=%s",
            stripe_account_id,
        )
        return None
    logger.info(
        "commerce.connect.synced stripe_account=%s status=%s charges=%s payouts=%s",
        stripe_account_id,
        status,
        charges_enabled,
        payouts_enabled,
    )
    return _row_to_dataclass(row)


async def get_connect_account_by_user(
    *,
    tenant_id: UUID,
    user_id: UUID,
) -> Optional[ConnectAccountRow]:
    """Return the caller's ``creator_connect_account`` row or None."""

    pool = get_pool()
    async with tenant_scoped(pool, tenant_id) as conn:
        return await _fetch_by_user(conn, user_id=user_id)


async def get_connect_account_by_stripe_id(
    *,
    stripe_account_id: str,
) -> Optional[ConnectAccountRow]:
    """Global lookup by Stripe id (used from the webhook path)."""

    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM creator_connect_account WHERE stripe_account_id = $1",
            stripe_account_id,
        )
        if row is None:
            return None
        return _row_to_dataclass(row)


async def require_onboarded_creator(
    *,
    tenant_id: UUID,
    creator_user_id: UUID,
) -> ConnectAccountRow:
    """Return the creator's Connect account or raise 403.

    Called from the purchase flow pre-condition check. Raises
    :class:`CreatorNotOnboardedProblem` when the creator has not
    completed Stripe onboarding (``charges_enabled=false``).
    """

    account = await get_connect_account_by_user(
        tenant_id=tenant_id, user_id=creator_user_id
    )
    if account is None:
        raise CreatorNotOnboardedProblem(
            detail=(
                "This listing's creator has not started Stripe Connect "
                "onboarding. Purchases are disabled until they finish."
            ),
        )
    if not account.charges_enabled:
        raise CreatorNotOnboardedProblem(
            detail=(
                "This listing's creator has not completed Stripe Connect "
                "onboarding (charges_enabled=false). Purchases disabled."
            ),
        )
    return account


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------


_ACCOUNT_COLUMNS: str = (
    "id, tenant_id, user_id, stripe_account_id, onboarding_status, "
    "charges_enabled, payouts_enabled, details_submitted, requirements, "
    "country, default_currency, last_synced_at, created_at, updated_at"
)


async def _fetch_by_user(
    conn: asyncpg.Connection,
    *,
    user_id: UUID,
) -> Optional[ConnectAccountRow]:
    row = await conn.fetchrow(
        f"SELECT {_ACCOUNT_COLUMNS} FROM creator_connect_account WHERE user_id = $1",
        user_id,
    )
    if row is None:
        return None
    return _row_to_dataclass(row)


async def _update_account_row(
    conn: asyncpg.Connection,
    *,
    stripe_account_id: str,
    onboarding_status: str,
    charges_enabled: bool,
    payouts_enabled: bool,
    details_submitted: bool,
    requirements: dict[str, Any],
    country: Optional[str],
    default_currency: Optional[str],
) -> Optional[Any]:
    return await conn.fetchrow(
        f"""
        UPDATE creator_connect_account
        SET
            onboarding_status = $2,
            charges_enabled = $3,
            payouts_enabled = $4,
            details_submitted = $5,
            requirements = $6::jsonb,
            country = COALESCE($7, country),
            default_currency = COALESCE($8, default_currency),
            last_synced_at = now()
        WHERE stripe_account_id = $1
        RETURNING {_ACCOUNT_COLUMNS}
        """,
        stripe_account_id,
        onboarding_status,
        charges_enabled,
        payouts_enabled,
        details_submitted,
        json.dumps(requirements or {}),
        country,
        default_currency,
    )


def _row_to_dataclass(row: Any) -> ConnectAccountRow:
    requirements_raw = row["requirements"]
    if isinstance(requirements_raw, str):
        try:
            requirements = json.loads(requirements_raw)
        except ValueError:
            requirements = {}
    elif isinstance(requirements_raw, dict):
        requirements = requirements_raw
    else:
        requirements = {}

    return ConnectAccountRow(
        id=row["id"],
        tenant_id=row["tenant_id"],
        user_id=row["user_id"],
        stripe_account_id=row["stripe_account_id"],
        onboarding_status=row["onboarding_status"],
        charges_enabled=bool(row["charges_enabled"]),
        payouts_enabled=bool(row["payouts_enabled"]),
        details_submitted=bool(row["details_submitted"]),
        requirements=requirements,
        country=row["country"],
        default_currency=row["default_currency"],
        last_synced_at=row["last_synced_at"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _attr(obj: Any, key: str) -> Any:
    """Return ``obj[key]`` or ``getattr(obj, key)`` whichever works."""

    if isinstance(obj, dict):
        return obj.get(key)
    return getattr(obj, key, None)


__all__ = [
    "ConnectAccountRow",
    "CreatorNotOnboardedProblem",
    "SLUG_CONNECT_NOT_CONFIGURED",
    "SLUG_CREATOR_NOT_ONBOARDED",
    "create_onboarding_link",
    "create_or_get_connect_account",
    "get_connect_account_by_stripe_id",
    "get_connect_account_by_user",
    "require_onboarded_creator",
    "sync_account_from_stripe",
]
