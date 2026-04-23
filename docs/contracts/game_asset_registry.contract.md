# Game Asset Registry

**Contract Version:** 0.1.0
**Owner Agent(s):** Talos (asset source catalog author, RV product-side infrastructure)
**Consumer Agent(s):** Thalia-v2 (Phaser scene asset loading), Hesperus (Opus SVG plus Canvas procedural lookups), Euterpe (audio asset lookups), Erato-v2 (UI chrome fallbacks), Kalypso (README CREDITS generation), Harmonia-RV-B (visual integration check license sweep)
**Stability:** draft
**Last Updated:** 2026-04-23 (RV Day 0, Pythia-v2 round 2)

## 1. Purpose

Defines the canonical registry of asset sources available to the NERIUM RV game build. Each entry names where an asset pack or generator lives, what license it carries, which world genre it fits, and whether the source is active, reserved, or dormant-deprecated. Consumers look up assets by source key rather than hardcoding pack URLs or generator APIs, so a future source swap is a single registry edit rather than a code sweep.

This contract is distinct from `sprite_atlas.contract.md` (per-world sliced atlas data), `asset_ledger.contract.md` (per-generation append-only audit trail), and `world_aesthetic.contract.md` (palette plus typography plus motif). The registry answers "where do asset bytes come from"; the atlas answers "which sprites live in this world"; the ledger answers "what happened during each generation event".

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor, Section 7 visual plus 3-world preference, Section 16 CC0 discipline)
- `CLAUDE.md` (root, anti-pattern 7 original plus RV override pointer)
- `_meta/RV_PLAN.md` (RV.6 anti-pattern 7 override, RV.7 asset strategy hybrid, RV.14 fal.ai budget state)
- `docs/phase_rv/RV_MANAGED_AGENTS_RESEARCH_v2.md` (Section 6 asset strategy, Section 6.4 ownership matrix)
- `docs/phase_rv/RV_NERIUM_AGENT_STRUCTURE_v2.md` (Section 4.1 Talos role, line 22 fal.ai spend removed decision)
- `docs/contracts/sprite_atlas.contract.md` (downstream atlas shape, consumes registry sources)
- `docs/contracts/asset_ledger.contract.md` (sibling audit trail, consumes registry source keys)
- `docs/contracts/world_aesthetic.contract.md` (world genre taxonomy, registry entries cite world_id)
- `docs/adr/ADR-override-antipattern-7.md` (evidence trail for fal.ai dormancy policy)

## 3. Schema Definition

