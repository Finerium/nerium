# Budget Monitor (Chronos Daemon)

**Contract Version:** 0.1.0
**Owner Agent(s):** Moros (budget daemon authority, Anthropic Admin Usage API poller, local accountant, cap flag, auto-disable). Kratos reads the cap flag in the MA session pre-call gate per `agent_orchestration_runtime.contract.md`.
**Consumer Agent(s):** Kratos (pre-call cap check + per-session post-call cost write), Hemera (auto-disabled `builder.live` flag), Eunomia (admin spend dashboard), Selene (OTel metric emission), Plutus (reconciliation against Stripe revenue), Marshall (tier-aware display in Banking UI if budget insights surface).
**Stability:** draft
**Last Updated:** 2026-04-24 (NP Wave 1, Pythia-v3 round 3)

## 1. Purpose

Defines the budget monitor daemon: hybrid local accounting (post-stream-close `message_delta.usage`) + Anthropic Admin Usage API reconciliation (poll every 5 min), Redis cap flag semantics, auto-disable Hemera flag on overspend, auto-re-enable at UTC 00:00 daily rollover, per-tenant daily spend counter, rate-limiter coordination. Daemon name is "Chronos" semantically; agent name is Moros for Greek myth coherence (daemon of doom).

Tracking granularity: per-tenant daily USD spend. Submission cap: USD 100 / day default per Ghaisan response to M1 Open Question 7.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor, Section 4 Builder Tokopedia-tier cost awareness)
- `CLAUDE.md` (root, Budget section)
- `docs/phase_np/RV_NP_RESEARCH.md` (Section B.12 MA session lifecycle, D.25 rate limit)
- `docs/phase_np/RV_NP_AGENT_STRUCTURE.md` (Section 4.18 Moros)
- `docs/contracts/agent_orchestration_runtime.contract.md` (pre-call gate integration)
- `docs/contracts/feature_flag.contract.md` (auto-disable `builder.live`)
- `docs/contracts/redis_session.contract.md` (cap flag + counter keys)
- `docs/contracts/observability.contract.md` (OTel metric schema)
- Anthropic Admin Usage API docs (`admin/usage_report/messages`)

## 3. Schema Definition

### 3.1 Database tables

```sql
CREATE TABLE budget_usage_snapshot (
  id              bigserial PRIMARY KEY,
  tenant_id       uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  period_start    timestamptz NOT NULL,
  period_end      timestamptz NOT NULL,
  input_tokens    bigint NOT NULL DEFAULT 0,
  output_tokens   bigint NOT NULL DEFAULT 0,
  cache_read_tokens  bigint NOT NULL DEFAULT 0,
  cache_write_tokens bigint NOT NULL DEFAULT 0,
  cost_usd        numeric(12, 4) NOT NULL DEFAULT 0.0,
  source          text NOT NULL CHECK (source IN ('local', 'admin_api', 'reconciled')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, period_start, source)
);

CREATE TABLE budget_policy (
  id                 uuid PRIMARY KEY,
  tenant_id          uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  daily_cap_usd      numeric(10, 2) NOT NULL,
  monthly_cap_usd    numeric(12, 2),
  threshold_50_pct   boolean NOT NULL DEFAULT true,
  threshold_75_pct   boolean NOT NULL DEFAULT true,
  threshold_90_pct   boolean NOT NULL DEFAULT true,
  threshold_100_pct  boolean NOT NULL DEFAULT true,
  auto_disable_flag  text DEFAULT 'builder.live',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id)
);
```

RLS on `budget_usage_snapshot` + `budget_policy` per tenant isolation.

### 3.2 Redis counter keys

| Key | TTL | Purpose |
|---|---|---|
| `chronos:ma_capped` | no TTL | Global cap flag (1 = capped, 0/absent = open) |
| `chronos:tenant:<id>:usd_today` | rollover at UTC 00:00 | Per-tenant daily spend (float seconds cents precision) |
| `chronos:tenant:<id>:capped` | no TTL | Per-tenant cap flag |
| `chronos:last_reconcile_ts` | 1 h | Last successful Admin API poll (ISO-8601) |
| `chronos:poll_lock` | 60 s | Single-runner lock on poll task |

