---
name: quest-json-schema
description: >
  Author, validate, and review NERIUM quest JSON files for the Phaser 3 vertical
  slice. Covers the linear FSM plus Trigger, Condition, Effect (TCE) pattern, zod
  schemas for Quest, Step, Trigger, Condition, Effect, the lumio_onboarding
  onboarding quest, and the fireTrigger dispatcher contract. Trigger: "quest",
  "quest file", "quest json", "new quest", "quest step", "quest effect", "quest
  trigger", "objectives", "rewards", "quest schema".
---

<!-- SKILL ORIGIN: fresh authoring by Talos, patterns referenced from https://github.com/Donchitos/Claude-Code-Game-Studios (48-agent studio, 37-skill set) and M1 Section 3.1 FSM+TCE research. -->
<!-- LICENSE: original_mit (governed by NERIUM repo LICENSE) -->
<!-- TRANSPLANTED BY: Talos on 2026-04-23 -->
<!-- ADAPTATION: NERIUM-specific schema locked by Pythia-v2 contracts quest_schema.contract.md, game_state.contract.md, game_event_bus.contract.md. This skill is the quest-authoring entrypoint for Nyx (quest owner), downstream-consumed by Thalia-v2 (scene events), Linus (dialogue effects), Erato-v2 (QuestTracker HUD). -->

# Quest JSON Schema (NERIUM RV)

Author quest files that the Nyx runtime can load, validate, and drive through a linear FSM.

---

## When to Invoke This Skill

Any time the user, an agent, or a contract references:

- creating or editing `src/data/quests/<quest_id>.json`
- defining a new quest step or effect
- wiring a Phaser scene event to a quest trigger
- validating a Claude-generated quest file against zod
- bridging dialogue choice effects into `fireTrigger`

---

## NERIUM Locks

Per M2 Section 4.2 (Nyx owner) and M1 Section 3.1 research:

1. **Linear FSM with Trigger/Condition/Effect hooks.** No branching, no behavior trees, no dependency graphs. One linear sequence of steps per quest.
2. **One JSON file per quest.** Path: `src/data/quests/<quest_id>.json`.
3. **Zod schemas at load time.** `src/data/quests/_schema.ts` exposes `questSchema`, `stepSchema`, `triggerSchema`, `conditionSchema`, `effectSchema`. Every quest file is parsed via `questSchema.parse(json)` before Nyx registers it.
4. **Single dispatcher.** `useQuestStore.getState().fireTrigger(trigger)` is the only path from a subsystem back into quest state. Thalia-v2 scene events call it via the bridge; Linus dialogue choice effects call it directly.
5. **Effects are pure descriptors.** Effects record what should happen, Nyx runtime executes. Never inline side-effects in a quest file.
6. **Branching deferred.** If the user asks for branching, offer the escape hatch `reserve a future step with a condition` and halt to V4 for scope approval before authoring branch logic.

---

## Canonical Schema

```typescript
// src/data/quests/_schema.ts
import { z } from 'zod';

export const triggerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('npc_interact'), npcId: z.string() }),
  z.object({ type: z.literal('prompt_submitted'), slot: z.string() }),
  z.object({ type: z.literal('cinematic_complete'), key: z.string() }),
  z.object({ type: z.literal('item_picked_up'), itemId: z.string() }),
  z.object({ type: z.literal('zone_entered'), zoneId: z.string() }),
  z.object({ type: z.literal('timer_elapsed'), ms: z.number().int().positive() }),
]);

export const conditionSchema = z
  .object({
    minChars: z.number().int().nonnegative().optional(),
    trustAtLeast: z.record(z.string(), z.number()).optional(),
    hasItem: z.string().optional(),
  })
  .optional();

export const effectSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('open_dialogue'), node: z.string() }),
  z.object({ type: z.literal('stream_apollo_response') }),
  z.object({ type: z.literal('award_item'), itemId: z.string() }),
  z.object({ type: z.literal('add_trust'), npcId: z.string(), amount: z.number() }),
  z.object({ type: z.literal('unlock_world'), worldId: z.string() }),
  z.object({ type: z.literal('play_cinematic'), key: z.string() }),
  z.object({ type: z.literal('complete_quest'), questId: z.string() }),
]);

export const stepSchema = z.object({
  id: z.string(),
  trigger: triggerSchema,
  condition: conditionSchema,
  effects: z.array(effectSchema).min(1),
});

export const questSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  title: z.string().min(1),
  giver: z.string(),
  world: z.string(),
  autostart: z.boolean().default(false),
  steps: z.array(stepSchema).min(1),
  rewards: z
    .object({
      currency: z.record(z.enum(['USD', 'IDR']), z.number()).optional(),
      items: z.array(z.string()).optional(),
    })
    .optional(),
});

export type Quest = z.infer<typeof questSchema>;
export type Step = z.infer<typeof stepSchema>;
export type Trigger = z.infer<typeof triggerSchema>;
```