```typescript
// src/data/assets/asset_registry_types.ts

import type { WorldId } from '@/builder/worlds/world_aesthetic_types';

export type AssetSourceKey =
  | 'kenney_roguelike_rpg'
  | 'kenney_rpg_urban'
  | 'kenney_rpg_base'
  | 'kenney_medieval_town'
  | 'kenney_medieval_rts'
  | 'kenney_ui_pack_rpg_expansion'
  | 'kenney_audio_rpg_sfx'
  | 'kenney_audio_ui_sfx'
  | 'opengameart_warped_city'
  | 'opengameart_cyberpunk_slim'
  | 'opengameart_cyberpunk_platformer'
  | 'opengameart_steampunk_mega'
  | 'opengameart_steampunk_32x32'
  | 'brullov_oak_woods'
  | 'brullov_generic_character_v02'
  | 'brullov_castle_of_despair'
  | 'brullov_medieval_icons'
  | 'opus_procedural_svg'
  | 'opus_procedural_canvas'
  | 'claude_design_generated'
  | 'fal_nano_banana_2'
  | 'fal_nano_banana_2_edit'
  | 'original_authored';

export type AssetSourceStatus =
  | 'active'                          // in live use for RV shipped build
  | 'reserved'                        // available but not yet pulled for RV
  | 'dormant_deprecated';             // schema present for post-hackathon, not exercised in shipped build per RV.14 and M2 line 22

export type AssetCategory =
  | 'tileset'
  | 'sprite_character'
  | 'sprite_prop'
  | 'ui_chrome'
  | 'audio_sfx'
  | 'audio_ambient'
  | 'audio_music'
  | 'procedural_fx'
  | 'font'
  | 'icon';

export type LicenseId =
  | 'cc0'
  | 'cc_by'
  | 'cc_by_sa'
  | 'mit'
  | 'brullov_custom_permissive'       // "free plus commercial, no redistribution"
  | 'partner_inference_commercial'    // fal.ai Nano Banana 2 model access terms
  | 'original_mit';                   // authored inside NERIUM repo, governed by repo LICENSE

export interface LicenseDescriptor {
  license_id: LicenseId;
  attribution_required: boolean;
  attribution_text: string | null;    // canonical credit line for CREDITS.md aggregation
  redistribution_allowed: boolean;
  notes: string;                      // edge cases (e.g., Oak Woods no-rehost)
}

export interface AssetSourceEntry {
  source_key: AssetSourceKey;
  display_name: string;
  category: AssetCategory[];          // a source may cover multiple categories (e.g., Kenney Roguelike covers tileset plus sprite_character plus sprite_prop)
  world_affinity: WorldId[] | 'world_agnostic';
  license: LicenseDescriptor;
  provenance_url: string | null;      // public URL for the source pack or model card
  status: AssetSourceStatus;
  integration: AssetIntegrationShape;
  deprecation: AssetDeprecationInfo | null;
}

export interface AssetIntegrationShape {
  kind: 'static_pack' | 'procedural_generator' | 'external_api_dormant';
  local_root?: string;                // for static_pack, e.g. 'public/assets/cc0/kenney-roguelike-rpg/'
  generator_entrypoint?: string;      // for procedural_generator, e.g. 'src/lib/procedural/hud_frame.ts'
  api_client_module?: string;         // for external_api_dormant, e.g. 'src/integrations/fal_nano_banana_2/client.ts'
  schema_version?: string;            // optional schema stamp for generators
}

export interface AssetDeprecationInfo {
  reason: 'budget_removed' | 'license_incompatible' | 'quality_rejected' | 'superseded_by';
  superseded_by_source_key?: AssetSourceKey;
  deprecated_at: string;              // ISO-8601 UTC
  post_hackathon_reactivation_plan: string | null;
}
```

The dormant-deprecated statuses preserve the schema shape so post-hackathon activation is a status flip rather than a re-add. fal.ai Nano Banana 2 entries ship with `status: 'dormant_deprecated'` per RV.14 and M2 line 22 (fal.ai spend removed entirely). Schema fields for generation parameters remain populated on those entries so the `asset-ledger.jsonl` schema has a target to reference if ever exercised.

## 4. Interface / API Contract

```typescript
// src/data/assets/AssetRegistry.ts

export interface AssetRegistry {
  list(): AssetSourceEntry[];
  get(source_key: AssetSourceKey): AssetSourceEntry;
  listByWorld(world_id: WorldId): AssetSourceEntry[];
  listByStatus(status: AssetSourceStatus): AssetSourceEntry[];
  listByCategory(category: AssetCategory): AssetSourceEntry[];
  requiredAttributions(): LicenseDescriptor[];  // across all active entries, for CREDITS.md
  assertSourceActive(source_key: AssetSourceKey): void; // throws if status is not 'active'
}
```

- Registry is a compile-time static array imported from `src/data/assets/asset_registry.ts`; no runtime mutation.
- `assertSourceActive` is called by Talos ingestion scripts and by Thalia-v2 preload to prevent loading from a dormant source by mistake.
- `requiredAttributions` aggregates unique credit lines for Kalypso to paste into `public/assets/CREDITS.md` and the README footer.
- Post-hackathon (out of scope for v0.1.0): a writable registry backed by SQLite so creators can register their own Marketplace-published asset packs.

## 5. Event Signatures

This contract does not emit pub/sub events directly. Downstream event emissions that reference registry sources (e.g., `sprite.atlas.loaded` carrying source provenance) live in the consuming contract (`sprite_atlas.contract.md` Section 5).

## 6. File Path Convention

- Types: `src/data/assets/asset_registry_types.ts`
- Registry static array: `src/data/assets/asset_registry.ts`
- Registry helper implementation: `src/data/assets/AssetRegistry.ts`
- Static pack roots: `public/assets/{license_band}/{source_key_with_hyphens}/`
  - `public/assets/cc0/kenney-roguelike-rpg/`
  - `public/assets/cc0/opengameart-warped-city/`
  - `public/assets/permissive/brullov-oak-woods/` (non-CC0 permissive)
  - `public/assets/attribution-required/opengameart-steampunk-mega/` (CC-BY bucket)
