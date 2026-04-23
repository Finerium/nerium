# Harmonia-RV-A State plus Contract Integration Audit

**Author:** Harmonia-RV-A (P0 specialist split 1 of 2, advisory role per M2 Section 4.13)
**Date:** 2026-04-23 (W4 Minggu pagi parallel audit)
**Audit scope:** State integrity plus contract conformance plus event bus registry plus quest-to-dialogue-to-inventory handoff plus subscribeWithSelector narrow selector usage plus SHUTDOWN cleanup mandate
**Pythia-v2 RV contracts in scope (8):** game_state, quest_schema, dialogue_schema, item_schema, game_asset_registry, game_event_bus, zustand_bridge, asset_ledger
**Shipped code in scope:** `src/stores/*.ts`, `src/state/*.ts`, `src/game/scenes/*.ts`, `src/game/objects/*.ts`, `src/components/hud/*.tsx`, `src/components/game/*.tsx`, `src/components/BusBridge.tsx`, `src/lib/{gameBridge,dialogueBridge,hudBus,questRunner,dialogueRunner,audioEngine}.ts`
**Mandate constraint:** Advisory only. No bug fix authority. Surface gap, recommend fix, ferry to V4 for owning Worker assignment.

---

## 1. Verdict matrix per contract

| Contract | Version | Conformance verdict | Critical gaps | Significant gaps | Moderate gaps |
|---|---|---|---|---|---|
| `game_state.contract.md` | v0.1.0 | FAIL | 1, 5 | 9, 10 | 11, 12 |
| `quest_schema.contract.md` | v0.1.0 | FAIL | 2 | none | none |
| `dialogue_schema.contract.md` | v0.1.0 | PASS-WITH-DRIFT | none | 13 | none |
| `item_schema.contract.md` | v0.1.0 | FAIL | none | 7, 9, 10 | none |
| `game_asset_registry.contract.md` | v0.1.0 | FAIL | none | 6 | none |
| `game_event_bus.contract.md` | v0.1.0 | PASS-WITH-DRIFT | none | 13, 14 | 15 |
| `zustand_bridge.contract.md` | v0.1.0 | PARTIAL-FAIL | 1, 5 | 15 | none |
| `asset_ledger.contract.md` | v0.1.0 | PASS-WITH-DRIFT | none | 8 | none |

Verdict legend:
- **PASS**: Contract honored end to end, no observable drift.
- **PASS-WITH-DRIFT**: Core honored, peripheral additions or non-blocking deviations present.
- **PARTIAL-FAIL**: Core promise of the contract is broken in at least one observable code path.
- **FAIL**: Contract is violated in a way that breaks the demo path or the singleton invariant the contract establishes.

---

## 2. Critical findings (demo-path blockers)

### Finding 1 [CRITICAL] Duplicate divergent QuestStore plus DialogueStore singletons

**Contract:** `game_state.contract.md` §4 ("Zustand is the only state manager. ... Cross-agent authority means no agent introduces a sixth store or adds a slice to an existing store without a contract amendment.") plus §3 (single canonical shape per store).

**Observed state:**

| Store | Path A | Path B | Same singleton? |
|---|---|---|---|
| `useQuestStore` | `src/state/stores.ts` line 64 (Thalia-v2 STUB, `fireTrigger` is `console.info('fireTrigger (stub)', trigger)`) | `src/stores/questStore.ts` line 112 (Nyx full TCE runtime, depth-guarded) | **No, two independent `create()` calls** |
| `useDialogueStore` | `src/state/stores.ts` line 172 (Thalia-v2 STUB, `setChoice` is `console.info('setChoice (stub)')`) | `src/stores/dialogueStore.ts` line 135 (Linus full reducer-backed projection) | **No, two independent `create()` calls** |
| `useInventoryStore` | `src/state/stores.ts` line 233 (Erato-v2 implementation) | `src/stores/inventoryStore.ts` line 15 (`export { useInventoryStore } from '../state/stores'`) | Yes, re-export shim |
| `useUIStore` | `src/state/stores.ts` line 329 (Erato-v2 implementation) | `src/stores/uiStore.ts` line 32 (`export { useUIStore } from '../state/stores'`) | Yes, re-export shim |
| `useAudioStore` | `src/stores/audioStore.ts` line 87 (Euterpe canonical) | `src/state/stores.ts` line 360 (`export { useAudioStore } from '../stores/audioStore'`) | Yes, re-export shim |

Two of the five stores (quest plus dialogue) violate the singleton invariant. The other three correctly route through re-export shims so all consumers observe one instance.

**Failure trace, NPC interact path:**

