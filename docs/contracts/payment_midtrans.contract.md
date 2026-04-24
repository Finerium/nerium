# Payment Midtrans

**Contract Version:** 0.1.0
**Owner Agent(s):** Plutus (secondary payment rail owner, Midtrans SNAP integration, IDR local methods)
**Consumer Agent(s):** Iapetus (marketplace IDR purchases route here for Indonesian buyers), Marshall (pricing UI surfaces IDR option when buyer geolocated ID), Eunomia (admin Midtrans transaction view), Pheme (payment confirmation email templates), Selene (OTel trace per transaction), Nemea-RV-v2 (sandbox transaction E2E)
**Stability:** draft
**Last Updated:** 2026-04-24 (NP Wave 1, Pythia-v3 round 3)

## 1. Purpose

Defines the Midtrans secondary payment rail for Indonesian local payment methods (BCA VA, Mandiri VA, BNI VA, GoPay, OVO, DANA, ShopeePay, QRIS). **Sandbox-only at submission** per honest-claim discipline; production activation post-Midtrans KYC. Fills the Stripe Indonesia gap (Stripe is invite-only preview status for Indonesia as of April 2026).

Midtrans SNAP hosted payment page used for simplicity. Webhook SHA512 verification. One-time payments only; subscriptions remain on Stripe (Midtrans subscription support is card + GoPay only, narrower feature set).

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor)
- `CLAUDE.md` (root, honest-claim discipline for "sandbox-only")
- `docs/phase_np/RV_NP_RESEARCH.md` (Section C.17 Midtrans)
- `docs/phase_np/RV_NP_AGENT_STRUCTURE.md` (Section 4.8 Plutus)
- `docs/contracts/payment_stripe.contract.md` (shared ledger + billing_customer)
- `docs/contracts/marketplace_commerce.contract.md` (purchase flow)

## 3. Schema Definition

### 3.1 Database tables

```sql
CREATE TABLE midtrans_transaction (
  id              uuid PRIMARY KEY,
  tenant_id       uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  order_id        text UNIQUE NOT NULL,                  -- matches midtrans order_id
  gross_amount_idr bigint NOT NULL,                      -- rupiah integer
  payment_type    text,                                  -- bank_transfer, gopay, qris, etc.
  transaction_status text NOT NULL,                      -- pending, settlement, capture, deny, expire, cancel, refund
  fraud_status    text,                                  -- accept, deny, challenge
  va_number       text,                                  -- virtual account number if bank_transfer
  pdf_url         text,                                  -- Midtrans hosted receipt
  snap_token      text,                                  -- SNAP token for client checkout
  snap_redirect_url text,
  reference_type  text,                                  -- 'marketplace_purchase'
  reference_id    text,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  settled_at      timestamptz,
  expired_at      timestamptz
);

CREATE TABLE midtrans_notification (
  id                 uuid PRIMARY KEY,
  midtrans_transaction_id uuid REFERENCES midtrans_transaction(id) ON DELETE CASCADE,
  signature_key      text NOT NULL,
  raw_payload        jsonb NOT NULL,
  verified           boolean NOT NULL DEFAULT false,
  processed_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);
```

### 3.2 Payment method enum

Supported methods at submission (SNAP auto-detects based on client selection):

- `credit_card` (Visa, Mastercard, JCB via Midtrans Aggregator)
- `bank_transfer` (BCA VA, Mandiri VA, BNI VA, Permata VA, BRI VA)
- `gopay` (QR or deep link)
- `ovo` (disabled if user not linked at Midtrans side)
- `dana`
- `shopeepay`
- `qris` (unified QRIS code, any registered wallet can pay)

Excluded at submission: `indomaret`, `alfamart` (physical retail counter, requires KYC tier upgrade).

## 4. Interface / API Contract

### 4.1 POST `/v1/billing/midtrans/charge`

Creates a SNAP transaction token for a purchase.

