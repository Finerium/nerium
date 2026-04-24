"""Hemera error types.

Consumers catch these narrowly (``except FlagNotFound``) so unrelated
Postgres / Redis errors bubble up to the RFC 7807 handler rather than
being swallowed as a flag issue.
"""

from __future__ import annotations


class HemeraError(Exception):
    """Base class for Hemera errors."""


class FlagNotFound(HemeraError):
    """Raised when a flag_name is not present in ``hemera_flag``.

    The ``service.get_flag`` path swallows this by returning ``None`` so
    callers can gracefully fall back to a coded default; the router path
    surfaces it as 404 problem+json.
    """

    def __init__(self, flag_name: str) -> None:
        super().__init__(f"flag '{flag_name}' is not registered")
        self.flag_name = flag_name


class FlagKindMismatch(HemeraError):
    """Raised when a value does not match the flag's declared kind.

    Caught by the admin router and mapped to 422 problem+json. The service
    layer does not raise this; it only validates on write in ``override.py``
    and ``admin/flags.py``.
    """

    def __init__(self, flag_name: str, expected: str, got: str) -> None:
        super().__init__(
            f"flag '{flag_name}' expects kind={expected}, got {got}"
        )
        self.flag_name = flag_name
        self.expected = expected
        self.got = got


class InvalidScope(HemeraError):
    """Raised when (scope_kind, scope_id) are internally inconsistent.

    Mirrors the Postgres CHECK constraint so the API layer can return a
    clean 400 without round-tripping to Postgres for the violation.
    """

    def __init__(self, scope_kind: str, scope_id: object) -> None:
        super().__init__(
            f"invalid scope shape: kind={scope_kind!r}, id={scope_id!r}"
        )
        self.scope_kind = scope_kind
        self.scope_id = scope_id


__all__ = [
    "FlagKindMismatch",
    "FlagNotFound",
    "HemeraError",
    "InvalidScope",
]
