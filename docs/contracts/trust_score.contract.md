# Trust Score

**Contract Version:** 0.2.0
**Owner Agent(s):** Astraea (NP trust score authority, Bayesian + Wilson formula, pg_cron nightly refresh, per-category scoring, new-agent boost). Hecate (P0 origin author, deprecated as owner per NP amendment).
**Consumer Agent(s):** Hyperion (search boost per `marketplace_search.contract.md` Section 4.4), Phanes (listing.trust_score_cached denormalized column), Iapetus (review data feeds recalculation), Tethys (verified identity flag boost), Eunomia (admin badge grant override + dispute-induced score adjustment), Frontend (trust badge render), Selene (score change emissions), Nemea-RV-v2 (formula regression)
**Stability:** stable for NP
**Last Updated:** 2026-04-24 (NP Wave 1, Pythia-v3 round 3 amendment)
**Changelog v0.2.0:** Replaced P0 weighted-average formula (usage + reviews + execution + attestation) with Bayesian smoothed mean (primary sort) + Wilson lower bound (binary signals). Added per-category formula dispatch (agent / skill / sprite_pack / dataset / service differ). Added pg_cron nightly refresh + new-agent boost factor (+0.2 × exp(-age_days/3) first 7 days). Added `computed_inputs` + `formula_version` columns to audit which formula snapshot produced each score.

## 1. Purpose

Defines NP trust score calculation: Bayesian smoothed mean for marketplace sort, Wilson lower bound for helpful/flag binary signals, per-category formula variations, pg_cron nightly precomputed `trust_score_cached` column refresh, new-agent boost formula. Surfaces `TrustBand` (unverified/emerging/established/trusted/elite) derived from score.

Per M1 Section D.22 decision. Formula weights maintained in Postgres `trust_formula_weights` table + config JSON snapshot in repo at `src/backend/trust/formula_weights.json`. Formula version bump required when weights change (enables historical score reproducibility).

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor, Section 6 Registry shallow-by-design)
- `CLAUDE.md` (root)
- `docs/phase_np/RV_NP_RESEARCH.md` (Section D.22 Bayesian + Wilson)
- `docs/phase_np/RV_NP_AGENT_STRUCTURE.md` (Section 4.12 Astraea)
- `docs/contracts/agent_identity.contract.md` v0.2.0 (identity subject of score)
- `docs/contracts/marketplace_listing.contract.md` v0.2.0 (listing.trust_score_cached + category dispatch)
- `docs/contracts/marketplace_commerce.contract.md` (review data source)
- `docs/contracts/marketplace_search.contract.md` (boost consumer)

## 3. Schema Definition

### 3.1 Formulas

Bayesian smoothed mean (for ordered sort, continuous score):

```
bayesian = (v / (v + m)) * R + (m / (v + m)) * C

where
  v = vote count (e.g., review count)
  R = observed mean rating (0.0 to 1.0 normalized)
  m = prior weight, default 15 (global tuning)
  C = global average of R across all entities, default 0.7 (re-seeded nightly)
```

Wilson score lower bound (for binary helpful/flag signals, 95% confidence):

```
wilson_lower = ((p_hat + (z^2 / (2n)) - z * sqrt((p_hat*(1 - p_hat) + (z^2 / (4n))) / n)) / (1 + (z^2 / n)))

where
  n = pos + neg
  p_hat = pos / n
  z = 1.96 (95% CI)

Implemented numerically:
  wilson = ((pos + 1.9208) / (pos + neg) - 1.96 * sqrt((pos*neg)/(pos+neg) + 0.9604) / (pos+neg)) / (1 + 3.8416/(pos+neg))
```

New-agent boost:

```
boost = score + 0.2 * exp(-age_days / 3)    when age_days < 7, else 0
```

Verified identity boost: fixed `+0.05` when `agent_identity.kind = 'creator'` AND `agent_identity.key_status = 'active'` AND identity has ≥ 1 completed purchase payout via `creator_payout` history.

Final bounded to [0.0, 1.0].

### 3.2 Per-category dispatch

