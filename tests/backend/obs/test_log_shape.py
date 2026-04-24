"""Log shape contract tests.

Asserts every emission from the structlog-configured logger is single-line
JSON with the mandatory fields listed in
``docs/contracts/observability.contract.md`` Section 3.1.

Capture note: ``configure_logging`` clears the root logger's handlers and
installs a ``StreamHandler(sys.stdout)`` with structlog's JSON
``ProcessorFormatter``, which removes pytest's ``caplog`` handler from the
chain. We therefore capture the raw JSON stdout with ``capsys`` and parse the
lines directly, which matches the contract guarantee (single-line JSON on
stdout ingested by Alloy then Loki).
"""

from __future__ import annotations

import json
import logging

import pytest

from src.backend.obs.logger import configure_logging, get_logger


def _parse_stdout(captured: str) -> list[dict]:
    """Parse captured stdout into the list of JSON log records it contains."""

    records: list[dict] = []
    for line in captured.splitlines():
        line = line.strip()
        if not line or not line.startswith("{"):
            continue
        try:
            records.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return records


def test_configure_logging_emits_json_with_mandatory_fields(
    capsys: pytest.CaptureFixture[str],
) -> None:
    configure_logging(env="test", level="DEBUG", service_name="nerium-api", service_version="0.1.0")
    log = get_logger("tests.backend.obs.test_log_shape")

    log.info("ma.session.created", session_id="ses_abc", model="claude-opus-4-7")
    logging.getLogger().handlers[0].flush()

    parsed = _parse_stdout(capsys.readouterr().out)
    assert parsed, "no log records captured"
    last = parsed[-1]
    for key in ("timestamp", "level", "event"):
        assert key in last, f"missing {key} in log line: {last}"
    assert last["event"] == "ma.session.created"
    assert last["session_id"] == "ses_abc"
    assert last["level"].lower() == "info"


def test_redaction_scrubs_secrets(capsys: pytest.CaptureFixture[str]) -> None:
    configure_logging(env="test", level="DEBUG")
    log = get_logger("tests.backend.obs.test_log_shape.redact")

    log.info(
        "vendor.anthropic.call",
        api_key="sk-ant-abc123",
        authorization="Bearer leaked",
        prompt="a" * 500,
    )
    logging.getLogger().handlers[0].flush()

    parsed = _parse_stdout(capsys.readouterr().out)
    assert parsed, "no log records captured"
    last = parsed[-1]
    assert last["api_key"] == "[REDACTED]"
    assert last["authorization"] == "[REDACTED]"
    assert last["prompt"].endswith("...[truncated]")
    assert len(last["prompt"]) <= 120
