# Payment Stripe

**Contract Version:** 0.1.0
**Owner Agent(s):** Plutus (Stripe integration authority, subscription CRUD, Checkout Session, webhook handler, double-entry ledger, invoice PDF)
**Consumer Agent(s):** Iapetus (Stripe Connect Express shares the same Stripe client + ledger), Marshall (pricing tier UI + treasurer NPC reads subscription state), Eunomia (admin refund + override + billing audit view), Moros (reconciliation against Stripe balance), Pheme (invoice + receipt email via template), Selene (OTel trace per webhook + checkout), Nemea-RV-v2 (checkout + webhook idempotency regression)
**Stability:** draft
**Last Updated:** 2026-04-24 (NP Wave 1, Pythia-v3 round 3)

## 1. Purpose

Defines the Stripe integration for NERIUM subscriptions (Free, Solo, Team, Enterprise) + one-time payments (marketplace purchases per `marketplace_commerce.contract.md`) + the internal double-entry ledger that is source-of-truth. **Stripe test mode is authoritative at submission**; live mode activates post-Stripe Atlas Global verification (10-14 days realistic). Midtrans secondary IDR rail runs in parallel per `payment_midtrans.contract.md`.

Stripe Elements for card input (SCA-compliant automatic). Stripe Checkout Session hosted flow for Mode A web + deep-link return for Mode B Tauri. WeasyPrint + Jinja2 for invoice PDF. Webhook SHA256 signature verify via `stripe-signature` header per Stripe SDK.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor, Section 5 Banking "kaya listrik" framing)
- `CLAUDE.md` (root, honest-claim honesty on Stripe test mode)
- `docs/phase_np/RV_NP_RESEARCH.md` (Sections C.16 Stripe ID, C.19 double-entry)
- `docs/phase_np/RV_NP_AGENT_STRUCTURE.md` (Section 4.8 Plutus)
- `docs/contracts/payment_midtrans.contract.md` (secondary rail)
- `docs/contracts/marketplace_commerce.contract.md` (Connect Express integration)
- `docs/contracts/email_transactional.contract.md` (invoice email delivery)
- `docs/contracts/postgres_multi_tenant.contract.md` (tenant billing schema)

## 3. Schema Definition

### 3.1 Database tables

```sql
CREATE TABLE billing_customer (
  id                 uuid PRIMARY KEY,
  tenant_id          uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  stripe_customer_id text UNIQUE NOT NULL,
  email              citext NOT NULL,
  display_name       text,
  default_payment_method_id text,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE billing_subscription (
  id                 uuid PRIMARY KEY,
  tenant_id          uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  customer_id        uuid NOT NULL REFERENCES billing_customer(id),
  stripe_subscription_id text UNIQUE NOT NULL,
  stripe_price_id    text NOT NULL,
  plan               text NOT NULL CHECK (plan IN ('free', 'solo', 'team', 'enterprise')),
  status             text NOT NULL CHECK (status IN ('trialing','active','past_due','canceled','unpaid','incomplete','incomplete_expired')),
  current_period_start timestamptz NOT NULL,
  current_period_end   timestamptz NOT NULL,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  trial_end          timestamptz,
  canceled_at        timestamptz,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE billing_invoice (
  id                 uuid PRIMARY KEY,
  tenant_id          uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  customer_id        uuid NOT NULL REFERENCES billing_customer(id),
  stripe_invoice_id  text UNIQUE NOT NULL,
  subscription_id    uuid REFERENCES billing_subscription(id),
  status             text NOT NULL,
  amount_due_cents   bigint NOT NULL,
  amount_paid_cents  bigint NOT NULL DEFAULT 0,
  currency           char(3) NOT NULL DEFAULT 'USD',
  paid_at            timestamptz,
  pdf_r2_key         text,                              -- R2 object key per file_storage.contract.md
  hosted_invoice_url text,                              -- Stripe-hosted URL
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE billing_webhook_event (
  id                 uuid PRIMARY KEY,
  stripe_event_id    text UNIQUE NOT NULL,              -- idempotency anchor
  event_type         text NOT NULL,
  processed_at       timestamptz,
  processing_error   text,
  attempts           int NOT NULL DEFAULT 0,
  payload            jsonb NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- Ledger tables (shared with commerce + budget_monitor)
CREATE TYPE account_type AS ENUM ('asset','liability','equity','revenue','expense');

CREATE TABLE ledger_account (
  id          bigserial PRIMARY KEY,
  code        text UNIQUE NOT NULL,                    -- e.g., 'asset:stripe_balance_usd', 'revenue:subscription_usd'
  name        text NOT NULL,
  type        account_type NOT NULL,
  currency    char(3) NOT NULL,
  tenant_id   uuid REFERENCES tenant(id) ON DELETE CASCADE,
  parent_id   bigint REFERENCES ledger_account(id),
  is_system   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ledger_transaction (
  id              uuid PRIMARY KEY,
  idempotency_key text UNIQUE NOT NULL,
  reference_type  text,
  reference_id    text,
  description     text,
  posted_at       timestamptz NOT NULL DEFAULT now(),
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE ledger_entry (
  id             bigserial PRIMARY KEY,
  transaction_id uuid NOT NULL REFERENCES ledger_transaction(id),
  account_id     bigint NOT NULL REFERENCES ledger_account(id),
  direction      char(1) NOT NULL CHECK (direction IN ('D','C')),
  amount_cents   bigint NOT NULL CHECK (amount_cents > 0),
  currency       char(3) NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
REVOKE UPDATE, DELETE ON ledger_entry FROM PUBLIC;

-- Per-transaction sum-to-zero invariant enforced via trigger + CI test
```

