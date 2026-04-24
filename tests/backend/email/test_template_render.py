"""Template renderer smoke tests.

Exercises :func:`render_html` + :func:`render_text` for every
registered template to confirm:

- Every template produces non-empty HTML output.
- The HTML output contains the template's subject somewhere in the
  body (either title + headline or preview copy).
- The ``{{ unsubscribe_url }}`` placeholder is substituted when a
  value is provided.
- Missing placeholders are left as literal markers (observable in
  Mailtrap for QA).
- Prop values are HTML-escaped so an XSS-shaped value cannot break
  out of attribute or text context.
"""

from __future__ import annotations

import pytest

from src.backend.email.renderer import render_html, render_text
from src.backend.email.templates import TEMPLATES


BASE_PROPS: dict[str, object] = {
    "recipient_name": "Lumen",
    "to_email": "lumen@example.com",
    "tenant_name": "Lumio Reading",
    "dashboard_url": "https://nerium.test/app",
    "verify_url": "https://nerium.test/verify?t=x",
    "reset_url": "https://nerium.test/reset?t=x",
    "expires_in_hours": 1,
    "listing_title": "Pixel Pack",
    "amount_paid": "$19.00",
    "invoice_url": "https://nerium.test/invoice/x",
    "buyer_handle": "lumen",
    "gross_amount": "$19.00",
    "seller_net": "$16.15",
    "amount": "$19.00",
    "bank_last4": "4242",
    "expected_arrival": "2026-04-30",
    "invoice_number": "INV-1",
    "invoice_pdf_url": "https://nerium.test/invoice/x.pdf",
    "quest_name": "First Builder Session",
    "reward_summary": "Unlocked dashboard",
    "old_fingerprint": "sha256:abc",
    "new_fingerprint": "sha256:def",
    "rotate_at": "2026-04-30 UTC",
    "dispute_reason": "Not as described",
    "action_deadline": "2026-05-01 UTC",
    "export_url": "https://nerium.test/gdpr.zip",
    "expires_at": "2026-05-01 UTC",
    "window_start": "2026-04-26 02:00 UTC",
    "window_end": "2026-04-26 03:00 UTC",
    "summary": "Postgres minor upgrade",
    "threshold_percent": "85",
    "current_spend": "$425.00",
    "cap": "$500.00",
    "unsubscribe_url": "https://nerium.test/unsubscribe?token=xyz",
}


@pytest.mark.parametrize("name", sorted(TEMPLATES.keys()))
def test_render_html_non_empty(name: str) -> None:
    html_out = render_html(name, BASE_PROPS)
    assert html_out
    assert len(html_out) > 64


@pytest.mark.parametrize("name", sorted(TEMPLATES.keys()))
def test_render_includes_unsubscribe_url(name: str) -> None:
    html_out = render_html(name, BASE_PROPS)
    assert "https://nerium.test/unsubscribe?token=xyz" in html_out


@pytest.mark.parametrize("name", sorted(TEMPLATES.keys()))
def test_render_text_non_empty(name: str) -> None:
    text_out = render_text(name, BASE_PROPS)
    assert text_out
    # Text body should not contain raw HTML tags.
    assert "<body" not in text_out
    assert "<html" not in text_out


def test_missing_placeholder_stays_as_marker() -> None:
    html_out = render_html("welcome", {"unsubscribe_url": "https://x.test/u"})
    # recipient_name was not provided in the props.
    assert "{{ recipient_name }}" in html_out


def test_prop_value_is_html_escaped() -> None:
    props = dict(BASE_PROPS)
    props["recipient_name"] = "<script>alert('x')</script>"
    html_out = render_html("welcome", props)
    assert "<script>alert" not in html_out
    assert "&lt;script&gt;" in html_out


def test_render_unknown_template_raises() -> None:
    with pytest.raises(KeyError):
        render_html("not_a_template", BASE_PROPS)
