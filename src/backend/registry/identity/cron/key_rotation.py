"""Tethys agent identity Ed25519 key rotation cron + admin worker.

Owner: Tethys (W2 NP P5 Session 2 deferred, T4).

Two surfaces live in this module:

1. ``tethys_key_rotation_sweep`` :class:`arq.cron.CronJob` body. Runs
   every Sunday at 03:00 UTC. Walks the ``agent_identity`` table for
   every ``status='active'`` row whose ``created_at`` is older than
   :data:`ROTATION_AGE_THRESHOLD_DAYS`. For each candidate it generates
   a fresh Ed25519 keypair, marks the old key ``status='retiring'``
   with ``retires_at = now() + GRACE_WINDOW_DAYS`` so existing
   signature verifications keep working through the grace window, and
   inserts the new key as a fresh ``agent_identity`` row sharing the
   same ``owner_user_id`` + ``tenant_id`` + ``display_name``. Pheme
   emits a ``key_rotation_alert`` template per identity owner with
   the old + new fingerprints + ``retires_at`` so external verifiers
   can re-pin within the grace window.

2. ``rotate_single_agent`` Arq job (also exposed for direct in-process
   call) that powers the ``POST /v1/identity/agents/{agent_id}/rotate``
   admin endpoint. Same rotation primitives as the cron sweep but
   targets a single ``agent_id``, returns the new fingerprint preview
   for the 202 response, and rejects rotation when the active key is
   newer than :data:`ROTATION_RECENT_GUARD_DAYS` (idempotent guard;
   raises :class:`RotationTooRecentError`).

Why a separate module + dedicated cron file
-------------------------------------------
The existing P5 Session 1 sibling files (``crypto`` / ``service`` /
``jwt_edd`` / ``middleware``) describe the active + revoked surface
only. The contract scaffold pre-allocated ``retires_at`` on the
``agent_identity`` table at migration 037 specifically so this S2
deferred module could land additively without a schema change.

Email + cron wiring follow the conventions Aether established at
``src.backend.workers.arq_worker.register_cron_job`` (see
``src.backend.flags.ttl_sweep`` for the canonical example) and
``src.backend.email.send.send`` (Pheme transactional template
dispatch). The ``key_rotation_alert`` template is already registered
in ``src.backend.email.templates`` so this module just calls
:func:`pheme_send` with the correct props payload.

Spawn-directive deviations from the agent_identity contract
-----------------------------------------------------------
- ``GRACE_WINDOW_DAYS = 7`` rather than the contract's default 14d
  per the T4 spawn directive Section "Scope, item 1" + the spawn's
  19-item self-check Section "3. Old key marked retiring (not
  deleted) with retires_at = now + 7d UTC". The contract's
  ``retires_at`` column is bytes-compatible with either value.
- Server-generated keypair on rotation (instead of contract Section
  4.2's continuity-signature dance) per the spawn directive's
  "generates new Ed25519 keypair via PyNaCl" wording. This matches
  the existing P1 ``register_identity`` POST handler which also
  generates server-side per the threat model documented at
  ``crypto.generate_ed25519_keypair`` + the one-time private PEM
  return shape.

Contract refs
-------------
- ``docs/contracts/agent_identity.contract.md`` Section 4.2 rotation
  semantics, Section 5 ``registry.identity.key_rotated`` audit log.
- ``docs/contracts/email_transactional.contract.md`` Section 3.2
  ``key_rotation_alert`` template definition.
- T4 spawn prompt Sections "Scope" + "Self-check 19/19".
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from arq.cron import cron

from src.backend.db.pool import get_pool
from src.backend.email.send import send as pheme_send
from src.backend.registry.identity.crypto import (
    generate_ed25519_keypair,
    public_pem_to_raw_bytes,
)
from src.backend.utils.uuid7 import uuid7
from src.backend.workers.arq_worker import register_cron_job, register_job

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------


ROTATION_AGE_THRESHOLD_DAYS: int = 90
"""Active keys older than this become rotation candidates in the sweep.

The contract's open question Section 10 recommends 90d for platform
identities; the spawn directive Section "Scope item 1" hardcodes
90d for every active row.
"""


GRACE_WINDOW_DAYS: int = 7
"""Days the retiring key keeps verifying signatures before revocation.

