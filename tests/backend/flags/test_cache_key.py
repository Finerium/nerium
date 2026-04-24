"""Cache key convention tests (pure function, no Redis)."""

from __future__ import annotations

from uuid import UUID

from src.backend.flags.cache import cache_key


USER = UUID("11111111-1111-7111-8111-111111111111")
TENANT = UUID("aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa")


def test_global_key() -> None:
    assert cache_key("builder.live", user_id=None, tenant_id=None) == (
        "flag:builder.live:none:none"
    )


def test_user_key() -> None:
    assert cache_key("builder.live", user_id=USER, tenant_id=None) == (
        f"flag:builder.live:{USER}:none"
    )


def test_tenant_key() -> None:
    assert cache_key("builder.live", user_id=None, tenant_id=TENANT) == (
        f"flag:builder.live:none:{TENANT}"
    )


def test_user_tenant_key() -> None:
    assert cache_key("builder.live", user_id=USER, tenant_id=TENANT) == (
        f"flag:builder.live:{USER}:{TENANT}"
    )


def test_user_id_as_string_still_hits_same_key() -> None:
    """Passing str vs UUID produces the same key (no surprise misses)."""

    key_uuid = cache_key("builder.live", user_id=USER, tenant_id=None)
    key_str = cache_key("builder.live", user_id=str(USER), tenant_id=None)
    assert key_uuid == key_str


def test_key_pattern_matches_invalidation_glob() -> None:
    """Glob used by :func:`cache.invalidate_flag` must match every variant."""

    import fnmatch

    pattern = "flag:builder.live:*"
    for key in [
        cache_key("builder.live", user_id=None, tenant_id=None),
        cache_key("builder.live", user_id=USER, tenant_id=None),
        cache_key("builder.live", user_id=None, tenant_id=TENANT),
        cache_key("builder.live", user_id=USER, tenant_id=TENANT),
    ]:
        assert fnmatch.fnmatch(key, pattern), f"key={key} missed glob={pattern}"
