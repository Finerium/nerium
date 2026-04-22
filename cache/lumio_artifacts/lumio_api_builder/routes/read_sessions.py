"""
GET /v1/reads and POST /v1/reads, saved articles and session lifecycle.
Stub implementation for the Dionysus demo bake.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Query
from pydantic import BaseModel, HttpUrl

router = APIRouter()


class CreateReadRequest(BaseModel):
    url: HttpUrl | None = None
    raw_text: str | None = None


class Read(BaseModel):
    id: str
    title: str
    source: str
    word_count: int
    saved_at: datetime
    has_summary: bool = False


class ReadsList(BaseModel):
    items: list[Read]
    next_cursor: str | None = None


@router.post("", response_model=Read)
async def create_read(body: CreateReadRequest) -> Read:
    title = "The Quiet Return of Long Attention"
    source = "Aeon" if body.url else "Pasted text"
    word_count = 4300 if body.url else len((body.raw_text or "").split())
    return Read(
        id=f"rd_{uuid4().hex[:12]}",
        title=title,
        source=source,
        word_count=word_count,
        saved_at=datetime.now(timezone.utc),
    )


@router.get("", response_model=ReadsList)
async def list_reads(
    cursor: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
) -> ReadsList:
    # Demo fixture, three synthesized reads. Live build queries the reads table
    # with keyset pagination on saved_at desc.
    items = [
        Read(
            id="rd_demo_001",
            title="The Quiet Return of Long Attention",
            source="Aeon",
            word_count=4300,
            saved_at=datetime.now(timezone.utc),
            has_summary=True,
        ),
        Read(
            id="rd_demo_002",
            title="On the Dignity of Slow Reading",
            source="Noema",
            word_count=2750,
            saved_at=datetime.now(timezone.utc),
            has_summary=True,
        ),
        Read(
            id="rd_demo_003",
            title="Memory Palaces for the Internet Era",
            source="The Atlantic",
            word_count=3520,
            saved_at=datetime.now(timezone.utc),
            has_summary=False,
        ),
    ]
    return ReadsList(items=items[:limit], next_cursor=None)
