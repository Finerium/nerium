# Asset Ledger

**Contract Version:** 0.1.0
**Owner Agent(s):** Talos (ledger schema author plus append authority, RV product-side infrastructure)
**Consumer Agent(s):** Hesperus (appends on Opus SVG plus Canvas procedural generation), Euterpe (appends on audio pack ingestion), Thalia-v2 (read-only lookup for provenance in scene tooltips), Kalypso (reads for README credits plus honest-claim section), Harmonia-RV-B (license sweep verifier), Ghaisan reviewer (out-of-band spot checks)
**Stability:** draft
**Last Updated:** 2026-04-23 (RV Day 0, Pythia-v2 round 2)

## 1. Purpose

Defines the append-only audit trail captured at every asset ingestion or generation event. Each JSONL line records what asset appeared, from which source, under what license, at what raster dimensions, and (where applicable) what prompt, seed, cost, and reviewer decision produced it. The ledger is the authoritative record for license compliance, budget tracking, and reproducibility, and it is the source consulted when an asset needs retroactive review.

This contract is distinct from `game_asset_registry.contract.md` (catalog of available sources) and `sprite_atlas.contract.md` (per-world sprite atlas data). The registry is the menu, the atlas is the dish, the ledger is the receipt.

The ledger schema retains full fidelity for fal.ai Nano Banana 2 generation events even though fal is `dormant_deprecated` in the RV shipped build per `_meta/RV_PLAN.md` RV.14. Preserving the schema lets post-hackathon reactivation ingest directly into the existing ledger without a migration.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor, Section 7 asset honesty plus Section 16 CC0 discipline)
- `CLAUDE.md` (root, anti-pattern 7 plus RV override pointer)
- `_meta/RV_PLAN.md` (RV.6 anti-pattern 7 override, RV.7 asset strategy hybrid, RV.14 fal.ai budget state)
- `docs/phase_rv/RV_MANAGED_AGENTS_RESEARCH_v2.md` (Section 6.4 pipeline ownership, Section 6.5 decision list)
- `docs/phase_rv/RV_NERIUM_AGENT_STRUCTURE_v2.md` (Section 4.1 Talos responsibilities)
- `docs/contracts/game_asset_registry.contract.md` (source_key values, license descriptors)
- `docs/contracts/sprite_atlas.contract.md` (sprite_id referenced by ledger entries for in-atlas assets)
- `docs/adr/ADR-override-antipattern-7.md` (honest-claim anchor for any generated assets)

## 3. Schema Definition

```typescript
// src/data/assets/asset_ledger_types.ts

import type { AssetSourceKey, AssetCategory, LicenseId } from '@/data/assets/asset_registry_types';
import type { WorldId } from '@/builder/worlds/world_aesthetic_types';

export type LedgerEventKind =
  | 'pack_ingest'                     // static CC0 or permissive pack pulled from upstream
  | 'procedural_generate'             // Opus SVG or Canvas procedural authored
  | 'external_generate'               // fal.ai Nano Banana 2 or equivalent external model (dormant in RV)
  | 'original_author'                 // hand-authored inside NERIUM repo
  | 'supersede'                       // new line marking retry or replacement (points to prior ledger_id)
  | 'redact';                         // license revocation or takedown marker (prior asset removed from shipped build)

export type ReviewerDecision =
  | 'accepted'
  | 'rejected_palette_drift'
  | 'rejected_silhouette_drift'
  | 'rejected_license_mismatch'
  | 'rejected_quality_insufficient'
  | 'retry_pending'
  | 'superseded';

export type ReviewerAgentId =
  | 'talos'
  | 'hesperus'
  | 'euterpe'
  | 'thalia_v2'
  | 'kalypso'
  | 'thea'                            // reserved per M2 Section 4.9 conditional spawn
  | 'ghaisan_human';

export interface RasterDimensions {
  width_px: number;
  height_px: number;
  pixel_aspect: string;               // '1:1' default for pixel art, other values allowed
  color_depth_bits: 8 | 16 | 24 | 32;
}

export interface GenerationParameters {
  prompt: string | null;              // full text submitted to generator, null for pack_ingest or original_author
  seed: number | null;
  model_identifier: string | null;    // e.g. 'fal-ai/nano-banana-2', 'claude-opus-4-7', null for pack_ingest
  resolution_tier: '0.5K' | '1K' | '2K' | '4K' | null;
  thinking_level: 'low' | 'medium' | 'high' | null;
  enable_web_search: boolean | null;
  additional_flags: Record<string, unknown>;
}

export interface CostRecord {
  cost_usd: number;                   // 0 for CC0 or authored, non-zero only for metered external generation
  currency_original: 'USD';           // locked to USD for v0.1.0; post-hackathon may support IDR-origin
  metered: boolean;                   // true for fal.ai, Anthropic API, etc.
}

export interface LedgerEntry {
  ledger_id: string;                  // uuid v4
  event_kind: LedgerEventKind;
  occurred_at: string;                // ISO-8601 UTC, millisecond precision
  asset_id: string;                   // semantic slug, e.g., 'apollo_hero_sheet_v1', 'cc0-kenney-roguelike-dirt-01'
  source_key: AssetSourceKey;         // foreign key to asset_registry
  category: AssetCategory;
  world_affinity: WorldId | 'world_agnostic';
  license_id: LicenseId;
  attribution_text: string | null;
  dimensions: RasterDimensions | null; // null for audio or font
  generation: GenerationParameters | null;   // null for pack_ingest when no prompt was used
  cost: CostRecord;
  reviewer: {
    decision: ReviewerDecision;
    agent_id: ReviewerAgentId;
    decided_at: string;               // ISO-8601 UTC
    rationale: string;                // short free-text, max 500 chars
  };
  supersedes_ledger_id: string | null; // for 'supersede' events
  external_request_id: string | null;  // e.g., fal.ai request_id when applicable
  local_file_paths: string[];         // output files committed under public/assets/
  tags: string[];                     // freeform indexing (e.g., 'hero', 'tile', 'ui_chrome')
}
```

