"""Embedding provider abstraction for the marketplace search substrate.

Owner: Hyperion (W2 NP P1 Session 1).

Contract refs
-------------
- ``docs/contracts/marketplace_search.contract.md`` Section 3 (Voyage
  primary, OpenAI fallback, 1024-dim column).
- ``docs/contracts/vendor_adapter.contract.md`` (fallback chain shape).

Design
------
Three implementations slot behind a single async interface:

1. :class:`VoyageEmbedder` - primary path. ``voyage-3.5`` model, 1024-dim
   native output. Requires the ``VOYAGE_API_KEY`` env var. Depends on
   the ``voyageai`` client if installed; otherwise the embedder gracefully
   no-ops via an ImportError at instantiation.
2. :class:`OpenAIEmbedder` - fallback. ``text-embedding-3-small`` with
   ``dimensions=1024`` parameter so the returned vector matches the
   column shape. Requires ``OPENAI_API_KEY`` + the ``openai`` client.
3. :class:`DeterministicPseudoEmbedder` - dev/test fallback. Seeded from
   SHA256(text), produces a 1024-dim L2-normalised vector. NOT semantic;
   only used so tests and local dev flows have a working embedder without
   network access or API keys.

Factory :func:`get_embedder` chooses based on env vars with the
Voyage > OpenAI > Deterministic preference order. API-backed embedders
gracefully degrade on transient HTTP failure by returning a
:class:`EmbeddingResult` with ``is_fallback=True`` so callers can tag the
row for a scheduled re-embed without blocking the request path.

Dimension discipline
--------------------
Every embedder returns exactly :data:`EMBEDDING_DIM` = 1024 floats. The
pgvector column is ``vector(1024)`` and the hybrid search path casts the
query embedding to the same shape; any mismatch raises a
:class:`ValueError` before hitting Postgres so we never see a cryptic
asyncpg serialization error at query time.
"""

from __future__ import annotations

import hashlib
import logging
import math
import os
from dataclasses import dataclass
from typing import Literal, Protocol

logger = logging.getLogger(__name__)


# Locked column dimension. Changing requires a new migration + re-embed
# of every row. See docs/contracts/marketplace_search.contract.md open
# question 1 for the rationale (Voyage primary 1024 matches OpenAI
# text-embedding-3-small with dimensions=1024 param).
EMBEDDING_DIM: int = 1024


EmbeddingSource = Literal["voyage", "openai", "deterministic"]


@dataclass(frozen=True)
class EmbeddingResult:
    """Return envelope from :meth:`Embedder.embed`.

    ``source`` tags which backend produced the vector so the search
    response can surface ``query_embedding_source`` to the client
    (useful for debugging when Voyage is down and the path silently
    fell back to OpenAI or the deterministic stub).

    ``is_fallback`` is ``True`` when an API-backed embedder failed and
    the deterministic stub synthesised a placeholder so the caller's
    control flow did not break. Background jobs tag the row for a
    scheduled re-embed when ``is_fallback=True``.
    """

    vector: list[float]
    source: EmbeddingSource
    is_fallback: bool = False

    def __post_init__(self) -> None:
        if len(self.vector) != EMBEDDING_DIM:
            raise ValueError(
                f"EmbeddingResult.vector must be {EMBEDDING_DIM}-dim; "
                f"got {len(self.vector)}"
            )


class Embedder(Protocol):
    """Async embedding interface. All implementations return 1024-dim vectors."""

    source: EmbeddingSource

    async def embed(self, text: str) -> EmbeddingResult:  # pragma: no cover - protocol
        ...


# ---------------------------------------------------------------------------
# Deterministic stub. Always available.
# ---------------------------------------------------------------------------


class DeterministicPseudoEmbedder:
    """Seed-from-hash pseudo-embedder for tests and dev flows.

    IMPORTANT: the returned vectors are NOT semantic. Same input yields
    the same vector across runs (good for deterministic tests); similar
    inputs yield uncorrelated vectors (bad for real search relevance).
    The hybrid pipeline degrades gracefully: the FTS branch still returns
    meaningful hits, and the semantic branch effectively becomes a
    random tie-breaker.

    The seed algorithm:
        1. SHA256 the input bytes.
        2. Expand the 32-byte digest to 4*1024 = 4096 bytes via SHA256 chain.
        3. Unpack each 4-byte block as a uint32, map to float in [-1, 1].
        4. L2-normalise so the cosine distance against another normalised
           vector is in [0, 2] (pgvector convention).
    """

    source: EmbeddingSource = "deterministic"

    async def embed(self, text: str) -> EmbeddingResult:
        return EmbeddingResult(
            vector=_deterministic_vector(text),
            source="deterministic",
            is_fallback=False,
        )


