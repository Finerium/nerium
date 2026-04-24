"""Kratos MA runtime test suite.

Session 1 tests cover state machine transitions + pre-call gates
(whitelist + budget cap). The router CRUD path is exercised indirectly
via the gate tests; a full TestClient-driven integration test ships
with Session 2 once the dispatcher is in place.
"""
