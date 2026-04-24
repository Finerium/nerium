"""Tests for the marketplace embedding provider abstraction.

Owner: Hyperion (W2 NP P1 S1).
"""

from __future__ import annotations

import math

import pytest

from src.backend.marketplace import embedding


def test_deterministic_embedder_returns_correct_dim() -> None:
    import asyncio

    emb = embedding.DeterministicPseudoEmbedder()
    res = asyncio.run(emb.embed("hello world"))
    assert len(res.vector) == embedding.EMBEDDING_DIM == 1024
    assert res.source == "deterministic"
    assert res.is_fallback is False


def test_deterministic_embedder_is_l2_normalized() -> None:
    import asyncio

    emb = embedding.DeterministicPseudoEmbedder()
    res = asyncio.run(emb.embed("normalise me"))
    norm = math.sqrt(sum(x * x for x in res.vector))
    assert math.isclose(norm, 1.0, rel_tol=1e-6)


def test_deterministic_embedder_is_reproducible() -> None:
    import asyncio

    emb = embedding.DeterministicPseudoEmbedder()
    a = asyncio.run(emb.embed("same input"))
    b = asyncio.run(emb.embed("same input"))
    assert a.vector == b.vector


def test_deterministic_embedder_differs_on_different_inputs() -> None:
    import asyncio

    emb = embedding.DeterministicPseudoEmbedder()
    a = asyncio.run(emb.embed("alpha"))
    b = asyncio.run(emb.embed("beta"))
    assert a.vector != b.vector


def test_deterministic_empty_string_still_produces_valid_vector() -> None:
    import asyncio

    emb = embedding.DeterministicPseudoEmbedder()
    res = asyncio.run(emb.embed(""))
    assert len(res.vector) == 1024
    # Should still be L2-normalised (hash produces non-zero seed).
    norm = math.sqrt(sum(x * x for x in res.vector))
    assert math.isclose(norm, 1.0, rel_tol=1e-6)


def test_embedding_result_rejects_wrong_dim() -> None:
    with pytest.raises(ValueError, match="1024"):
        embedding.EmbeddingResult(
            vector=[0.0] * 128, source="deterministic", is_fallback=False
        )


def test_factory_returns_deterministic_when_no_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("VOYAGE_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    embedding.set_embedder(None)
    result = embedding.get_embedder()
    assert isinstance(result, embedding.DeterministicPseudoEmbedder)
    # Singleton is cached; a second call returns the same instance.
    assert embedding.get_embedder() is result
    embedding.set_embedder(None)  # cleanup


def test_factory_prefers_voyage_when_key_set(monkeypatch: pytest.MonkeyPatch) -> None:
    """When VOYAGE_API_KEY is set but voyageai is not importable, the factory
    falls through to OpenAI. When OpenAI is also unavailable, it falls
    through to Deterministic. This mirrors the production env where the
    packages are optional deps.
    """

    embedding.set_embedder(None)
    monkeypatch.setenv("VOYAGE_API_KEY", "dummy-key")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    result = embedding.get_embedder()
    # In this test env the voyageai package is not installed, so the
    # factory falls back to deterministic with an INFO log.
    assert isinstance(result, embedding.DeterministicPseudoEmbedder)
    embedding.set_embedder(None)


def test_factory_prefers_openai_after_voyage_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    embedding.set_embedder(None)
    monkeypatch.delenv("VOYAGE_API_KEY", raising=False)
    monkeypatch.setenv("OPENAI_API_KEY", "dummy-key")
    result = embedding.get_embedder()
    # openai is also not installed in this env, so deterministic again.
    assert isinstance(result, embedding.DeterministicPseudoEmbedder)
    embedding.set_embedder(None)


def test_factory_accepts_stub_installed_via_set_embedder() -> None:
    class StubEmbedder:
        source = "deterministic"

        async def embed(self, text: str) -> embedding.EmbeddingResult:
            return embedding.EmbeddingResult(
                vector=[0.0] * 1024, source="deterministic", is_fallback=False
            )

    stub = StubEmbedder()
    embedding.set_embedder(stub)
    assert embedding.get_embedder() is stub
    embedding.set_embedder(None)


def test_build_listing_index_text_concatenates_in_stable_order() -> None:
    text = embedding.build_listing_index_text(
        title="My Agent",
        short_description="short summary",
        long_description="long markdown body",
        capability_tags=["alpha", "beta"],
        category="core_agent",
        subtype="agent",
    )
    assert "My Agent" in text
    assert "short summary" in text
    assert "long markdown body" in text
    assert "alpha, beta" in text
    assert "core_agent agent" in text
    # Stable ordering: title comes first.
    assert text.index("My Agent") < text.index("short summary")
    assert text.index("short summary") < text.index("long markdown body")


def test_build_listing_index_text_handles_missing_fields() -> None:
    text = embedding.build_listing_index_text(title="Just a title")
    assert text == "Just a title"


def test_voyage_embedder_raises_import_error_when_voyageai_missing() -> None:
    """In CI the voyageai package is not installed; instantiation should
    raise ImportError so the factory falls through without crashing."""

    with pytest.raises(ImportError):
        embedding.VoyageEmbedder(api_key="dummy")


def test_openai_embedder_raises_import_error_when_openai_missing() -> None:
    with pytest.raises(ImportError):
        embedding.OpenAIEmbedder(api_key="dummy")
