# Email Transactional

**Contract Version:** 0.1.0
**Owner Agent(s):** Pheme (Resend + React Email authority, DKIM/SPF/DMARC config, template versioning, warmup scheduler, unsubscribe)
**Consumer Agent(s):** Plutus (invoice receipt), Iapetus (marketplace sale notification + payout paid), Tethys (identity key rotation alert), Eunomia (GDPR data export ZIP link, maintenance notice), Kratos (session-complete summary if opt-in), Aether (welcome on signup + email verification), Selene (trace per send), Nemea-RV-v2 (template render regression)
**Stability:** draft
**Last Updated:** 2026-04-24 (NP Wave 1, Pythia-v3 round 3)

## 1. Purpose

Defines the transactional email pipeline: Resend API provider + React Email templating + DKIM + SPF + DMARC on `mail.nerium.com` subdomain. Warmup schedule for new-domain reputation (under 50/day week 1 → scale gradually). Unsubscribe compliance per CAN-SPAM + GDPR. Dev inbox via Mailtrap when `EMAIL_ENV=dev`. No marketing emails at submission; transactional only.

Templates versioned in repo as React Email components. Send queued via Arq to isolate request latency from provider calls.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor)
- `CLAUDE.md` (root)
- `docs/phase_np/RV_NP_RESEARCH.md` (Section C.20 email)
- `docs/phase_np/RV_NP_AGENT_STRUCTURE.md` (Section 4.14 Pheme)
- `docs/contracts/rest_api_base.contract.md` (X-Request-Id correlation for mail tracking)
- `docs/contracts/observability.contract.md` (trace send attempts)
- `docs/contracts/feature_flag.contract.md` (Hemera gates for email kinds)

## 3. Schema Definition

### 3.1 Database tables

```sql
CREATE TABLE email_message (
  id                uuid PRIMARY KEY,
  tenant_id         uuid REFERENCES tenant(id) ON DELETE CASCADE,  -- NULL for system mail
  user_id           uuid REFERENCES app_user(id) ON DELETE SET NULL,
  template_name     text NOT NULL,                        -- 'welcome', 'purchase_receipt', ...
  template_version  text NOT NULL,                        -- semver of template component
  to_email          citext NOT NULL,
  from_email        citext NOT NULL,
  reply_to          citext,
  subject           text NOT NULL,
  props             jsonb NOT NULL,                       -- serialized template props
  rendered_html     text,                                 -- snapshot for audit (optional)
  rendered_text     text,
  provider_message_id text,                               -- Resend id
  status            text NOT NULL CHECK (status IN ('queued', 'sending', 'sent', 'failed', 'bounced', 'complained')),
  sent_at           timestamptz,
  failure_reason    text,
  retry_count       int NOT NULL DEFAULT 0,
  idempotency_key   text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (to_email, idempotency_key) WHERE idempotency_key IS NOT NULL
);

CREATE TABLE email_unsubscribe (
  id            uuid PRIMARY KEY,
  email         citext UNIQUE NOT NULL,
  categories    text[] NOT NULL DEFAULT '{}',             -- 'marketplace', 'digest', 'system_alert'
  reason        text,
  unsubscribed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE email_bounce (
  id                 uuid PRIMARY KEY,
  to_email           citext NOT NULL,
  bounce_type        text NOT NULL CHECK (bounce_type IN ('hard', 'soft', 'complaint')),
  provider_event     jsonb NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);
```

`email_message` partially tenant-scoped via FK. `email_unsubscribe` + `email_bounce` are global (cross-tenant email validity).

### 3.2 Template registry

