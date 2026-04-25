"""Crius dispatcher: kill-switch -> registry -> adapter.invoke.

Owner: Crius (W2 NP P5 Session 1).

S1 surface: a single async :func:`dispatch` helper the router calls
with an authenticated :class:`AgentPrincipal`. The function performs
the Hemera kill switch check FIRST (before adapter resolution +
invocation) so a flipped flag short-circuits the dispatch even if the
adapter would have raised on its own.

S2 ferry-deferred
-----------------
- pybreaker circuit breaker around ``adapter.invoke``.
- Tenacity retry with exponential jitter on transient errors.
- Per-vendor cost meter emission to Selene.
- AES-256-GCM envelope decryption of vendor API keys at call time.

S1 keeps the dispatch path linear so the integration test surface
stays small + the kill-switch precedence is unambiguous.
"""

from __future__ import annotations

import logging

from src.backend.errors import ServiceUnavailableProblem
from src.backend.flags.service import get_flag
from src.backend.protocol.adapters.base import VendorResponse, VendorTask
from src.backend.protocol.registry import AdapterRegistry, get_registry
from src.backend.registry.identity import AgentPrincipal

__all__ = ["dispatch", "kill_switch_flag_name"]

logger = logging.getLogger(__name__)


def kill_switch_flag_name(vendor_slug: str) -> str:
    """Return the Hemera flag key that disables ``vendor_slug``.

    Convention is documented in
    ``docs/contracts/feature_flag.contract.md`` Section 3.3 seed:
    ``vendor.<slug>.disabled`` evaluated as a boolean. Centralising
    the name here keeps the spelling identical between the dispatcher
    and the admin tooling.
    """

    return f"vendor.{vendor_slug}.disabled"


async def dispatch(
    *,
    vendor_slug: str,
    task: VendorTask,
    agent: AgentPrincipal,
    registry: AdapterRegistry | None = None,
) -> VendorResponse:
    """Dispatch ``task`` to the named vendor or raise 503 / 404.

    Sequence
    --------
    1. Resolve adapter from the registry. Unknown slug -> 404 via
       :class:`NotFoundProblem` raised inside ``registry.get``.
    2. Read the Hemera kill switch ``vendor.<slug>.disabled``.
       Truthy -> 503 :class:`ServiceUnavailableProblem`. Read happens
       BEFORE invoke so a tripped flag short-circuits even if the
       adapter would have failed for another reason.
    3. Call ``adapter.invoke(task, agent)``. Propagate the response.

    Parameters
    ----------
    vendor_slug
        Catalogue slug. Must match one of the registry keys.
    task
        Validated :class:`VendorTask` from the router.
    agent
        Authenticated agent principal from
        :func:`require_agent_jwt`.
    registry
        Optional :class:`AdapterRegistry` for tests; production uses
        the singleton.

    Raises
    ------
    NotFoundProblem
        Unknown ``vendor_slug``.
    ServiceUnavailableProblem
        Hemera kill switch flipped to True for this vendor.
    """

    reg = registry or get_registry()
    adapter = reg.get(vendor_slug)

    flag_key = kill_switch_flag_name(vendor_slug)
    flag_value = await get_flag(
        flag_key,
        user_id=agent.owner_user_id,
        tenant_id=agent.tenant_id,
    )
    # Hemera returns the JSON-decoded value. Boolean flags are stored
    # as JSON ``true`` / ``false``; ``None`` means the flag is not
    # registered, which we treat as "not disabled" (default-on
    # behaviour matches the seed default of False).
    if flag_value is True:
        logger.info(
            "protocol.dispatch.kill_switch vendor=%s agent=%s",
            vendor_slug,
            agent.agent_id,
        )
        raise ServiceUnavailableProblem(
            detail=(
                f"Vendor {vendor_slug!r} is disabled by Hemera flag "
                f"{flag_key!r}."
            ),
        )

    return await adapter.invoke(task, agent)
