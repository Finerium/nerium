"""Vercel Cron Jobs entry: nightly trust score refresh sweep.

Owner: Aether-Vercel (NP T6 deploy lane). Replaces the Arq cron worker
runtime per V6 D3 decision (Arq dropped, Vercel Cron Jobs hit HTTP
endpoints directly). Schedule: ``0 2 * * *`` (02:00 UTC daily) per
``vercel.json`` ``crons`` block.

Body invokes :func:`src.backend.trust.cron.refresh_scores.run_refresh_batch`
inside ``asyncio.run`` so the existing async cron primitive ships
unchanged. The function returns a summary dict that we surface in the
HTTP response body for Vercel's cron log dashboard.
"""

from __future__ import annotations

import asyncio
import json
import logging
import sys
from pathlib import Path

# api/cron/trust-refresh.py -> project root is two parents up.
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from src.backend.trust.cron.refresh_scores import run_refresh_batch  # noqa: E402

logger = logging.getLogger(__name__)


def handler(event: dict, context: object) -> dict:
    """Vercel Cron Jobs entry point.

    Vercel passes a Lambda-style ``event`` + ``context`` pair. We
    ignore both because :func:`run_refresh_batch` reads its tuning
    knobs from the live settings + DB rather than the request payload.
    """

    del event, context
    try:
        summary = asyncio.run(run_refresh_batch())
    except Exception:
        logger.exception("vercel.cron.trust_refresh.failed")
        return {
            "statusCode": 500,
            "body": json.dumps({"detail": "trust refresh batch failed"}),
        }

    return {
        "statusCode": 200,
        "headers": {"content-type": "application/json"},
        "body": json.dumps({"summary": summary}),
    }