Daily rollover: Arq cron at UTC 00:00 runs `chronos_daily_reset`, deletes all `chronos:tenant:*:usd_today` keys, clears `chronos:ma_capped` if cleared from policy.

### 3.3 Cost computation

Anthropic pricing April 2026 (USD per million tokens):

| Model | Input | Output | Cache read | Cache write (5-min) |
|---|---|---|---|---|
| `claude-opus-4-7` | 5 | 25 | 0.50 | 6.25 |
| `claude-opus-4-6` | 5 | 25 | 0.50 | 6.25 |
| `claude-sonnet-4-6` | 3 | 15 | 0.30 | 3.75 |
| `claude-haiku-4-5` | 1 | 5 | 0.10 | 1.25 |

Formula:

```
cost_usd = (input_tokens - cache_read_tokens - cache_write_tokens) * input_price / 1e6
        + output_tokens * output_price / 1e6
        + cache_read_tokens * cache_read_price / 1e6
        + cache_write_tokens * cache_write_price / 1e6
```

Prices maintained in `src/backend/budget/pricing.py` constant map; pricing updates via Alembic migration + version bump to this contract.

## 4. Interface / API Contract

### 4.1 Admin Usage API poller

```python
# src/backend/budget/usage_api_poller.py

@arq_worker.cron("*/5 * * * *")  # every 5 min
async def poll_anthropic_usage():
    if not await redis.set("chronos:poll_lock", "1", ex=60, nx=True):
        return                                             # another runner holds the lock

    since = (await redis.get("chronos:last_reconcile_ts")) or (now() - timedelta(hours=1))
    report = await anthropic.admin.usage_report.messages(
        starting_at=since, ending_at=now(), bucket_width="1h"
    )
    for bucket in report.data:
        await upsert_snapshot(
            tenant_id=resolve_tenant(bucket.workspace_id),
            period_start=bucket.starting_at,
            period_end=bucket.ending_at,
            source="admin_api",
            input_tokens=bucket.uncached_input_tokens + bucket.cache_read_input_tokens + bucket.cache_creation_input_tokens,
            output_tokens=bucket.output_tokens,
            cache_read_tokens=bucket.cache_read_input_tokens,
            cache_write_tokens=bucket.cache_creation_input_tokens,
        )
    await redis.set("chronos:last_reconcile_ts", now().isoformat(), ex=3600)
    await reconcile_and_cap()
```

Reconciliation step computes local vs admin API drift per tenant. Drift > 5% emits `budget.reconcile.drift` log + optional Eunomia alert.

### 4.2 Local accountant

```python
# src/backend/budget/local_accountant.py (called by Kratos post-stream)

async def record_session_cost(session_id: UUID):
    session = await load_session(session_id)
    if session.cost_usd == 0:
        return
    key = f"chronos:tenant:{session.tenant_id}:usd_today"
    new_total = await redis.incrbyfloat(key, float(session.cost_usd))
    await redis.expireat(key, next_utc_midnight())
    await check_thresholds(session.tenant_id, new_total)
```

### 4.3 Threshold + auto-disable

```python
async def check_thresholds(tenant_id: UUID, spent: float):
    policy = await load_policy(tenant_id)
    pct = spent / float(policy.daily_cap_usd) * 100
    for threshold in (50, 75, 90, 100):
        if getattr(policy, f"threshold_{threshold}_pct") and pct >= threshold:
            await maybe_emit_alert(tenant_id, threshold, spent, policy.daily_cap_usd)
    if pct >= 100:
        await redis.set(f"chronos:tenant:{tenant_id}:capped", "1")
        if policy.auto_disable_flag:
            await hemera.set_override(
                flag_name=policy.auto_disable_flag,
                user_scope=("tenant", tenant_id),
                value=False,
                expires_at=next_utc_midnight(),
                reason="budget_cap_tripped",
            )
        await publish(f"nerium.system.budget_alert", BudgetAlertPayload(
            tenant_id=str(tenant_id), threshold_pct=100,
            spent_usd_today=spent, cap_usd_today=float(policy.daily_cap_usd),
            builder_disabled=True,
        ))
```

Global cap (`chronos:ma_capped`) set when platform-wide daily cap tripped (sum across all tenants). Platform cap default USD 200 / day at submission. Separate from per-tenant cap.

