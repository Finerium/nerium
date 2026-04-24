"""Tests for :mod:`src.backend.ma.whitelist_gate`.

Owner: Kratos (W2 S1).

The whitelist gate is the first pre-call gate per
``agent_orchestration_runtime.contract.md`` Section 4.4. Behaviour
tested here:

- ``builder.live == True``: pass without raising.
- ``builder.live == False``: raise :class:`BuilderNotEnabledProblem`.
- Flag unknown / None: fail closed (raise) per the contract's
  deny-by-default on kill switches.
- Hemera outage (``get_flag`` raises): fail closed with the
  "service unavailable" detail rider.

The tests patch ``get_flag`` directly; they do not spin up the real
Postgres + Redis stack.
"""

from __future__ import annotations

import pytest

from src.backend.ma.errors import BuilderNotEnabledProblem
from src.backend.ma.whitelist_gate import (
    BUILDER_LIVE_FLAG,
    enforce_whitelist_gate,
)

USER_ID = "aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa"
TENANT_ID = "bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb"


@pytest.mark.asyncio
async def test_pass_when_flag_true(monkeypatch: pytest.MonkeyPatch) -> None:
    """``True`` value returns without raising (happy path)."""

    calls: list[dict] = []

    async def fake_get_flag(flag_name, *, user_id, tenant_id, **kwargs):
        calls.append(
            {"flag_name": flag_name, "user_id": user_id, "tenant_id": tenant_id}
        )
        return True

    monkeypatch.setattr(
        "src.backend.ma.whitelist_gate.get_flag", fake_get_flag
    )
    await enforce_whitelist_gate(user_id=USER_ID, tenant_id=TENANT_ID)
    assert calls == [
        {
            "flag_name": BUILDER_LIVE_FLAG,
            "user_id": USER_ID,
            "tenant_id": TENANT_ID,
        }
    ]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "value",
    [False, None, 0, "false", ""],
    ids=["false", "none", "zero", "string-false", "empty-string"],
)
async def test_deny_when_flag_not_true(
    monkeypatch: pytest.MonkeyPatch, value
) -> None:
    """Anything other than the literal ``True`` denies the caller.

    The gate is strict-true: coerced-truthy values (non-empty strings
    other than "1"/"True" semantics) still deny because the underlying
    Hemera flag kind is ``boolean`` and only returns Python ``True`` or
    ``False`` for registered flags.
    """

    async def fake_get_flag(*args, **kwargs):
        return value

    monkeypatch.setattr(
        "src.backend.ma.whitelist_gate.get_flag", fake_get_flag
    )
    with pytest.raises(BuilderNotEnabledProblem) as excinfo:
        await enforce_whitelist_gate(user_id=USER_ID, tenant_id=TENANT_ID)
    assert excinfo.value.slug == "builder_not_enabled"
    assert excinfo.value.status == 403


@pytest.mark.asyncio
async def test_fail_closed_on_hemera_outage(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """When ``get_flag`` raises we still deny, with an explanatory detail."""

    async def raising(*args, **kwargs):
        raise RuntimeError("postgres down")

    monkeypatch.setattr(
        "src.backend.ma.whitelist_gate.get_flag", raising
    )
    with pytest.raises(BuilderNotEnabledProblem) as excinfo:
        await enforce_whitelist_gate(user_id=USER_ID, tenant_id=TENANT_ID)
    assert "temporarily unavailable" in excinfo.value.detail