def _deterministic_vector(text: str) -> list[float]:
    """Produce a 1024-dim L2-normalised vector seeded from SHA256(text)."""

    # Need 1024 floats = 4096 bytes. SHA256 = 32 bytes so we chain 128 digests.
    encoded = text.encode("utf-8")
    buf = bytearray()
    seed = hashlib.sha256(encoded).digest()
    while len(buf) < EMBEDDING_DIM * 4:
        buf.extend(seed)
        seed = hashlib.sha256(seed).digest()

    vec = [
        # 4-byte big-endian unsigned int -> float in [-1, 1]
        (int.from_bytes(buf[i : i + 4], "big") / 0xFFFFFFFF) * 2.0 - 1.0
        for i in range(0, EMBEDDING_DIM * 4, 4)
    ]

    # L2-normalise. Guard against the astronomically unlikely zero vector.
    norm = math.sqrt(sum(x * x for x in vec))
    if norm == 0.0:
        vec[0] = 1.0
        norm = 1.0
    return [x / norm for x in vec]


# ---------------------------------------------------------------------------
# Voyage - primary API-backed embedder.
# ---------------------------------------------------------------------------


class VoyageEmbedder:
    """Voyage ``voyage-3.5`` embedder. 1024-dim native.

    The ``voyageai`` client library is imported lazily so the module
    stays importable in environments that have not installed the
    dependency. Instantiation raises ImportError when the library is
    missing; the factory catches and falls through to the next provider.
    """

    source: EmbeddingSource = "voyage"
    MODEL: str = "voyage-3.5"

    def __init__(self, *, api_key: str | None = None) -> None:
        try:
            import voyageai  # type: ignore[import-not-found]
        except ImportError as exc:
            raise ImportError(
                "voyageai package is not installed; pip install voyageai "
                "or unset VOYAGE_API_KEY to fall back to OpenAI/deterministic."
            ) from exc

        self._voyageai = voyageai
        effective_key = api_key or os.environ.get("VOYAGE_API_KEY")
        if not effective_key:
            raise ImportError("VOYAGE_API_KEY not set")
        # Voyage 0.3+ exposes AsyncClient; older versions fall back to
        # the sync Client wrapped via asyncio.to_thread inside embed().
        self._client = voyageai.AsyncClient(api_key=effective_key)

    async def embed(self, text: str) -> EmbeddingResult:
        # Truncate to a reasonable byte budget. Voyage input is tokens;
        # 32k chars is comfortably below the 32k-token model limit.
        payload = text[:32000] if text else ""
        try:
            resp = await self._client.embed(
                texts=[payload],
                model=self.MODEL,
                input_type="document",
            )
            raw = resp.embeddings[0]
            if len(raw) != EMBEDDING_DIM:
                logger.error(
                    "voyage.embed.dim_mismatch expected=%d got=%d",
                    EMBEDDING_DIM,
                    len(raw),
                )
                raise ValueError("voyage dimension mismatch")
            return EmbeddingResult(
                vector=[float(v) for v in raw],
                source="voyage",
                is_fallback=False,
            )
        except Exception as exc:  # noqa: BLE001 - degrade to deterministic
            logger.warning("voyage.embed.failed err=%s falling_back=deterministic", exc)
            return EmbeddingResult(
                vector=_deterministic_vector(text),
                source="voyage",
                is_fallback=True,
            )


# ---------------------------------------------------------------------------
# OpenAI - fallback API-backed embedder.
# ---------------------------------------------------------------------------