`billing_*` tables RLS per tenant. Ledger tables partially tenant-scoped (`ledger_account.tenant_id` nullable for platform accounts).

### 3.2 Subscription plan pricing

| Plan | Stripe Price ID (test) | Monthly USD | Monthly IDR (approx) |
|---|---|---|---|
| Free | `price_free_00` | 0 | 0 |
| Solo | `price_test_solo_monthly` | 19 | 300,000 |
| Team | `price_test_team_monthly` | 99 | 1,550,000 |
| Enterprise | `price_test_enterprise_monthly` | 499 | 7,800,000 |

Yearly tier adds 20% discount. Stripe Price IDs stored in Hemera flag `billing.price_id_map` (JSON object) for live swap post-Atlas.

## 4. Interface / API Contract

### 4.1 POST `/v1/billing/checkout`

Creates Stripe Checkout Session for subscription signup or upgrade.

```python
class CheckoutRequest(BaseModel):
    plan: Literal["solo", "team", "enterprise"]
    interval: Literal["monthly", "yearly"] = "monthly"
    success_url: HttpUrl | None = None                    # default nerium.com/billing/success
    cancel_url: HttpUrl | None = None
    mode_b_deep_link: bool = False                        # return via nerium:// after success

class CheckoutResponse(BaseModel):
    checkout_session_id: str
    url: HttpUrl                                          # Stripe-hosted checkout URL
```

Idempotency key honored per `rest_api_base.contract.md`. Session auto-expires 24 h.

Mode B deep link: on Checkout success, Stripe redirects to `https://nerium.com/billing/success?mode=tauri`, server emits JS that invokes `window.location = "nerium://billing/success?session_id=..."`.

### 4.2 GET `/v1/billing/subscription`

Returns current tenant's subscription + plan details + renewal date.

### 4.3 POST `/v1/billing/subscription/cancel`

Sets `cancel_at_period_end = true`. Stripe handles grace period.

### 4.4 POST `/v1/billing/subscription/resume`

Undoes pending cancellation before period end.

### 4.5 POST `/v1/billing/portal`

Creates Stripe Customer Portal session URL for self-service billing management (payment method update, invoice history).

### 4.6 GET `/v1/billing/invoices`

Paginated list of tenant's invoices.

### 4.7 GET `/v1/billing/invoices/{id}/pdf`

Signed URL to R2-stored PDF (regenerated on-demand if missing).

### 4.8 POST `/v1/billing/webhooks/stripe`

Webhook endpoint. Verifies `stripe-signature` header. Handles events:

- `checkout.session.completed` → promote `billing_subscription` to active, send welcome email
- `customer.subscription.created|updated|deleted` → sync subscription row
- `invoice.created|paid|payment_failed` → sync invoice row + post ledger
- `charge.refunded` → post reversing ledger entry
- `payout.paid` → record platform payout to ledger (Iapetus Connect related)

Idempotency: check `billing_webhook_event.stripe_event_id` before processing. Replay returns HTTP 200 without reprocessing.

Response HTTP 200 within 5 s to avoid Stripe retry. Heavy processing via Arq worker enqueue + 200 acknowledge.

### 4.9 Ledger posting on paid invoice

```
charge.succeeded invoice.paid:
  DEBIT  asset:stripe_balance_usd          (tenant-scoped account)   amount
  CREDIT revenue:subscription_usd          (tenant-scoped account)   amount
```

`charge.refunded`:
```
  DEBIT  revenue:subscription_usd (reverse)                          amount
  CREDIT asset:stripe_balance_usd                                    amount
```

Idempotency key `stripe:evt:<event_id>`. Ledger transaction rows immutable; reversals are new transactions.

### 4.10 Reconciliation

Nightly Arq cron `billing_reconcile` pulls `stripe.Balance.retrieve()` + cross-checks against `SUM(asset:stripe_balance_usd)`. Drift > 1 cent emits `billing.reconcile.drift` at ERROR. Admin review via Eunomia.

## 5. Event Signatures

Wire events via `realtime_bus.contract.md`:

| Event | Payload | Target audience |
|---|---|---|
| `nerium.billing.subscription_updated` | `{tenant_id, plan, status, current_period_end}` | Tenant user room |
| `nerium.billing.invoice_paid` | `{tenant_id, invoice_id, amount_usd}` | Tenant user room |
| `nerium.billing.payment_failed` | `{tenant_id, subscription_id, reason}` | Tenant user room |
| `nerium.billing.plan_upgraded` | `{tenant_id, from_plan, to_plan}` | Tenant + Marshall + Eunomia |

Log events:

| Event | Fields |
|---|---|
| `billing.checkout.created` | `tenant_id`, `plan`, `interval`, `session_id` |
| `billing.webhook.received` | `stripe_event_id`, `event_type`, `duration_ms` |
| `billing.webhook.duplicate` | `stripe_event_id` |
| `billing.ledger.posted` | `transaction_id`, `idempotency_key`, `amount_cents` |
| `billing.ledger.reversed` | `transaction_id`, `original_idempotency_key` |
| `billing.reconcile.drift` | `expected_cents`, `actual_cents`, `drift_cents` |

## 6. File Path Convention

- Stripe client wrapper: `src/backend/billing/stripe_client.py`
- Checkout: `src/backend/billing/checkout.py`
- Subscription CRUD: `src/backend/billing/subscription.py`
- Webhook handler: `src/backend/billing/webhook.py`
- Ledger operations: `src/backend/billing/ledger.py`
- Invoice PDF: `src/backend/billing/invoice_pdf.py` (WeasyPrint + Jinja2 templates)
- Invoice templates: `src/backend/billing/templates/invoice.html`, `invoice.css`
- Reconciliation: `src/backend/billing/reconcile.py`
- Deep link return: `src/backend/billing/tauri_deep_link.py`
- Router: `src/backend/routers/v1/billing/*.py`
- Migrations: `src/backend/db/migrations/XXX_billing_customer.py`, `XXX_billing_subscription.py`, `XXX_billing_invoice.py`, `XXX_billing_webhook_event.py`, `XXX_ledger_*.py`
- Seed: `src/backend/db/seed/demo_customers.sql`, `default_ledger_accounts.sql`
- Tests: `tests/billing/test_checkout_creation.py`, `test_webhook_idempotency.py`, `test_ledger_double_entry.py`, `test_reconcile_drift.py`, `test_invoice_pdf.py`, `test_cancel_resume.py`, `test_sca_test_card.py`

## 7. Naming Convention