```python
# src/backend/email/templates/__init__.py

TEMPLATES = {
    "welcome":              {"version": "1.0.0", "component": WelcomeTemplate,           "subject": "Welcome to NERIUM"},
    "email_verify":         {"version": "1.0.0", "component": EmailVerifyTemplate,       "subject": "Verify your NERIUM email"},
    "password_reset":       {"version": "1.0.0", "component": PasswordResetTemplate,     "subject": "Reset your NERIUM password"},
    "purchase_receipt":     {"version": "1.0.0", "component": PurchaseReceiptTemplate,   "subject": "Your NERIUM marketplace receipt"},
    "marketplace_sale":     {"version": "1.0.0", "component": MarketplaceSaleTemplate,   "subject": "Your listing was purchased"},
    "payout_paid":          {"version": "1.0.0", "component": PayoutPaidTemplate,        "subject": "Your payout has been sent"},
    "invoice_receipt":      {"version": "1.0.0", "component": InvoiceReceiptTemplate,    "subject": "Your NERIUM invoice"},
    "quest_completion":     {"version": "1.0.0", "component": QuestCompletionTemplate,   "subject": "Quest complete"},
    "key_rotation_alert":   {"version": "1.0.0", "component": KeyRotationAlertTemplate,  "subject": "Your identity key is rotating"},
    "dispute_notification": {"version": "1.0.0", "component": DisputeNotificationTemplate,"subject": "A purchase dispute needs your attention"},
    "gdpr_export_ready":    {"version": "1.0.0", "component": GdprExportReadyTemplate,   "subject": "Your NERIUM data export is ready"},
    "maintenance_notice":   {"version": "1.0.0", "component": MaintenanceNoticeTemplate, "subject": "Scheduled maintenance notice"},
    "budget_alert":         {"version": "1.0.0", "component": BudgetAlertTemplate,       "subject": "NERIUM budget alert"},
}
```

Each template is a React Email component (.tsx) rendered server-side via `@react-email/render` Node child process OR Python port via `mjml` fallback. MVP path: React Email components pre-rendered to Jinja2 + CSS inline via `@react-email/render` during build, served as static HTML files with props substitution.

### 3.3 DNS records

```
# TXT mail.nerium.com "v=spf1 include:amazonses.com include:_spf.resend.com -all"
# TXT _dmarc.nerium.com "v=DMARC1; p=none; rua=mailto:dmarc@nerium.com; ruf=mailto:dmarc@nerium.com; fo=1"
# CNAME resend._domainkey.mail.nerium.com → resend._domainkey.resend.com
```

DMARC starts `p=none` for 2 weeks, advances to `p=quarantine` after warmup complete. Ghaisan applies DNS via Cloudflare dashboard; records documented at `ops/dns/email_records.md`.

## 4. Interface / API Contract

### 4.1 Send function

```python
# src/backend/email/send.py

async def send(
    template_name: str,
    to_email: str,
    props: dict,
    *,
    user_id: UUID | None = None,
    tenant_id: UUID | None = None,
    idempotency_key: str | None = None,
    tag: str | None = None,
) -> UUID:
    # 1. Check unsubscribe
    if await is_unsubscribed(to_email, category_of(template_name)):
        raise UnsubscribedError(to_email)
    # 2. Check warmup cap
    if not await within_warmup_cap():
        raise WarmupCapExceededError()
    # 3. Create email_message row (status=queued)
    msg_id = await create_row(...)
    # 4. Enqueue Arq job
    await arq.enqueue_job("send_email", msg_id)
    return msg_id
```

Arq worker task:

```python
@arq_worker.task
async def send_email(ctx, msg_id: UUID):
    msg = await load(msg_id)
    await set_status(msg, "sending")
    try:
        resp = await resend.send({
            "from": msg.from_email,
            "to": [msg.to_email],
            "subject": msg.subject,
            "html": render_html(msg.template_name, msg.props),
            "text": render_text(msg.template_name, msg.props),
            "tags": [{"name": "template", "value": msg.template_name}],
        })
        await set_status(msg, "sent", provider_message_id=resp.id)
    except ResendError as e:
        if e.is_hard_bounce:
            await set_status(msg, "bounced", failure_reason=str(e))
            await record_bounce(msg.to_email, "hard", e.payload)
        elif msg.retry_count < 3:
            await increment_retry(msg)
            raise                                         # Arq retries
        else:
            await set_status(msg, "failed", failure_reason=str(e))
```

