"""HTTP routes for ``/v1/marketplace/search`` + autocomplete.

Owner: Hyperion (W2 NP P1 Session 1).

Endpoints
---------
- ``GET /v1/marketplace/search``           hybrid FTS + pgvector + RRF
- ``GET /v1/marketplace/search/autocomplete`` pg_trgm prefix + fuzzy

Design
------
- No auth requirement beyond the middleware stack: public marketplace
  search is world-readable per contract Section 10 open question 3.
  Unauthenticated callers can search; the service-level SQL filters on
  ``status='published'`` so drafts + archived rows never leak.
- Query params map 1:1 to :class:`SearchQuery`. Missing ``q`` or empty
  string returns 422 per contract Section 8.
- Response shape mirrors the Pythia contract Section 3.3 ``SearchResponse``.
  We surface ``query_embedding_source`` so the FE can log which provider
  backed the semantic branch (useful when Voyage was down + OpenAI stood
  in, or when the deterministic stub is in play during dev).
"""

from __future__ import annotations

import logging
from typing import Literal

from fastapi import APIRouter, Query, status
from pydantic import BaseModel, Field

from src.backend.errors import ValidationProblem
from src.backend.marketplace import search as search_service
from src.backend.marketplace.search import (
    AUTOCOMPLETE_DEFAULT_LIMIT,
    AUTOCOMPLETE_MAX_LIMIT,
    DEFAULT_LIMIT,
    MAX_LIMIT,
    SearchQuery,
    SortMode,
)
from src.backend.models.marketplace_listing import ListingPublic

logger = logging.getLogger(__name__)

search_router = APIRouter(
    prefix="/marketplace/search",
    tags=["marketplace", "search"],
)


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------


class SearchResponse(BaseModel):
    """Wire envelope for ``GET /v1/marketplace/search``.

    ``items`` is the final fused+sorted page of listings. ``fused_scores``
    line up 1:1 with ``items`` so the FE can render a debug score tag.
    ``query_embedding_source`` names the embedder that handled the
    semantic branch (voyage | openai | deterministic); downstream agents
    use this to detect fallback state without consuming logs.
    """

    items: list[ListingPublic]
    fused_scores: list[float] = Field(default_factory=list)
    total_candidate_count: int = 0
    query_embedding_source: Literal["voyage", "openai", "deterministic"]
    embedding_is_fallback: bool = False
    next_cursor: str | None = None
    has_more: bool = False


class AutocompleteResponse(BaseModel):
    """Wire envelope for ``GET /v1/marketplace/search/autocomplete``."""

    suggestions: list[str]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@search_router.get(
    "",
    response_model=SearchResponse,
    status_code=status.HTTP_200_OK,
)
async def search_endpoint(
    q: str = Query(
        ...,
        min_length=1,
        max_length=200,
        description="Free-text search query. Bilingual Indonesian + English tokens supported.",
    ),
    category: str | None = Query(
        None, description="Filter by top-level category (snake_case)."
    ),
    subtype: str | None = Query(
        None, description="Filter by subtype; must be consistent with category."
    ),
    license_type: str | None = Query(
        None,
        alias="license",
        description="Filter by license enum (MIT, CC0, CC_BY_4, APACHE_2, ...).",
    ),
    pricing_model: str | None = Query(
        None, description="Filter by pricing_model enum."
    ),
    price_min: float | None = Query(
        None, ge=0.0, description="Inclusive lower bound on pricing_details.amount_usd."
    ),
    price_max: float | None = Query(
        None, ge=0.0, description="Inclusive upper bound on pricing_details.amount_usd."
    ),
    sort: SortMode = Query(
        "relevance",
        description="Sort order: relevance (RRF) | recent | trust.",
    ),
    cursor: str | None = Query(
        None, description="Opaque cursor from a prior page."
    ),
    limit: int = Query(
        DEFAULT_LIMIT,
        ge=1,
        le=MAX_LIMIT,
        description=f"Page size 1..{MAX_LIMIT}.",
    ),
) -> SearchResponse:
    """Hybrid FTS + pgvector search with RRF merge (k=60).

    Empty queries surface 422 via the ``min_length=1`` guard. Very short
    queries (1 character) still execute but typically return zero FTS
    matches; the semantic branch carries the weight.
    """

    # Compose + validate via the dataclass so the service layer sees the
    # same shape whether the caller came through HTTP or the MCP tool.
    try:
        query = SearchQuery(
            q=q,
            category=category,
            subtype=subtype,
            license_type=license_type,
            pricing_model=pricing_model,
            price_min_usd=price_min,
            price_max_usd=price_max,
            sort=sort,
            limit=limit,
            cursor=cursor,
        )
    except ValueError as exc:
        raise ValidationProblem(detail=str(exc)) from exc

    result = await search_service.hybrid_search(query)

    return SearchResponse(
        items=result.items,
        fused_scores=result.fused_scores,
        total_candidate_count=result.total_candidate_count,
        query_embedding_source=result.embedding_source,
        embedding_is_fallback=result.embedding_is_fallback,
        next_cursor=result.next_cursor,
        has_more=result.has_more,
    )


@search_router.get(
    "/autocomplete",
    response_model=AutocompleteResponse,
    status_code=status.HTTP_200_OK,
)
async def autocomplete_endpoint(
    q: str = Query(
        ...,
        min_length=1,
        max_length=50,
        description="Prefix or near-prefix. Trigram similarity covers small typos.",
    ),
    limit: int = Query(
        AUTOCOMPLETE_DEFAULT_LIMIT,
        ge=1,
        le=AUTOCOMPLETE_MAX_LIMIT,
        description=f"Suggestion count 1..{AUTOCOMPLETE_MAX_LIMIT}.",
    ),
) -> AutocompleteResponse:
    """Return title suggestions ranked by trigram similarity."""

    suggestions = await search_service.autocomplete_suggest(q, limit=limit)
    return AutocompleteResponse(suggestions=suggestions)


__all__ = ["search_router"]
