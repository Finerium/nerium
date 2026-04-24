"""Email routers (Pheme, W1).

Mounts under ``/v1/email/*``. Per
``docs/contracts/email_transactional.contract.md`` Section 4.3, 4.4 we
ship:

- ``unsubscribe`` : ``POST /v1/email/unsubscribe`` + ``GET /unsubscribe``
  one-click compliance per RFC 8058.
- ``webhook``     : ``POST /v1/email/webhooks/resend``.
- ``preview``     : ``GET /v1/email/preview/{template_name}`` dev-only
  route so Nemea-RV-v2 + designers can eyeball rendered HTML without
  firing a real send.
"""

from .preview import router as preview_router
from .unsubscribe import router as unsubscribe_router
from .webhook import router as webhook_router

__all__ = [
    "preview_router",
    "unsubscribe_router",
    "webhook_router",
]