| Category | Primary inputs | Secondary inputs |
|---|---|---|
| `core_agent` | execution_success_rate (from audit log) + review_weighted_mean | review_count, verified_flag, age_days |
| `content` (prompt/skill/quest) | usage_count_normalized + review_weighted_mean | helpful_count, flag_count |
| `infrastructure` (mcp_config/connector/workflow) | install_success_rate + review_weighted_mean | issue_count_open |
| `assets` (sprite/sound/theme) | download_count_normalized + review_weighted_mean | helpful_count, flag_count |
| `services` (custom_build/consulting) | completion_rate + review_weighted_mean | dispute_count_inverse |
| `premium` | admin_grant (binary verified/not) | N/A (hand-curated) |
| `data` (dataset/dashboard) | download_count_normalized + review_weighted_mean + data_freshness_score | issue_count_open |

Usage/download counts log-normalized via `log(count + 1) / log(10000)` capped at 1.0.

### 3.3 Database tables

```sql
CREATE TABLE trust_score_snapshot (
  id                  bigserial PRIMARY KEY,
  identity_id         uuid REFERENCES agent_identity(id) ON DELETE CASCADE,
  listing_id          uuid REFERENCES marketplace_listing(id) ON DELETE CASCADE,
  category            text,                              -- if listing-scoped
  score               numeric(4,3) NOT NULL,             -- 0.000 to 1.000
  band                text NOT NULL CHECK (band IN ('unverified','emerging','established','trusted','elite')),
  stability           text NOT NULL CHECK (stability IN ('provisional','stable')),
  computed_inputs     jsonb NOT NULL,                    -- {R, v, pos, neg, age_days, ...}
  formula_version     text NOT NULL,                     -- 'bayesian_wilson_v1'
  boost_components    jsonb NOT NULL DEFAULT '{}'::jsonb,-- {new_agent_boost: 0.05, verified_boost: 0.05}
  computed_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (identity_id, listing_id, computed_at),
  CHECK ((identity_id IS NOT NULL) OR (listing_id IS NOT NULL))
);
CREATE INDEX idx_trust_identity_latest ON trust_score_snapshot(identity_id, computed_at DESC);
CREATE INDEX idx_trust_listing_latest ON trust_score_snapshot(listing_id, computed_at DESC);

CREATE TABLE trust_formula_weights (
  id                  bigserial PRIMARY KEY,
  formula_version     text UNIQUE NOT NULL,              -- 'bayesian_wilson_v1'
  weights             jsonb NOT NULL,                    -- {m, C, z, new_agent_decay_half_life, verified_boost, category_weights: {core_agent: {...}, ...}}
  active              boolean NOT NULL DEFAULT false,    -- only one active at a time
  created_at          timestamptz NOT NULL DEFAULT now(),
  retired_at          timestamptz
);
```

### 3.4 Pydantic response model

```python
class TrustScoreResponse(BaseModel):
    subject_kind: Literal["identity", "listing"]
    subject_id: str
    score: float
    band: Literal["unverified","emerging","established","trusted","elite"]
    stability: Literal["provisional","stable"]
    computed_at: str
    formula_version: str
    category: str | None
    category_scores: dict[str, float] | None             # per-category breakdown if aggregate
    inputs_summary: dict[str, float]                     # safe-to-display inputs
    boost_components: dict[str, float]
```

### 3.5 Band thresholds

| Band | Score range |
|---|---|
| `unverified` | 0.00 ≤ score < 0.20 |
| `emerging` | 0.20 ≤ score < 0.40 |
| `established` | 0.40 ≤ score < 0.60 |
| `trusted` | 0.60 ≤ score < 0.85 |
| `elite` | 0.85 ≤ score ≤ 1.00 |

Stability: `provisional` when `v < 10` OR `pos + neg < 10`; `stable` otherwise.

## 4. Interface / API Contract

### 4.1 pg_cron nightly refresh

```sql
-- Scheduled via pg_cron (or Arq cron if pg_cron unavailable)
SELECT cron.schedule('refresh_trust_scores', '0 2 * * *', $$
  INSERT INTO trust_score_snapshot (identity_id, listing_id, category, score, band, stability,
                                     computed_inputs, formula_version, boost_components, computed_at)
  SELECT ... FROM compute_trust_score_batch();
  -- Update denormalized columns
  UPDATE marketplace_listing SET trust_score_cached = (
    SELECT score FROM trust_score_snapshot
    WHERE listing_id = marketplace_listing.id
    ORDER BY computed_at DESC LIMIT 1
  );
$$);
```

