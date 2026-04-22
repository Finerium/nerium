# Lumio Deploy Plan

**Author:** lumio_deployer (step 9)
**Produced:** 2026-04-24T03:41:10Z
**Status:** plan-only per Section 19 NarasiGhaisan Vercel-uncertain lock. Apollo halts for Ghaisan lock before any real provision.

## Target posture

- Frontend: Next.js 15 static-plus-ISR.
- Backend: FastAPI on uvicorn, single process during demo window.
- Persistence: SQLite, WAL mode, single file.
- Domain: `lumio.demo` behind Cloudflare, origin Caddy on self-hosted VPS.

## Recommended host

Hetzner CX22 in eu-central. 2 vCPU, 4 GB RAM, 40 GB SSD, EUR 4.59 / month. Ghaisan indicated Vercel is uncertain, self-hosted VPS is the documented default direction pending explicit lock.

## Step-by-step plan, ordered

1. Provision CX22, Ubuntu 24.04 LTS minimal image.
2. Create `lumio` service user, lock root SSH, enable automatic security upgrades.
3. Install Caddy 2.x, Node 20 LTS, Python 3.12, uv for Python dependency management.
4. Clone repo, checkout the demo-bake branch, run `pnpm install --frozen-lockfile` and `uv sync`.
5. Build frontend, copy `.next/` output into Caddy's static root.
6. Run `alembic upgrade head` against `/var/lib/lumio/lumio.db`, permissions 0600.
7. Start FastAPI via systemd unit `lumio-api.service`, reload on file change disabled.
8. Caddy config routes `/` to static, `/v1/*` to `127.0.0.1:8000`.
9. Smoke test, curl `/health` returns `{ "status": "ok" }`.
10. Hand DNS cutover to Ghaisan, do not flip CNAME without explicit lock.

## Rollback plan

`git checkout previous-tag && pnpm install && pnpm build && systemctl restart lumio-api`.
Database migrations are forward-only, schema changes gated by Apollo review.

## What does NOT ship in the demo bake

- Actual provisioning of any host.
- Real DNS cutover.
- Payment provider integration.
- Email sending provider integration.

All four are planned for post-demo live bake once Ghaisan locks the deploy target.
