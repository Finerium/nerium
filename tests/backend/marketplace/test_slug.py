"""Unit tests for :func:`src.backend.marketplace.listing_service.derive_slug`.

The slug helper must produce output that matches the Postgres CHECK
constraint ``^[a-z0-9]+(-[a-z0-9]+)*$`` installed by migration 046.
Guarding the regex shape here means the INSERT never fails on slug
validity.
"""

from __future__ import annotations

import re

import pytest

from src.backend.marketplace.listing_service import derive_slug

_SLUG_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")


@pytest.mark.parametrize(
    "title,expected",
    [
        ("Hello World", "hello-world"),
        ("Retro Sprite Pack v2", "retro-sprite-pack-v2"),
        ("   Leading Trailing   ", "leading-trailing"),
        ("dashes---collapse", "dashes-collapse"),
        ("UPPER_case__Name", "upper-case-name"),
        ("àçcénted Façade", "accented-facade"),
        ("!!!", "listing"),  # falls back to 'listing' when nothing alnum remains
        ("", "listing"),
    ],
)
def test_derive_slug_shapes(title: str, expected: str) -> None:
    assert derive_slug(title) == expected
    assert _SLUG_RE.match(derive_slug(title))


def test_derive_slug_truncates_to_60_chars() -> None:
    title = "a" * 100
    out = derive_slug(title)
    assert len(out) <= 60
    assert _SLUG_RE.match(out)


def test_derive_slug_strips_trailing_hyphen_after_truncation() -> None:
    """A long title that truncates on a boundary must not end with '-'.

    Covers the regex constraint rejecting ``foo-bar-`` shapes.
    """

    # 58 a's, a hyphen, then more. Truncation at 60 would land on '-'.
    title = ("a" * 58) + "-zzzzzz"
    out = derive_slug(title)
    assert not out.endswith("-")
    assert _SLUG_RE.match(out)