Fallback if pg_cron unavailable: Arq cron `trust_score_refresh_daily` at 02:00 UTC runs identical logic via Python.

### 4.2 On-demand recompute

```python
# src/backend/trust/bayesian.py

async def compute_trust(subject_kind: Literal["identity", "listing"], subject_id: UUID, category: str | None = None) -> TrustScoreResponse:
    weights = await load_active_weights()
    inputs = await gather_inputs(subject_kind, subject_id, category)
    R = _normalize_rating_mean(inputs.review_ratings)
    bayesian = (inputs.review_count / (inputs.review_count + weights.m)) * R + \
               (weights.m / (inputs.review_count + weights.m)) * weights.C
    wilson = _wilson_lower_bound(inputs.helpful_count, inputs.flag_count) if inputs.helpful_count + inputs.flag_count > 0 else 0.5
    base = (0.7 * bayesian + 0.3 * wilson)  # per-category weights apply here
    new_agent_boost = 0.2 * math.exp(-inputs.age_days / 3) if inputs.age_days < 7 else 0.0
    verified_boost = 0.05 if inputs.verified_flag else 0.0
    score = min(1.0, max(0.0, base + new_agent_boost + verified_boost))
    band = _derive_band(score)
    stability = 'stable' if inputs.review_count >= 10 else 'provisional'
    await persist_snapshot(subject_kind, subject_id, score, band, stability, inputs, weights.formula_version, ...)
    return TrustScoreResponse(...)
```

### 4.3 Endpoints

- `GET /v1/registry/identities/{id}/trust`: latest snapshot for identity.
- `GET /v1/marketplace/listings/{id}/trust`: latest snapshot for listing.
- `POST /v1/admin/trust/recompute`: admin-trigger recompute (subject_kind + subject_id). Useful post-review-flood.
- `GET /v1/admin/trust/formula-weights`: admin view active + retired formulas.
- `POST /v1/admin/trust/formula-weights`: register new formula version (admin + 2FA). Bumping formula_version requires re-seeding C global average next night.

### 4.4 New-agent grace policy

Agents less than 7 days old get provisional + boost; prevent cold-start sandbagging. Boost decays exponentially (t=0 → +0.20, t=3 → +0.074, t=7 → +0.023).

## 5. Event Signatures

Wire events:

| Event | Payload |
|---|---|
| `nerium.registry.trust_recomputed` | `{subject_kind, subject_id, previous_score, new_score, band_changed}` |
| `nerium.registry.trust_band_changed` | `{subject_kind, subject_id, previous_band, next_band}` |

Log:

| Event | Fields |
|---|---|
| `trust.score.computed` | `subject_kind`, `subject_id`, `score`, `band`, `stability`, `formula_version` |
| `trust.refresh.batch_completed` | `rows_updated`, `duration_ms`, `formula_version` |
| `trust.formula.version_activated` | `formula_version`, `previous_version`, `actor_user_id` |
| `trust.boost.applied` | `subject_id`, `boost_kind`, `boost_amount` |

OTel spans: `trust.compute`, `trust.refresh.batch`, `trust.gather_inputs`.

## 6. File Path Convention

- Formula module: `src/backend/trust/bayesian.py`
- Wilson helper: `src/backend/trust/wilson.py`
- Per-category dispatcher: `src/backend/trust/per_category.py`
- New-agent boost: `src/backend/trust/new_agent_boost.py`
- Weights loader: `src/backend/trust/weights.py`
- Batch refresh: `src/backend/trust/refresh_batch.py`
- pg_cron schedule SQL: `src/backend/db/migrations/XXX_trust_pg_cron.sql`
- Arq cron fallback: `src/backend/workers/trust_refresh_daily.py`
- Router: `src/backend/routers/v1/registry/trust.py`, `v1/admin/trust.py`
- Migrations: `src/backend/db/migrations/XXX_trust_score_snapshot.py`, `XXX_trust_formula_weights.py`
- Weights snapshot JSON: `src/backend/trust/formula_weights.json` (version-controlled)
- Tests: `tests/trust/test_bayesian_smoothing.py`, `test_wilson_interval.py`, `test_new_agent_decay.py`, `test_per_category_dispatch.py`, `test_pg_cron_refresh.py`, `test_band_derivation.py`, `test_provisional_stability.py`

