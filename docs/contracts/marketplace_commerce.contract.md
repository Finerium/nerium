# Marketplace Commerce

**Contract Version:** 0.1.0
**Owner Agent(s):** Iapetus (commerce authority, Stripe Connect Express, purchase flow, creator payout, review + rating)
**Consumer Agent(s):** Plutus (shared Stripe client + ledger accounts), Phanes (reads `marketplace_listing` for purchase dispatch), Astraea (review data feeds trust score), Hyperion (purchase analytics filter + search boost), Eunomia (admin refund + creator suspension + dispute queue), Marshall (buyer tier affects available listings), Pheme (purchase receipt + payout notification), Kratos (purchased MCP tools + skills become available to buyer's MA sessions), Selene (OTel trace per purchase), Nemea-RV-v2 (purchase + payout E2E)
**Stability:** draft
**Last Updated:** 2026-04-24 (NP Wave 1, Pythia-v3 round 3)

## 1. Purpose

Defines the marketplace commerce surface: Stripe Connect Express creator onboarding, buyer purchase flow (one-time + usage-based), automatic revenue split (platform default 20% take rate), creator dashboard (earnings, sales, payout history), monthly payout schedule (weekly for Verified creators), review + rating system with Wilson lower-bound moderation, refund workflow. Covers both USD via Stripe Connect and IDR via `payment_midtrans.contract.md` ledger-based manual split (Midtrans does not have Connect equivalent).

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor, Section 5 marketplace monetization unlock)
- `CLAUDE.md` (root)
- `docs/phase_np/RV_NP_RESEARCH.md` (Sections C.16 Stripe Connect, C.17 Midtrans, C.19 ledger, C.21 listing schema)
- `docs/phase_np/RV_NP_AGENT_STRUCTURE.md` (Section 4.9 Iapetus)
- `docs/contracts/payment_stripe.contract.md` (shared ledger + client)
- `docs/contracts/payment_midtrans.contract.md` (IDR rail)
- `docs/contracts/marketplace_listing.contract.md` (listing resolution)
- `docs/contracts/trust_score.contract.md` (review → trust)
- `docs/contracts/email_transactional.contract.md` (receipts + payout notifications)

## 3. Schema Definition

### 3.1 Database tables

```sql
CREATE TABLE connect_account (
  id                 uuid PRIMARY KEY,
  tenant_id          uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  user_id            uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  stripe_account_id  text UNIQUE NOT NULL,               -- acct_xxx
  onboarding_status  text NOT NULL CHECK (onboarding_status IN ('pending', 'incomplete', 'verified', 'suspended')),
  charges_enabled    boolean NOT NULL DEFAULT false,
  payouts_enabled    boolean NOT NULL DEFAULT false,
  requirements       jsonb NOT NULL DEFAULT '{}'::jsonb, -- Stripe requirements hash
  country            char(2),
  default_currency   char(3),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE marketplace_purchase (
  id                 uuid PRIMARY KEY,
  tenant_id          uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  buyer_user_id      uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  listing_id         uuid NOT NULL REFERENCES marketplace_listing(id),
  creator_user_id    uuid NOT NULL,                       -- denormalized for immutable record
  creator_connect_account_id uuid REFERENCES connect_account(id),
  gross_amount_cents bigint NOT NULL,
  platform_fee_cents bigint NOT NULL,
  creator_net_cents  bigint NOT NULL,
  currency           char(3) NOT NULL,
  rail               text NOT NULL CHECK (rail IN ('stripe', 'midtrans')),
  status             text NOT NULL CHECK (status IN ('pending', 'completed', 'refunded', 'disputed', 'cancelled')),
  stripe_checkout_session_id text,                       -- when rail=stripe
  stripe_charge_id   text,
  midtrans_order_id  text,                               -- when rail=midtrans
  refunded_amount_cents bigint NOT NULL DEFAULT 0,
  license_key        text,                               -- for digital license listings
  idempotency_key    text,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  completed_at       timestamptz,
  UNIQUE (buyer_user_id, idempotency_key)
);
CREATE INDEX idx_purchase_buyer ON marketplace_purchase(buyer_user_id, created_at DESC);
CREATE INDEX idx_purchase_creator ON marketplace_purchase(creator_user_id, completed_at DESC);
CREATE INDEX idx_purchase_listing ON marketplace_purchase(listing_id);

CREATE TABLE marketplace_review (
  id                 uuid PRIMARY KEY,
  tenant_id          uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  listing_id         uuid NOT NULL REFERENCES marketplace_listing(id),
  buyer_user_id      uuid NOT NULL,
  purchase_id        uuid REFERENCES marketplace_purchase(id),
  rating             int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title              text,
  body               text,
  helpful_count      int NOT NULL DEFAULT 0,
  flag_count         int NOT NULL DEFAULT 0,
  status             text NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden', 'removed')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (listing_id, buyer_user_id)
);

CREATE TABLE creator_payout (
  id                 uuid PRIMARY KEY,
  creator_user_id    uuid NOT NULL,
  connect_account_id uuid NOT NULL REFERENCES connect_account(id),
  amount_cents       bigint NOT NULL,
  currency           char(3) NOT NULL,
  period_start       timestamptz NOT NULL,
  period_end         timestamptz NOT NULL,
  status             text NOT NULL CHECK (status IN ('scheduled', 'paid', 'failed', 'reversed')),
  stripe_payout_id   text,
  midtrans_settlement_ref text,
  purchases_included uuid[] NOT NULL DEFAULT '{}',
  scheduled_at       timestamptz NOT NULL,
  paid_at            timestamptz,
  error              jsonb,
  created_at         timestamptz NOT NULL DEFAULT now()
);
```

