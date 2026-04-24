"""UUID v7 helper, Khronos-local.

Aether ships the canonical helper at ``src/backend/utils/uuid7.py`` per
``docs/contracts/rest_api_base.contract.md`` Section 6. Prefer that import in
new code. This module stays as an escape hatch for routers that want to
remain runnable even when Aether's utils module is still landing.
"""

from __future__ import annotations

import os
import time


def uuid7_str() -> str:
    """Return a UUID v7 hyphenated lowercase string."""

    ts_ms = int(time.time() * 1000) & 0xFFFFFFFFFFFF
    rand_a = int.from_bytes(os.urandom(2), "big") & 0x0FFF
    rand_b = int.from_bytes(os.urandom(8), "big") & 0x3FFFFFFFFFFFFFFF

    ts_hex = f"{ts_ms:012x}"
    ver_rand_a = f"7{rand_a:03x}"
    var_rand_b = rand_b | (0b10 << 62)
    var_rand_b_hex = f"{var_rand_b:016x}"

    return f"{ts_hex[:8]}-{ts_hex[8:12]}-{ver_rand_a}-{var_rand_b_hex[:4]}-{var_rand_b_hex[4:]}"
