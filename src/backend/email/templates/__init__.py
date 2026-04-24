"""Template registry for Pheme transactional email.

Per ``docs/contracts/email_transactional.contract.md`` Section 3.2 the
contract ships 13 templates. The registry declares:

- ``version`` : semver string written into ``email_message.template_version``
  so downstream audits can trace which template shape produced a given
  message. Bump semver on any content change.
- ``subject`` : default subject line. Templates MAY override at send time
  via the ``subject_override`` argument on :func:`src.backend.email.send.send`.
- ``category`` : compliance category used to segment opt-outs. Contract
  Section 7 lists: ``marketplace``, ``billing``, ``system_alert``,
  ``digest``, ``security``. ``digest`` is reserved for future use.
- ``critical`` : when True the template bypasses warmup cap per contract
  Section 8 ("critical emails (password_reset, security_alert) bypass
  cap with log WARN").

Why a Python registry for React Email components
------------------------------------------------
The React Email ``.tsx`` components live next to this file and are
pre-rendered at build time via ``@react-email/render`` into
``rendered/<name>.html`` (contract Section 3.2 MVP path). The Python
layer references templates by name only; the renderer (``renderer.py``)
reads the HTML artifact, substitutes props, and returns the final body.

This decouples the Python runtime from a Node subprocess at request
time, which keeps p95 send latency below the 200 ms budget noted in
``_meta/NarasiGhaisan.md`` Section 22 demo pacing notes.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class TemplateMeta:
    """Static metadata about a registered template."""

    name: str
    version: str
    subject: str
    category: str
    critical: bool = False
    # ``description`` is informational only; surfaced in the preview route
    # so Nemea-RV-v2 regression checks carry context without reading the
    # .tsx source.
    description: str = ""


# Contract Section 3.2: the authoritative 13.
TEMPLATES: dict[str, TemplateMeta] = {
    "welcome": TemplateMeta(
        name="welcome",
        version="1.0.0",
        subject="Welcome to NERIUM",
        category="system_alert",
        critical=False,
        description="Sent on successful signup + tenant provisioning.",
    ),
    "email_verify": TemplateMeta(
        name="email_verify",
        version="1.0.0",
        subject="Verify your NERIUM email",
        category="security",
        critical=True,
        description="Account email ownership verification with signed token.",
    ),
    "password_reset": TemplateMeta(
        name="password_reset",
        version="1.0.0",
        subject="Reset your NERIUM password",
        category="security",
        critical=True,
        description="Aether-initiated password reset link, 1 h TTL.",
    ),
    "purchase_receipt": TemplateMeta(
        name="purchase_receipt",
        version="1.0.0",
        subject="Your NERIUM marketplace receipt",
        category="billing",
        critical=False,
        description="Iapetus buyer receipt post-checkout success.",
    ),
    "marketplace_sale": TemplateMeta(
        name="marketplace_sale",
        version="1.0.0",
        subject="Your listing was purchased",
        category="marketplace",
        critical=False,
        description="Iapetus seller notification on sale.",
    ),
    "payout_paid": TemplateMeta(
        name="payout_paid",
        version="1.0.0",
        subject="Your payout has been sent",
        category="billing",
        critical=False,
        description="Plutus + Iapetus payout completed to seller bank.",
    ),
    "invoice_receipt": TemplateMeta(
        name="invoice_receipt",
        version="1.0.0",
        subject="Your NERIUM invoice",
        category="billing",
        critical=False,
        description="Plutus Stripe invoice.paid webhook consumer.",
    ),
    "quest_completion": TemplateMeta(
        name="quest_completion",
        version="1.0.0",
        subject="Quest complete",
        category="system_alert",
        critical=False,
        description="Nyx onboarding quest complete; optional opt-in digest.",
    ),
    "key_rotation_alert": TemplateMeta(
        name="key_rotation_alert",
        version="1.0.0",
        subject="Your identity key is rotating",
        category="security",
        critical=True,
        description="Tethys Ed25519 key rotation notice with old + new fp.",
    ),
    "dispute_notification": TemplateMeta(
        name="dispute_notification",
        version="1.0.0",
        subject="A purchase dispute needs your attention",
        category="marketplace",
        critical=True,
        description="Iapetus dispute opened, action required in 7 days.",
    ),
    "gdpr_export_ready": TemplateMeta(
        name="gdpr_export_ready",
        version="1.0.0",
        subject="Your NERIUM data export is ready",
        category="security",
        critical=True,
        description="Eunomia GDPR export ZIP available via signed URL.",
    ),
    "maintenance_notice": TemplateMeta(
        name="maintenance_notice",
        version="1.0.0",
        subject="Scheduled maintenance notice",
        category="system_alert",
        critical=False,
        description="Eunomia operator-initiated maintenance window notice.",
    ),
    "budget_alert": TemplateMeta(
        name="budget_alert",
        version="1.0.0",
        subject="NERIUM budget alert",
        category="billing",
        critical=True,
        description="Moros budget cap proximity or breach alert.",
    ),
}


def get_template_meta(name: str) -> TemplateMeta:
    """Return metadata for a registered template.

    Raises
    ------
    KeyError
        When the template name is not in the registry. Callers are
        expected to surface this as HTTP 400 ``unknown_template`` per
        contract Section 8.
    """

    if name not in TEMPLATES:
        raise KeyError(f"unknown_template: {name!r}")
    return TEMPLATES[name]


def category_of(name: str) -> str:
    """Return the compliance category for a template name.

    Used by :func:`src.backend.email.unsubscribe.is_unsubscribed` to scope
    the opt-out check. A user who unsubscribed from ``marketplace`` still
    receives ``security`` + ``system_alert`` messages (they are not
    marketing per contract Section 1).
    """

    return get_template_meta(name).category


def list_template_names() -> list[str]:
    """Return sorted template names for the preview route + Nemea snapshot."""

    return sorted(TEMPLATES.keys())


__all__ = [
    "TEMPLATES",
    "TemplateMeta",
    "category_of",
    "get_template_meta",
    "list_template_names",
]
