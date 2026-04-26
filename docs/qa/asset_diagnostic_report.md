# T-ASSET Diagnostic Report

Author: T-ASSET emergency rescue specialist
Date: 2026-04-26 23:50 WIB (~7h before submission target)
Submission target: Senin 27 April 06:00 WIB (T-7h)
Hard deadline: Senin 27 April 07:00 WIB (T-8h)

---

## Verdict

**PATH A confirmed: Vercel Blob store suspended.** All 96 production assets return HTTP 403 with body `Your store is blocked` from `kswntqjwnfadqljd.public.blob.vercel-storage.com`. Production `/play` renders Phaser scenes with **0 textures resolved** because every `this.load.image` and `this.load.spritesheet` call hits the suspended store.

T-ASSET halts code change. Surface options + recommendation to V7. Decision belongs to Ghaisan + V7 (cost authorization, vendor selection, scope).

---

## Phase 1.1 - Sample blob URL fetch (5 representative + manifest + page)

| Sample                                                          | Status | Body size | Note                                          |
| --------------------------------------------------------------- | ------ | --------- | --------------------------------------------- |
| `backgrounds/apollo_village_bg.jpg`                              | 403    | 22 b      | `Your store is blocked`                       |
| `characters/apollo_spritesheet.png`                              | 403    | 22 b      | `Your store is blocked`                       |
| `props/apollo_village/builder_workshop_landmark.png`             | 403    | 22 b      | `Your store is blocked`                       |
| `props/cyberpunk_shanghai/cyber_apartment_filler.png`            | 403    | 22 b      | `Your store is blocked`                       |
| `overlays/smog_wisps.png`                                        | 403    | 22 b      | `Your store is blocked`                       |
| `https://nerium-one.vercel.app/asset_manifest.json`              | 200    | 24.9 KB   | Manifest itself loads fine (Vercel CDN, not Blob) |
| `https://nerium-one.vercel.app/play`                             | 200    | 7.7 KB    | App shell renders, scripts boot               |

Headers from sample 403:

```
HTTP/2 403
server: Vercel
cache-control: public, max-age=0, must-revalidate
x-vercel-id: sin1::sfbwf-...
```

The `Your store is blocked` body is the canonical Vercel Blob store-suspension response. Shared across all 96 keys, so this is store-wide, not per-asset.

## Phase 1.2 - Playwright console scrape (`/play?intro=0`, headless, 8s settle)

```
FAIL_COUNT 96         (every single registered asset)
CONSOLE_ERROR_COUNT 196
PAGEERROR_COUNT 0     (no JS exception thrown - PreloadScene swallows via loaderror logger)
```

First 5 failures all 403 from the same blob host. Console error count of 196 is approximately 96 native `Failed to load resource` browser errors plus ~96 PreloadScene `[PreloadScene] asset load failed: <key> at <url>` console.error logs (PreloadScene.ts line 57-58 handler), plus a handful of incidental warnings. The handler is firing loudly, not silently swallowing.

Path C (silent fail) is ruled out: the loaderror handler IS triggering. The asset failures are loud and visible in DevTools but the game continues running because Phaser does not throw on missing textures, it renders the green-stripe placeholder (and at our scene scale, "no texture" silhouettes look like the empty patches Ghaisan is seeing).

## Phase 1.3 - Manifest vs registry vs filesystem cross-check

Counts:

| Source                                           | Count |
| ------------------------------------------------ | ----- |
| `public/asset_manifest.json` keys                | 96    |
| `public/asset_manifest.json` stems (entry.stem)  | 96    |
| `src/game/visual/asset_keys.ts` ASSET_PATHS stems | 96    |
| `_Reference/ai_generated_assets/` (excl `_archive/`) | 111   |

Cross-diff:

