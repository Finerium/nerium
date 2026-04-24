"""GDPR compliance surface.

Owner: Eunomia (W2 NP P6 S1).

Contents
--------
- :mod:`src.backend.gdpr.export`: synchronous small-data ZIP export.
  Arq async path DEFERRED per V4 #6 CUT.
- :mod:`src.backend.gdpr.delete`: soft-delete + session revoke.
  Full purge cron DEFERRED post-submit.
- :mod:`src.backend.gdpr.consent`: consent history CRUD backing the
  Klaro banner (Session 2 CUT frontend) plus the ``POST /v1/me/consent``
  endpoint.
"""

from __future__ import annotations

__all__: list[str] = []
