"""Tethys registry package.

Owner: Tethys (W2 NP P5 Session 1).

Holds Ed25519 agent-identity primitives + the JWT EdDSA bearer + the
``require_agent_jwt`` middleware used by Crius (vendor identity reuse)
and by every downstream consumer that needs to authenticate an agent
(rather than a human user) on a request.

Sub-packages
------------
- ``identity``: cryptography helpers, JWT issue/verify, FastAPI
  dependency, DB service for the ``agent_identity`` row.
"""