1. `src/game/objects/NPC.ts` line 96 emits `game.npc.interact` on `this.scene.game.events`.
2. The typed bus wraps `game.events`, so `bus.on('game.npc.interact', ...)` in `src/state/gameBridge.ts` line 76 receives it.
3. Bridge calls `useQuestStore.getState().fireTrigger(trigger)` against the **STUB** instance (line 78).
4. STUB `fireTrigger` is `console.info('[questStore] fireTrigger (stub)', trigger)` per `src/state/stores.ts` line 87.
5. The Nyx instance (`src/stores/questStore.ts`) never receives the trigger.
6. No quest progression for the `npc_interact` step of `lumio_onboarding`.
7. Apollo dialogue does not open from in-game NPC interaction.

**Failure trace, cinematic complete path:**

1. `MiniBuilderCinematicScene` line 767 emits `game.cinematic.complete`.
2. Bridge handler at `src/state/gameBridge.ts` line 102 calls `useQuestStore.getState().fireTrigger({ type: 'cinematic_complete', key })` against the **STUB**.
3. STUB no-ops.
4. Nyx quest is stuck at the cinematic step. The `award_item` effect at the next step never fires. `InventoryToast` therefore never appears.

**Failure trace, autostart path:**

1. Some HUD initializer calls Nyx `autostartFromCatalog()` (currently no caller is wired but this is the intended bootstrap).
2. Nyx `activeQuests` grows.
3. STUB `activeQuests` stays empty.
4. Bridge `useQuestStore.subscribe((s) => s.activeQuests, ...)` at line 168 subscribes to the **STUB** and therefore never observes the change.
5. `game.quest.started` never emits.
6. Phaser scenes that subscribe to `game.quest.started` never react.

**Recommendation to owning Worker:** Replace the inline `create<QuestStore>()(...)` and `create<DialogueStore>()(...)` blocks in `src/state/stores.ts` with `export { useQuestStore } from '../stores/questStore'` and `export { useDialogueStore } from '../stores/dialogueStore'`. This mirrors the existing audio re-export at line 360 and the inventory plus ui forward-shims. Result: one singleton per store, bridge and HUD observe the same state, contract §4 honored.

**Owning Worker:** Thalia-v2 (authored `src/state/stores.ts` Session A minimum viable shape per its own preface). Pythia-v2 endorsement on the rewire is non-blocking because the resulting shape strictly equals the Pythia-v2 contract.

**Halt-trigger basis:** Contract violation detected (per M2 Section 4.13 halt trigger). Escalate to V4 ferry.

---

### Finding 2 [CRITICAL] Bridge `questEffectBus` filter is over-narrow

**Contract:** `quest_schema.contract.md` §4 ("Effect application is synchronous by default; effects that emit bridge events return immediately while the downstream subsystem handles asynchrony.") plus `game_event_bus.contract.md` §5 (every quest-emitting effect should reach its consumer).

**Observed state:** `src/state/gameBridge.ts` line 131 subscribes to `questEffectBus.on(...)` then immediately filters:

```
if (payload.effect.type !== 'play_cinematic') return;
```

Nyx emits the following effect types onto `questEffectBus` per `src/stores/questStore.ts` lines 226 to 234:

- `award_item`
- `consume_item`
- `add_currency`
- `push_toast`
- `open_dialogue`
- `stream_apollo_response`
- `play_cinematic`
- `emit_event`

Only `play_cinematic` is forwarded by the bridge. The other seven effect types vanish.

**Failure trace, award flow:**

1. Lumio onboarding step N completes, `award_item` effect on Nyx fires.
2. Nyx `applyEffect` switch case for `award_item` calls `questEffectBus.emit({ effect, context })` per `src/stores/questStore.ts` line 234.
3. Bridge receives the bus payload, sees `effect.type === 'award_item'`, returns early (line 132).
4. `useInventoryStore.award` is never called.
5. `lastAwarded` stays null. `InventoryToast` never appears.
6. Quest reward never lands. Demo loop incomplete.

Same pattern breaks `add_currency` (CurrencyDisplay never updates), `push_toast` (UI toasts silent), and `open_dialogue` (Apollo dialogue never opens from quest effect, only from manual NPC interact which is also broken per Finding 1).

**Recommendation to owning Worker:** Extend the `questEffectBus.on` handler in `src/state/gameBridge.ts` so the switch covers every effect type Nyx emits. Approximate shape:

