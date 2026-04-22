# Lumio System Overview

**Author:** lumio_architect (step 1)
**Produced:** 2026-04-24T03:08:31Z
**Inputs:** `builds/lumio/strategy/product_brief.md`

## 1. Architecture at one glance

Lumio is a thin Next.js 15 App Router frontend against a FastAPI Python backend that speaks to SQLite for persistence and the Anthropic Claude API for language inference. No microservices, no queue, no cache layer for the demo bake. A later scale tier adds Redis for session state and Postgres for multi-tenant, both are out of scope here.

```
 user browser
     |
     v
 Next.js 15 (Vercel-ready, self-hosted acceptable)
     |  fetch  (JSON, cookies for session)
     v
 FastAPI (uvicorn) on :8000
     |------> SQLite (single-file, wal mode)
     |------> Anthropic Messages API (Opus 4.7, Sonnet 4.6 for summarization)
     '------> R2 or S3 (article body storage, opaque blobs)
```

## 2. Core services

- `users` service, account lifecycle, sessions, token issuance.
- `reads` service, saved article ingestion, normalization, storage.
- `summary` service, wraps Anthropic Messages API with retry, zero-retention, mode toggles.
- `atlas` service, concept extraction from highlights plus nearest-neighbor linking.
- `recall` service, spaced-repetition scheduler, card selection per user.
- `letter` service, weekly digest assembly plus email send.

Each service is a FastAPI router. Shared deps live in `app/deps.py`.

## 3. Data flow for the hero use case

A user forwards a newsletter email.

1. `/ingest/email` parses mime, extracts HTML, strips boilerplate.
2. Normalized article persisted as `reads` row plus body blob.
3. `summary` service fires on write-commit, queues at Sonnet 4.6 for Brief mode. Upgrades to Opus 4.7 only if user explicitly requests Essay mode.
4. User opens the article in the Lumio reader, highlights inline.
5. Each highlight emits a `highlight.created` domain event, `atlas` subscribes and updates the concept graph.
6. Overnight job picks 2 to 3 highlights for tomorrow's recall card set per user tempo.
7. Sunday 08:00 local, `letter` service assembles digest and hands to transactional email.

## 4. Latency budgets

- Save an article: p95 under 600 ms from tap to toast.
- Render reader: p95 under 400 ms first contentful paint on mobile 4G.
- Generate Brief summary: p95 under 8 s, streamed progressively.
- Serve a recall card: p95 under 250 ms.

## 5. Security posture for the demo

- Zero data retention with Anthropic, per Section 6 product brief commitment.
- All highlights stored encrypted at rest in SQLite field-level via libsodium.
- Password hashing with argon2id, default params, no custom pepper.
- Session cookie httpOnly, secure, strict sameSite, 30 day rolling renewal.

## 6. What ships in this cached demo bake

- Landing page (index.html).
- Signup flow (signup.html) with client-side validation and a mock submit.
- No backend actually provisioned, the demo bake intentionally stops at the deploy plan per Section 19 NarasiGhaisan Vercel-uncertain lock.

## 7. What the live build would add next

- Real backend provision on a small self-hosted VPS (Hetzner CX22, 2 vCPU 4 GB).
- Caddy in front, Let's Encrypt automated.
- Observability with OpenTelemetry plus a Loki log sink.

This system overview is deliberately conservative. Lumio is a demo, not a moonshot. The Builder scaled-down demo shows the shape, not the scale.