Immutability rule: once a line is written, it is never rewritten. Corrections are a new `supersede` line pointing `supersedes_ledger_id` at the prior entry. License takedowns are a `redact` line; shipped-build scripts filter out redacted lineage at build time.

## 4. Interface / API Contract

```typescript
// src/data/assets/AssetLedger.ts

export interface AssetLedger {
  append(entry: LedgerEntry): Promise<void>;
  read(filter?: LedgerFilter): Promise<LedgerEntry[]>;
  totalCostUsd(filter?: LedgerFilter): Promise<number>;
  listBySource(source_key: AssetSourceKey): Promise<LedgerEntry[]>;
  listActive(): Promise<LedgerEntry[]>;          // excludes superseded and redacted lineage
  verifyLicenses(): Promise<LicenseVerificationReport>;
}

export interface LedgerFilter {
  event_kind?: LedgerEventKind;
  source_key?: AssetSourceKey;
  world_affinity?: WorldId | 'world_agnostic';
  reviewer_decision?: ReviewerDecision;
  occurred_after?: string;
  occurred_before?: string;
}

export interface LicenseVerificationReport {
  total_active_entries: number;
  attribution_required_entries: number;
  missing_attribution_entries: LedgerEntry[];    // violation set, must be empty before shipping
  dormant_source_entries: LedgerEntry[];         // should be empty in shipped build per RV.14
  license_conflict_entries: LedgerEntry[];       // license_id on entry disagrees with registry canonical license
}
```

- `append` writes a single JSONL line atomically via `fs.appendFile` with `{ flag: 'a' }`.
- `read` streams the file and parses line-by-line; invalid JSON lines are logged and skipped (never throw mid-read).
- `listActive` filters out any entry whose `ledger_id` appears in another entry's `supersedes_ledger_id` with a later `occurred_at`, and any entry whose `event_kind === 'redact'` or is pointed to by a redact entry.
- `verifyLicenses` is the gate Kalypso and Harmonia-RV-B run before demo bake; any non-empty violation set halts the shipping pipeline.

## 5. Event Signatures

This contract does not publish to `game_event_bus.contract.md` (game scene layer). It emits to a dedicated audit bus separate from gameplay:

- `asset.ledger.appended` payload: `{ ledger_id, source_key, event_kind, reviewer_decision }`
- `asset.ledger.verification_failed` payload: `{ violation_kind, offending_ledger_ids }`

These events ride the existing pipeline event bus (`docs/contracts/event_bus.contract.md` P0 contract) as a parallel namespace and are consumed by Ananke for orchestration log entries and Kalypso for README freshness checks. They do not cross into the Phaser game scene.

## 6. File Path Convention

