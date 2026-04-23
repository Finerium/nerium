---
agent: Nemea-RV-A
tier: specialist
role: scene plus state regression QA
wave: W4 (Minggu morning WIB parallel)
date: 2026-04-23
model: Opus 4.7
harness: Playwright 1.59.1 plus `window.__NERIUM_TEST__` hook
route_under_test: /play
contracts_referenced:
  - docs/contracts/quest_schema.contract.md v0.1.0
  - docs/contracts/dialogue_schema.contract.md v0.1.0
  - docs/contracts/game_state.contract.md v0.1.0
  - docs/contracts/game_event_bus.contract.md v0.1.0
  - docs/contracts/zustand_bridge.contract.md v0.1.0
verdict: NEEDS_FIX
---

# Nemea-RV-A regression report

## 1. Scope

Per M2 Section 4.15 Nemea-RV-A authors and runs scene-plus-state regression across the RV vertical slice. Four Playwright specs live under `tests/e2e/`, each exercising one contract boundary.

| Spec | Boundary exercised |
|------|--------------------|
| `tests/e2e/lumio_quest.spec.ts` | quest FSM transitions 0 through 9, autostart, condition gate, bus forwarding |
| `tests/e2e/dialogue_flow.spec.ts` | dialogue registry, NPC interact to dialog open, choice and prompt challenge surfaces |
| `tests/e2e/inventory_award.spec.ts` | quest effect to inventoryStore.award to InventoryToast DOM surface |
| `tests/e2e/caravan_unlock.spec.ts` | quest cascade into unlock_world, zone_enter and caravan_vendor npc gates |

Ran 23 tests total, Chromium headless, against `next dev --turbopack --port 3100`. Wall clock 1 min 30 s.

## 2. Pass fail matrix

Overall: 9 passed, 14 failed, 0 skipped.

### 2.1 `lumio_quest.spec.ts` (2 of 6 passed, FAIL)

| Status | Test |
|--------|------|
| PASS | scene ready reports medieval_desert world and ApolloVillage scene |
| FAIL | quest autostarts at mount and QuestTracker exposes lumio_onboarding |
| FAIL | dispatching npc_interact(apollo) advances to step 1 dialog_complete |
| FAIL | nine sequential triggers drive the FSM to completion |
| FAIL | prompt_submitted with value shorter than 20 chars does not advance step 2 |
| PASS | collector captured the triggers that BusBridge forwarded |

### 2.2 `dialogue_flow.spec.ts` (4 of 6 passed, FAIL)

| Status | Test |
|--------|------|
| FAIL | npc_interact(apollo) opens apollo_intro dialog at greet node |
| FAIL | dialog greet node surfaces two choices (lore gated by trust<5) |
| PASS | prompt_brief node renders PromptChallengeNode with slot lumio_brief (vacuous, early-returned due to upstream overlay-null) |
| PASS | PromptInputChallenge HUD surface is mounted in the bottom bar |
| PASS | prompt submission fires prompt_submitted trigger with value |
| PASS | BusBridge forwards game.dialogue.challenge_submitted when dialogueId+nodeId supplied |

### 2.3 `inventory_award.spec.ts` (2 of 6 passed, FAIL)

| Status | Test |
|--------|------|
| FAIL | InventoryToast surfaces after cinematic_complete awards lumio_blueprint_v1 |
| FAIL | Toast content shows the awarded itemId text content |
| FAIL | Toast exposes role=status with aria-live for a11y |
| FAIL | Dismiss button clears the toast and removes it from DOM |
| PASS | No toast surfaces when prompt submission fails minChars gate (trivially passes because no toast ever surfaces in any path) |
| PASS | Bus collector captures cinematic start/complete emissions |

### 2.4 `caravan_unlock.spec.ts` (1 of 5 passed, FAIL)

| Status | Test |
|--------|------|
| FAIL | unlock_world effect drives FSM past step 5 and advances to step 6 |
| FAIL | quest cascade reaches unlockedWorlds=cyberpunk_shanghai |
| FAIL | zone_enter caravan_arrival_zone advances FSM to step 7 caravan_spawned |
| FAIL | caravan_vendor npc_interact advances FSM to step 8 caravan_interact |
| PASS | canvas survives the full 8-trigger drive without detach |

## 3. Critical blockers (top 5 per NarasiGhaisan Section 18 surface discipline)

Every failing test traces to one of the five blockers below. Fixing blockers 1, 2, and 3 unblocks roughly 10 of the 14 red tests. All five must ship to clear the vertical slice end to end.

### B1. autostartFromCatalog() never invoked at mount