```python
class MidtransChargeRequest(BaseModel):
    order_id: str = Field(..., max_length=50)            # merchant-side unique id
    gross_amount_idr: int = Field(..., gt=0)
    item_details: list[dict]                             # [{id, price, quantity, name}]
    customer_details: dict                                # {first_name, last_name, email, phone}
    reference_type: Literal["marketplace_purchase", "subscription_one_time", "test"]
    reference_id: str
    callbacks_finish_url: HttpUrl | None = None

class MidtransChargeResponse(BaseModel):
    token: str                                           # SNAP token for client snap.js
    redirect_url: HttpUrl
    order_id: str
    expires_in: int                                      # seconds until expiry (SNAP default 15 min)
```

Client uses Midtrans SNAP JS (`<script src="https://app.sandbox.midtrans.com/snap/snap.js">`) to open hosted popup with the token.

### 4.2 POST `/v1/billing/midtrans/webhook`

HTTP Notification endpoint. Verifies signature:

```
sha512(order_id + status_code + gross_amount + server_key)
```

Stores raw payload to `midtrans_notification`. If signature valid, updates `midtrans_transaction.transaction_status` and on terminal states posts ledger (marketplace_commerce) or rejects.

Handled statuses:

- `settlement` + `capture` (credit_card) → success
- `pending` → still awaiting payment (VA number issued)
- `expire` → VA window passed or QR timeout
- `deny` → rejected (card declined, wallet insufficient)
- `cancel` → user cancelled
- `refund` → post reversal to ledger

### 4.3 GET `/v1/billing/midtrans/transactions/{id}`

Tenant-scoped lookup. Returns current transaction status + VA number if applicable.

### 4.4 Status polling fallback

If webhook delayed, client may poll `GET /v1/billing/midtrans/transactions/{id}/status`. Server re-fetches from Midtrans `/v2/<order_id>/status` API if last local update > 30 s old.

### 4.5 Ledger posting

```
settlement (IDR):
  DEBIT  asset:midtrans_balance_idr         tenant-scoped    amount
  CREDIT revenue:<reference_type>_idr       tenant-scoped    amount

refund:
  DEBIT  revenue:<reference_type>_idr       tenant-scoped    amount
  CREDIT asset:midtrans_balance_idr                          amount
```

Idempotency key `midtrans:order:<order_id>`. Reversal idempotency `midtrans:refund:<order_id>`.

### 4.6 Settlement funds

Midtrans settles to Indonesian bank account on T+1 to T+2 business days (configurable per merchant agreement). `asset:midtrans_balance_idr` accumulates; nightly reconciliation against Midtrans settlement report.

Cross-currency reporting: IDR converted to USD at month-end using monthly average rate from Bank Indonesia; conversion entries posted to `expense:fx_conversion` / `asset:usd_equivalent`.

## 5. Event Signatures

Wire events:

| Event | Payload | Consumer |
|---|---|---|
| `nerium.billing.midtrans.settled` | `{order_id, amount_idr, payment_type, transaction_id}` | Tenant user room |
| `nerium.billing.midtrans.expired` | `{order_id, reason}` | Tenant user room |
| `nerium.billing.midtrans.denied` | `{order_id, reason}` | Tenant user room |

Log:

| Event | Fields |
|---|---|
| `midtrans.charge.created` | `order_id`, `gross_amount_idr`, `reference_type` |
| `midtrans.webhook.received` | `order_id`, `transaction_status`, `verified` |
| `midtrans.webhook.signature_invalid` | `order_id`, `payload_hash` |
| `midtrans.status.polled` | `order_id`, `status` |
| `midtrans.settlement.recorded` | `order_id`, `amount_idr`, `ledger_transaction_id` |
| `midtrans.expiry.swept` | `swept_count`, `sweep_duration_ms` |

## 6. File Path Convention

- Midtrans client: `src/backend/billing/midtrans_client.py`
- Charge handler: `src/backend/billing/midtrans_charge.py`
- Webhook handler: `src/backend/billing/midtrans_webhook.py`
- Status polling: `src/backend/billing/midtrans_status.py`
- Expiry sweep cron: `src/backend/billing/midtrans_expiry_cron.py`
- Router: `src/backend/routers/v1/billing/midtrans.py`
- Migrations: `src/backend/db/migrations/XXX_midtrans_transaction.py`, `XXX_midtrans_notification.py`
- Seed: `src/backend/db/seed/demo_midtrans_sandbox.sql`
- Tests: `tests/billing/midtrans/test_charge_creation.py`, `test_webhook_signature.py`, `test_status_poll_fallback.py`, `test_expiry_sweep.py`