| Diff                                              | Result                                            |
| ------------------------------------------------- | ------------------------------------------------- |
| `manifest_stems vs registry_stems`                | EXACT MATCH (no drift)                            |
| `fs_stems INTERSECT registry_stems`               | EXACT MATCH                                       |
| `fs_stems MINUS registry_stems` (fs-only)         | 15 marketplace-prefixed files dormant, not registered, not uploaded - unrelated |
| `registry_stems MINUS fs_stems` (registry-only)   | 0 (every registered key has a backing file on disk) |

The 15 fs-only files are `marketplace/builder_*`, `marketplace/marketplace_*` UI assets that exist on disk but are not part of the active Phaser preload registry. They are not the bug.

Path B (manifest/registry drift) is ruled out: zero drift between manifest and registry. The shipped manifest is correct; it points at URLs that are simply not serving.

---

## Bundle inventory for sizing options

```
Total: 386,312,052 bytes = 368.4 MB across 96 assets
```

Top 10 largest:

```
19 MB props/cyberpunk_shanghai/cyber_apartment_filler
11 MB props/cyberpunk_shanghai/cyber_marketplace_landmark
 8 MB props/cyberpunk_shanghai/neon_sign_vertical
 7 MB props/cyberpunk_shanghai/admin_hall_landmark
 7 MB backgrounds/cyber_rooftop
 7 MB backgrounds/caravan_mountain_pass
 7 MB backgrounds/cyber_server_room
 7 MB ui/marketplace/marketplace_empty_state
 7 MB backgrounds/caravan_forest_crossroad
 7 MB props/cyberpunk_shanghai/refrigerator
```

20 smallest are 359 KB to 1.8 MB. Apollo Village (the demo-critical world) is the lightest set: most apollo + caravan_road props are 700 KB to 4 MB.

Apollo Village + caravan_road + Apollo character set + Treasurer + Caravan Vendor (i.e. the demo path the 3-min video walks through) totals approximately 110 to 140 MB across roughly 40 assets. The cyberpunk world bulk (~220 MB) is mostly off-screen for the recorded demo.

---

## Why this happened

V6 ferry context (paraphrased from prompt): Vercel Blob free tier 1 GB exhausted, 30-day grace period started, warning email received, no upgrade or migration was scheduled in time. Today the 30-day clock expired and the blob store hit the suspension state observed.

The runtime path is correct. The infra ran out of credit. Code cannot fix this directly without either restoring the store or moving the assets.

---

## Options matrix

Decision belongs to V7 + Ghaisan. T-ASSET will not auto-pick.

### Option A1 - Upgrade Vercel Pro (paid, fastest)

Action: From the Vercel team settings, upgrade the team to the Pro plan ($20/month). The Pro plan includes 100 GB Blob storage and 1 TB Blob bandwidth, well above the 368 MB store. The "Your store is blocked" suspension lifts on plan upgrade automatically (no manual intervention needed at the bucket level).

| Dimension          | Value                                                                 |
| ------------------ | --------------------------------------------------------------------- |
| Effort             | ~5-15 min from Vercel dashboard                                       |
| Cost               | $20 one-time-this-month (cancellable post-judging)                    |
| Risk               | LOW. The blob URLs already in the manifest re-activate; no code change needed. |
| Code change        | Zero                                                                  |
| Redeploy required  | No (assets resolve as soon as upstream unblocks)                      |
| Time to demo green | ~15 min                                                               |
| Personal-fund check | $20 spend - needs Ghaisan auth. Distinct from V6 fal.ai $0 lock per ADR-override-antipattern-7.md (asset gen vs hosting infra).                       |

### Option A2 - Migrate to Cloudflare R2 (free, slower, new vendor)

Action: Provision Cloudflare R2 bucket on the existing Cloudflare account, mirror all 96 assets via aws-sdk S3 client (R2 is S3-compatible), expose via R2 public bucket policy or `*.r2.dev` URL, regenerate `public/asset_manifest.json` with new URLs, redeploy.