### 4.2 Warmup cap

```python
async def within_warmup_cap() -> bool:
    day_sent = await count_sent_today()
    cap = await compute_warmup_cap()                      # grows daily per schedule
    return day_sent < cap

def compute_warmup_cap() -> int:
    days_since_launch = (now() - settings.warmup_start).days
    schedule = [50, 50, 100, 200, 500, 1000, 2000, 5000]  # day 1..8
    if days_since_launch < len(schedule):
        return schedule[days_since_launch]
    return 10000                                          # steady-state cap
```

Warmup start date captured in Hemera flag `email.warmup_start` (ISO date).

### 4.3 Unsubscribe

Footer of every email contains `{{ unsubscribe_url }}` link. Pattern:

```
https://nerium.com/unsubscribe?token=<hmac>
```

Token is HMAC-SHA256 of `(email + category + secret)`. Unauthenticated click → `POST /v1/unsubscribe` server endpoint verifies HMAC + inserts `email_unsubscribe` row.

One-click unsubscribe header (RFC 8058): `List-Unsubscribe: <https://nerium.com/unsubscribe?token=...>, <mailto:unsubscribe@nerium.com?subject=unsubscribe>`.

### 4.4 Provider webhook

Resend webhooks `/v1/email/webhooks/resend`:

- `email.sent` → ignore (already recorded)
- `email.delivered` → update `sent_at` if missing
- `email.bounced` → `email_bounce` insert + `email_message.status = bounced` + hard-bounce-flag email as unsubscribed
- `email.complained` → `email_message.status = complained` + auto-unsubscribe (CAN-SPAM compliance)
- `email.opened`, `email.clicked` → IGNORE at submission (no tracking for transactional; honest-claim README mentions "no marketing analytics by default")

Signature verification via Resend SDK.

### 4.5 Dev inbox

Env `EMAIL_ENV=dev` routes all sends to Mailtrap inbox instead of Resend. No real emails delivered. Useful for E2E + manual testing.

## 5. Event Signatures

Structured log:

| Event | Fields |
|---|---|
| `email.send.queued` | `message_id`, `template_name`, `to_email`, `tenant_id`, `idempotency_key` |
| `email.send.sent` | `message_id`, `provider_message_id`, `duration_ms` |
| `email.send.retried` | `message_id`, `attempt`, `reason` |
| `email.send.failed` | `message_id`, `reason`, `final_attempt` |
| `email.bounce.recorded` | `to_email`, `bounce_type` |
| `email.unsubscribe.recorded` | `email`, `categories`, `source` (`link_click`, `auto_bounce`, `complaint`) |
| `email.warmup.cap_exceeded` | `day_sent`, `cap` |
| `email.webhook.received` | `event_type`, `provider_message_id` |

OTel spans: `email.send` + child `email.render` + `email.provider.call`.

## 6. File Path Convention

- Send function: `src/backend/email/send.py`
- Arq worker: `src/backend/workers/email_sender.py`
- Resend client: `src/backend/email/resend_client.py`
- React Email templates: `src/backend/email/templates/<name>.tsx`
- Rendered fixtures: `src/backend/email/templates/rendered/<name>.html` (build-time output)
- Renderer: `src/backend/email/renderer.py`
- Warmup logic: `src/backend/email/warmup.py`
- Unsubscribe handler: `src/backend/email/unsubscribe.py`
- Webhook handler: `src/backend/email/webhook.py`
- Router: `src/backend/routers/v1/email/*.py`
- Migrations: `src/backend/db/migrations/XXX_email_message.py`, `XXX_email_unsubscribe.py`, `XXX_email_bounce.py`
- DNS records doc: `ops/dns/email_records.md`
- Tests: `tests/email/test_send_queue.py`, `test_warmup_cap.py`, `test_unsubscribe_hmac.py`, `test_bounce_handling.py`, `test_template_render.py`

