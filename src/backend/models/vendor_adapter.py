"""Pydantic v2 projection for ``vendor_adapter`` (read-only scaffold).

Crius owns the write + envelope-encryption path; this projection is the
READ view. Encrypted columns (``config_encrypted``, ``dek_wrapped``)
are deliberately NOT surfaced here: the wire format only exposes what
downstream consumers need (vendor + request_type + priority + status).
Matching migration ``038_vendor_adapter``.
"""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import Field

from src.backend.models.base import TenantBaseModel

Vendor = Literal["anthropic", "openai", "voyage", "vllm_local", "other"]
RequestType = Literal["chat", "embedding", "image_gen", "tts", "vision"]
AdapterStatus = Literal["active", "disabled", "circuit_open"]


class VendorAdapter(TenantBaseModel):
    """Row projection of ``vendor_adapter``; encrypted columns omitted."""

    vendor: Vendor
    request_type: RequestType
    priority: int = Field(default=100)
    status: AdapterStatus = Field(default="active")
    kill_switch_flag: Optional[str] = Field(
        default=None,
        description="Hemera flag name that forces circuit_open when true.",
    )
    metadata: dict[str, Any] = Field(default_factory=dict)


__all__ = [
    "AdapterStatus",
    "RequestType",
    "Vendor",
    "VendorAdapter",
]