| Dimension          | Value                                                                 |
| ------------------ | --------------------------------------------------------------------- |
| Effort             | ~1-2 h (account, bucket, IAM, upload script, manifest rewrite, smoke test, redeploy) |
| Cost               | $0 (R2 free tier: 10 GB storage, 1M Class A ops, 10M Class B ops; egress always free) |
| Risk               | MEDIUM. New vendor near deadline introduces config risk (CORS, public access policy, custom-domain vs r2.dev). |
| Code change        | New `scripts/migrate-blob-to-r2.ts` + manifest re-emit; no game-code change. |
| Redeploy required  | Yes                                                                   |
| Time to demo green | ~2 h                                                                  |
| Personal-fund check | $0                                                                    |

### Option A3 - Inline assets to `public/assets/ai/` (free, medium-fast, build-size question)

Action: Copy all 96 assets from `_Reference/ai_generated_assets/` into `public/assets/ai/` preserving the stem layout, regenerate `public/asset_manifest.json` with relative URLs `/assets/ai/<stem>.<ext>`, redeploy. Vercel serves `public/` as static CDN content (NOT bundled into Lambda function ephemeral storage, so the original 500 MB Lambda limit is not in scope here).

| Dimension          | Value                                                                 |
| ------------------ | --------------------------------------------------------------------- |
| Effort             | ~30-45 min (copy, regen manifest, build, redeploy, smoke test)        |
| Cost               | $0                                                                    |
| Risk               | MEDIUM. Vercel build artifact will balloon by 369 MB. Hobby tier deploy size soft limits unclear; first redeploy may surface a build-output-too-large error and force partial-inline (Apollo Village + Caravan only, ~110-140 MB). Bandwidth budget on Hobby tier is 100 GB/month - 369 MB per cold-cache visitor = ~270 unique loads before exhaustion (judging traffic should fit). |
| Code change        | New `scripts/inline-assets-to-public.ts` + manifest re-emit; no game-code change beyond manifest URL pattern. |
| Redeploy required  | Yes                                                                   |
| Time to demo green | ~45 min (full) or ~30 min (Apollo + Caravan partial)                  |
| Personal-fund check | $0                                                                    |

---

## T-ASSET recommendation

**Primary: A1.** $20 unblocks within 15 minutes. Lowest engineering risk. Zero code change. Submission window is ~7 hours; A1 leaves time for buffer. The cost is a hosting fee, not asset generation, so the V6 personal-fund USD 0 lock around fal.ai (per `docs/adr/ADR-override-antipattern-7.md`) does not directly apply, but explicit Ghaisan authorization is still required because the lock did not pre-approve this category of spend either.

**Fallback if A1 declined: A3 partial.** Inline only the demo-path assets (Apollo Village + Caravan Road + Apollo character + Treasurer + Caravan Vendor + ApolloVillage backgrounds), approximately 40 assets totaling ~110-140 MB. Skip the cyberpunk_shanghai prop bulk (those are not on the recorded demo path; the video can fast-cut past the cyberpunk transition or display them as cinematic stills). This stays well under any plausible Vercel build-output limit and ships in ~30-45 min.

**Avoid: A2 unless A1 and A3 both fail.** R2 setup is technically clean but introduces a new vendor + config surface near a 7-hour deadline, and the failure mode (CORS misconfigured, public bucket policy wrong, etc.) is harder to debug at 4am than a Vercel upgrade.

---

## What T-ASSET committed

`docs/qa/asset_diagnostic_report.md` (this file). No code change. No manifest change. No registry change. No PreloadScene change.

## Next action belongs to V7

V7 picks A1 / A2 / A3, then either:

- A1: Ghaisan upgrades on dashboard, T-ASSET (or a simpler agent) re-runs the Phase 1.2 Playwright check to verify 96/96 green.
- A2: Spawn a fresh agent with R2 credentials, run migration script, verify, redeploy.
- A3: T-ASSET (or fresh agent) writes inline script, regens manifest, redeploys, runs Phase 1.2 verify.

Halt summary at session end below.