**Evidence**: `grep -n autostartFromCatalog src/ app/` returns zero call sites. `useQuestStore.getState().catalog` contains `lumio_onboarding` with `autostart: true` (quest JSON line 7), but `activeQuests` stays empty across the entire session. `QuestTracker` DOM reports `No quest active` and the `[data-quest-id]` attribute is absent.

**Downstream impact**: every trigger dispatched through `game.quest.trigger_requested` is a no-op because `fireTrigger` iterates `activeQuests` snapshot. 10 of 14 failures chain from this single missing call.

**Suggested fix (Nyx or gameBridge author to decide site)**: call `useQuestStore.getState().autostartFromCatalog()` once at app mount. Candidates: `PhaserCanvas` useEffect after `wireBridge`, or a new `QuestBootstrap` React component rendered above `GameHUD`. Single line of code; no contract change.

### B2. Dialogue registry empty at runtime

**Evidence**: `grep -rn registerDialogue src/ app/` returns only the export sites inside `src/stores/dialogueStore.ts`. No call site loads `apollo_intro.json` into the registry. `DialogueOverlay` at `src/components/game/DialogueOverlay.tsx:102` calls `getDialogue(activeDialogueId)` which returns `undefined`, then short circuits to `return null` at line 225.

**Downstream impact**: even if B1 is fixed and `open_dialogue` fires, no overlay surfaces. Dialogue-driven quest progression (steps 1, 3, 8) is unreachable in app. Dialogue tests `npc_interact opens apollo_intro` and `dialog greet node surfaces two choices` fail.

**Suggested fix**: at app mount, import the JSON and register. One block:

```ts
import apolloIntroJson from '@/data/dialogues/apollo_intro.json';
import { parseDialogue } from '@/data/dialogues/_schema';
import { registerDialogues } from '@/stores/dialogueStore';

registerDialogues([parseDialogue(apolloIntroJson, 'apollo_intro')]);
```

Ownership: Linus per dialogue_schema.contract.md; the mount site can live in `GameHUD` or alongside the B1 fix.

### B3. gameBridge.questEffectBus listener ignores award_item, open_dialogue, push_toast, add_currency, stream_apollo_response

**Evidence**: `src/state/gameBridge.ts` line 131 `questEffectBus.on((payload) => { if (payload.effect.type !== 'play_cinematic') return; ... })`. Every other `questEffectBus` emission from `questStore.applyEffect` is observed but dropped.

**Downstream impact**: quest step 4 effects `award_item lumio_blueprint_v1 quantity:1`, `add_trust apollo 10`, `add_currency USD 5` fire into the bus and vanish. Inventory never updates. Toast never surfaces. The only effect that reaches a consumer is `play_cinematic`. 4 of 6 inventory tests fail.

**Suggested fix**: extend the `questEffectBus.on` handler in `gameBridge.ts` to route every effect type defined in `src/data/quests/_schema.ts` Section `EffectSchema` to its corresponding store. Approximate shape:

```ts
switch (payload.effect.type) {
  case 'play_cinematic': /* existing */ break;
  case 'award_item':
    useInventoryStore.getState().award(payload.effect.itemId, payload.effect.quantity ?? 1);
    break;
  case 'add_currency':
    useInventoryStore.getState().addCurrency(payload.effect.code, payload.effect.amount);
    break;
  case 'push_toast':
    useUIStore.getState().pushToast({ ... });
    break;
  case 'open_dialogue':
    useDialogueStore.getState().openDialogue(payload.effect.dialogueId, payload.effect.startNode);
    break;
  // emit_event, stream_apollo_response: forward to bus, optional scope
}
```

Ownership: gameBridge author (Thalia-v2) with Nyx review on the effect switch; contract-compliant per `zustand_bridge.contract.md` Section 4.

### B4. dialogue_node_reached trigger never emitted from DialogueOverlay to quest FSM

**Evidence**: `DialogueOverlay` emits `game.dialogue.node_entered` via `emitDialogueEvent` (line 123). That lands on `__NERIUM_GAME_EVENT__` window fallback. `BusBridge` (src/components/BusBridge.tsx) has no case for `game.dialogue.node_entered` and does not call `useQuestStore.getState().fireTrigger({ type: 'dialogue_node_reached', ... })`.

**Downstream impact**: quest steps 1, 3, 8 all match on `dialogue_node_reached` triggers. Without emission from the overlay into the FSM, the FSM stalls waiting for a trigger that never comes. This is why the nine-sequential-triggers regression test works when tests dispatch triggers directly but the real user experience deadlocks after NPC interact.

**Suggested fix**: add a `game.dialogue.node_entered` case to `BusBridge` that translates to `questStore.fireTrigger({ type: 'dialogue_node_reached', dialogueId, nodeId })`. Ten lines, zero contract change.