- Stripe ID columns: `stripe_<resource>_id` (`stripe_customer_id`, `stripe_subscription_id`).
- Ledger account codes: `<type>:<category>[:<tenant_id>]` colon-separated (`asset:stripe_balance_usd`, `revenue:subscription_usd:01926f...`).
- Amount columns: `amount_cents` bigint (USD cents, IDR rupiah integer; never FLOAT).
- Idempotency keys: `stripe:evt:<event_id>`, `checkout:<session_id>`, `refund:<charge_id>`.
- Subscription plan enum: `free`, `solo`, `team`, `enterprise` lowercase.
- Event payload types per `realtime_bus.contract.md` Section 3.3.

## 8. Error Handling

- Stripe API 500: retry 3x with Tenacity exponential backoff. Sustained failure → HTTP 502 `upstream_error`.
- Stripe API 4xx (bad params): HTTP 400 `validation_failed` with sanitized Stripe error message.
- Webhook signature invalid: HTTP 401, log at WARN (possible replay attack); do NOT process.
- Webhook stale (`> 5 min old`): HTTP 401, log WARN (timing attack prevention).
- Webhook processing exception: HTTP 500, Stripe retries up to 3 days; our idempotency store prevents double-posting on retry.
- Ledger sum-to-zero invariant violation: trigger raises, transaction rolls back, emit CRITICAL.
- Invoice PDF render fail (WeasyPrint OOM): fall back to Stripe-hosted invoice URL; PDF re-rendered on next download attempt.
- SCA challenge required: Stripe Elements handles client-side; server path same success/failure handling.
- Checkout session expired: user re-creates; no-op cleanup.
- Test card triggering decline (e.g., `4000 0000 0000 0002`): expected in test mode; surface to UI via Stripe error payload echo.
- Live mode accidentally invoked pre-Atlas: hard fail HTTP 503 `stripe_live_disabled` via Hemera flag `billing.live_mode_enabled` default `false`.

## 9. Testing Surface

- Test checkout happy path: POST `/v1/billing/checkout`, receive URL, simulate Stripe success webhook, subscription row active.
- Idempotency: POST checkout twice with same `Idempotency-Key`, returns same session id.
- Webhook idempotency: replay `checkout.session.completed` event, second call no-op, log `duplicate`.
- Webhook signature tamper: modify payload byte, signature verify fails, 401.
- Ledger double-entry: paid invoice posts correct DEBIT + CREDIT, sum-to-zero invariant holds.
- Refund reversal: `charge.refunded` posts reversing ledger entry, original transaction immutable.
- Cancel + resume: cancel sets flag, resume clears; period end respected.
- SCA test card: `4000 0025 0000 3155` triggers 3DS, flow completes.
- PDF render: paid invoice generates PDF to R2, signed URL downloadable.
- Reconcile drift: mock Stripe balance differs by 5 cents, `billing.reconcile.drift` logged at ERROR.
- Mode B deep link: success URL emits `nerium://billing/success?session_id=...`.
- Live mode flag: with `billing.live_mode_enabled=false`, live Stripe client calls rejected.

## 10. Open Questions

- Stripe test mode data persistence: test customers + subscriptions ship in seed; confirm judges interact against test sandbox not live.
- Yearly billing proration: use Stripe native prorate; confirm ledger captures the prorated delta correctly.
- Free plan in Stripe: use `price_free_00` with $0 amount OR manage Free tier entirely outside Stripe? Recommend entirely outside Stripe (no Stripe customer created for Free) to reduce Stripe dashboard clutter. Confirm.

## 11. Post-Hackathon Refactor Notes

- Live mode activation post-Stripe Atlas Global (10-14 days realistic).
- Tax handling via Stripe Tax (automatic VAT/sales tax computation per geography).
- Multi-currency pricing (USD + IDR + EUR + SGD). Atlas US acquirer routes revenue; IDR local via Midtrans parallel.
- Metered billing via Stripe usage records (per-token MA spend pass-through to customer).
- Revenue recognition (ASC 606): spread subscription revenue across service period in ledger.
- Dispute handling webhook (`charge.dispute.created`) + admin workflow.
- Dunning automation via Stripe Smart Retries.
- Invoice customization per tenant (custom logo, footer text via Stripe Invoice Templates).
- Webhook signature rotation procedure doc.