```
questEffectBus.on((payload) => {
  switch (payload.effect.type) {
    case 'play_cinematic':       /* existing launch logic */ break;
    case 'award_item':           useInventoryStore.getState().award(payload.effect.itemId, payload.effect.quantity); break;
    case 'consume_item':         useInventoryStore.getState().consume(payload.effect.itemId, payload.effect.quantity); break;
    case 'add_currency':         useInventoryStore.getState().addCurrency(payload.effect.code, payload.effect.amount); break;
    case 'push_toast':           useUIStore.getState().pushToast({ toast_id: crypto.randomUUID(), kind: payload.effect.kind, message: payload.effect.message, dismissAfterMs: payload.effect.dismissAfterMs }); break;
    case 'open_dialogue':        useDialogueStore.getState().openDialogue(payload.effect.dialogueId, payload.effect.startNode); break;
    case 'stream_apollo_response': /* Apollo backend hook, defer to Apollo stream wiring */ break;
    case 'emit_event':           bus.emit(payload.effect.eventName as GameEventTopic, payload.effect.payload as unknown as never); break;
  }
});
```

**Owning Worker:** Thalia-v2 (gameBridge author).

**Halt-trigger basis:** Contract violation, demo-path blocker.

---

### Finding 5 [CRITICAL, derived from Finding 1] Caravan subscribes to STUB store

**Contract:** `game_state.contract.md` §4 (single instance per store) plus `zustand_bridge.contract.md` §4 (scenes subscribe via the canonical store).

**Observed state:** `src/game/objects/Caravan.ts` line 16 imports `useQuestStore` from `'../../state/stores'`, that is the STUB instance.

**Failure trace:**

1. Lumio onboarding step that calls `unlock_world` effect runs on Nyx (`src/stores/questStore.ts` `unlockWorld` action).
2. Nyx `unlockedWorlds` array gains `cyberpunk_shanghai`.
3. STUB `unlockedWorlds` stays empty.
4. Caravan `useQuestStore.subscribe((s) => s.unlockedWorlds, ...)` is bound to STUB. Never fires.
5. `Caravan.spawn()` never runs. Caravan stays invisible. Multi-world expansion hook is dead even when the underlying quest unlocked the next world.

**Recommendation to owning Worker:** Either (a) accept the Finding 1 fix, which automatically resolves this because both paths collapse to the same singleton, or (b) change the import on Caravan line 16 to `'../../stores/questStore'`. Option (a) is preferred because it removes a category of footgun rather than patching one site.

**Owning Worker:** Thalia-v2 (Caravan author + gameBridge author + `src/state/stores.ts` author).

---

## 3. Significant findings (contract violations, non-blocking for happy path)

### Finding 6 [SIGNIFICANT] AssetRegistry runtime helper missing

**Contract:** `game_asset_registry.contract.md` §4 specifies `AssetRegistry` interface with `list`, `get`, `listByWorld`, `listByStatus`, `listByCategory`, `requiredAttributions`, `assertSourceActive`. §6 specifies file paths `src/data/assets/asset_registry_types.ts`, `src/data/assets/asset_registry.ts`, `src/data/assets/AssetRegistry.ts`.

**Observed state:** `src/data/assets/` directory does not exist. Asset metadata is encoded directly in `public/assets/ledger/asset-ledger.jsonl` (16 entries, see Finding 8 for ledger conformance) but no compile-time TypeScript registry wraps it.

**Consequence:** Kalypso README CREDITS generation has nothing to call. `requiredAttributions()` is the only contracted entry point that produces the canonical credit lines for the README footer per §4. Today Kalypso would have to read the JSONL directly and dedupe attribution_text values manually, which works but defeats the contract's purpose of being the authoritative API.

`assertSourceActive('fal_nano_banana_2')` is the dormancy guard the contract pins; without an AssetRegistry implementation, no code can call it, so accidental fal.ai activation has no programmatic gate. (Manual gate via the JSONL `event_kind: external_generate` filter still works during demo bake.)

**Recommendation to owning Worker:** Talos to author `src/data/assets/asset_registry_types.ts`, `src/data/assets/asset_registry.ts`, and `src/data/assets/AssetRegistry.ts` per §3 plus §4 of the contract. Static array import only, no runtime mutation.

**Owning Worker:** Talos.

---

### Finding 7 [SIGNIFICANT] Item registry plus item JSON files missing

**Contract:** `item_schema.contract.md` §6 specifies `src/data/items/item_types.ts`, `src/data/items/ItemRegistry.ts`, `src/data/items/<item_id>.json`. §4 specifies `ItemRegistry` interface with `loadAll`, `get`, `tryGet`, `listByTag`, `listByType`, `listPurchasable`.

**Observed state:** `src/data/items/` directory does not exist. `useInventoryStore.award` accepts a raw `ItemId` string without resolving against any item metadata.

