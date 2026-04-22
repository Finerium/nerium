"""
POST /v1/users, workspace creation.
Stub implementation for the Dionysus demo bake.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr, Field

router = APIRouter()


class ReadingProfile(BaseModel):
    primary_source: Literal["articles", "papers", "books"] = "articles"
    weekly_hours: int = Field(ge=0, le=60, default=4)
    main_reason: Literal["remember", "connect", "focus", "team"] = "remember"


class CreateUserRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)
    plan: Literal["reader", "deep", "studio"] = "reader"
    reading_profile: ReadingProfile | None = None


class User(BaseModel):
    id: str
    name: str
    email: EmailStr
    plan: Literal["reader", "deep", "studio"]
    created_at: datetime


@router.post("", status_code=status.HTTP_201_CREATED, response_model=User)
async def create_user(body: CreateUserRequest) -> User:
    if not any(ch.isdigit() for ch in body.password):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Password must contain at least one digit.",
        )
    # Demo bake returns a synthesized user with a deterministic-looking id.
    # Live build would hash the password and persist via SQLAlchemy.
    return User(
        id=f"usr_{uuid4().hex[:12]}",
        name=body.name,
        email=body.email,
        plan=body.plan,
        created_at=datetime.now(timezone.utc),
    )