class OpenAIEmbedder:
    """OpenAI ``text-embedding-3-small`` with ``dimensions=1024``.

    text-embedding-3-small natively produces 1536-dim vectors but the
    ``dimensions`` parameter requests a Matryoshka-style truncation to
    the specified size, matching the column width.
    """

    source: EmbeddingSource = "openai"
    MODEL: str = "text-embedding-3-small"

    def __init__(self, *, api_key: str | None = None) -> None:
        try:
            import openai  # type: ignore[import-not-found]
        except ImportError as exc:
            raise ImportError(
                "openai package is not installed; pip install openai "
                "or unset OPENAI_API_KEY to fall back to deterministic."
            ) from exc

        effective_key = api_key or os.environ.get("OPENAI_API_KEY")
        if not effective_key:
            raise ImportError("OPENAI_API_KEY not set")
        self._client = openai.AsyncOpenAI(api_key=effective_key)

    async def embed(self, text: str) -> EmbeddingResult:
        payload = text[:32000] if text else ""
        try:
            resp = await self._client.embeddings.create(
                model=self.MODEL,
                input=payload,
                dimensions=EMBEDDING_DIM,
            )
            raw = resp.data[0].embedding
            if len(raw) != EMBEDDING_DIM:
                logger.error(
                    "openai.embed.dim_mismatch expected=%d got=%d",
                    EMBEDDING_DIM,
                    len(raw),
                )
                raise ValueError("openai dimension mismatch")
            return EmbeddingResult(
                vector=[float(v) for v in raw],
                source="openai",
                is_fallback=False,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("openai.embed.failed err=%s falling_back=deterministic", exc)
            return EmbeddingResult(
                vector=_deterministic_vector(text),
                source="openai",
                is_fallback=True,
            )


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------


# Module-level singleton installed by :func:`set_embedder` (tests) or
# populated lazily by :func:`get_embedder`. Kept separate from the env-
# variable path so tests can pin a deterministic instance without
# unsetting provider keys.
_embedder_singleton: Embedder | None = None


def set_embedder(embedder: Embedder | None) -> None:
    """Install a process-wide embedder. Tests call with a stub.

    Passing ``None`` clears the singleton; the next call to
    :func:`get_embedder` re-resolves via the env-var priority chain.
    """

    global _embedder_singleton
    _embedder_singleton = embedder


def get_embedder() -> Embedder:
    """Return the resolved embedder singleton.

    Priority order:

    1. A stub installed via :func:`set_embedder` (test harness).
    2. Voyage if ``VOYAGE_API_KEY`` is set AND the ``voyageai`` library
       is importable.
    3. OpenAI if ``OPENAI_API_KEY`` is set AND the ``openai`` library is
       importable.
    4. :class:`DeterministicPseudoEmbedder` as the final fallback.

    Every step that fails logs at INFO so the startup trace tells the
    operator which provider was selected.
    """

    global _embedder_singleton
    if _embedder_singleton is not None:
        return _embedder_singleton

    if os.environ.get("VOYAGE_API_KEY"):
        try:
            _embedder_singleton = VoyageEmbedder()
            logger.info("marketplace.embedder.selected source=voyage")
            return _embedder_singleton
        except ImportError as exc:
            logger.info("marketplace.embedder.voyage_unavailable err=%s", exc)

    if os.environ.get("OPENAI_API_KEY"):
        try:
            _embedder_singleton = OpenAIEmbedder()
            logger.info("marketplace.embedder.selected source=openai")
            return _embedder_singleton
        except ImportError as exc:
            logger.info("marketplace.embedder.openai_unavailable err=%s", exc)

    _embedder_singleton = DeterministicPseudoEmbedder()
    logger.info("marketplace.embedder.selected source=deterministic")
    return _embedder_singleton


def build_listing_index_text(
    *,
    title: str,
    short_description: str | None = None,
    long_description: str | None = None,
    capability_tags: list[str] | None = None,
    category: str | None = None,
    subtype: str | None = None,
) -> str:
    """Concatenate listing columns into the text passed to the embedder.

    Order + separator are stable so small edits (fixing a typo in
    long_description) do not reshuffle the embedding in ways that defeat
    incremental re-indexing.
    """

    parts = [
        title or "",
        short_description or "",
        (", ".join(capability_tags) if capability_tags else ""),
        f"{category or ''} {subtype or ''}".strip(),
        long_description or "",
    ]
    return "\n\n".join(p for p in parts if p)


__all__ = [
    "EMBEDDING_DIM",
    "DeterministicPseudoEmbedder",
    "Embedder",
    "EmbeddingResult",
    "EmbeddingSource",
    "OpenAIEmbedder",
    "VoyageEmbedder",
    "build_listing_index_text",
    "get_embedder",
    "set_embedder",
]