All tenant tables RLS per tenant isolation. `creator_payout` scoped by `creator_user_id` indirectly; explicit RLS policy uses `app_user.tenant_id` lookup.

### 3.2 Platform fee policy

- Default take rate 20% on gross.
- Verified creator: 15% (Hemera flag `commerce.verified_take_rate`).
- Premium category listings: 25% (custom_build_service, consulting_hour).
- Minimum platform fee USD 0.50 on transactions < USD 2.50.
- Rate enforced at purchase-creation time; historical purchases keep original split on refund.

### 3.3 Payout schedule

- Default: monthly on the 1st.
- Verified creators: weekly on Monday.
- Minimum payout threshold USD 25 (accumulates if under threshold).
- Currency: creator's Connect account default currency. No FX conversion in submission scope.

## 4. Interface / API Contract

### 4.1 POST `/v1/commerce/connect/onboard`

Initiates creator Stripe Connect Express onboarding.

```python
class ConnectOnboardRequest(BaseModel):
    country: str = Field(..., min_length=2, max_length=2)
    default_currency: str = Field(..., min_length=3, max_length=3)
    return_url: HttpUrl | None = None
    refresh_url: HttpUrl | None = None

class ConnectOnboardResponse(BaseModel):
    onboarding_url: HttpUrl                              # Stripe-hosted form
    connect_account_id: str
    expires_at: str
```

Stripe Account Link created with `type="account_onboarding"`. Url expires 5 min.

### 4.2 GET `/v1/commerce/connect/status`

Returns current creator's onboarding status + requirements.

### 4.3 POST `/v1/commerce/purchase`

Creates a purchase intent.

```python
class PurchaseRequest(BaseModel):
    listing_id: str
    rail: Literal["stripe", "midtrans"] = "stripe"
    idempotency_key: str | None = None

class PurchaseResponse(BaseModel):
    purchase_id: str
    rail: Literal["stripe", "midtrans"]
    checkout_url: HttpUrl                                # Stripe Checkout or Midtrans SNAP redirect
    expires_at: str
```

Stripe rail: creates Checkout Session with `payment_intent_data.application_fee_amount` + `transfer_data.destination` set to creator's `connect_account_id` per Stripe Connect Express pattern.

Midtrans rail: creates `midtrans_transaction` with merchant-level aggregation; creator payout handled via internal ledger + manual Midtrans settlement split (Midtrans lacks Connect analog).

### 4.4 Webhook integration

`charge.succeeded` with `application_fee` + `transfer` present:
- Update `marketplace_purchase.status = 'completed'`
- Post ledger:
  ```
  DEBIT  asset:stripe_balance_usd                        gross_amount
  CREDIT revenue:marketplace_platform_fee_usd            platform_fee
  CREDIT liability:creator_payable_usd:<creator_id>      creator_net
  ```
- Generate license_key if listing is digital
- Send receipt email via Pheme (`purchase_receipt` template)
- Emit `nerium.marketplace.purchase_completed`

