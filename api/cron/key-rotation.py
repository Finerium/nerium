"""Vercel Cron Jobs entry: weekly Tethys agent identity key rotation sweep.

Owner: Aether-Vercel (NP T6 deploy lane). Replaces the Arq cron worker
per V6 D3 decision. Schedule: ``0 3 * * 0`` (Sundays 03:00 UTC) per
``vercel.json`` ``crons`` block, matching the original arq.cron
``weekday="sun" hour={3} minute={0}`` registration in
``src.backend.registry.identity.cron.key_rotation``.

Body invokes :func:`tethys_key_rotation_sweep` with an empty ctx dict
because the Arq cron body discards ctx in line 592 of the original
module. Returns a summary dict (candidate count, rotated count,
failed count, lists) for Vercel's cron log dashboard.
"""

from __future__ import annotations

import asyncio
import json
import logging
import sys
from pathlib import Path

# api/cron/key-rotation.py -> project root is two parents up.
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from src.backend.registry.identity.cron.key_rotation import (  # noqa: E402
    tethys_key_rotation_sweep,
)

logger = logging.getLogger(__name__)


def handler(event: dict, context: object) -> dict:
    """Vercel Cron Jobs entry point."""

    del event, context
    try:
        summary = asyncio.run(tethys_key_rotation_sweep(ctx={}))
    except Exception:
        logger.exception("vercel.cron.key_rotation.failed")
        return {
            "statusCode": 500,
            "body": json.dumps({"detail": "key rotation sweep failed"}),
        }

    return {
        "statusCode": 200,
        "headers": {"content-type": "application/json"},
        "body": json.dumps({"summary": summary}),
    }