- Procedural generator modules: `src/lib/procedural/*.ts`
- Dormant external clients: `src/integrations/fal_nano_banana_2/client.ts` (not imported by live code paths)
- Credits: `public/assets/CREDITS.md` (generated by `requiredAttributions()` output)

## 7. Naming Convention

- `AssetSourceKey` strings: lowercase with underscores, vendor or publisher first, then pack slug (`kenney_roguelike_rpg`, `opengameart_warped_city`, `brullov_oak_woods`, `fal_nano_banana_2`).
- `AssetCategory` strings: lowercase underscore (`sprite_character`, `audio_sfx`).
- `LicenseId` strings: lowercase SPDX-flavored (`cc0`, `cc_by`, `cc_by_sa`, `mit`); custom permissive or vendor terms use publisher-prefixed underscore (`brullov_custom_permissive`, `partner_inference_commercial`).
- `AssetSourceStatus`: lowercase underscore (`active`, `reserved`, `dormant_deprecated`).
- File paths under `public/assets/`: kebab-case directories matching the underscore-to-hyphen transform of the source key.
- Type names: `PascalCase`.

## 8. Error Handling

- Unknown `source_key` in `get`: throws `UnknownAssetSourceError` with the attempted key.
- `assertSourceActive` called against a dormant or reserved source: throws `DormantAssetSourceError` with `source_key` plus current `status` plus (if dormant) the `post_hackathon_reactivation_plan` so the caller sees why the source is parked.
- Attribution-required source without `attribution_text`: registry validator at import time throws `LicenseMetadataMissing`.
- Category filter on empty result: returns `[]` rather than throwing; callers decide whether empty is an error.
- Status filter where no entries match: returns `[]`.

## 9. Testing Surface

- Registry loads without throwing: import `asset_registry.ts`, assert `list().length > 0`.
- Every entry has a resolvable license descriptor with either `attribution_required: false` or a non-null `attribution_text`.
- `listByWorld('medieval_desert')` returns at least one `active` source covering `tileset` category (Kenney Roguelike or Oak Woods satisfies this).
- `listByStatus('active')` never includes any `fal_nano_banana_2_*` source key in the RV shipped build (guard against accidental activation).
- `assertSourceActive('fal_nano_banana_2')` throws `DormantAssetSourceError` with a readable reactivation plan string.
- `requiredAttributions()` aggregates without duplicate `attribution_text` lines even if two entries share the same publisher.
- Kalypso-consumable CREDITS.md snapshot test: serialize `requiredAttributions()` through the CREDITS formatter and assert the output contains expected publishers (Kenney, OpenGameArt authors, brullov).

## 10. Open Questions

- None blocking v0.1.0. Reactivation plan strings for `fal_nano_banana_2*` entries should reference `docs/adr/ADR-override-antipattern-7.md` once that ADR is committed by Talos during RV-0.5 setup. If the ADR path or filename changes, update the reactivation plan strings to match.

## 11. Post-Hackathon Refactor Notes

- Move static array to SQLite-backed table so creators can publish asset packs through the Marketplace pillar without a repo commit.
- Add per-entry `version` field for pack version pinning (Kenney updates Roguelike pack periodically; pinning avoids silent asset drift).
- Introduce a `local_hash` field recording SHA-256 of pulled pack contents at import time for tamper detection.
- Extend `AssetIntegrationShape` with `cache_policy` and `licence_check_interval_hours` for long-lived Marketplace usage.
- Reactivate fal.ai lane by flipping `fal_nano_banana_2*` entries to `status: 'active'`, wiring `src/integrations/fal_nano_banana_2/client.ts` back into Calliope or successor agent, and updating `asset-ledger.jsonl` ingestion to accept `cost_usd` for fal invocations. Governance: gate reactivation on budget allocation plus ADR superseding ADR-override-antipattern-7.md.
- Support multi-vendor parity entries (Stability, Recraft, Ideogram, Imagen) once the Protocol pillar matures enough to translate between vendor prompt conventions.
