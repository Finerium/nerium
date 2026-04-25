"""Tethys identity sub-package public surface.

Re-exports the four primitives Crius (W2 NP P5 Session 2) consumes
so the import path stays stable across the wave:

    from src.backend.registry.identity import (
        generate_ed25519_keypair,
        sign_message,
        verify_signature,
        issue_jwt,
        verify_jwt,
        require_agent_jwt,
        AgentPrincipal,
    )

Internals (``service`` DB layer) remain non-public; downstream consumers
import the router or the helpers above.
"""

from src.backend.registry.identity.crypto import (
    generate_ed25519_keypair,
    sign_message,
    verify_signature,
)
from src.backend.registry.identity.jwt_edd import (
    JWT_TTL_MAX_SEC,
    issue_jwt,
    verify_jwt,
)
from src.backend.registry.identity.middleware import (
    AgentPrincipal,
    require_agent_jwt,
)

__all__ = [
    "AgentPrincipal",
    "JWT_TTL_MAX_SEC",
    "generate_ed25519_keypair",
    "issue_jwt",
    "require_agent_jwt",
    "sign_message",
    "verify_jwt",
    "verify_signature",
]