## 7. Naming Convention

- Formula version strings: `bayesian_wilson_v1` underscore lowercase.
- Band values: single word lowercase.
- Category strings per `marketplace_listing.contract.md` Section 3.1.
- Input summary field names: snake lowercase.
- Boost component keys: snake lowercase (`new_agent_boost`, `verified_boost`).
- Endpoint paths: `/v1/{registry|marketplace}/{resource}/{id}/trust`.

## 8. Error Handling

- Unknown subject_id: HTTP 404.
- Inputs out of expected range (negative usage_count): clamp to 0, log WARN.
- Weights record missing active row: HTTP 500 `formula_misconfigured`; operator alert via Selene CRITICAL.
- pg_cron unavailable: fallback Arq cron activates; emit `trust.refresh.degraded_pg_cron`.
- Batch compute row count > 10 K: throttle via LIMIT 1000 per run + multiple runs; prevent nightly refresh from over-running window.
- Wilson math precision edge (pos + neg extreme): use `mpmath` or `numpy.float64`, not Python native float.
- pg_cron partial failure (subset of rows): snapshot rows that succeeded written; failures logged; retry on next run.
- Formula version change mid-day: existing snapshots keep their `formula_version`; new snapshots use new version; score backfill explicit via `POST /v1/admin/trust/backfill` (admin + long-running Arq job).

## 9. Testing Surface

- Bayesian determinism: same inputs + weights → same score bitwise.
- Band derivation: score 0.15 → unverified, 0.35 → emerging, 0.55 → established, 0.75 → trusted, 0.90 → elite.
- Stability: review_count 2 → provisional; review_count 15 → stable.
- Wilson interval: 10 pos / 2 neg → score in correct range.
- New-agent boost: age_days 0 → +0.20; age_days 3 → +0.074; age_days 7 → ~+0.023; age_days 10 → 0.
- Verified boost: identity with completed payout + active key → +0.05 applied; without → 0.
- Per-category dispatch: listing category core_agent → uses execution_success_rate input; category assets → uses download_count_normalized.
- Score bounded [0, 1]: input edge cases (all positive + all boosts) clamps at 1.0.
- Batch refresh: 100 listings, pg_cron runs, all trust_score_cached updated, last-computed events emitted.
- Arq fallback: disable pg_cron, Arq cron fires at 02:00 UTC, identical behavior.
- Formula version activation: admin POST new weights, next refresh uses new version.
- RLS: tenant scope on identity-level trust (platform identities readable by all).
- On-demand recompute: admin POST triggers immediate snapshot, reflected in denormalized column within seconds.
- Brigading detection (future): stub test scaffolds anomaly pattern (100 5-star reviews in 1 min from new accounts); current v0.2.0 does not yet detect but tests reserve fixture.

## 10. Open Questions

- Formula weight tuning cadence: quarterly review after submission launch. No changes for submission week.
- Band thresholds: current choices are intuition-based; refine via real review distribution data post-launch.
- Provisional threshold `v < 10`: could be category-dependent (agents need more signal than assets). Defer category-specific post-hackathon.

## 11. Post-Hackathon Refactor Notes

- Recency decay: exponentially discount older reviews (half-life 180 days) to emphasize recent signal.
- Anti-brigading: detect clustered review burst patterns (sybil detection via account age + IP clustering + purchase history).
- Weighted verifier attestation: named verifiers (NERIUM team, enterprise auditor) carry more weight than anonymous reviews.
- Portable reputation: import cross-platform (GitHub stars, prior marketplace ratings, academic citations).
- Machine-learned trust score (post sufficient data) via gradient-boosted tree on feature matrix; preserve formula-based baseline as interpretable fallback.
- Public Trust Score API (OAuth-scoped) for external platforms to surface NERIUM scores.
- Explanation surface: why is this listing's trust score X? (field-level contribution breakdown in UI).
- Formula A/B test (compare rank stability + purchase CTR between versions before activating).
- Trust decay on issue surfacing (dispute opened → immediate score penalty; resolved in favor of creator → penalty removed).
- Multi-dimensional trust (reliability + craftsmanship + communication) with separate sub-scores.
