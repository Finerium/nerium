# Item Schema

**Contract Version:** 0.1.0
**Owner Agent(s):** Pythia-v2 (schema authority). Data population: Nyx (quest reward items), Linus (dialogue-unlocked items), Talos (CC0 icon asset sourcing)
**Consumer Agent(s):** Erato-v2 (inventory HUD render, InventoryToast, ShopModal), Nyx (`award_item` plus `consume_item` quest effects), Linus (choice effects may award items), Thalia-v2 (Phaser world-space pickup zones reference ItemId), Harmonia-RV-A (integration check award flow end to end)
**Stability:** draft
**Last Updated:** 2026-04-23 (RV Day 0, Pythia-v2 round 2)

## 1. Purpose

Defines the canonical Item data model, the inventory slot shape, and the award-effect contract that binds quest plus dialogue systems to the inventory HUD. Items are static data (authored in JSON) plus runtime state (slot instances in `useInventoryStore`). Separating definition from instance keeps item metadata read-only and allows shared references without duplication.

Schema is zod-derived: `Item`, `InventorySlot`, and `AwardResult` are `z.infer<typeof ...Schema>` so Claude-authored item JSON validates at load time with the same types runtime code consumes.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor, Section 9 modular contract discipline)
- `CLAUDE.md` (root)
- `_meta/RV_PLAN.md` (RV.2 vertical slice scope, RV.7 asset strategy)
- `docs/phase_rv/RV_MANAGED_AGENTS_RESEARCH_v2.md` (Section 3.3 inventory system, Section 3.6 Lumio onboarding quest reward flow)
- `docs/phase_rv/RV_NERIUM_AGENT_STRUCTURE_v2.md` (Section 4.5 Erato-v2 role)
- `docs/contracts/game_state.contract.md` (inventoryStore consumes these types)
- `docs/contracts/quest_schema.contract.md` (Effect `award_item` references ItemId)
- `docs/contracts/dialogue_schema.contract.md` (Choice effects may award items)
- `docs/contracts/game_asset_registry.contract.md` (icon source resolution)

## 3. Schema Definition

```typescript
// src/data/items/item_types.ts

import { z } from 'zod';

export type ItemId = string;

export const ItemTypeEnum = z.enum([
  'blueprint',        // quest-specific lore item (e.g., "Lumio Blueprint v1")
  'material',         // crafting input (post-hackathon reserved)
  'consumable',       // single-use
  'currency_token',   // symbolic currency pouch (distinct from Currency record)
  'unlock_key',       // gate-opener for content
  'cosmetic',         // appearance only, no gameplay effect
  'quest_artifact',   // specific to a named quest
  'generic',
]);
export type ItemType = z.infer<typeof ItemTypeEnum>;

export const ItemRarityEnum = z.enum(['common', 'uncommon', 'rare', 'epic', 'legendary']);
export type ItemRarity = z.infer<typeof ItemRarityEnum>;

export const ItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: ItemTypeEnum,
  rarity: ItemRarityEnum.default('common'),
  description: z.string().default(''),
  iconAssetId: z.string(),                    // references asset_ledger.asset_id or sprite_atlas sprite_id
  iconUrl: z.string().optional(),             // resolved at load time from asset_ledger
  tags: z.array(z.string()).default([]),
  stackable: z.boolean().default(false),
  maxStack: z.number().int().positive().default(1),
  sellPriceUsd: z.number().nonnegative().optional(),   // present when Shop offers this item
  buyPriceUsd: z.number().nonnegative().optional(),
  onAwardSfxKey: z.string().optional(),
  onConsumeSfxKey: z.string().optional(),
  flavorText: z.string().optional(),          // displayed in tooltip
  loreTag: z.string().optional(),             // narrative reference for Kalypso credits
});
export type Item = z.infer<typeof ItemSchema>;

export const InventorySlotSchema = z.object({
  slotIndex: z.number().int().nonnegative(),
  itemId: z.string(),
  quantity: z.number().int().positive(),
  acquiredAt: z.string(),                     // ISO-8601 UTC
  source: z.enum(['quest', 'dialogue', 'shop', 'pickup', 'grant_debug']).default('quest'),
  sourceRef: z.string().optional(),           // quest id, dialogue id, or shop order id
});
export type InventorySlot = z.infer<typeof InventorySlotSchema>;

export const AwardResultSchema = z.object({
  outcome: z.enum(['awarded_new_slot', 'stacked_existing', 'rejected_stack_full', 'rejected_unknown_item']),
  slotIndex: z.number().int().nonnegative().optional(),
  finalQuantity: z.number().int().positive().optional(),
  rejectionReason: z.string().optional(),
});
export type AwardResult = z.infer<typeof AwardResultSchema>;
```

