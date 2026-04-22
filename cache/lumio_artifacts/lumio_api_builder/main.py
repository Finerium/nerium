"""
Lumio FastAPI entrypoint.

Author: lumio_api_builder (step 4)
Produced: 2026-04-24T03:17:02Z

Scope: demo bake. This module wires routers and health endpoints. It does not
implement auth middleware or real Anthropic SDK calls, those are planned for
the post-hackathon live bake.
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routes import read_sessions, users

app = FastAPI(
    title="Lumio API",
    version="0.1.0-demo",
    description="Smart reading companion API, bounded demo build.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://lumio.demo"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(users.router, prefix="/v1/users", tags=["users"])
app.include_router(read_sessions.router, prefix="/v1/reads", tags=["reads"])


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "build": "lumio-demo-0.1.0"}


@app.get("/ready")
async def ready() -> dict[str, str]:
    # Demo bake does not actually ping the database. Live build would exercise
    # SELECT 1 against SQLite and a zero-byte Anthropic health ping.
    return {"status": "ready"}