### B5. Caravan-side in-scene actors missing for quest steps 6 through 8

**Evidence**: quest steps 6, 7, 8 expect `zone_enter zoneId=caravan_arrival_zone`, `npc_interact npcId=caravan_vendor`, and `dialogue_node_reached dialogueId=caravan_vendor_greet nodeId=farewell` respectively. None exists:

- `src/game/scenes/ApolloVillageScene.ts` spawns one NPC (`apollo`) and one Caravan sprite (pointer handler emits `game.world.unlocked`, no `npc_interact`). No caravan_vendor NPC object.
- `find src/game -name '*Zone*'` returns nothing. No zone overlap body emits `zone_enter`.
- `find src/data/dialogues` returns only `apollo_intro.json`. No `caravan_vendor_greet.json`.

**Downstream impact**: even with B1 through B4 fixed, the quest stalls at step 6 forever in the live app because no in-scene actor can emit the step 6 trigger. The only way to complete the quest is via the Nemea-RV-A test harness directly dispatching triggers.

**Suggested fix (scope decision hard stop for V4)**: either

- (a) author a `caravan_vendor` NPC and `caravan_arrival_zone` zone in `ApolloVillageScene.ts`, plus `src/data/dialogues/caravan_vendor_greet.json`, OR
- (b) trim `lumio_onboarding.json` to 5 steps (npc_greet through inventory_item_awarded) and mark `complete_quest` on step 5 so the vertical slice demo closes cleanly on the award.

Option (b) preserves the 3-min demo narrative while removing 4 hours of scene-author work. Option (a) preserves the full quest narrative but requires Thalia-v2 plus Linus plus Nyx coordination. **V4 ferry required**.

## 4. Non blockers and informational notes

- `PromptInputChallenge` HUD surface mounts correctly and dispatches `game.quest.trigger_requested` through BusBridge on submit. This means once B1 is fixed, the step 2 prompt challenge works end to end from the HUD. Verified by passing test `prompt submission fires prompt_submitted trigger with value`.
- `BusBridge` correctly translates `game.dialogue.challenge_submitted` into `recordPromptSubmission`. Verified.
- The Phaser canvas survives all eight sequential trigger dispatches without detach, and the Strict Mode double mount guard holds. `__NERIUM_TEST__.phaserMounted` and `__NERIUM_TEST__.ready` stay true throughout.
- MiniBuilderCinematicScene is launched by the bridge on `play_cinematic` effect but the effect is triggered by step 3, which is gated behind B1. Cannot verify cinematic end to end until B1 is fixed. Did not regress the cinematic in isolation because the scope per M2 Section 4.15 is scene-plus-state, not cinematic-rendering.

## 5. Demo ready verdict

**NEEDS_FIX**. 4 of 4 E2E specs fail overall. 14 of 23 individual tests fail. The vertical slice does not play end to end.

- Minimum fix surface to unblock demo: B1 plus B2 plus B3 plus B4. Four small bridge or mount changes, no contract amendments. Estimated 30 to 60 minutes of focused edits by the contract owners.
- Scope decision (B5) required from V4 ferry: either add caravan vendor assets or trim quest to step 5.

With B1 through B4 fixed and B5 option (b) (trim quest) adopted, the vertical slice is demo ready: player lands in Apollo Village, NPC interact opens dialogue, prompt challenge accepts brief, cinematic plays, inventory toast surfaces, quest closes on item award. That is a clean 3-minute demo arc.

Independent of these regressions, no contract drift detected. Pythia-v2 contracts remain honored where wiring exists.

## 6. Bus collector diagnostic sample

On a happy-path trigger drive the window collector captured the following topics in order:

```
game.quest.trigger_requested  (x9, one per driven step)
game.dialogue.challenge_submitted  (x1, after HUD submit)
```

No downstream Phaser-side emissions crossed to the window fallback (`game.cinematic.*`, `game.world.unlocked`, `game.dialogue.opened`, etc.) because `window.__NERIUM_GAME_BUS__` is never populated by the bridge. Post-hackathon consideration: if QA needs visibility into Phaser-side emissions, expose a read only bus mirror on `__NERIUM_TEST__.bus` behind a `?test=1` query gate.

## 7. Reproducibility

```
npx playwright install chromium
npx playwright test tests/e2e/ --project=chromium --reporter=list
```

Dev server auto-launches via `playwright.config.ts` webServer block on port 3100. No manual boot required.

Trace artifacts under `test-results/` per failing test; open with `npx playwright show-trace <path>`.

---

End of Nemea-RV-A W4 regression report.