Price fields are denominated in USD. IDR display values are computed at render time from the `billing_meter.contract.md` hackathon-static rate (approximately 16200 IDR per USD) or the locale preference. Item schema does not embed IDR; render layer converts.

`iconAssetId` is the primary reference. `iconUrl` is a convenience resolved at `loadAll` time by consulting `asset_ledger.jsonl` and `sprite_atlas.contract.md`; callers may use either field but the registry is the source of truth.

## 4. Interface / API Contract

```typescript
// src/data/items/ItemRegistry.ts

export interface ItemRegistry {
  loadAll(): Promise<Item[]>;                       // reads src/data/items/*.json, validates, resolves iconUrl
  get(itemId: ItemId): Item;                         // throws on unknown id
  tryGet(itemId: ItemId): Item | null;
  listByTag(tag: string): Item[];
  listByType(type: ItemType): Item[];
  listPurchasable(): Item[];                         // items with defined sellPriceUsd
}

// Award semantics consumed by useInventoryStore.award implementation
export interface InventoryAwardContext {
  itemId: ItemId;
  quantity: number;
  source: InventorySlot['source'];
  sourceRef?: string;
}

export function computeAward(
  slots: InventorySlot[],
  item: Item,
  ctx: InventoryAwardContext,
): { nextSlots: InventorySlot[]; result: AwardResult };
```

- `loadAll` validates every `src/data/items/*.json` file at boot. Validation failure throws `ItemSchemaError` with the failing item id and zod path.
- `computeAward` is pure. Given current slots, target item, and context, it returns the next slots array plus a result descriptor. `useInventoryStore.award` delegates to this function and writes the result.
- Stacking rule: if `item.stackable === true` and an existing slot carries the same itemId with `quantity + added <= maxStack`, the existing slot is incremented. Otherwise a new slot is appended. If `stackable === true` but `maxStack` reached, returns `rejected_stack_full` and the caller may decide to overflow into a new slot (post-hackathon default is rejection).
- Consume semantics (symmetric): `useInventoryStore.consume(itemId, qty)` finds the first slot with `itemId`, deducts qty, removes the slot when qty drops to 0. If insufficient total quantity exists across all slots, returns false and does not mutate.

## 5. Event Signatures

Handled by `game_event_bus.contract.md`. Item runtime emits:

- `game.inventory.awarded` payload: `{ itemId, quantity, source, sourceRef?, outcome }`
- `game.inventory.consumed` payload: `{ itemId, quantity, slotIndex, remainingQuantity }`
- `game.inventory.rejected` payload: `{ itemId, reason }`

Subscribed events (bridge-dispatched):

- `game.shop.purchase_completed` (Marketplace or Banking pillar in-game integration) triggers `award` with `source: 'shop'`.
- `game.pickup.interact` (Phaser zone pickup) triggers `award` with `source: 'pickup'`.

## 6. File Path Convention