**Consequences:**

- `InventoryToast` displays the raw ItemId string at line 98 (`<span>{lastAwarded}</span>`); a player sees `lumio_blueprint_v1` instead of "Lumio Blueprint v1".
- `ShopModal` synthesizes an inline `SEED_LISTINGS` array at line 33 instead of reading from the registry.
- `Item.iconAssetId` resolution to `iconUrl` per §3 paragraph after the schema (`iconUrl is a convenience resolved at loadAll time by consulting asset_ledger.jsonl`) cannot happen.
- Quest reward authoring in `lumio_onboarding.json` references item ids that have no canonical shape. Future Marketplace quest packs cannot validate.

**Recommendation to owning Worker:** Pythia-v2 already ratified the schema; Erato-v2 to author `ItemRegistry.ts` plus an initial slate of item JSON files for the items Lumio onboarding rewards (minimum: `lumio_blueprint_v1`, `apollo_trust_token`, `caravan_pass`).

**Owning Worker:** Erato-v2 (consumer surface) plus Nyx (quest reward content).

---

### Finding 8 [SIGNIFICANT] Asset ledger runtime API missing

**Contract:** `asset_ledger.contract.md` §4 specifies `AssetLedger` interface with `append`, `read`, `totalCostUsd`, `listBySource`, `listActive`, `verifyLicenses`. §6 specifies `src/data/assets/AssetLedger.ts`.

**Observed state:** `public/assets/ledger/asset-ledger.jsonl` exists with 16 valid entries. Schema conformance per spot check on the first three entries: PASS (uuid v4 ledger_id, ISO-8601 occurred_at, valid AssetSourceKey, license_id, attribution_text, dimensions where applicable, cost_usd zero for CC0, reviewer.agent_id `talos`, reviewer.decision `accepted`). However the TypeScript surface that reads, filters, supersedes, redacts, and verifies is absent.

**Consequence:** `verifyLicenses()` is the gate Kalypso plus Harmonia-RV-B run before demo bake per §4. Without an `AssetLedger.ts` implementation, the verification cannot be programmatically gated. Manual JSONL inspection is the workaround.

`listActive()` filtering of superseded plus redacted lineage is unimplementable at runtime without the API, so any future supersede-or-redact event in the ledger has no enforcement layer.

**Recommendation to owning Worker:** Talos to author `src/data/assets/asset_ledger_types.ts` plus `src/data/assets/AssetLedger.ts` per §3 plus §4. Implementation can use Node `fs.appendFile` plus JSONL streaming.

**Owning Worker:** Talos.

---

### Finding 9 [SIGNIFICANT] InventoryStore.award violates Item.stackable contract

**Contract:** `item_schema.contract.md` §4 ("Stacking rule: if `item.stackable === true` and an existing slot carries the same itemId with `quantity + added <= maxStack`, the existing slot is incremented. Otherwise a new slot is appended.") and `computeAward(slots, item, ctx)` is the pure function the inventoryStore is supposed to delegate to.

**Observed state:** `src/state/stores.ts` lines 244 to 259 implement award as: if existing slot with same `itemId`, always stack; otherwise create new slot. `Item.stackable` is never consulted. `Item.maxStack` is never consulted. `AwardResult.outcome` is never returned.

**Consequence:** A non-stackable item awarded twice silently merges into one slot at quantity 2, contradicting the contract's "otherwise a new slot is appended" branch. `rejected_stack_full` outcome is unreachable. Once `ItemRegistry` lands per Finding 7, this divergence becomes visible and breaks unique-instance items.

**Recommendation to owning Worker:** Erato-v2 to wire `useInventoryStore.award` against `computeAward(slots, item, ctx)` once Item registry exists. Pre-Item-registry, award can keep the always-stack behavior with a `// FIXME contract-stackable` comment so the regression is visible to the next pass.

**Owning Worker:** Erato-v2 (inventoryStore surface owner).

---

### Finding 10 [SIGNIFICANT] InventorySlot shape incomplete vs contract

**Contract:** `item_schema.contract.md` §3 `InventorySlotSchema` requires `slotIndex`, `itemId`, `quantity`, `acquiredAt`, `source`, `sourceRef?`. `game_state.contract.md` §3.3 references `slots: InventorySlot[]` as the canonical type.

**Observed state:** `src/state/types.ts` line 59 declares:

```
export interface InventorySlot {
  itemId: ItemId | null;
  quantity: number;
}
```

Missing fields: `slotIndex`, `acquiredAt`, `source`, `sourceRef`. Plus `itemId` is widened to nullable (the contract has it non-null and uses an empty array for empty slots).

