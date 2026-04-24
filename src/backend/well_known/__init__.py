"""OAuth + MCP well-known metadata static assets.

Owner: Khronos. The JSON files alongside this package init are served by the
FastAPI route handler in ``src/backend/mcp/well_known.py`` (RFC 9728 Protected
Resource Metadata, RFC 8414 Authorization Server Metadata). Keeping them as
filesystem assets rather than inline dicts lets ops audit the exact bytes
Claude.ai discovery agents receive without a Python stack trace between them.

Contract: ``docs/contracts/mcp_server.contract.md`` Section 3.2.
"""

from __future__ import annotations

from importlib import resources
from pathlib import Path

_PACKAGE_ROOT = Path(__file__).resolve().parent


def asset_path(filename: str) -> Path:
    """Return absolute filesystem path to a bundled JSON asset."""

    candidate = _PACKAGE_ROOT / filename
    if not candidate.is_file():
        raise FileNotFoundError(
            f"well-known asset '{filename}' missing from {_PACKAGE_ROOT}"
        )
    return candidate


def load_asset_bytes(filename: str) -> bytes:
    """Read a bundled JSON asset, returning its raw bytes."""

    try:
        return (resources.files(__name__) / filename).read_bytes()
    except (AttributeError, FileNotFoundError):
        return asset_path(filename).read_bytes()