## 7. Naming Convention

- Template names: `snake_case` lowercase (`purchase_receipt`, `payout_paid`).
- Template versions: semver string (`1.0.0`).
- Provider tags: `template`, `env`, `tenant_id`.
- From addresses: `noreply@mail.nerium.com` (system), `support@mail.nerium.com` (admin replies).
- Reply-to: `support@nerium.com` or per-category.
- Category strings: `marketplace`, `billing`, `system_alert`, `digest`, `security`.
- Idempotency key: `email:<template>:<entity_id>` (e.g., `email:purchase_receipt:<purchase_id>`).

## 8. Error Handling

- Resend API 429: Arq retries exponential (Tenacity). Sustained → status `failed`.
- Resend API 401 (key invalid): log CRITICAL, halt queue, notify via GlitchTip Sentry alert.
- Template render failure: log ERROR, `email_message.status = failed` + `failure_reason = render_error`.
- Unknown template_name: HTTP 400 `unknown_template` on sync send; fail job on async.
- Email already unsubscribed: sync send returns HTTP 403 `unsubscribed`; async queues but worker drops (status `failed`).
- Hard bounce on an address: auto-unsubscribe + future sends rejected.
- Warmup cap exceeded: sends queued but worker delays to next day; non-critical emails (`quest_completion`) dropped after 24 h wait; critical emails (`password_reset`, `security_alert`) bypass cap with log WARN.
- Webhook signature invalid: HTTP 401, log WARN, do not process.
- Duplicate webhook (same provider event id): idempotent no-op.
- DMARC p=quarantine causing delivery failures: observed in Resend dashboard; fallback revert to p=none via DNS update.

## 9. Testing Surface

- Send queued: `send("welcome", email, props)` creates row + enqueues Arq job.
- Worker send: job runs, Resend mock succeeds, status `sent`.
- Retry on 5xx: Resend mock 500 twice, 200 third → `sent`.
- Hard bounce: webhook `email.bounced type=hard` → `email_bounce` row + auto-unsubscribe.
- Complaint: webhook `email.complained` → auto-unsubscribe + `email_message.status = complained`.
- Unsubscribe link click: valid HMAC → `email_unsubscribe` row + subsequent sends rejected.
- Unsubscribe link tamper: invalid HMAC → HTTP 403 + no DB change.
- Warmup cap: day 1 cap 50, 51st send throttled (queued for day 2).
- Critical bypass: `password_reset` sends even if cap reached.
- Template render: `welcome` template renders with props, includes unsubscribe footer.
- Dev inbox: `EMAIL_ENV=dev` sends go to Mailtrap, Resend not called.
- DNS record doc matches expected SPF/DKIM/DMARC.
- Idempotency: sending same template + same `idempotency_key` twice returns same `message_id`.

## 10. Open Questions

- React Email Node rendering pipeline: run via Node subprocess at runtime vs pre-render at build time? Recommend pre-render at build (faster, no Node dep in Python runtime). Trade-off: dynamic props substituted via template placeholders.
- Attach invoice PDF inline vs link: link (R2 signed URL) preserves size budget. Confirm UX.
- Support reply: `support@nerium.com` forwards to Ghaisan personal inbox via Cloudflare Email Routing until support team hired. Confirm.

## 11. Post-Hackathon Refactor Notes

- Postmark or AWS SES fallback if Resend quota exhausted.
- Marketing email pipeline with double opt-in (separate from transactional).
- Email templating localization (EN + ID + more).
- Email preview surface in Eunomia admin (render template with props on-demand).
- Email digest scheduling (unread notifications hourly roll-up).
- Tracking pixels + click tracking with explicit consent (Klaro integration).
- Scheduled sends (send_at future timestamp).
- Bulk batch API optimization.
- Email deliverability dashboard (SPF/DKIM/DMARC compliance, bounce rate, open rate post-consent).
- Migration from Resend to self-host SMTP (Postfix + DKIMproxy) if volume exceeds free tier.