### 4.4 Kratos pre-call gate integration

```python
# Called inside agent_orchestration_runtime.contract.md dispatch()
async def enforce_budget_cap(tenant_id: UUID, requested_usd_cap: float):
    if await redis.get("chronos:ma_capped") == "1":
        raise BudgetCapTripped("global_cap_tripped")
    if await redis.get(f"chronos:tenant:{tenant_id}:capped") == "1":
        raise BudgetCapTripped("tenant_cap_tripped")
    spent = float(await redis.get(f"chronos:tenant:{tenant_id}:usd_today") or 0)
    policy = await load_policy(tenant_id)
    if spent + requested_usd_cap > float(policy.daily_cap_usd):
        raise BudgetCapTripped("insufficient_remaining",
            remaining_usd=float(policy.daily_cap_usd) - spent)
```

### 4.5 Admin + Eunomia endpoints

- `GET /v1/admin/budget/tenants/{id}/usage` returns per-tenant snapshot rows + Redis live counter.
- `GET /v1/admin/budget/global` returns platform-level spend vs cap.
- `POST /v1/admin/budget/tenants/{id}/reset` clears tenant cap flag + zeros daily counter (admin only).
- `POST /v1/admin/budget/global/reset` clears global cap (admin only).

All admin endpoints gated by `app_user.is_superuser = true` + CSRF per `rest_api_base.contract.md`.

### 4.6 Rate-limiter coordination

Moros owns global Lua token bucket for Anthropic API calls coordinated across all Kratos workers. Key `chronos:anthropic_rpm`, bucket size 50 rpm default (Anthropic tier-dependent), refill continuous. Kratos dispatcher acquires one token per Anthropic API call attempt; on denial, session transitions `failed` with reason `rate_limited_by_chronos`.

## 5. Event Signatures

| Wire event | Payload | Consumer |
|---|---|---|
| `nerium.system.budget_alert` | `BudgetAlertPayload` per `realtime_bus.contract.md` Section 3.3 | Frontend admin UI, user notifications |
| `nerium.system.budget_capped` | `{tenant_id, scope: "tenant"|"global"}` | All MA dispatchers |
| `nerium.system.budget_reset` | `{tenant_id: str | null, reset_at: str}` | Frontend |

Structured log:

| Event | Fields |
|---|---|
| `budget.local.recorded` | `tenant_id`, `session_id`, `cost_usd`, `new_total_today` |
| `budget.admin_api.polled` | `buckets_count`, `total_new_cost_usd`, `duration_ms` |
| `budget.reconcile.drift` | `tenant_id`, `local_usd`, `api_usd`, `drift_pct` |
| `budget.threshold.alerted` | `tenant_id`, `threshold_pct`, `spent_usd` |
| `budget.cap.tripped` | `tenant_id`, `scope`, `spent_usd`, `cap_usd` |
| `budget.cap.cleared` | `tenant_id`, `scope`, `reason` (`rollover` or `admin_reset`) |

OTel metrics (Prometheus exposition via Selene):

- `budget_tenant_spent_usd{tenant_id,period}` gauge
- `budget_global_spent_usd{period}` gauge
- `budget_alert_threshold_total{tenant_id,pct}` counter
- `budget_cap_tripped_total{scope}` counter

## 6. File Path Convention

- Daemon module: `src/backend/budget/` subtree
- Poller: `src/backend/budget/usage_api_poller.py`
- Local accountant: `src/backend/budget/local_accountant.py`
- Cap flag + check: `src/backend/budget/cap_flag.py`
- Daily reset cron: `src/backend/budget/daily_reset.py`
- Threshold + alert: `src/backend/budget/alerts.py`
- Reconciliation: `src/backend/budget/reconcile.py`
- Pricing map: `src/backend/budget/pricing.py`
- Admin routes: `src/backend/routers/v1/admin/budget.py`
- Migrations: `src/backend/db/migrations/XXX_budget_usage_snapshot.py`, `XXX_budget_policy.py`
- Seed: `src/backend/db/seed/default_budget_policy.sql`
- Tests: `tests/budget/test_cap_short_circuit.py`, `test_threshold_alerts.py`, `test_daily_rollover.py`, `test_admin_api_drift.py`, `test_auto_disable_hemera.py`

## 7. Naming Convention

