---
agent: Nemea-RV-v2
phase: NP
wave: W4
session: T-NEMEA Phase 2
date: 2026-04-26
model: Opus 4.7
harness: Lighthouse 13.1.0 (npx) headless Chrome
scope: V4 lock #7 narrow Lighthouse scope, landing / plus game /play only
target_url: https://nerium-one.vercel.app
verdict: PASS
---

# Nemea-RV-v2 W4 Phase 2 Lighthouse Report

## 1. Scope

V4 lock #7 narrow Lighthouse scope. Two routes audited: landing / and game /play. Marketplace + builder + pricing routes intentionally excluded per the lock.

## 2. Audit configuration

- Lighthouse 13.1.0 (CLI via `npx lighthouse`)
- Chrome flags: `--headless=new --no-sandbox`
- Categories landing: performance, accessibility, best-practices, seo
- Categories /play: performance, accessibility, best-practices (SEO N/A on game canvas)
- Form factor: mobile (Lighthouse default)
- Throttling: simulated (Lighthouse default)

## 3. Score table

| Route | Performance | Accessibility | Best Practices | SEO | Verdict |
|---|---|---|---|---|---|
| / | 94 PASS (>=70) | 92 PASS (>=85) | 96 PASS (>=80) | 100 PASS (>=80) | PASS |
| /play | 72 PASS (>=50) | 100 PASS (>=75) | 96 PASS (>=80) | N/A | PASS |

All thresholds satisfied per V7 brief.

## 4. Web Vitals

### 4.1 Landing /

| Metric | Value |
|---|---|
| First Contentful Paint | 1.6 s |
| Largest Contentful Paint | 2.8 s |
| Total Blocking Time | 40 ms |
| Cumulative Layout Shift | 0.002 |
| Speed Index | 3.3 s |

### 4.2 Game /play

| Metric | Value |
|---|---|
| First Contentful Paint | 1.5 s |
| Largest Contentful Paint | 2.6 s |
| Total Blocking Time | 670 ms |
| Cumulative Layout Shift | 0 |
| Speed Index | 8.4 s |

TBT 670 ms on /play is expected for a Phaser-bootstrapped canvas surface; game engine bundle plus scene boot dominates the main thread. Below the Lighthouse "good" 200 ms guideline but above the 600 ms "poor" threshold by 70 ms. Acceptable at the >=50 perf threshold V7 narrow scope.

## 5. Honest-claim discipline

Scores above are pulled directly from `docs/qa/lighthouse_root.json` and `docs/qa/lighthouse_play.json` JSON output. Mobile form factor, simulated throttling default; desktop scores typically run 5 to 15 points higher per Lighthouse known behavior. Numbers reported as observed.

## 6. Verdict

PASS. Both routes satisfy the V4 lock #7 narrow Lighthouse thresholds.

No remediation required. No production code modification required (territory lock honored).

## 7. Reproducibility

```
npx lighthouse https://nerium-one.vercel.app/ --output=json --output-path=docs/qa/lighthouse_root.json --only-categories=performance,accessibility,best-practices,seo --chrome-flags="--headless=new --no-sandbox" --quiet

npx lighthouse https://nerium-one.vercel.app/play --output=json --output-path=docs/qa/lighthouse_play.json --only-categories=performance,accessibility,best-practices --chrome-flags="--headless=new --no-sandbox" --quiet
```

Run on 2026-04-26 from local Mac via npx. Wall clock approximately 90 seconds for landing, 110 seconds for /play (Phaser boot included).

End of Phase 2 report.