`charge.refunded`:
- Update purchase refunded_amount_cents
- Post reversing ledger entries
- Adjust creator_payable proportionally (refund comes from creator's next payout or directly from balance)
- Send refund notification email

`account.updated` (Connect):
- Sync `connect_account.requirements` + `onboarding_status` + `charges_enabled` + `payouts_enabled`.

### 4.5 POST `/v1/commerce/reviews`

Creates a review. Buyer must have a completed, non-refunded purchase of the listing.

```python
class ReviewRequest(BaseModel):
    listing_id: str
    rating: int = Field(..., ge=1, le=5)
    title: str | None = Field(default=None, max_length=100)
    body: str | None = Field(default=None, max_length=5000)

class ReviewResponse(BaseModel):
    review_id: str
    visible: bool                                        # false if auto-flagged
```

Auto-moderation: Wilson lower bound interval computed per listing per `trust_score.contract.md`. Flag threshold `flag_count >= 3` hides review pending admin review.

### 4.6 POST `/v1/commerce/reviews/{id}/helpful` and `/flag`

Toggles helpful or flag. Rate limited 10/min per user via Redis token bucket.

### 4.7 GET `/v1/commerce/dashboard`

Creator dashboard data: earnings total, period spend, sales count, recent purchases, review summary, payout schedule next date.

### 4.8 Payout cron

Arq cron daily at 03:00 UTC:

```python
@arq_worker.cron("0 3 * * *")
async def run_creator_payouts():
    now = datetime.utcnow()
    creators = await load_eligible_creators(now)
    for c in creators:
        balance_cents = await compute_creator_balance(c.user_id)
        if balance_cents >= 2500:                         # USD 25 min
            payout = await stripe.Transfer.create(
                amount=balance_cents,
                currency="usd",
                destination=c.stripe_account_id,
                metadata={"creator_user_id": str(c.user_id)},
            )
            await record_payout(c, payout, balance_cents)
```

### 4.9 Dispute handling

`charge.dispute.created` webhook:
- Purchase status → `disputed`.
- Hold corresponding creator balance (ledger sub-account `liability:creator_payable_held_usd:<creator_id>`).
- Create `moderation_queue_entry` for Eunomia admin review.
- Email creator via Pheme (`dispute_notification` template).

## 5. Event Signatures

Wire events:

| Event | Payload | Consumer |
|---|---|---|
| `nerium.marketplace.purchase_completed` | `{purchase_id, listing_id, buyer_user_id, creator_user_id, gross_amount_cents, currency, rail}` | buyer room + creator room |
| `nerium.marketplace.purchase_refunded` | `{purchase_id, refunded_amount_cents}` | both rooms |
| `nerium.marketplace.review_posted` | `{review_id, listing_id, rating}` | creator room |
| `nerium.marketplace.payout_paid` | `{payout_id, amount_cents, currency}` | creator room |
| `nerium.marketplace.connect_verified` | `{connect_account_id}` | creator room |

Log:

| Event | Fields |
|---|---|
| `commerce.purchase.created` | `purchase_id`, `listing_id`, `rail`, `gross_cents` |
| `commerce.purchase.completed` | `purchase_id`, `platform_fee_cents`, `creator_net_cents` |
| `commerce.payout.scheduled` | `payout_id`, `creator_user_id`, `amount_cents` |
| `commerce.payout.paid` | `payout_id`, `stripe_payout_id` |
| `commerce.payout.failed` | `payout_id`, `error_kind` |
| `commerce.review.flagged` | `review_id`, `flag_count` |
| `commerce.dispute.opened` | `purchase_id`, `dispute_id`, `held_cents` |

## 6. File Path Convention

- Connect onboarding: `src/backend/commerce/connect.py`
- Purchase flow: `src/backend/commerce/purchase.py`
- Payout scheduler: `src/backend/commerce/payout.py`
- Review CRUD: `src/backend/commerce/review.py`
- Dispute handler: `src/backend/commerce/dispute.py`
- Dashboard data: `src/backend/commerce/dashboard.py`
- Router: `src/backend/routers/v1/commerce/*.py`
- Frontend: `src/frontend/app/dashboard/page.tsx`, `src/frontend/app/marketplace/[listingId]/page.tsx`, `src/frontend/components/dashboard/*.tsx`
- Migrations: `src/backend/db/migrations/XXX_connect_account.py`, `XXX_marketplace_purchase.py`, `XXX_marketplace_review.py`, `XXX_creator_payout.py`
- Seed: `src/backend/db/seed/demo_purchases.sql`, `demo_reviews.sql`
- Tests: `tests/commerce/test_purchase_flow.py`, `test_revenue_split.py`, `test_payout_cron.py`, `test_review_visibility.py`, `test_dispute_hold.py`, `test_midtrans_manual_split.py`

## 7. Naming Convention

- Endpoint paths: `/v1/commerce/*`.
- Amount columns: `*_cents` bigint (USD cents, IDR rupiah; never FLOAT).
- Status enum values: `snake_case` lowercase.
- Ledger account codes: `liability:creator_payable_usd:<creator_id>`, `revenue:marketplace_platform_fee_usd`.
- Idempotency keys: `purchase:<listing_id>:<buyer_id>:<user_provided_key>`.
- Template names (Pheme): `purchase_receipt`, `marketplace_sale`, `payout_paid`, `dispute_notification`.

## 8. Error Handling

- Listing not purchasable (draft/archived): HTTP 403 `listing_not_purchasable`.
- Listing author purchases own: HTTP 403 `self_purchase_forbidden`.
- Connect account not verified when creator tries to monetize: HTTP 403 `connect_not_verified`.
- Stripe transfer fails (Connect balance insufficient): HTTP 502, mark payout `failed`, retry next run.
- Midtrans charge fails: purchase stays `pending`, user can retry.
- Review without completed purchase: HTTP 403 `no_eligible_purchase`.
- Duplicate review (same listing + buyer): HTTP 409 `review_exists`.
- Review rate limit exceeded: HTTP 429.
- Payout below minimum threshold: skip this cycle, log INFO.
- Dispute handler fails to find purchase: log ERROR, do not create moderation entry.
- Creator account suspended mid-purchase: purchase transitions `pending` → `cancelled`, buyer refunded, log WARN.

## 9. Testing Surface

- Connect onboarding happy path: POST returns Stripe-hosted URL; simulated `account.updated` webhook with `charges_enabled=true` transitions to verified.
- Purchase Stripe rail: POST creates Checkout; simulated `charge.succeeded` completes purchase + ledger posted + receipt emailed.
- Purchase Midtrans rail: POST creates SNAP token; simulated webhook settles; manual split ledger posted.
- Platform fee math: USD 10 purchase → USD 2 platform + USD 8 creator (20% rate); test verified creator → USD 1.50 + USD 8.50 (15% rate).
- Minimum fee: USD 2 purchase → USD 0.50 platform + USD 1.50 creator.
- Refund: partial refund splits proportionally between platform + creator balance.
- Payout cron: creator balance USD 100, cron creates Transfer, `creator_payout` row inserted.
- Payout below threshold: balance USD 20, skip, carry over.
- Review after purchase: allowed; without purchase: rejected.
- Review flag threshold: 3 flags hides review.
- Wilson lower bound: 10 reviews 4.5 avg outranks 2 reviews 5.0 avg.
- Dispute: opens moderation entry, holds creator balance; admin resolve releases.
- Self-purchase prevented: creator attempts purchase of own listing → 403.
- Concurrent purchase: two buyers race on limited-quantity listing handled via DB row lock (SELECT FOR UPDATE).

## 10. Open Questions

- Platform take rate 20% vs 15% default: 20% at launch, reduce as competition analyzed.
- Volume-based tier for take rate: recommend defer post-hackathon (complex to explain).
- Midtrans manual split timing: immediate ledger entry on webhook; actual IDR payout to creator Indonesian bank settled monthly via admin action. Confirm.
- Cross-rail single listing (listing sellable both USD + IDR): per-listing flag `supports_stripe + supports_midtrans`. Default both true.

## 11. Post-Hackathon Refactor Notes

- Stripe Connect Custom type for deeper platform control (disputes, refunds, fraud) vs Express.
- Subscription purchases through marketplace (recurring creator revenue share).
- Usage-based billing pass-through: creator charges per-execution, platform skims percentage per tick.
- Dispute workflow UI in Eunomia admin.
- Automatic FX conversion for creators with non-USD settlement currency.
- Sales tax / VAT computation per buyer geography (Stripe Tax integration).
- Gift purchases (buyer pays for another user's account).
- Volume discount coupons (platform-sponsored seasonal promos).
- Creator analytics API for external dashboard integrations.
- Midtrans settlement parity with Stripe Connect (manual ledger split is temporary; build marketplace-level accounts if Midtrans releases Connect-like primitives).
