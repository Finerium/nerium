"""Template renderer.

Per ``docs/contracts/email_transactional.contract.md`` Section 3.2 the
MVP path pre-renders React Email components to static HTML at build
time and performs ``{{ placeholder }}`` substitution at send time. This
keeps the FastAPI runtime Python-only: no Node subprocess fork per
send, no React Email bundle in the hot path.

Build-time pipeline (out of scope for this module)
--------------------------------------------------
``pnpm exec react-email export`` reads every ``.tsx`` under
``src/backend/email/templates/`` and emits the inlined-CSS HTML shell
into ``src/backend/email/templates/rendered/<name>.html``. The shell
contains Jinja-style ``{{ key }}`` markers that match the props
contract for each template. The build artifacts are checked into the
repo so pytest fixtures can read them without an npm install step.

Runtime substitution
--------------------
The substitution engine here is deliberately NOT Jinja2; it implements
a narrow subset (single-pass ``{{ name }}`` replacement with HTML
escaping of interpolated values) to avoid introducing a templating
library on the critical send path and to make template tampering
auditable. If a template needs loops or conditionals those must be
resolved at build time in the React Email component source.

Missing renders fall back to a compiled-in minimal shell so Pheme can
ship before every .tsx has been authored + rendered. The fallback shell
is clearly labeled in the output ``<title>`` so QA notices the gap.
"""

from __future__ import annotations

import html
import re
from pathlib import Path

from src.backend.email.templates import get_template_meta

_PLACEHOLDER_RE = re.compile(r"\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}")

_RENDERED_DIR = Path(__file__).resolve().parent / "templates" / "rendered"


def render_html(template_name: str, props: dict[str, object]) -> str:
    """Render a template to HTML with ``{{ key }}`` substitution.

    Parameters
    ----------
    template_name
        Registry key. Must resolve via :func:`get_template_meta`.
    props
        Mapping from placeholder name to value. Non-string values are
        coerced via :func:`str`. Values are HTML-escaped before
        substitution to preserve safety against prop-borne HTML
        injection.

    Missing placeholders remain as literal ``{{ key }}`` markers in the
    output which makes the gap obvious in Mailtrap during development.
    Callers SHOULD validate props against the template's documented
    schema before send.
    """

    meta = get_template_meta(template_name)
    shell = _load_shell(template_name)
    return _substitute(shell, props, template_meta=meta)


def render_text(template_name: str, props: dict[str, object]) -> str:
    """Render the plain-text fallback body.

    Provider best practice (Resend + SES + Postmark) is to ship a
    text/plain alternative alongside text/html so spam filters score
    the message lower and screen readers render gracefully. The text
    body is derived from the same shell but stripped of HTML tags.

    If a dedicated ``<name>.txt`` artifact exists under
    ``templates/rendered/`` we read it verbatim; otherwise we collapse
    the rendered HTML body.
    """

    txt_path = _RENDERED_DIR / f"{template_name}.txt"
    if txt_path.exists():
        shell = txt_path.read_text(encoding="utf-8")
    else:
        html_body = render_html(template_name, props)
        shell = _strip_tags(html_body)
    return _substitute(shell, props, template_meta=get_template_meta(template_name))


def _load_shell(template_name: str) -> str:
    """Read the build-time HTML shell or return the fallback stub.

    The fallback stub is intentionally ugly so reviewers notice the
    missing render artifact during demo dry-runs. It still includes the
    unsubscribe link so compliance is preserved even before the React
    Email pipeline runs.
    """

    path = _RENDERED_DIR / f"{template_name}.html"
    if path.exists():
        return path.read_text(encoding="utf-8")
    return _fallback_shell(template_name)


def _fallback_shell(template_name: str) -> str:
    """Minimal shell used when a build-time artifact is missing."""

    meta = get_template_meta(template_name)
    return (
        "<!doctype html>\n"
        "<html lang=\"en\">\n"
        "<head>\n"
        "<meta charset=\"utf-8\">\n"
        f"<title>[PENDING RENDER] {meta.subject}</title>\n"
        "</head>\n"
        "<body style=\"font-family: system-ui, -apple-system, "
        "Segoe UI, Roboto, sans-serif; color: #111; background: #fff;\">\n"
        f"  <h1>{meta.subject}</h1>\n"
        f"  <p>Hello {{{{ recipient_name }}}},</p>\n"
        f"  <p>This is a placeholder body for the <strong>{meta.name}</strong> "
        "template. The React Email shell has not been exported yet. The "
        "content below is substituted from the template props at send time.</p>\n"
        "  <pre style=\"white-space: pre-wrap;\">{{ body_text }}</pre>\n"
        "  <p style=\"margin-top: 32px; font-size: 12px; color: #666;\">\n"
        "    NERIUM, Infrastructure for the AI agent economy.<br>\n"
        "    <a href=\"{{ unsubscribe_url }}\">Unsubscribe</a>\n"
        "  </p>\n"
        "</body>\n"
        "</html>\n"
    )


def _substitute(
    shell: str,
    props: dict[str, object],
    *,
    template_meta,  # TemplateMeta; annotated loosely to avoid circular import
) -> str:
    """Substitute ``{{ key }}`` markers with HTML-escaped prop values."""

    # The contract requires every transactional email carry an
    # unsubscribe footer. If the caller forgot to include an
    # unsubscribe_url prop we leave the marker in place; the outer
    # send() fills it after HMAC construction so callers never have to
    # compute the token themselves.
    merged: dict[str, object] = {
        "template_name": template_meta.name,
        "template_version": template_meta.version,
        "subject": template_meta.subject,
    }
    merged.update(props)

    def _replace(match: re.Match[str]) -> str:
        key = match.group(1)
        if key not in merged:
            return match.group(0)
        value = merged[key]
        if value is None:
            return ""
        return html.escape(str(value), quote=True)

    return _PLACEHOLDER_RE.sub(_replace, shell)


_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")


def _strip_tags(body: str) -> str:
    """Minimal HTML-to-text collapse for the text/plain alternative.

    Good enough for transactional templates which are layout-light.
    Production MAY swap in ``selectolax`` or ``html2text`` post-
    hackathon for better list + table handling.
    """

    no_tags = _TAG_RE.sub(" ", body)
    decoded = html.unescape(no_tags)
    return _WS_RE.sub(" ", decoded).strip() + "\n"


__all__ = ["render_html", "render_text"]
