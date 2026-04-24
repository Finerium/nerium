"""NERIUM backend transactional email package.

Owner: Pheme (Resend + React Email authority, DKIM/SPF/DMARC config,
template versioning, warmup scheduler, unsubscribe compliance).

Public surface
--------------
- ``send`` : queue a template send (RLS-safe, idempotent).
- ``render_template`` : pre-rendered HTML + text body for a template name.
- ``is_unsubscribed`` : check whether an address has opted out of a
  category before enqueuing.
- ``build_unsubscribe_url`` : HMAC-signed unsubscribe URL used in footer
  + List-Unsubscribe header.

All tenant-scoped tables (``email_message``) follow the canonical RLS
pattern from ``postgres_multi_tenant.contract.md`` Section 3.2. The
two global tables (``email_unsubscribe``, ``email_bounce``) are NOT
tenant-scoped because email address validity cuts across tenants.

Contract: ``docs/contracts/email_transactional.contract.md`` v0.1.0.
Research: ``docs/phase_np/RV_NP_RESEARCH.md`` Section C.20.
Agent structure: ``docs/phase_np/RV_NP_AGENT_STRUCTURE.md`` Section 4.14.
"""

from src.backend.email.send import (
    EmailSendError,
    UnsubscribedError,
    WarmupCapExceededError,
    send,
)
from src.backend.email.templates import TEMPLATES, category_of, get_template_meta
from src.backend.email.unsubscribe import (
    build_unsubscribe_token,
    build_unsubscribe_url,
    is_unsubscribed,
    verify_unsubscribe_token,
)
from src.backend.email.warmup import compute_warmup_cap, within_warmup_cap

__all__ = [
    "EmailSendError",
    "TEMPLATES",
    "UnsubscribedError",
    "WarmupCapExceededError",
    "build_unsubscribe_token",
    "build_unsubscribe_url",
    "category_of",
    "compute_warmup_cap",
    "get_template_meta",
    "is_unsubscribed",
    "send",
    "verify_unsubscribe_token",
    "within_warmup_cap",
]
