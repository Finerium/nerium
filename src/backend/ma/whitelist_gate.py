"""Hemera ``builder.live`` whitelist gate.

Owner: Kratos (W2 S1).

Fast pre-call check run by the session create endpoint (and by the
dispatcher as a belt-and-braces on pick-up). Consumes Hemera's
``get_flag`` per the Aether-shipped W1 SHA ``032590f`` surface so the
whitelist override semantics (``builder.live=true`` permanent for
Ghaisan + demo user + judges via Hemera user-scope overrides) are
inherited for free.

Contract references
-------------------
- ``docs/contracts/agent_orchestration_runtime.contract.md`` Section
  4.4 first bullet "Hemera whitelist".
- ``docs/contracts/feature_flag.contract.md`` ``get_flag`` signature.
- Kratos Strategic Decision Hard-Stop "Running live Builder without
  Hemera whitelist gate".

Behavioural notes
-----------------
- Flag default is ``false``. When ``get_flag`` returns ``None`` (flag
  row not registered yet, e.g. pre-seed smoke test) we treat as
  ``false`` and raise. The contract explicitly prefers deny-by-default
  on missing kill-switches.
- The gate NEVER swallows the raise; callers handle at the router
  boundary. The dispatcher also calls it defensively so a racing flag
  flip between create-time and dispatch-time terminates the session.
- We do not log PII here; the flag service owns audit emission.
"""

from __future__ import annotations

import logging
from uuid import UUID

from src.backend.flags.service import get_flag
from src.backend.ma.errors import BuilderNotEnabledProblem

logger = logging.getLogger(__name__)

BUILDER_LIVE_FLAG: str = "builder.live"
"""The single flag name the whitelist gate consults. Contract-locked."""


async def enforce_whitelist_gate(
    user_id: UUID | str,
    *,
    tenant_id: UUID | str | None = None,
    flag_name: str = BUILDER_LIVE_FLAG,
) -> None:
    """Raise :class:`BuilderNotEnabledProblem` when ``builder.live`` is false.

    Hemera resolves precedence internally (user > tenant > global >
    default). Ghaisan + demo + judges have permanent user-scope
    overrides so their evaluation returns ``True`` even when the global
    default stays ``False``.

    Parameters
    ----------
    user_id
        The authenticated caller (from :class:`AuthPrincipal`).
    tenant_id
        Optional tenant id used by Hemera's tenant-scope precedence
        tier; passing ``None`` still yields a correct eval because the
        SQL LATERAL join tolerates NULL.
    flag_name
        Overridable for future multi-flag gating (e.g. a "builder.live
        MCP lane" variant). Default is the contract-locked
        ``builder.live``.
    """

    try:
        value = await get_flag(flag_name, user_id=user_id, tenant_id=tenant_id)
    except Exception:
        logger.exception("ma.whitelist.eval_failed flag=%s user=%s", flag_name, user_id)
        # Fail closed: any Hemera outage gates to 403 until the flag
        # service is healthy again. The alternative (fail-open) would
        # let non-whitelisted users invoke the Builder during an
        # incident, which violates Kratos hard-stop 1.
        raise BuilderNotEnabledProblem(
            detail=(
                "Builder runtime gate could not be evaluated; the feature "
                "flag service is temporarily unavailable."
            )
        )

    if value is True:
        logger.info(
            "ma.whitelist.pass flag=%s user=%s",
            flag_name,
            user_id,
        )
        return

    logger.info(
        "ma.whitelist.blocked flag=%s user=%s value=%r",
        flag_name,
        user_id,
        value,
    )
    raise BuilderNotEnabledProblem()


__all__ = ["BUILDER_LIVE_FLAG", "enforce_whitelist_gate"]