## 7. Naming Convention

- Endpoint paths: `/v1/billing/midtrans/*`.
- `order_id`: merchant-generated `ord_<uuid7short>` (22 char) for Midtrans uniqueness.
- Amount columns: `amount_idr` integer rupiah (no decimal).
- Payment type enum values: `snake_case` Midtrans-native naming.
- Idempotency key: `midtrans:order:<order_id>`, `midtrans:refund:<order_id>`.

## 8. Error Handling

- Midtrans API 500: retry 3x with Tenacity; sustained failure HTTP 502 `upstream_error`.
- Midtrans API 4xx: HTTP 400 `validation_failed` with sanitized Midtrans error.
- Webhook signature invalid: HTTP 200 (don't reveal validation detail to attacker), log WARN, do NOT process.
- Webhook order_id unknown (transaction not in DB): HTTP 200, log WARN (stale or misrouted).
- Duplicate notification for same order_id + status: HTTP 200 idempotent, log `duplicate`.
- Expired transaction: status sweeper marks `expire`, emits `midtrans.expiry.swept`. User may re-initiate via new `order_id`.
- Currency mismatch (client attempts USD amount): HTTP 400 `unsupported_currency_midtrans` with hint to use Stripe rail.
- Sandbox vs production key confusion: config check at boot, fail fast if `MIDTRANS_ENV=production` but `MIDTRANS_SERVER_KEY` starts with `SB-Mid-server-` (sandbox prefix).
- Fraud status `challenge`: transaction held, notify user via Pheme email; admin reviews via Eunomia. Auto-expire after 24 h.
- Production mode accidentally invoked pre-KYC: hard fail via Hemera flag `billing.midtrans.production_enabled` default `false`.

## 9. Testing Surface

- Charge creation sandbox: POST returns SNAP token + redirect URL.
- Webhook signature verification: valid signature processes, invalid returns 200 without processing.
- Webhook idempotency: replay same notification twice, second is no-op.
- VA bank transfer flow: charge with `bank_transfer.bank=bca` returns VA number; simulated settlement webhook transitions to `settlement`.
- GoPay flow: charge with `gopay`, redirect URL returns QR or deep link.
- QRIS flow: charge with `qris`, redirect URL returns unified QR code.
- Expiry sweep: transaction older than 24 h and status `pending` marked `expire`.
- Status polling fallback: mock webhook not delivered, client polls after 30 s, server re-fetches from Midtrans API.
- Ledger posting IDR: settled transaction creates DEBIT + CREDIT in IDR accounts.
- Fraud challenge: test card `4811111111111114` triggers challenge status.
- Production mode flag: flag false, production API call rejected.

## 10. Open Questions

- Midtrans Core API vs SNAP hosted: SNAP chosen for faster integration; Core API available post-hackathon for embedded checkout (better UX).
- Subscription via Midtrans card tokenization: deferred. Stripe handles subscriptions.
- QRIS static vs dynamic QR: SNAP uses dynamic per-transaction QR (locked to order_id + amount).

## 11. Post-Hackathon Refactor Notes

- Production KYC: Midtrans requires business registration (PT/CV) + tax ID (NPWP) + bank account. Timeline 2-4 weeks post-hackathon.
- Embed Midtrans Core API for inline card entry (improves conversion vs SNAP popup).
- Install Snap.js via npm module instead of CDN script.
- Add recurring card tokenization for subscription support (limited to card + GoPay at Midtrans).
- Dunning workflow for retried subscription card failures.
- Multi-merchant Connect analog: Midtrans does not have direct Stripe Connect equivalent; custom ledger-based split with manual T+N settlement required.
- IDR to USD monthly conversion via Bank Indonesia JISDOR rate.
- Dispute + chargeback handling (low volume for local methods vs card).
