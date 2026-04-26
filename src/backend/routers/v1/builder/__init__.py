"""Builder pillar routers under ``/v1/builder/*``.

Owner: Aether-Vercel T6 Phase 1.5.

Routes
------
- ``POST /v1/builder/sessions/live``  Stateless Anthropic Messages API
  forwarder for the BYOK demo opt-in. Forwards the user-supplied
  ``user_api_key`` as the ``x-api-key`` header on a single Anthropic
  ``POST /v1/messages`` call and proxies the SSE stream back to the
  browser. ZERO usage of NERIUM-side ANTHROPIC_API_KEY env var. The
  endpoint NEVER logs the key value, NEVER persists the key in a
  database row, NEVER stores the key in Redis. It is a pure forwarder.

Security posture
----------------
- ``user_api_key`` is read from the request body, validated against the
  Anthropic key regex, and forwarded as a header. The body field is
  stripped before any structured log line is emitted.
- The route is registered in ``DEFAULT_PUBLIC_PATHS`` so unauthenticated
  visitors can run the BYOK flow without a NERIUM session token. The
  only auth surface is the user's own Anthropic key, which the user
  voluntarily supplied.
- Rate limiting at hackathon scope is enforced client-side via the
  sessionStorage counter in ``apolloBuilderDialogueStore``. Backend
  side rides the existing ``install_rate_limit`` middleware which
  applies a default per-IP bucket. Tighter per-key buckets can be
  added post-launch via Khronos-managed Redis keys.
"""

from __future__ import annotations

from src.backend.routers.v1.builder.live_session import live_session_router

__all__ = ["live_session_router"]
