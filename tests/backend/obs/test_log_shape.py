"""Log shape contract tests.

Asserts every emission from the structlog-configured logger is single-line
JSON with the mandatory fields listed in
``docs/contracts/observability.contract.md`` Section 3.1.
"""

from __future__ import annotations

import json
import logging

import pytest

from src.backend.obs.logger import configure_logging, get_logger


def _capture(caplog: pytest.LogCaptureFixture) -> list[dict]:
    """Return parsed JSON for each captured log line.

    structlog's ProcessorFormatter renders the record's ``msg`` attribute
    (already a JSON string for structlog loggers). caplog intercepts before
    the handler formatter runs, so we also check the formatted output via
    ``record.getMessage()``.
    """

    lines: list[dict] = []
    for record in caplog.records:
        try:
            payload = record.msg if isinstance(record.msg, dict) else json.loads(str(record.msg))
            lines.append(payload)
        except (TypeError, ValueError):
            # stdlib records that have not been routed through structlog.
            lines.append({"_raw": record.getMessage(), "levelname": record.levelname})
    return lines


def test_configure_logging_emits_json_with_mandatory_fields(caplog: pytest.LogCaptureFixture) -> None:
    configure_logging(env="test", level="DEBUG", service_name="nerium-api", service_version="0.1.0")
    log = get_logger("tests.backend.obs.test_log_shape")

    caplog.set_level(logging.DEBUG)
    log.info("ma.session.created", session_id="ses_abc", model="claude-opus-4-7")

    parsed = _capture(caplog)
    assert parsed, "no log records captured"
    last = parsed[-1]
    # Mandatory fields per contract 3.1.
    for key in ("timestamp", "level", "event"):
        assert key in last, f"missing {key} in log line: {last}"
    assert last["event"] == "ma.session.created"
    assert last["session_id"] == "ses_abc"
    assert last["level"].lower() == "info"


def test_redaction_scrubs_secrets(caplog: pytest.LogCaptureFixture) -> None:
    configure_logging(env="test", level="DEBUG")
    log = get_logger("tests.backend.obs.test_log_shape.redact")

    caplog.set_level(logging.DEBUG)
    log.info(
        "vendor.anthropic.call",
        api_key="sk-ant-abc123",
        authorization="Bearer leaked",
        prompt="a" * 500,
    )

    parsed = _capture(caplog)
    last = parsed[-1]
    assert last["api_key"] == "[REDACTED]"
    assert last["authorization"] == "[REDACTED]"
    assert last["prompt"].endswith("...[truncated]")
    assert len(last["prompt"]) <= 120