Set per the T4 spawn directive (overrides the agent_identity contract
default of 14d for this scope). External verifiers + downstream cached
JWT bearers have this window to swap to the new public PEM before the
old key is rejected.
"""


ROTATION_RECENT_GUARD_DAYS: int = 7
"""Idempotent guard for the admin rotate endpoint.

Repeated POSTs against the rotate endpoint within this window return
HTTP 409 ``rotation_too_recent`` rather than spawning duplicate
keypairs. Keeps the audit log + Pheme outbox tidy when an operator
double-clicks the button.
"""


PHEME_TEMPLATE_NAME: str = "key_rotation_alert"
"""Pheme transactional template registered in the email registry.

Defined in ``src.backend.email.templates`` with ``critical=True``
+ category ``security`` so the warmup cap does not throttle this
notice.
"""


CRON_SCHEDULE_NAME: str = "tethys.key_rotation_sweep"
"""Arq job + observability tag. Stable across restarts so dashboards
can pivot on it."""


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


class RotationTooRecentError(RuntimeError):
    """Raised when the admin endpoint refuses a too-recent rotation.

    The router catches this and translates to HTTP 409 with the
    contract's error code ``rotation_too_recent`` so clients can
    distinguish it from generic 500s.
    """

    def __init__(self, *, agent_id: UUID, age_days: float) -> None:
        super().__init__(
            f"agent_id={agent_id} active key is only {age_days:.2f} days "
            f"old; rotation guarded for {ROTATION_RECENT_GUARD_DAYS} days."
        )
        self.agent_id = agent_id
        self.age_days = age_days


class RotationTargetMissingError(LookupError):
    """Raised when the admin endpoint targets an agent_id that does
    not exist or is already revoked."""

    def __init__(self, *, agent_id: UUID) -> None:
        super().__init__(
            f"agent_id={agent_id} not found or already revoked."
        )
        self.agent_id = agent_id


# ---------------------------------------------------------------------------
# Result dataclass
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class RotationOutcome:
    """Single-agent rotation result returned from the worker function.

    The router renders this into the 202 response; the cron sweep
    stitches a list of outcomes into the structured log line at the
    end of the run.
    """

    agent_id: UUID
    """Agent identity rotated."""

    new_agent_id: UUID
    """Primary key of the freshly inserted ``status='active'`` row.

    The new row keeps the same ``owner_user_id`` + ``tenant_id`` +
    ``display_name`` so downstream consumers (Astraea trust score
    aggregation, Phanes listing creator FK) can follow ownership
    by ``owner_user_id`` rather than by a single immutable id.
    """

    new_public_key_fingerprint: str
    """``sha256:<base64url first 16 bytes>`` per contract Section 7.

    Surfaced in the 202 response body + the Pheme email props as the
    ``new_fingerprint`` placeholder.
    """

    old_public_key_fingerprint: str
    """Fingerprint of the now-retiring key. Surfaced in the audit log
    + the Pheme email props as the ``old_fingerprint`` placeholder."""

    retires_at: datetime
    """UTC instant the retiring key flips to ``revoked``. Computed as
    ``now() + GRACE_WINDOW_DAYS`` inside the rotation transaction."""

    notified_email: str | None
    """Recipient email surfaced to the audit log. ``None`` when the
    owner_user_id has no resolvable address; the rotation still
    proceeds because the security-critical operation must not block
    on a notification surface."""


# ---------------------------------------------------------------------------
# Crypto + fingerprint helpers
# ---------------------------------------------------------------------------


def _fingerprint(public_pem: str) -> str:
    """Compute the contract Section 7 fingerprint for a public PEM.

    Format: ``sha256:<base64url first 16 bytes of sha256(raw_pubkey)>``
    The 32-byte raw form is read via :func:`public_pem_to_raw_bytes`
    so the digest matches what an external verifier would compute
    from the JWKS-style raw representation.
    """

    import base64
    import hashlib

    raw = public_pem_to_raw_bytes(public_pem)
    digest = hashlib.sha256(raw).digest()
    truncated = digest[:16]
    encoded = base64.urlsafe_b64encode(truncated).rstrip(b"=").decode("ascii")
    return f"sha256:{encoded}"


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------


async def _list_rotation_candidates(pool: Any) -> list[dict[str, Any]]:
    """Return active rows older than the rotation threshold.

    The cron runs as a worker process so it does not bind to a tenant;
    the query bypasses the tenant_scoped helper deliberately. RLS
    still permits this read because the worker uses the migration
    role per Aether's ``arq_redis`` setup. We narrow to ``active``
    only because retiring rows are mid-grace and revoked rows are
    terminal.
    """

    threshold_seconds = ROTATION_AGE_THRESHOLD_DAYS * 24 * 60 * 60
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, tenant_id, owner_user_id, agent_slug,
                   display_name, public_key_pem, created_at
            FROM agent_identity
            WHERE status = 'active'
              AND owner_user_id IS NOT NULL
              AND public_key_pem IS NOT NULL
              AND created_at < (now() - make_interval(secs => $1))
            ORDER BY created_at ASC
            """,
            threshold_seconds,
        )
    return [dict(row) for row in rows]


