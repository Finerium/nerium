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
    # Hyperion W2 NP P1 Session 1: marketplace hybrid search. Mounts at
    # ``/v1/marketplace/search`` + ``/v1/marketplace/search/autocomplete``
    # per docs/contracts/marketplace_search.contract.md.
    ("marketplace.search", "src.backend.routers.v1.marketplace", "search_router"),
    # Astraea W2 NP P1 Session 1: registry trust score GET endpoints
    # under ``/v1/registry/trust/*`` + admin-only force-refresh POSTs
    # under ``/v1/admin/trust/*`` per docs/contracts/trust_score.contract.md.
    ("registry.trust", "src.backend.routers.v1.registry", "trust_router"),
    ("admin.trust", "src.backend.routers.v1.registry.trust", "admin_trust_router"),
    # Plutus W2 NP P4 Session 1: Stripe billing surface. Four routers
    # land under ``/v1/billing/*``:
    #   - plans: public pricing catalogue (no auth).
    #   - checkout: POST checkout session create (auth + Hemera gate).
    #   - subscription: GET current subscription (auth).
    #   - webhook: POST Stripe-signed webhook (Stripe-Signature header).
    # Per docs/contracts/payment_stripe.contract.md.
    ("billing.plans", "src.backend.routers.v1.billing", "plans_router"),
    ("billing.checkout", "src.backend.routers.v1.billing", "checkout_router"),
    ("billing.subscription", "src.backend.routers.v1.billing", "subscription_router"),
    ("billing.webhook", "src.backend.routers.v1.billing", "webhook_router"),
    # Plutus W2 NP S2: invoice PDF download. ``GET /v1/billing/invoices/
    # {invoice_id}.pdf`` resolves the id to a marketplace_purchase row,
    # gates on buyer-or-seller membership, renders ReportLab Canvas PDF
    # bytes back with attachment Content-Disposition. Consumed by the
    # Iapetus dashboard "Download invoice" button.
    ("billing.invoices", "src.backend.billing.invoices", "invoices_router"),
    # Iapetus W2 NP P4 Session 1: marketplace commerce surface. Three
    # routers land under ``/v1/commerce/*``:
    #   - connect: POST onboard + refresh + GET status (Connect Express).
    #   - purchase: POST /v1/commerce/purchase (PaymentIntent create).
    #   - review:   CRUD under /v1/commerce/listings/.../reviews +
    #               /v1/commerce/reviews.
    # Marketplace Stripe webhook events (payment_intent.*, charge.refunded,
    # account.updated) ride the existing Plutus webhook dispatcher via
    # ``src.backend.commerce.webhook.handle_commerce_event`` so no
    # separate webhook router is mounted.
    ("commerce.connect", "src.backend.routers.v1.commerce", "connect_router"),
    ("commerce.purchase", "src.backend.routers.v1.commerce", "purchase_router"),
    ("commerce.review", "src.backend.routers.v1.commerce", "review_router"),
    # Eunomia W2 NP P6 Session 1: admin ops surface.
    #   - admin.moderation: ``/v1/admin/moderation/listings`` queue +
    #     approve/reject routes. Scope: admin / admin:moderation.
    #   - me.gdpr: ``/v1/me/gdpr/export`` + ``/v1/me/gdpr/delete``.
    #   - me.consent: ``POST /v1/me/consent`` +
    #     ``GET /v1/me/consent/history``.
    ("admin.moderation", "src.backend.routers.v1.admin", "moderation_router"),
    ("me.gdpr", "src.backend.routers.v1.me", "gdpr_router"),
    ("me.consent", "src.backend.routers.v1.me", "consent_router"),
    # Tethys W2 NP P5 Session 1: Ed25519 agent identity CRUD.
    # ``POST /v1/identity/agents`` registers a new keypair (private PEM
    # surfaced exactly once), ``GET /v1/identity/agents[/{id}]`` lists
    # or fetches owner-scoped rows, ``DELETE`` revokes by flipping
    # ``status = 'revoked'``. The ``require_agent_jwt`` FastAPI
    # dependency lives at ``src.backend.registry.identity`` and is
    # imported by Crius for vendor identity reuse.
    ("identity.agents", "src.backend.routers.v1.identity", "identity_router"),
    # Crius W2 NP P5 Session 1: multi-vendor adapter dispatcher.
    # ``POST /v1/protocol/invoke`` requires an EdDSA agent JWT and
    # dispatches via :func:`src.backend.protocol.dispatcher.dispatch`
    # with the Hemera vendor.<slug>.disabled kill switch checked
    # BEFORE adapter invocation. ``GET /v1/protocol/vendors`` lists
    # the enabled catalogue (no auth, no secrets exposed).
    ("protocol.invoke", "src.backend.routers.v1.protocol", "protocol_router"),
    # Crius W2 NP P5 Session 2: tenant API key envelope CRUD. Three
    # routes under ``/v1/protocol/keys``: POST seals + persists, GET
    # lists metadata (no plaintext ever), DELETE removes. Auth is the
    # USER JWT (request.state.auth) NOT the agent JWT; these are
    # tenant operator credentials configured by humans.
    ("protocol.keys", "src.backend.routers.v1.protocol_keys", "protocol_keys_router"),
    # Future W2 slots. Keeping the label namespace so Nemea can assert
    # pillars are mounted before their dependent tests run.
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
