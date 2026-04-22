# Lumio Environment Requirements

**Author:** lumio_deployer (step 9)
**Produced:** 2026-04-24T03:41:58Z

## Runtime environment variables

| Key | Purpose | Example | Required |
|---|---|---|---|
| `LUMIO_ENV` | Environment label | `production` | yes |
| `LUMIO_DB_PATH` | SQLite file path | `/var/lib/lumio/lumio.db` | yes |
| `LUMIO_ANTHROPIC_API_KEY` | Anthropic key, zero-retention enabled | `sk-ant-api03-...` | yes |
| `LUMIO_ANTHROPIC_MODEL_DEFAULT` | Default summarizer | `claude-sonnet-4-6` | yes |
| `LUMIO_ANTHROPIC_MODEL_ESSAY` | Essay-mode summarizer | `claude-opus-4-7` | yes |
| `LUMIO_SESSION_SECRET` | Cookie HMAC key | generated | yes |
| `LUMIO_EMAIL_PROVIDER` | Transactional email provider | `resend` | yes |
| `LUMIO_EMAIL_API_KEY` | Email provider key | `re_...` | yes |
| `LUMIO_SENTRY_DSN` | Error tracking | DSN URL | optional |
| `LUMIO_LOG_LEVEL` | Log verbosity | `info` | optional |

## Host requirements

- 2 vCPU minimum, 4 GB RAM minimum.
- 20 GB SSD, WAL sizing allows for 1 GB reads table for 50 k users.
- Caddy 2.7 plus for Let's Encrypt automatic TLS.
- Node 20 LTS for Next.js build.
- Python 3.12 for FastAPI runtime.
- `uv` 0.4 plus for dependency management.

## Secrets management

- Secrets live in `/etc/lumio/env`, permissions 0600, owner lumio.
- Root user has no access once setuid boundary is crossed.
- Rotation policy: every 90 days, automatic via `lumio-rotate.timer`.

## Observability

- Logs to stdout, captured by systemd journal, shipped to Loki.
- Metrics: Prometheus exporter at `:9100` on loopback only.
- Uptime probe: external, 60 second cadence, page if three failures in a row.

## Demo bake posture

For the Dionysus cached demo bake, no environment is actually provisioned. The requirements list above is the contract the live bake will honor post-hackathon.
