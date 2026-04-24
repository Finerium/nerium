"""Eunomia W2 NP P6 admin ops package.

Modules
-------
- :mod:`src.backend.admin.moderation`: listing moderation service + schemas.

The SQLAdmin panel referenced in the Eunomia prompt ships as a thin
FastAPI router surface in this wave because the panel's mount-at-``/admin``
pattern would duplicate the existing ``/v1/admin/*`` admin scope that
Hemera, Moros, and Astraea already established. Consolidating on the
``/v1/admin/*`` prefix keeps a single auth gate (``require_admin_scope``)
across every admin endpoint and avoids a second session cookie backend.

Session 2 (CUT per V4 #6) would have added Klaro consent UI + Termly
legal pages; those land in the frontend wave when Marshall + Kalypso
ship public surface.
"""

from __future__ import annotations

__all__: list[str] = []