- Types and zod schemas: `src/data/items/item_types.ts`
- Registry implementation: `src/data/items/ItemRegistry.ts`
- Item JSON files: `src/data/items/<item_id>.json`
- Item index (manifest listing all valid ids): `src/data/items/index.ts` (generated by `scripts/build-item-index.ts`)
- Validator CLI: `scripts/validate-items.ts`
- Toast component (HUD surface): `src/components/hud/InventoryToast.tsx` (Erato-v2)
- Panel component (full inventory UI): `src/components/hud/InventoryPanel.tsx` (Erato-v2)

## 7. Naming Convention

- Item ids: `snake_case`, descriptive with version when narratively versioned (`lumio_blueprint_v1`, `apollo_trust_token`, `cyberpunk_caravan_pass`).
- Type enum values: lowercase single word or `snake_case`.
- Rarity enum values: lowercase single word.
- Tags: `snake_case`, freeform but consistent (`apollo`, `onboarding`, `reward`, `cyberpunk`).
- Icon asset ids: kebab-case when referencing CC0 pack slice (`cc0-kenney-icon-blueprint-01`) or `snake_case` when referencing generated asset (`apollo_trust_token_icon_v1`).

## 8. Error Handling

- JSON parse failure at `loadAll`: throws `ItemLoadError` with file path.
- Zod validation failure: throws `ItemSchemaError`.
- Duplicate item ids across files: throws `DuplicateItemIdError`.
- `iconAssetId` unresolvable in asset_ledger plus sprite_atlas: warn, substitute a placeholder icon asset id (`placeholder_missing_icon`), keep loading.
- `award` called with unknown `itemId`: returns `AwardResult { outcome: 'rejected_unknown_item' }`, does not throw.
- `award` with `quantity <= 0`: logs warn, returns existing slots unchanged.
- `consume` with insufficient aggregate quantity: returns false, no mutation.
- Shop purchase with `sellPriceUsd` undefined on the item: caller should not reach here; if reached, surface an `ItemNotPurchasable` error and emit `game.inventory.rejected`.
- `maxStack: 0` or negative: zod rejects at load.

## 9. Testing Surface

- Sample item `lumio_blueprint_v1.json` round-trips through `ItemSchema.parse`.
- `computeAward` against empty slots with a stackable item returns a single new slot with the input quantity.
- `computeAward` against an existing stack of quantity 3 with added quantity 2 returns the same slot at quantity 5 when `maxStack >= 5`.
- `computeAward` when stack is at `maxStack` and additional award: returns `rejected_stack_full`, slots unchanged.
- Consume round trip: award 3, consume 2, `hasItem(id, 1)` returns true; consume 1 more, slot is removed, `hasItem(id, 1)` returns false.
- `loadAll` with duplicate ids across two files throws `DuplicateItemIdError`.
- `iconAssetId` unresolvable falls back to placeholder and warns without throwing.
- `listByTag('apollo')` returns every item tagged Apollo; `listByTag('nonexistent')` returns empty.
- `listPurchasable` includes only items with `sellPriceUsd` defined.

## 10. Open Questions

- None blocking v0.1.0. Overflow policy on `rejected_stack_full` (drop, auto-spawn new slot, or mail-to-inventory) deferred to post-hackathon Marketplace integration.

## 11. Post-Hackathon Refactor Notes

- Add item durability and decay semantics for consumables that expire after N minutes of in-game time.
- Add item set bonuses (wear 3 items with tag X, gain stat Y) once the vertical slice expands to combat or mini-games.
- Migrate `sellPriceUsd` and `buyPriceUsd` to a dedicated `ShopListing` schema so one item can have multiple shop entries with different locales and promotions.
- Add item trade plus gift schemas for multiplayer Marketplace surfaces.
- Introduce signed item ownership records for blockchain-backed cosmetic items (post-hackathon optional, aligns with NERIUM Registry pillar future direction).
- Add item preview in DialogueOverlay choice buttons so players see the reward before accepting.
- Add programmatic item generator (procedural names for variants) once Marketplace creators publish templated item packs.