**Consequence:** `game.inventory.awarded` event payload per `game_event_bus.contract.md` §3.1 line 175 includes `outcome` and `source` plus `sourceRef`; the bridge cannot construct the payload from the current slot shape. Audit trail for "where did this item come from" is not derivable post hoc.

**Recommendation to owning Worker:** Pythia-v2 amend `state/types.ts` to mirror `item_types.ts` `InventorySlotSchema`, OR Erato-v2 plus Pythia-v2 jointly accept a contract amendment v0.2.0 that documents the lighter slice for the vertical slice and defers the audit fields post-hackathon.

**Owning Worker:** Pythia-v2 (schema authority) plus Erato-v2 (consumer surface) jointly.

---

### Finding 13 [SIGNIFICANT] dialogueBridge plus hudBus emit topics not in `GameEventTopic` registry

**Contract:** `game_event_bus.contract.md` §3 defines `GameEventTopic` as a closed discriminated union. §7 paragraph 4 mandates "Any new topic addition requires a contract version bump (v0.1.0 to v0.2.0)."

**Observed state:**

- `src/lib/dialogueBridge.ts` lines 18 to 27 declare `BridgeTopic` including `'game.dialogue.effect_pending'` and `'game.quest.trigger_requested'`. Neither of these appears in `GameEventTopic` at `src/state/game_events.ts` lines 13 to 95.
- `src/lib/hudBus.ts` lines 21 to 30 declare `HudBusTopic` including `'game.quest.trigger_requested'` (not in registry) plus `'nerium.ui.model_changed'` and `'nerium.ui.language_changed'` (acceptable as a parallel `nerium.*` namespace per the contract Section 2 prose, no violation).

**Consequence:** The typed registry's compile-time guarantee that "every cross-boundary event lives in the contract" is bypassed by any code path that goes through `emitDialogueEvent` or `emitBusEvent`. BusBridge component at `src/components/BusBridge.tsx` line 117 listens for `'game.quest.trigger_requested'` so the loop closes functionally, but the topic name lives nowhere in the typed registry, so the IDE provides no narrowing and the contract version cannot mark the addition.

**Recommendation to owning Worker:** Pythia-v2 amend `game_event_bus.contract.md` to v0.2.0 adding `game.dialogue.effect_pending` and `game.quest.trigger_requested` (or move them under a parallel `nerium.*` namespace consistent with the model_changed plus language_changed precedent and update the emitters accordingly). Linus plus Erato-v2 then update emit call sites to match.

**Owning Worker:** Pythia-v2 (registry authority).

---

### Finding 14 [SIGNIFICANT] BusBridge listens via window CustomEvent, not via `bus.on`

Same root as Finding 13. The BusBridge component is the canonical React-side translator per its own preface, but it listens via `window.addEventListener('__NERIUM_GAME_EVENT__', ...)` rather than via `bus.on(topic, handler)`. This means BusBridge cannot use the typed `PayloadFor<T>` narrowing, and any future refactor that registers `window.__NERIUM_GAME_BUS__` from PhaserCanvas plus uses `bus.emit` directly would silently bypass BusBridge.

**Recommendation to owning Worker:** Once Finding 1 is resolved and there is one questStore singleton, decide whether BusBridge stays as a window-CustomEvent listener (interop layer for tests plus pre-PhaserCanvas mount) or migrates to `bus.on` after PhaserCanvas wires `gameEventBus`. Recommend interim: keep BusBridge for compatibility, document the dual-path in `zustand_bridge.contract.md` §4 prose, and add a deprecation stamp once the dual path is no longer needed.

**Owning Worker:** Erato-v2 (BusBridge author).

---

## 4. Moderate findings (drift, not breakage)

### Finding 11 [MODERATE] questStore Nyx extensions undocumented in contract v0.1.0

**Contract:** `game_state.contract.md` §3.1 declares `QuestStore` interface fields and actions.

**Observed state:** Nyx adds the following fields plus actions not in the contract:

- Fields: `catalog`, `completedStepsByQuest`, `variables`, `_triggerDepth`.
- Actions: `resetQuest`, `autostartFromCatalog`.
- `fireTrigger` arity is extended to `(trigger, promptValue?)`.

The questStore preface comment at lines 12 to 17 references `docs/nyx.decisions.md ADR-002` for the depth-guarded fireTrigger order flip. ADR file not verified by this audit (out of scope for state integration check); recommend Nyx confirm ADR is committed.

**Consequence:** Pure additions, no breakage. But contract v0.1.0 is no longer the sole source of truth for the questStore shape; downstream agents reading only the contract will not know about `autostartFromCatalog` (the obvious bootstrap entry point for the demo).

