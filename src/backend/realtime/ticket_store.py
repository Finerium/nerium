"""Redis-backed active + revoked ticket stores.

Owner: Nike (W2 NP P3 S2).

Key schema (per S2 spawn directive)
-----------------------------------
- Active ticket record:  ``realtime:ticket:<jti>``
    Hash fields: ``sub``, ``res``, ``exp``, ``tid``.
    TTL: aligned to ticket ``exp``. Used by:
      * Admin diagnostics ("is this ticket live?")
      * Revocation lookup (we key the revocation TTL off the original
        exp so the tombstone disappears alongside the natural expiry).
      * The logout hook enumerates active jtis owned by a session and
        revokes each one.

- Revocation tombstone:  ``realtime:ticket:revoked:<jti>``
    Value: fixed ``"1"``.
    TTL: ``max(1, exp - now)`` seconds. Once the ticket would have
    expired on its own the tombstone is pointless; Redis GCs it.

- Per-user jti index:    ``realtime:ticket:user:<user_id>``
    Sorted set. Score = ``exp`` unix. Member = jti. Used by the logout
    revocation sweep to enumerate + revoke every outstanding ticket for
    a user without a KEYS scan. Trimmed by :data:`USER_INDEX_TRIM` so
    the set cannot grow unbounded if revocation is never called.

Fail-open vs fail-closed
------------------------
All writes are best-effort: Redis outage logs + continues. The mint
endpoint is the only caller that REQUIRES a working Redis because
absence of the active record makes later revocation impossible.
Validation's revocation check fails open on Redis outage (we return
``False`` from :func:`is_revoked` on error) so a transient Redis blip
does not nuke every live SSE stream. Post-hackathon this should flip
to fail-closed once Redis HA is in place.

Contract references
-------------------
- ``docs/contracts/realtime_bus.contract.md`` Section 4.5.
- ``docs/contracts/redis_session.contract.md`` Section 3.4 memory cap.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any, Iterable, Optional

logger = logging.getLogger(__name__)


ACTIVE_KEY_FMT: str = "realtime:ticket:{jti}"
"""Active ticket record key. Hash with sub, res, exp, tid."""

REVOKED_KEY_FMT: str = "realtime:ticket:revoked:{jti}"
"""Revocation tombstone key. Value ``"1"``, TTL aligned to exp."""

USER_INDEX_KEY_FMT: str = "realtime:ticket:user:{user_id}"
"""Sorted set of (jti -> exp) per user for enumeration."""

USER_INDEX_TRIM: int = 50
"""Hard cap on active jtis per user stored in the index. Anything
above rolls off via ``ZREMRANGEBYRANK`` at write time."""


@dataclass(frozen=True)
class ActiveTicketRecord:
    """The subset of fields we persist in the active hash + read back."""

    jti: str
    sub: str
    res: str
    tid: str
    exp: int


# ---------------------------------------------------------------------------
# Writes
# ---------------------------------------------------------------------------


async def record_active(
    redis: Any,
    *,
    jti: str,
    sub: str,
    tid: str,
    res: str,
    exp_unix: int,
    now_unix: Optional[int] = None,
) -> None:
    """Persist an active ticket record + user index entry.

    Both keys use absolute TTL derived from ``exp_unix`` so the natural
    expiry cleans them up without a background sweeper.

    Best-effort: raises only on programmer error (missing fields) so a
    Redis blip does not block the mint endpoint. The caller SHOULD log
    any exception surfaced from the Redis client directly.
    """

    if not all([jti, sub, tid, res]) or exp_unix <= 0:
        raise ValueError(
            "record_active requires non-empty jti/sub/tid/res + positive exp."
        )
    now = int(now_unix if now_unix is not None else time.time())
    ttl_s = max(1, int(exp_unix) - now)

    active_key = ACTIVE_KEY_FMT.format(jti=jti)
    user_key = USER_INDEX_KEY_FMT.format(user_id=sub)

    # HSET + EXPIRE done as two calls; fakeredis does not reliably
    # honour HSET + EX flags but supports both HSET and EXPIRE cleanly.
    await redis.hset(
        active_key,
        mapping={
            "jti": jti,
            "sub": sub,
            "tid": tid,
            "res": res,
            "exp": str(int(exp_unix)),
        },
    )
    await redis.expire(active_key, ttl_s)

    await redis.zadd(user_key, {jti: int(exp_unix)})
    # Trim the per-user index so a runaway mint loop does not push
    # unbounded members into the sorted set.
    await redis.zremrangebyrank(user_key, 0, -USER_INDEX_TRIM - 1)
    # Align user-index TTL with the longest live ticket; at minimum
    # the current ticket's TTL so the key does not persist forever.
    await redis.expire(user_key, ttl_s)


async def revoke_jti(
    redis: Any,
    *,
    jti: str,
    exp_unix: int,
    now_unix: Optional[int] = None,
) -> bool:
    """Install a revocation tombstone for ``jti``.

    Returns ``True`` on a fresh revoke, ``False`` on a no-op (either
    already revoked or exp in the past). TTL aligned to remaining
    exp so the tombstone disappears naturally.
    """

    if not jti:
        raise ValueError("revoke_jti requires a non-empty jti")
    now = int(now_unix if now_unix is not None else time.time())
    remaining = int(exp_unix) - now
    if remaining <= 0:
        # Ticket already expired; revocation is a no-op.
        return False

    key = REVOKED_KEY_FMT.format(jti=jti)
    # ``set(..., nx=True)`` so a repeat revocation does not reset the
    # TTL clock. Returns None when the key already existed; ``True``
    # on fresh create.
    result = await redis.set(key, "1", ex=remaining, nx=True)
    return bool(result)


async def revoke_all_for_user(
    redis: Any,
    *,
    user_id: str,
    now_unix: Optional[int] = None,
) -> int:
    """Revoke every live ticket for ``user_id``.

    Reads the per-user index, tombstones each non-expired jti, and
    returns the count of tombstones installed. Used by the session
    logout hook in Aether's auth router.
    """

    if not user_id:
        raise ValueError("revoke_all_for_user requires a non-empty user_id")
    now = int(now_unix if now_unix is not None else time.time())
    user_key = USER_INDEX_KEY_FMT.format(user_id=user_id)

    entries = await redis.zrange(user_key, 0, -1, withscores=True)
    revoked = 0
    stale: list[str] = []
    for member, score in entries or []:
        jti = member.decode("utf-8") if isinstance(member, (bytes, bytearray)) else str(member)
        exp_unix = int(score)
        if exp_unix <= now:
            stale.append(jti)
            continue
        if await revoke_jti(
            redis, jti=jti, exp_unix=exp_unix, now_unix=now
        ):
            revoked += 1
    if stale:
        await redis.zrem(user_key, *stale)
    return revoked


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------


async def is_revoked(redis: Any, jti: str) -> bool:
    """Return ``True`` when a revocation tombstone exists for ``jti``.

    Fail-open on transport error: logs + returns ``False`` so a Redis
    blip does not nuke every live SSE. Tighten post-hackathon.
    """

    if not jti:
        return False
    key = REVOKED_KEY_FMT.format(jti=jti)
    try:
        value = await redis.get(key)
    except Exception:
        logger.warning(
            "realtime.ticket.revocation_check_failed jti=%s",
            jti,
            exc_info=True,
        )
        return False
    return value is not None


async def load_active(
    redis: Any,
    jti: str,
) -> Optional[ActiveTicketRecord]:
    """Return the live active record for ``jti`` or ``None``.

    Missing key is expected (natural expiry); callers treat None as
    "no record" rather than "error".
    """

    if not jti:
        return None
    try:
        raw = await redis.hgetall(ACTIVE_KEY_FMT.format(jti=jti))
    except Exception:
        logger.warning(
            "realtime.ticket.active_load_failed jti=%s",
            jti,
            exc_info=True,
        )
        return None
    if not raw:
        return None

    def _s(key: str) -> str:
        value = raw.get(key) if isinstance(raw, dict) else None
        if isinstance(value, bytes):
            return value.decode("utf-8", errors="ignore")
        return str(value) if value is not None else ""

    try:
        exp_unix = int(_s("exp")) if _s("exp") else 0
    except ValueError:
        exp_unix = 0
    sub = _s("sub")
    res = _s("res")
    tid = _s("tid")
    if not sub or not res or not tid or exp_unix <= 0:
        return None
    return ActiveTicketRecord(jti=jti, sub=sub, res=res, tid=tid, exp=exp_unix)


async def list_active_for_user(
    redis: Any,
    user_id: str,
) -> list[str]:
    """Return every jti in the per-user index. Stale entries filtered."""

    if not user_id:
        return []
    now = int(time.time())
    try:
        entries = await redis.zrange(
            USER_INDEX_KEY_FMT.format(user_id=user_id),
            0,
            -1,
            withscores=True,
        )
    except Exception:
        logger.warning(
            "realtime.ticket.user_index_read_failed user_id=%s",
            user_id,
            exc_info=True,
        )
        return []
    out: list[str] = []
    for member, score in entries or []:
        if int(score) <= now:
            continue
        jti = member.decode("utf-8") if isinstance(member, (bytes, bytearray)) else str(member)
        out.append(jti)
    return out


__all__ = [
    "ACTIVE_KEY_FMT",
    "ActiveTicketRecord",
    "REVOKED_KEY_FMT",
    "USER_INDEX_KEY_FMT",
    "USER_INDEX_TRIM",
    "is_revoked",
    "list_active_for_user",
    "load_active",
    "record_active",
    "revoke_all_for_user",
    "revoke_jti",
]