Pythia-v2 `quest_schema.contract.md` is authoritative. If a field here disagrees with the contract, halt and ferry to V4.

---

## Vertical Slice Example: `lumio_onboarding`

```json
{
  "id": "lumio_onboarding",
  "title": "Meet Apollo and build Lumio v1",
  "giver": "apollo",
  "world": "apollo_village",
  "autostart": true,
  "steps": [
    {
      "id": "approach_apollo",
      "trigger": { "type": "npc_interact", "npcId": "apollo" },
      "effects": [{ "type": "open_dialogue", "node": "apollo_intro" }]
    },
    {
      "id": "answer_prompt_challenge",
      "trigger": { "type": "prompt_submitted", "slot": "lumio_brief" },
      "condition": { "minChars": 20 },
      "effects": [{ "type": "stream_apollo_response" }]
    },
    {
      "id": "watch_builder_cinematic",
      "trigger": { "type": "cinematic_complete", "key": "mini_builder" },
      "effects": [
        { "type": "award_item", "itemId": "lumio_blueprint_v1" },
        { "type": "add_trust", "npcId": "apollo", "amount": 10 },
        { "type": "unlock_world", "worldId": "cyberpunk_shanghai" }
      ]
    }
  ],
  "rewards": {
    "currency": { "USD": 5 },
    "items": ["lumio_blueprint_v1"]
  }
}
```

This is the nine-beat breakdown in M1 Section 3.6, collapsed to three FSM steps. Each step emits at least one effect; the final step may award multiple effects in sequence.

---

## Runtime Contract

```typescript
// src/stores/questStore.ts
useQuestStore.getState().fireTrigger({ type: 'npc_interact', npcId: 'apollo' });
useQuestStore.getState().advanceStep();    // Nyx-internal, driven by effects
useQuestStore.getState().completeQuest('lumio_onboarding');
```

- `fireTrigger` looks up the active step of every active quest and, if the trigger matches and the condition passes, runs the effects in order, then advances the `stepIndex`.
- Trigger call depth guard: if `fireTrigger` recursively calls itself more than 10 times, Nyx halts and logs. This avoids infinite loops from mis-authored effects.

---

## Authoring Checklist

Before saving a quest JSON file:

- [ ] `id` matches filename and `/^[a-z0-9_]+$/`.
- [ ] Every `trigger.type` is in the discriminated union above.
- [ ] Every `effect.type` is in the discriminated union above.
- [ ] Every `itemId`, `npcId`, `worldId`, `node` (dialogue) referenced is declared elsewhere.
- [ ] `autostart: true` only if the quest should activate on fresh session load.
- [ ] `rewards.currency` uses `USD` or `IDR` key (locked by Erato-v2 CurrencyDisplay i18n).
- [ ] Passes `questSchema.parse(...)` via `tests/quest.test.ts`.

---

## Anti-Patterns

| Anti-Pattern | Why it breaks | What to do instead |
|---|---|---|
| Effects that call DOM APIs | Not a pure descriptor | Emit a `play_cinematic` effect; let Nyx runtime emit the DOM call |
| Branching inside step | FSM must stay linear | Author two quests and chain via `complete_quest` + autostart |
| Arbitrary `condition` expression | Not typed, zod fails | Add a field to `conditionSchema` and Pythia-v2 revises the contract |
| Quest references missing dialogue node | Runtime errors silently | Cross-reference against dialogue JSON before shipping |
| `autostart: true` on every quest | User gets quest spam | Only one autostart quest per session (the onboarding) |
| Manual `stepIndex` tweaking from outside Nyx | Bypasses dispatcher | Fire the matching trigger instead |

---

## Related Skills

- `dialogue-tree-authoring`: dialogue choice effects that fire triggers.
- `zustand-bridge`: how scene events reach `fireTrigger` without direct imports.
- `phaser-scene-authoring`: which scene events translate to which triggers.
