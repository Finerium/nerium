"""MCP tool: search_marketplace.

Contract: ``docs/contracts/mcp_tool_registry.contract.md`` Section 4.3.
Backed by Hyperion's hybrid FTS + pgvector RRF merge on the
``marketplace_listing`` table (Phanes migration). Until both ship the
tool returns an empty result set with ``query_echo`` preserved so
Claude.ai sees a stable schema.
"""


from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from src.backend.mcp.auth import current_mcp_principal
from src.backend.mcp.deps import db_fetch
from src.backend.mcp.server import mcp_server
from src.backend.mcp.tools._base import tool_wrap


class SearchMarketplaceInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    query: str = Field(..., min_length=1, max_length=200)
    category: Literal[
        "core_agent",
        "content",
        "infrastructure",
        "assets",
        "services",
        "premium",
        "data",
        "all",
    ] = "all"
    license: list[str] | None = Field(default=None, max_length=10)
    pricing_model: list[str] | None = Field(default=None, max_length=10)
    sort: Literal["relevance", "trust", "newest", "price_asc", "price_desc"] = "relevance"
    limit: int = Field(default=10, ge=1, le=50)
    cursor: str | None = Field(default=None, max_length=512)


class ListingHit(BaseModel):
    model_config = ConfigDict(extra="forbid")

    listing_id: str
    slug: str
    title: str
    short_description: str
    category: str
    subtype: str
    license: str
    pricing_model: str
    price_hint: dict | None = None
    trust_score: float = Field(..., ge=0.0, le=1.0)
    rrf_score: float = Field(..., ge=0.0)
    thumbnail_url: str | None = None


class SearchMarketplaceOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[ListingHit]
    total_hits: int = Field(..., ge=0)
    next_cursor: str | None = None
    query_echo: str


_QUERY = """
SELECT listing_id::text,
       slug,
       title,
       short_description,
       category,
       subtype,
       license,
       pricing_model,
       price_hint,
       COALESCE(trust_score, 0.0) AS trust_score,
       COALESCE(ts_rank(fts, plainto_tsquery('english', $1)), 0.0) AS rrf_score,
       thumbnail_url
  FROM marketplace_listing
 WHERE ($2::text = 'all' OR category = $2::text)
   AND fts @@ plainto_tsquery('english', $1)
   AND status = 'published'
 ORDER BY rrf_score DESC, trust_score DESC
 LIMIT $3
"""


def _normalise_query(raw: str) -> str:
    return " ".join(raw.split()).lower()


@mcp_server().tool(
    name="search_marketplace",
    title="Search Marketplace",
    description=(
        "Hybrid FTS + pgvector semantic search across 7 marketplace categories. "
        "Returns RRF-ranked listings with price and trust score."
    ),
)
@tool_wrap("search_marketplace")
async def search_marketplace_tool(input: SearchMarketplaceInput) -> SearchMarketplaceOutput:
    principal = current_mcp_principal()
    normalised_query = _normalise_query(input.query)

    rows = await db_fetch(
        _QUERY,
        normalised_query,
        input.category,
        input.limit,
        tenant_id=principal.tenant_id,
    )

    items: list[ListingHit] = []
    for row in rows:
        price_hint_raw = row["price_hint"]
        price_hint = price_hint_raw if isinstance(price_hint_raw, dict) else None
        items.append(
            ListingHit(
                listing_id=row["listing_id"],
                slug=row["slug"],
                title=row["title"],
                short_description=row["short_description"],
                category=row["category"],
                subtype=row["subtype"],
                license=row["license"],
                pricing_model=row["pricing_model"],
                price_hint=price_hint,
                trust_score=float(row["trust_score"]),
                rrf_score=float(row["rrf_score"]),
                thumbnail_url=row["thumbnail_url"],
            )
        )

    return SearchMarketplaceOutput(
        items=items,
        total_hits=len(items),
        next_cursor=None,
        query_echo=normalised_query,
    )


__all__ = [
    "ListingHit",
    "SearchMarketplaceInput",
    "SearchMarketplaceOutput",
    "search_marketplace_tool",
]