- Redis key namespace: `chronos:<subject>:<id>` (daemon name Chronos preserved).
- Policy enum + boolean thresholds: `threshold_<pct>_pct`.
- Scope literals: `global`, `tenant`, `user`.
- Event names: `budget.<subject>.<action>` snake lowercase.
- Metric names: `budget_<subject>_<unit>{labels}` Prometheus convention.
- Cron schedule strings: standard crontab (`*/5 * * * *`).

## 8. Error Handling

- Admin Usage API 429: back off exponentially, max poll interval 30 min; alert Selene if 3 consecutive failures.
- Admin Usage API auth failure: emit `budget.admin_api.auth_failed` at CRITICAL, freeze poller until manual rotation; Kratos continues with local-only accounting.
- Redis connection lost mid-increment: session cost lost; reconciliation catches up within 5 min via Admin API. Acceptable 5-min drift window.
- Hemera auto-disable call fails: retry 3x with Tenacity. If still failing, emit CRITICAL + fall back to `chronos:tenant:<id>:capped` Redis flag as gate (Kratos reads flag directly without Hemera).
- Pricing map out of date (Anthropic changes prices): bump this contract + Alembic migration + redeploy. Interim: manual override via `POST /v1/admin/budget/override-pricing`.
- Daily rollover cron missed (pod restart): Arq retries missed schedule on boot; worst case 30-min late rollover, alerts emitted if > 30 min.
- Reconcile drift > 5%: log at ERROR, do NOT auto-adjust. Admin manually reviews via `budget_usage_snapshot` table.
- Budget cap tripped but Kratos bypasses (race): post-session cost write still lands; next pre-call gate catches. Worst case 1 extra session in-flight during cap trip window.

## 9. Testing Surface

- Pre-call gate blocks when global flag set: `chronos:ma_capped=1`, dispatch returns `BudgetCapTripped`.
- Pre-call gate blocks when tenant flag set: `chronos:tenant:<id>:capped=1`, dispatch blocked.
- Pre-call gate blocks when cap insufficient: `usd_today=80`, `cap=100`, `requested_cap=30`, dispatch blocked with `insufficient_remaining`.
- Session cost accounting: `record_session_cost` increments correct counter, emits `budget.local.recorded`.
- Threshold 50% + 75% + 90% + 100% emit alerts once each within same day.
- Auto-disable Hemera: 100% threshold sets override on `builder.live` for tenant.
- Daily rollover: run `chronos_daily_reset`, counters cleared, cap flags cleared, new day starts fresh.
- Admin API poll: mock API response, snapshot row inserted, `last_reconcile_ts` updated.
- Reconciliation drift: local 50 USD, API 48 USD, drift 4% logged as info; drift 6% logged as ERROR.
- Admin reset: `POST /v1/admin/budget/tenants/{id}/reset` clears flag + counter, emits `budget.cap.cleared`.
- Rate-limiter bucket: 51 concurrent Anthropic call attempts, 51st denied with `rate_limited_by_chronos`.
- Poll lock: two poller instances started concurrently, only one runs per 5-min window.

## 10. Open Questions

- Platform cap USD 200 / day vs 500 / day for submission: 200 default, raisable via admin reset if judge traffic demands. Confirm.
- Monthly cap tracking: enforced or advisory only? Recommend advisory at submission (daily cap is the binding limit); add monthly cap policy post-hackathon.
- Cost of admin API polling: ~10 K tokens per 5-min poll worst case. Acceptable at scale? Yes, < USD 1/day.

## 11. Post-Hackathon Refactor Notes

- Per-user budget (not only per-tenant): free tier users on shared budget, paid users on own budget.
- Predictive cap: alert at 80% based on rate extrapolation, not just instant spend.
- Cost estimation pre-call: return projected cost in `CreateMaSessionResponse` so UI can warn user before expensive runs.
- Multi-currency support for non-USD pricing (post-Atlas Global).
- Integration with Plutus double-entry ledger: budget spend posts to `expense:ma_compute` account.
- Export daily usage to CSV via Eunomia admin.
- Per-tool cost attribution (MCP tool X consumed Y USD of Z session).
- Subscription tier enforcement: free (cap 5/day), solo (cap 50/day), team (cap 500/day), enterprise (custom).
