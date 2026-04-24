"""Version 1 routers + resilient mount helper.

Versioning is URL-based per ``docs/contracts/rest_api_base.contract.md``
Section 3.1. No header versioning, no Accept-version, no query-string
versioning. Every tenant-scoped + stateful endpoint from W1/W2 agents
lives under the ``/v1`` prefix.

Mount discovery
---------------
Wave 1 authors (Aether, Chione, Pheme, Khronos) land routers in parallel
terminals. Wave 2 authors (Phanes, Plutus, Iapetus, Kratos, Nike,
Tethys, Crius, Astraea, ...) will add more. ``mount_v1_routers``
resolves each pillar import lazily and inside a ``try``/``except
ImportError`` block so the FastAPI app factory stays bootable even when
downstream pillars have not shipped their routers yet. This keeps the
Session 1 + Session 2 smoke tests green across the shipping wave.

Contract references
-------------------
- ``docs/contracts/rest_api_base.contract.md`` Section 3.1 /v1 prefix.
- ``docs/contracts/file_storage.contract.md`` Section 4 /v1/storage/*.
- ``docs/contracts/email_transactional.contract.md`` Sections 4.3-4.4 email.

Design notes
------------
- The function takes an explicit ``prefix`` parameter so tests can mount
  the same routers under an alternate prefix if the need arises, but
  callers should stick with ``"/v1"`` in production.
- ``mount_report`` returns a list of ``(router_label, status)`` tuples
  so Selene + Nemea observers can log which pillars loaded and which
  did not. ``status`` is one of ``"mounted"``, ``"skipped:import"``,
  ``"skipped:flag"``.
"""

from __future__ import annotations

import logging
from typing import Iterable, Tuple

from fastapi import APIRouter, FastAPI

logger = logging.getLogger(__name__)

MountReport = Tuple[str, str]
"""``(router_label, status)`` pair surfaced by :func:`mount_v1_routers`."""


def _try_mount(
    app: FastAPI,
    *,
    label: str,
    loader: str,
    attr: str,
    prefix: str,
) -> MountReport:
    """Import ``loader:attr`` and mount the resulting APIRouter.

    Import errors are swallowed with a warning log so a missing pillar
    does not crash the app factory. Any OTHER exception propagates (a
    syntax error in a pillar router is still a fatal bug).
    """

    try:
        module = __import__(loader, fromlist=[attr])
    except ImportError as exc:
        logger.info(
            "routers.v1.mount.skipped_import label=%s loader=%s err=%s",
            label,
            loader,
            exc,
        )
        return (label, "skipped:import")

    router = getattr(module, attr, None)
    if router is None:
        logger.warning(
            "routers.v1.mount.missing_attr label=%s loader=%s attr=%s",
            label,
            loader,
            attr,
        )
        return (label, "skipped:attr_missing")

    if not isinstance(router, APIRouter):
        logger.warning(
            "routers.v1.mount.bad_type label=%s type=%s",
            label,
            type(router).__name__,
        )
        return (label, "skipped:bad_type")

    app.include_router(router, prefix=prefix)
    logger.info("routers.v1.mount.mounted label=%s prefix=%s", label, prefix)
    return (label, "mounted")


# Registry of pillar routers. Each tuple is ``(label, loader_path, attr)``.
# Order is stable so the mount report is deterministic for tests. Adding
# a new pillar is a single line; removing one requires coordination with
# the owning agent so the /v1 URL contract does not regress silently.
#
# NOTE ON OWNERSHIP
# -----------------
# - storage.upload + storage.download are Chione.
# - email.unsubscribe + email.webhook + email.preview are Pheme. They
#   mount OUTSIDE ``/v1`` per the contract (webhook + unsubscribe) and
#   are therefore registered directly in ``src/backend/main.py`` rather
#   than here. Still re-exported from this module for completeness.
# - Downstream W2 pillars (marketplace, billing, ma_sessions, registry,
#   realtime, crius, astraea) slot in below with the same pattern.
_PILLAR_REGISTRY: tuple[tuple[str, str, str], ...] = (
    # Chione W1 storage routers (land inside /v1).
    ("storage.upload", "src.backend.routers.v1.storage", "upload_router"),
    ("storage.download", "src.backend.routers.v1.storage", "download_router"),
    # Hemera W1 admin flag router (/v1/admin/flags/*) + user-facing
    # flag exposure (/v1/me/flags). Admin router carries its own scope
    # dependency so tenant-binding's ``/admin`` cross-tenant exemption
    # does not apply until a route mounts at the literal ``/admin``
    # prefix (e.g. Eunomia's future SQLAdmin panel).
    ("admin.flags", "src.backend.routers.v1.admin", "flags_router"),
    ("me.flags", "src.backend.routers.v1.me", "flags_router"),
    # Moros W2 NP P3 S1: Chronos budget daemon admin read endpoint.
    # ``GET /v1/admin/budget/status`` surfaces the Redis state hash
    # + Hemera-resolved caps so operators can triage cap events.
    ("admin.budget", "src.backend.routers.v1.admin", "budget_router"),
    # Kratos W2 P2 Session 1: MA session CRUD. SSE stream endpoint
    # lands at the same prefix in Session 3.
    ("ma.sessions", "src.backend.routers.v1.ma", "sessions_router"),
    # Nike W2 NP P3 Session 1: generic realtime WebSocket. Mounts at
    # ``/v1/realtime/ws``. Session 2 adds ``/v1/realtime/ticket`` mint
    # endpoint + optional generic SSE wrapper to this same package.
    ("realtime.ws", "src.backend.routers.v1.realtime", "ws_router"),
    # Nike W2 NP P3 Session 2: HTTP ticket mint + revoke.
    # ``POST /v1/realtime/ticket`` + ``POST /v1/realtime/ticket/revoke``.
    ("realtime.ticket", "src.backend.routers.v1.realtime", "ticket_router"),
    # Phanes W2 NP P1 Session 1: marketplace listing CRUD. Mounts at
    # ``/v1/marketplace/listings`` with the 7-category schema + draft/
    # publish/archive lifecycle per docs/contracts/marketplace_listing.
    ("marketplace.listing", "src.backend.routers.v1.marketplace", "listing_router"),
    # Future W2 slots. Keeping the label namespace so Nemea can assert
    # pillars are mounted before their dependent tests run.
    # ("billing.invoice", "src.backend.routers.v1.billing", "invoice_router"),
    # ("registry.identity", "src.backend.routers.v1.registry", "identity_router"),
)


def mount_v1_routers(
    app: FastAPI,
    *,
    prefix: str = "/v1",
    extra: Iterable[tuple[str, str, str]] | None = None,
) -> list[MountReport]:
    """Mount every known ``/v1`` pillar router onto ``app``.

    Parameters
    ----------
    app
        The FastAPI instance to extend.
    prefix
        URL prefix. Defaults to ``/v1``. Tests may override for mount
        probes but production MUST keep the contract-locked default.
    extra
        Optional additional ``(label, loader, attr)`` tuples to mount
        after the registry. Downstream integration tests use this to
        register fixture routers without mutating the module-level
        registry.

    Returns
    -------
    list[MountReport]
        One entry per registered pillar, in registration order.
    """

    report: list[MountReport] = []
    for label, loader, attr in _PILLAR_REGISTRY:
        report.append(_try_mount(app, label=label, loader=loader, attr=attr, prefix=prefix))

    if extra:
        for label, loader, attr in extra:
            report.append(_try_mount(app, label=label, loader=loader, attr=attr, prefix=prefix))

    return report


__all__ = [
    "MountReport",
    "mount_v1_routers",
]