- Types: `src/data/assets/asset_ledger_types.ts`
- Implementation: `src/data/assets/AssetLedger.ts`
- Ledger file: `public/assets/ledger/asset-ledger.jsonl` (committed to repo, append-only)
- Archive snapshot (tagged at each demo bake): `public/assets/ledger/asset-ledger-{iso_date}.jsonl` (optional, only when Kalypso requests a checkpoint)
- Verification report output: `docs/qa/asset_ledger_verification.md` (generated by Harmonia-RV-B)
- License conflict dumps: `docs/qa/asset_ledger_conflicts.jsonl` (only emitted when verification fails)

## 7. Naming Convention

- `asset_id`: semantic slug, lowercase with hyphens or underscores, versioned with `_vN` suffix when iterating (`apollo_hero_sheet_v1`, `cyberpunk_shop_tile_a01`). For CC0 pack pulls, prefix with the source pack slug (`cc0-kenney-roguelike-dirt-01`).
- `ledger_id`: uuid v4.
- `event_kind` values: lowercase underscore.
- `reviewer.decision` values: lowercase underscore, `rejected_{reason}` pattern for rejections.
- `reviewer.agent_id` values: lowercase underscore matching specialist names; `ghaisan_human` marks out-of-band Ghaisan review.
- `local_file_paths`: POSIX forward-slash paths relative to repo root, always under `public/assets/`.
- Timestamps: ISO-8601 UTC, millisecond precision.

## 8. Error Handling

- Append of a malformed entry (missing required field): throws `LedgerValidationError` with field list before writing to disk; no partial line is written.
- Append when `ledger_id` already exists in the file: throws `LedgerDuplicateError`; callers regenerate uuid and retry.
- Supersede pointing at a non-existent `ledger_id`: verification reports as `license_conflict_entries` and flags for Ghaisan review.
- Verification detects `event_kind: 'external_generate'` with `source_key` status `dormant_deprecated`: surfaces in `dormant_source_entries` and fails the shipping gate (shipped build must not contain dormant-source active lineage).
- Corrupt JSONL line on read: logs the line number to `console.warn`, skips, continues streaming; does not propagate to caller.
- File absent on first `append`: creates parent directory plus file atomically, logs `ledger.initialized` once.

## 9. Testing Surface

- Round-trip append: write a sample entry, read back via `read`, assert field equality.
- Supersede chain: append entry A, then entry B with `supersedes_ledger_id: A.ledger_id`; `listActive` returns B only.
- Redact filtering: append entry A then a redact entry pointing to A; `listActive` excludes A.
- Cost aggregation: append three entries with costs 0.08, 0.12, 0.0; `totalCostUsd` returns 0.20 with precision tolerance below 1e-6.
- Verification clean path: synthesize ledger with all active entries carrying valid licenses; `verifyLicenses` reports empty violation sets.
- Verification failure path: inject an entry with `source_key: 'fal_nano_banana_2'` and `event_kind: 'external_generate'` (simulating accidental fal activation); `verifyLicenses` surfaces it in `dormant_source_entries`.
- Attribution audit: entry with `license_id: 'brullov_custom_permissive'` and `attribution_text: null` surfaces in `missing_attribution_entries`.
- Malformed line tolerance: prepend a non-JSON garbage line to a test ledger file; `read` skips it without throwing and returns the valid remainder.

## 10. Open Questions

- None blocking v0.1.0. If Ghaisan reactivates fal.ai post-ADR-supersedence, the `cost.cost_usd` precision convention (two decimal places for dollars) is already enforced. Any future non-USD origin cost needs a schema bump (`CostRecord.currency_original` is typed narrow on purpose to force that conversation).

## 11. Post-Hackathon Refactor Notes

- Move from flat JSONL to a SQLite table with indexes on `source_key`, `reviewer.decision`, `occurred_at` so verification runs in milliseconds across a large ledger.
- Add a Merkle-style chained hash field (`prev_line_hash`) for tamper detection post-hackathon.
- Emit `asset.ledger.appended` over the wider event bus when cross-pillar Ananke audit logging is productized.
- Add `reviewer_agent_id: 'creator_user'` once Marketplace creators start publishing asset packs with their own ledger lineage.
- Introduce versioned schema stamp (`schema_version: 1`) once v0.2.0 of this contract ships so mixed-version ledgers can coexist.
- Add optional `thumbnail_data_url` for fast credits-page rendering without full asset preload.
- Extend `reviewer.rationale` free-text cap to 2000 chars once Thea cross-batch QA begins writing longer review notes; current 500-char cap is shipping-slice discipline.