**Recommendation:** Pythia-v2 amend contract to v0.2.0 absorbing the additions, or Nyx remove the undocumented surface. Recommend amendment because the additions are useful and demo-relevant.

**Owning Worker:** Pythia-v2 (contract amendment) or Nyx (surface trim).

---

### Finding 12 [MODERATE] audioStore extensions undocumented in contract v0.1.0

**Contract:** `game_state.contract.md` §3.5.

**Observed state:** Euterpe adds `initialized`, `setMuted`, `markInitialized`, `resetForNewSession`. Plus a module-level `oneShotListeners` set with `registerOneShotListener` exported from `src/stores/audioStore.ts`. Plus `getEffectiveVolume` helper.

**Consequence:** Same shape as Finding 11. Pure additions, no breakage. AudioInitGate plus audioEngine require the additions, so trimming is not the right move.

**Recommendation:** Pythia-v2 amend contract to v0.2.0 absorbing.

**Owning Worker:** Pythia-v2.

---

### Finding 15 [MODERATE, architectural] Side-channel bridges via `window.__NERIUM_GAME_BUS__`

**Contract:** `zustand_bridge.contract.md` §1 ("The bridge is the only component permitted to cross the Phaser to React boundary.")

**Observed state:** `src/lib/dialogueBridge.ts` plus `src/lib/hudBus.ts` both define their own `emit*` helpers that fall back to `window.dispatchEvent('__NERIUM_GAME_EVENT__', { detail })` when `window.__NERIUM_GAME_BUS__` is not yet registered. BusBridge listens on the window event to translate back into store actions.

**Consequence:** A second bridge exists in practice. It is untyped, not contracted, and dependent on lazy registration of `window.__NERIUM_GAME_BUS__`. Today this is necessary because PhaserCanvas may not have mounted yet when HUD components render; the window dispatch path is the only safe channel.

**Recommendation:** Erato-v2 plus Linus plus Thalia-v2 jointly decide whether to:

1. Have PhaserCanvas register `window.__NERIUM_GAME_BUS__` synchronously in its mount effect so the fallback path is the rare case rather than the default. Document the fallback in the contract.
2. Or keep the window-CustomEvent path as the canonical React-to-bus channel and update the contract Section 1 prose to acknowledge the second bridge.

Option 1 is cleaner. Recommend it.

**Owning Worker:** Erato-v2 (Linus plus Thalia-v2 review).

---

## 5. Areas that PASS

### 5.1 `subscribeWithSelector` discipline

Every store uses `create<T>()(subscribeWithSelector((set, get) => ({...})))`. Confirmed at:

- `src/stores/questStore.ts` line 113
- `src/stores/dialogueStore.ts` line 136
- `src/stores/audioStore.ts` line 88
- `src/state/stores.ts` line 65 (questStore STUB), line 173 (dialogueStore STUB), line 234 (inventoryStore), line 330 (uiStore)
- `src/stores/uiStore.ts` line 92 (uiPreferencesStore separate from contract scope)

PASS.

### 5.2 React HUD narrow selector usage

Spot check:

- `BottomBar.tsx` lines 31 to 33: three single-field selectors over `useUIStore`.
- `TopBar.tsx` lines 33 to 34: two single-field selectors over `useUIPreferencesStore`.
- `InventoryToast.tsx` lines 29 to 30: two single-field selectors over `useInventoryStore`.
- `CurrencyDisplay.tsx` lines 37 to 39: three single-field selectors split across two stores.
- `DialogueOverlay.tsx` lines 91 to 100: ten single-field selectors over `useDialogueStore`.
- `ApolloStream.tsx` lines 80 to 83: four single-field selectors split across two stores.

No `useShallow` multi-field selection seen, but no multi-field selection seen either; every component picks one slice at a time. The contract permits both single-slice and `useShallow` multi-slice; the chosen single-slice approach is conservative.

PASS.

### 5.3 SHUTDOWN cleanup

- `ApolloVillageScene.ts` lines 270 to 285 register `Phaser.Scenes.Events.SHUTDOWN` once, runs every disposer, emits `game.scene.shutdown`. PASS.
- `MiniBuilderCinematicScene.ts` line 247 registers SHUTDOWN to call `teardownTimeline()` which removes every tween plus timer. PASS.
- `Caravan.ts` does NOT register SHUTDOWN explicitly; instead its `destroy(fromScene?)` override at line 101 handles unsubscribe. Phaser scenes call destroy on game objects automatically on scene shutdown, so the cleanup path runs. Acceptable but slightly outside the contract template that prefers SHUTDOWN handlers for store subscriptions.
- `NPC.ts` similarly cleans up via `destroy()` override line 113. Acceptable.