async def _load_active_row(pool: Any, agent_id: UUID) -> dict[str, Any] | None:
    """Return the active row for ``agent_id`` or ``None`` if missing.

    Used by the admin endpoint to guard the idempotent recent-key
    rejection. We require ``status='active'`` because rotating a
    retiring or revoked key is meaningless.
    """

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, tenant_id, owner_user_id, agent_slug,
                   display_name, public_key_pem, created_at, status
            FROM agent_identity
            WHERE id = $1 AND status = 'active'
            """,
            agent_id,
        )
    if row is None:
        return None
    return dict(row)


async def _resolve_owner_email(pool: Any, owner_user_id: UUID) -> str | None:
    """Return the owner's email address or ``None`` when unresolvable.

    Looks up ``app_user.email`` directly. Returning ``None`` does NOT
    abort the rotation; the security-critical key swap still happens
    and the absence is logged for Selene to alert on.
    """

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT email FROM app_user WHERE id = $1",
            owner_user_id,
        )
    if row is None or not row["email"]:
        return None
    return str(row["email"])


async def _apply_rotation(
    pool: Any,
    *,
    old_row: dict[str, Any],
    new_public_pem: str,
    now: datetime,
) -> tuple[UUID, datetime]:
    """Flip the old row to retiring + insert the new active row.

    Runs both writes in a single transaction so a partial failure
    (network blip mid-INSERT) leaves the row pair atomic. Returns
    ``(new_agent_id, retires_at)`` so the caller can stitch the
    Pheme email + 202 response.
    """

    new_id = uuid7()
    retires_at = now + timedelta(days=GRACE_WINDOW_DAYS)
    new_raw_pubkey = public_pem_to_raw_bytes(new_public_pem)
    derived_slug = f"agent_{new_id.hex[:12]}"

    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                """
                UPDATE agent_identity
                SET status = 'retiring',
                    retires_at = $2,
                    updated_at = $3
                WHERE id = $1 AND status = 'active'
                """,
                old_row["id"],
                retires_at,
                now,
            )
            await conn.execute(
                """
                INSERT INTO agent_identity (
                    id, tenant_id, owner_user_id, agent_slug,
                    display_name, public_key, public_key_pem,
                    status, metadata
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7,
                    'active', '{}'::jsonb
                )
                """,
                new_id,
                old_row["tenant_id"],
                old_row["owner_user_id"],
                derived_slug,
                old_row["display_name"],
                new_raw_pubkey,
                new_public_pem,
            )

    return new_id, retires_at


async def _notify_owner(
    *,
    email: str | None,
    display_name: str,
    old_fingerprint: str,
    new_fingerprint: str,
    retires_at: datetime,
    tenant_id: UUID,
    owner_user_id: UUID,
) -> bool:
    """Send the ``key_rotation_alert`` Pheme template.

    Returns ``True`` when the send was queued, ``False`` when the
    owner had no resolvable email address. Any exception bubbles up
    so the caller can decide whether to surface it; the cron sweep
    catches + logs but does NOT roll back the rotation because the
    key swap is the security-critical primary effect.
    """

    if not email:
        logger.warning(
            "tethys.key_rotation.notify.no_email owner_user_id=%s",
            owner_user_id,
        )
        return False

    await pheme_send(
        PHEME_TEMPLATE_NAME,
        email,
        {
            "recipient_name": display_name,
            "rotate_at": retires_at.isoformat(),
            "old_fingerprint": old_fingerprint,
            "new_fingerprint": new_fingerprint,
        },
        tenant_id=tenant_id,
        user_id=owner_user_id,
        idempotency_key=(
            f"key_rotation:{owner_user_id}:{new_fingerprint}"
        ),
    )
    return True


# ---------------------------------------------------------------------------
# Public worker function
# ---------------------------------------------------------------------------


@register_job
async def rotate_single_agent(
    ctx: dict[str, Any] | None,
    agent_id: str | UUID,
    *,
    enforce_recent_guard: bool = True,
) -> dict[str, Any]:
    """Rotate one agent's Ed25519 key.

    Parameters
    ----------
    ctx
        Arq job context. ``None`` is accepted so the router can
        invoke the function directly without going through the queue
        for the admin-triggered case (matches the spawn directive's
        "calls key_rotation worker function directly" wording).
    agent_id
        UUID (string or :class:`uuid.UUID`) of the active identity
        to rotate.
    enforce_recent_guard
        When ``True`` (default + admin path), raise
        :class:`RotationTooRecentError` if the active key is younger
        than :data:`ROTATION_RECENT_GUARD_DAYS`. The cron sweep
        already filters by age via SQL so it can pass ``False`` to
        skip the redundant Python-side check.

    Returns
    -------
    dict
        Serialised :class:`RotationOutcome` plus a ``status`` key
        for Arq job-result inspection. Keys: ``status``, ``agent_id``,
        ``new_agent_id``, ``new_public_key_fingerprint``,
        ``old_public_key_fingerprint``, ``retires_at``,
        ``notified_email``.
    """

    del ctx  # unused; honours Arq's positional arg contract
    target_id = agent_id if isinstance(agent_id, UUID) else UUID(str(agent_id))
    pool = get_pool()
    now = datetime.now(UTC)

    old_row = await _load_active_row(pool, target_id)
    if old_row is None:
        raise RotationTargetMissingError(agent_id=target_id)

    if enforce_recent_guard:
        created_at = old_row["created_at"]
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=UTC)
        age = now - created_at
        if age < timedelta(days=ROTATION_RECENT_GUARD_DAYS):
            raise RotationTooRecentError(
                agent_id=target_id,
                age_days=age.total_seconds() / 86400.0,
            )

    outcome = await _execute_rotation(pool, old_row, now)
    return {
        "status": "rotated",
        "agent_id": str(outcome.agent_id),
        "new_agent_id": str(outcome.new_agent_id),
        "new_public_key_fingerprint": outcome.new_public_key_fingerprint,
        "old_public_key_fingerprint": outcome.old_public_key_fingerprint,
        "retires_at": outcome.retires_at.isoformat(),
        "notified_email": outcome.notified_email,
    }


async def _execute_rotation(
    pool: Any,
    old_row: dict[str, Any],
    now: datetime,
) -> RotationOutcome:
    """Inner helper: keypair gen + DB swap + Pheme notify.

    Split out from :func:`rotate_single_agent` so the cron sweep can
    invoke the same primitive without re-running the admin guard
    logic. The private PEM produced by
    :func:`generate_ed25519_keypair` is intentionally dropped on the
    floor because the cron-driven rotation is initiated server-side
    and there is no API surface to deliver it back to the owner.
    Owners who need the new private PEM rotate via the admin endpoint
    (which surfaces the new agent_id; a follow-up POST to
    ``/v1/identity/agents`` issues a fresh keypair owned by them).
    """

    target_id = old_row["id"]
    if not isinstance(target_id, UUID):
        target_id = UUID(str(target_id))

    owner_user_id = old_row["owner_user_id"]
    if not isinstance(owner_user_id, UUID):
        owner_user_id = UUID(str(owner_user_id))

    tenant_id = old_row["tenant_id"]
    if not isinstance(tenant_id, UUID):
        tenant_id = UUID(str(tenant_id))

    old_pem = old_row["public_key_pem"]
    old_fingerprint = _fingerprint(old_pem)

    new_public_pem, _new_private_pem = generate_ed25519_keypair()
    new_fingerprint = _fingerprint(new_public_pem)

    new_id, retires_at = await _apply_rotation(
        pool,
        old_row=old_row,
        new_public_pem=new_public_pem,
        now=now,
    )

    email = await _resolve_owner_email(pool, owner_user_id)
    notified_email = email if email else None
    try:
        await _notify_owner(
            email=email,
            display_name=str(old_row["display_name"]),
            old_fingerprint=old_fingerprint,
            new_fingerprint=new_fingerprint,
            retires_at=retires_at,
            tenant_id=tenant_id,
            owner_user_id=owner_user_id,
        )
    except Exception:  # noqa: BLE001 - email surface must not roll back rotation
        logger.exception(
            "tethys.key_rotation.notify.failed agent_id=%s "
            "owner_user_id=%s",
            target_id,
            owner_user_id,
        )
        notified_email = None

    logger.info(
        "tethys.key_rotation.applied agent_id=%s new_agent_id=%s "
        "old_fingerprint=%s new_fingerprint=%s retires_at=%s "
        "notified=%s",
        target_id,
        new_id,
        old_fingerprint,
        new_fingerprint,
        retires_at.isoformat(),
        bool(notified_email),
    )

    return RotationOutcome(
        agent_id=target_id,
        new_agent_id=new_id,
        new_public_key_fingerprint=new_fingerprint,
        old_public_key_fingerprint=old_fingerprint,
        retires_at=retires_at,
        notified_email=notified_email,
    )


# ---------------------------------------------------------------------------
# Cron sweep body
# ---------------------------------------------------------------------------


async def tethys_key_rotation_sweep(ctx: dict[str, Any]) -> dict[str, Any]:
    """Arq cron body: rotate every active key older than 90 days.

    Runs every Sunday at 03:00 UTC (per the spawn directive). Iterates
    candidates one at a time so a single rotation failure does not
    abort the rest of the sweep; per-row failures land in the log
    and the Selene dashboard.
    """

    del ctx  # unused; honours Arq's positional arg contract
    pool = get_pool()
    now = datetime.now(UTC)

    candidates = await _list_rotation_candidates(pool)
    logger.info(
        "tethys.key_rotation.sweep.begin candidate_count=%d",
        len(candidates),
    )

    rotated: list[str] = []
    failed: list[str] = []
    for candidate in candidates:
        try:
            outcome = await _execute_rotation(pool, candidate, now)
            rotated.append(str(outcome.agent_id))
        except Exception:  # noqa: BLE001 - one bad row must not stop sweep
            agent_id_str = str(candidate.get("id", "<unknown>"))
            logger.exception(
                "tethys.key_rotation.sweep.row_failed agent_id=%s",
                agent_id_str,
            )
            failed.append(agent_id_str)

    summary = {
        "candidate_count": len(candidates),
        "rotated_count": len(rotated),
        "failed_count": len(failed),
        "rotated": rotated,
        "failed": failed,
    }
    logger.info(
        "tethys.key_rotation.sweep.complete rotated=%d failed=%d",
        len(rotated),
        len(failed),
    )
    return summary


# ---------------------------------------------------------------------------
# Cron registration
# ---------------------------------------------------------------------------


# Schedule: every Sunday at 03:00 UTC. Sunday is "sun" in arq.cron's
# weekday vocabulary (see arq.typing.WEEKDAYS = mon, tues, wed, thurs,
# fri, sat, sun). The scalar-set hour={3} + minute={0} pair fires
# exactly once per matching minute. ``run_at_startup=False`` keeps
# worker reboots from accidentally rotating fresh keys.
KEY_ROTATION_CRON = cron(
    tethys_key_rotation_sweep,
    name=CRON_SCHEDULE_NAME,
    weekday="sun",
    hour={3},
    minute={0},
    run_at_startup=False,
)
"""The CronJob instance registered with Arq.

Exposed at module scope so :mod:`src.backend.registry.identity.cron`
+ test harness can introspect the schedule without re-importing the
arq.cron internals.
"""


register_cron_job(KEY_ROTATION_CRON)


__all__ = [
    "CRON_SCHEDULE_NAME",
    "GRACE_WINDOW_DAYS",
    "KEY_ROTATION_CRON",
    "PHEME_TEMPLATE_NAME",
    "ROTATION_AGE_THRESHOLD_DAYS",
    "ROTATION_RECENT_GUARD_DAYS",
    "RotationOutcome",
    "RotationTargetMissingError",
    "RotationTooRecentError",
    "rotate_single_agent",
    "tethys_key_rotation_sweep",
]