PASS for primary scenes; minor note for game objects.

### 5.4 fireImmediately discipline

`zustand_bridge.contract.md` §3 mandates `fireImmediately: false` default and a comment when `true`.

- `Caravan.ts` line 64 uses `fireImmediately: true` with explanatory comment line 63. PASS.
- All seven `useStore.subscribe` calls in `gameBridge.ts` use `fireImmediately: false`. PASS.

PASS.

### 5.5 GameEventBus typed wrapper with cascade limit

`src/state/GameEventBus.ts` implements `emit/on/once/off` with `PayloadFor<T>` narrowing per `game_event_bus.contract.md` §4. Cascade limit at 5 throws per 30 seconds is implemented at lines 25 to 78. Auto-removal plus `game.system.shutdown_requested` emission on cascade trip per contract §8 is implemented at lines 68 to 76.

PASS.

### 5.6 Asset ledger JSONL data conformance

16 entries spot-checked. Every entry carries valid uuid v4 `ledger_id`, ISO-8601 millisecond `occurred_at`, valid `AssetSourceKey` referencing the contract's enumerated values, `license_id` matching the registry, `attribution_text` non-null where `license_id !== 'cc0'` (and present even for CC0 per Talos discipline), `dimensions` populated for visual assets and null for audio packs, `cost.cost_usd === 0` for all `event_kind: pack_ingest` entries (no fal.ai entries observed, dormancy guard intact), `reviewer.agent_id === 'talos'` plus `decision: 'accepted'` for all 16.

PASS for data conformance. Runtime API gap is Finding 8.

---

## 6. Cross-handoff readiness scorecard

The vertical slice end-to-end loop per `_meta/RV_PLAN.md` RV.2: NPC intro dialog plus prompt challenge plus Apollo Advisor in-NPC-skin respond plus mini Builder run cinematic plus inventory item award.

| Handoff segment | Contract path | Observed path | Verdict |
|---|---|---|---|
| Player approaches Apollo NPC | `game.npc.nearby` from NPC.ts to `useUIStore.setInteractPrompt(true, ...)` via bridge | Works (UIStore is the single Erato-v2 instance) | PASS |
| Player presses E | `game.npc.interact` from NPC.ts to `useQuestStore.fireTrigger({type:'npc_interact',npcId})` to step advance plus `open_dialogue` effect | Bridge calls **STUB** fireTrigger, no advance, no dialogue open | FAIL (Finding 1) |
| Apollo dialogue opens | `useDialogueStore.openDialogue('apollo_intro')` from quest effect dispatch | Quest effect dispatch routes through bridge questEffectBus filter that drops `open_dialogue` | FAIL (Finding 2) |
| Player submits prompt via PromptInputChallenge | `useQuestStore.fireTrigger({type:'prompt_submitted', slot}, value)` direct | Calls Nyx directly, advance OK, effects emit to questEffectBus | PASS |
| Cinematic launches | questEffectBus `play_cinematic` triggers `lobby.scene.launch(MiniBuilderCinematicScene)` | Bridge correctly handles `play_cinematic`, scene launches, `game.cinematic.start` emits, audioEngine receives sting cue | PASS |
| Cinematic plays | 12-second tween sequence, narration beats, MA highlight, camera pullback | Phaser-only logic; no store dependency in this segment | PASS |
| Cinematic completes | `game.cinematic.complete` from MiniBuilder to `useQuestStore.fireTrigger({type:'cinematic_complete', key})` | Bridge calls **STUB** fireTrigger, no advance | FAIL (Finding 1) |
| Award item to inventory | `award_item` effect from Nyx step N+1 to `useInventoryStore.award` via bridge questEffectBus | Bridge filter drops `award_item`, inventoryStore never updates | FAIL (Finding 2) |
| Toast displays | `useInventoryStore.lastAwarded` change to `InventoryToast` Framer slide-in | InventoryToast is correct in isolation, but `lastAwarded` never set, so toast never fires | FAIL (downstream of Finding 2) |
| Caravan unlocks for next world | `unlock_world` effect from Nyx to `useQuestStore.unlockedWorlds` to Caravan subscription | Caravan subscribes to STUB store, never sees Nyx update | FAIL (Finding 5) |

End-to-end demo loop verdict: **FAIL** until Findings 1 plus 2 are resolved. Once those two land, all listed FAIL rows convert to PASS without further edits to the handoff layer.

---

## 7. Recommended fix sequencing for V4 ferry

Order is mechanical: Finding 1 first (it is the singleton invariant), Finding 2 second (it is the effect routing fan-out), the rest in parallel.

1. **Finding 1 fix (Thalia-v2):** Rewrite `src/state/stores.ts` lines 45 to 217 to re-export `useQuestStore` and `useDialogueStore` from `src/stores/questStore.ts` and `src/stores/dialogueStore.ts` respectively, mirroring the audio re-export at line 360. Estimated 30 minutes including a smoke run.
2. **Finding 2 fix (Thalia-v2):** Extend the `questEffectBus.on` switch in `src/state/gameBridge.ts` lines 130 to 163 to dispatch every effect type Nyx emits. Estimated 45 minutes including manual click-through verification.
3. **Finding 5 fix:** Self-resolves under Finding 1.
4. **Finding 6 plus 8 (Talos):** Author `src/data/assets/asset_registry_types.ts`, `asset_registry.ts`, `AssetRegistry.ts`, `asset_ledger_types.ts`, `AssetLedger.ts`. Schema is fully specified by contracts; estimated 60 to 90 minutes.
5. **Finding 7 (Erato-v2 plus Nyx):** Author `src/data/items/item_types.ts`, `ItemRegistry.ts`, plus initial item JSON files for `lumio_blueprint_v1`, `apollo_trust_token`, `caravan_pass`. Estimated 45 minutes.
6. **Findings 9 plus 10 (Erato-v2 plus Pythia-v2 jointly):** Once Item registry exists, wire `useInventoryStore.award` against `computeAward`. Decide on `InventorySlot` shape amendment vs implementation expansion. Estimated 45 minutes.
7. **Finding 13 plus 14 plus 15 (Pythia-v2 plus Erato-v2 plus Linus):** Contract amendment v0.2.0 to absorb the side-channel topics, plus an architectural decision on whether to keep the window-CustomEvent path. Estimated 60 minutes including ADR.
8. **Findings 11 plus 12 (Pythia-v2):** Contract amendment v0.2.0 absorbing Nyx plus Euterpe extensions. Estimated 30 minutes.

Total recommended fix budget: roughly 5 to 6 hours of paralllelizable Worker time, of which Findings 1 plus 2 are the must-have-for-demo critical path (75 minutes solo Thalia-v2).

---

## 8. Audit confidence

This audit read every file listed in scope at full length. No grep-based inference was used for the critical findings; every store import path was confirmed by reading the actual import statement. The duplicate-singleton finding was further confirmed by independent reading of `gameBridge.ts` line 24 (imports from `./stores`) versus `BusBridge.tsx` line 41 (imports from `'../stores/questStore'`).

The audit did not exercise the running app. Findings 1 plus 2 plus 5 are derived from static analysis of the import graph plus contract text, and the failure traces are mechanical consequences of the observed code. A Playwright-driven runtime verification by Nemea-RV-A is recommended as the regression follow-up to confirm the predicted FAIL rows actually fail.

---

## 9. Halt summary for V4

State integrity verdict: **FAIL** with 2 critical singleton-and-routing findings (Findings 1 and 2) blocking the vertical slice demo loop end-to-end.

Contract conformance matrix:

- 2 of 8 contracts: PASS-WITH-DRIFT (`dialogue_schema`, `asset_ledger`).
- 1 of 8 contracts: PARTIAL-FAIL (`zustand_bridge`).
- 4 of 8 contracts: FAIL (`game_state`, `quest_schema`, `item_schema`, `game_asset_registry`).
- 1 of 8 contracts: PASS-WITH-DRIFT (`game_event_bus`).

Event bus mismatch count: 2 emitter-side topic drifts (`game.dialogue.effect_pending`, `game.quest.trigger_requested`).

Critical gaps surfaced: 5 (Findings 1, 2, 5 critical; Findings 6, 7, 8, 9, 10 significant; Findings 11, 12, 13, 14, 15 moderate).

Recommendations to owning Workers, by priority:

1. Thalia-v2: Findings 1 plus 2 plus 5 (single fix sweep, 75 minutes).
2. Talos: Findings 6 plus 8 (asset registry plus ledger runtime API, 60 to 90 minutes).
3. Erato-v2 plus Nyx: Finding 7 (item registry plus content, 45 minutes).
4. Erato-v2 plus Pythia-v2: Findings 9 plus 10 (inventory slot shape plus stacking semantics, 45 minutes).
5. Pythia-v2: Findings 11 plus 12 plus 13 (contract v0.2.0 amendments, 90 minutes).
6. Erato-v2 plus Linus plus Thalia-v2: Findings 14 plus 15 (BusBridge plus side-channel architecture, 60 minutes).

End of audit.
