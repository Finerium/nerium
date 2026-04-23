# Quest Schema

**Contract Version:** 0.1.0
**Owner Agent(s):** Nyx (quest state owner, authors quest JSON files plus questStore action surface)
**Consumer Agent(s):** Linus (dialogue choice effects call `fireTrigger`), Thalia-v2 (Phaser scene events bubble through bridge to `fireTrigger`), Erato-v2 (QuestTracker HUD renders active steps plus rewards), Euterpe (quest trigger events map to sfx cues), Harmonia-RV-A (integration check quest to dialogue to inventory handoff)
**Stability:** draft
**Last Updated:** 2026-04-23 (RV Day 0, Pythia-v2 round 2)

## 1. Purpose

Defines the canonical Quest data model, evaluation runtime contract, and JSON authoring shape for NERIUM RV. Per Metis-v2 M1 Section 3.1, the quest runtime is a linear finite-state machine of Steps with per-step Trigger, Condition, and Effect hooks (the TCE hybrid). This is the only sanctioned quest pattern for the vertical slice. Behavior trees, dependency graphs, and third-party quest engines (Ink, Yarn Spinner, rex DialogQuest) are explicitly excluded per M1 Section 3.7 and CLAUDE.md anti-pattern inheritance.

Schema is zod-derived: `Trigger`, `Condition`, `Effect`, `Step`, and `Quest` are typed via `z.infer<typeof ...Schema>` so load-time validation of Claude-authored JSON uses the same types that runtime code consumes.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor, Section 9 modular contract discipline)
- `CLAUDE.md` (root)
- `_meta/RV_PLAN.md` (RV.1 game pivot, RV.2 vertical slice scope)
- `docs/phase_rv/RV_MANAGED_AGENTS_RESEARCH_v2.md` (Section 3.1 quest FSM pattern, Section 3.6 Lumio onboarding quest breakdown, Section 3.7 tooling decisions)
- `docs/phase_rv/RV_NERIUM_AGENT_STRUCTURE_v2.md` (Section 4.2 Nyx role)
- `docs/contracts/game_state.contract.md` (questStore consumes these types)
- `docs/contracts/dialogue_schema.contract.md` (effects open dialogues, choice effects fire triggers)
- `docs/contracts/item_schema.contract.md` (`award_item` effect references ItemId)
- `docs/contracts/game_event_bus.contract.md` (bridge events that feed `fireTrigger`)

## 3. Schema Definition

```typescript
// src/data/quests/quest_types.ts

import { z } from 'zod';

// Nominal type aliases kept as string to preserve JSON authoring simplicity.
export type QuestId = string;
export type StepId = string;
export type NpcId = string;
export type SlotId = string;
export type ZoneId = string;

// ------- Trigger --------

export const TriggerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('npc_interact'), npcId: z.string() }),
  z.object({ type: z.literal('prompt_submitted'), slot: z.string() }),
  z.object({ type: z.literal('cinematic_complete'), key: z.string() }),
  z.object({ type: z.literal('zone_enter'), zoneId: z.string() }),
  z.object({ type: z.literal('zone_exit'), zoneId: z.string() }),
  z.object({ type: z.literal('item_acquired'), itemId: z.string() }),
  z.object({ type: z.literal('quest_complete'), questId: z.string() }),
  z.object({ type: z.literal('timer_elapsed'), ms: z.number().int().nonnegative() }),
  z.object({ type: z.literal('dialogue_node_reached'), dialogueId: z.string(), nodeId: z.string() }),
]);
export type Trigger = z.infer<typeof TriggerSchema>;

// ------- Condition --------

export const ConditionSchema = z.object({
  minChars: z.number().int().positive().optional(),
  hasItem: z.object({ itemId: z.string(), minQuantity: z.number().int().positive().default(1) }).optional(),
  trustAtLeast: z.object({ npcId: z.string(), value: z.number() }).optional(),
  stepComplete: z.object({ questId: z.string(), stepId: z.string() }).optional(),
  worldUnlocked: z.string().optional(),
  expression: z.string().optional(),   // parsed by a narrow evaluator, see Section 8
}).partial();
export type Condition = z.infer<typeof ConditionSchema>;

// ------- Effect --------

export const EffectSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('open_dialogue'), dialogueId: z.string(), startNode: z.string().optional() }),
  z.object({ type: z.literal('stream_apollo_response'), streamKey: z.string().default('apollo_stream') }),
  z.object({ type: z.literal('award_item'), itemId: z.string(), quantity: z.number().int().positive().default(1) }),
  z.object({ type: z.literal('consume_item'), itemId: z.string(), quantity: z.number().int().positive().default(1) }),
  z.object({ type: z.literal('add_trust'), npcId: z.string(), amount: z.number() }),
  z.object({ type: z.literal('add_currency'), code: z.enum(['USD', 'IDR']), amount: z.number().nonnegative() }),
  z.object({ type: z.literal('unlock_world'), worldId: z.string() }),
  z.object({ type: z.literal('play_cinematic'), key: z.string() }),
  z.object({ type: z.literal('emit_event'), eventName: z.string(), payload: z.unknown().optional() }),
  z.object({ type: z.literal('set_variable'), scope: z.enum(['quest', 'dialogue']), name: z.string(), value: z.unknown() }),
  z.object({ type: z.literal('complete_quest'), questId: z.string() }),
  z.object({ type: z.literal('fail_quest'), questId: z.string(), reason: z.string() }),
  z.object({ type: z.literal('push_toast'), kind: z.enum(['inventory', 'quest', 'currency', 'info', 'warning']), message: z.string(), dismissAfterMs: z.number().int().positive().default(3000) }),
]);
export type Effect = z.infer<typeof EffectSchema>;

// ------- Step --------

export const StepSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  trigger: TriggerSchema,
  condition: ConditionSchema.optional(),
  effects: z.array(EffectSchema).default([]),
  hintText: z.string().optional(),           // shown in QuestTracker HUD when step active
  optional: z.boolean().default(false),
});
export type Step = z.infer<typeof StepSchema>;

// ------- Reward --------

export const RewardSchema = z.object({
  currency: z.record(z.enum(['USD', 'IDR']), z.number().nonnegative()).optional(),
  items: z.array(z.string()).default([]),
  trust: z.record(z.string(), z.number()).optional(),
  unlockedWorlds: z.array(z.string()).default([]),
});
export type Reward = z.infer<typeof RewardSchema>;

// ------- Quest --------

export const QuestSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().default(''),
  giver: z.string(),                         // NpcId
  world: z.string(),                         // WorldId or scene name
  autostart: z.boolean().default(false),
  prerequisites: z.object({
    completedQuests: z.array(z.string()).default([]),
    items: z.array(z.string()).default([]),
    trust: z.record(z.string(), z.number()).default({}),
  }).default({ completedQuests: [], items: [], trust: {} }),
  steps: z.array(StepSchema).min(1),
  rewards: RewardSchema.default({ items: [], unlockedWorlds: [] }),
  tags: z.array(z.string()).default([]),
});
export type Quest = z.infer<typeof QuestSchema>;
```

## 4. Interface / API Contract

```typescript
// src/data/quests/QuestRunner.ts

export interface QuestRunner {
  loadAll(): Promise<Quest[]>;                // reads src/data/quests/*.json, validates, throws on invalid
  startQuest(questId: QuestId): void;          // calls useQuestStore.getState().startQuest
  fireTrigger(trigger: Trigger): void;         // matches every active step, evaluates conditions, applies effects
  isEligible(quest: Quest): boolean;           // checks prerequisites against current stores
  evaluateCondition(condition: Condition, ctx: EvaluationContext): boolean;
}

export interface EvaluationContext {
  questId: QuestId;
  stepId: StepId;
  promptValue?: string;                        // populated for prompt_submitted triggers
  inventorySnapshot: { slots: ReadonlyArray<{ itemId: string; quantity: number }> };
  trustSnapshot: Readonly<Record<NpcId, number>>;
  variables: Readonly<Record<string, unknown>>;
}
```

- `loadAll` validates every quest file at module import time. Validation failure halts the game boot sequence with a clear error listing the failing quest id and zod path.
- `fireTrigger` iterates `useQuestStore.getState().activeQuests`, matches the trigger against each active step at that quest's current `stepIndex`, evaluates the optional condition, applies effects in declared order, then advances `stepIndex` if effects completed without throwing.
- `isEligible` returns false if any prerequisite is unmet; used by QuestTracker HUD to gray-out unavailable quests.
- Effect application is synchronous by default; effects that emit bridge events (`emit_event`, `play_cinematic`) return immediately while the downstream subsystem handles asynchrony.
- Condition expressions: `expression` field supports a narrow DSL (boolean, comparison, dot-path reads) parsed by `jsep`. Arbitrary JavaScript via `new Function` is forbidden (security and auditability).

## 5. Event Signatures

Handled by `game_event_bus.contract.md`. Quest runtime subscribes to and emits the following bridge topics:

- `game.quest.started`, `game.quest.step_advanced`, `game.quest.completed`, `game.quest.failed`, `game.quest.trigger_fired`.
- Trigger source events (e.g., `game.npc.interact`, `game.cinematic.complete`) are mapped to `Trigger` instances inside the bridge and handed to `fireTrigger`.

## 6. File Path Convention

- Types and zod schemas: `src/data/quests/quest_types.ts`
- Runner implementation: `src/data/quests/QuestRunner.ts`
- Quest JSON files: `src/data/quests/<quest_id>.json` (e.g., `src/data/quests/lumio_onboarding.json`)
- Validator CLI: `scripts/validate-quests.ts` (Nyx maintains; runs in CI plus pre-commit)
- Condition DSL parser: `src/data/quests/condition_parser.ts`

## 7. Naming Convention

- Quest ids: `snake_case`, descriptive (`lumio_onboarding`, `caravan_intro`).
- Step ids: `snake_case`, action-first (`approach_apollo`, `answer_prompt_challenge`).
- Trigger types: `snake_case` discriminant tags.
- Effect types: `snake_case` verb-noun (`award_item`, `add_trust`, `play_cinematic`).
- Condition fields: `camelCase` (`minChars`, `hasItem`, `trustAtLeast`).
- Currency codes: uppercase ISO (`USD`, `IDR`).
- File names: `snake_case.json`.

## 8. Error Handling

- JSON parse failure at `loadAll`: throws `QuestLoadError` with file path.
- Zod validation failure: throws `QuestSchemaError` with the failing quest id and the `z.ZodError.issues` array; boot halts.
- `fireTrigger` with unknown trigger type: `TriggerSchema` rejects at zod level; a trigger shape that passes zod but matches no step is a no-op (intended behavior, not an error).
- Effect application throw: logs error with quest id and step id, fails the quest via an implicit `fail_quest` with reason `effect_threw:{effect.type}`.
- Condition `expression` with invalid DSL: evaluator throws `ExpressionParseError` at load time via pre-validation pass; runtime evaluation never throws, returns `false` on unresolvable paths.
- Prerequisite check with missing item or insufficient trust: `isEligible` returns false, does not throw.
- Cycle detection: `prerequisites.completedQuests` may not include the quest's own id; `loadAll` detects and throws.

## 9. Testing Surface

- Sample quest `lumio_onboarding.json` round-trips through `QuestSchema.parse` with no validation error.
- Invalid quest (missing `id`) fails validation with useful zod path.
- `fireTrigger({ type: 'npc_interact', npcId: 'apollo' })` against a quest whose active step listens for that trigger advances `stepIndex` by 1.
- Condition `minChars: 20` against a `prompt_submitted` trigger with 10-char payload fails; 20-char payload succeeds.
- Effect `award_item` calls `useInventoryStore.getState().award` with correct item id and quantity.
- Effect `add_trust` mutates `useQuestStore.getState().npcTrust[npcId]` by the expected delta.
- Effect `unlock_world` appends world id to `unlockedWorlds` without duplicates.
- Prerequisite unmet: `startQuest` called via HUD does not mutate `activeQuests`; HUD shows gray state.
- Condition expression `"trust.apollo >= 5"` evaluates true when `npcTrust.apollo = 10`, false when 4.
- Cycle in prerequisites rejected at `loadAll`.

## 10. Open Questions

- None blocking v0.1.0. M1 Section 8 Q2 asked whether to reserve a `source: 'ink'` escape hatch in schema; that lives in `dialogue_schema.contract.md` (not here) because the escape is specifically for dialogue authoring.

## 11. Post-Hackathon Refactor Notes

- Add branching support by allowing `steps: Step[]` to reference `nextStepId` instead of strictly linear progression. Schema bump to v0.2.0 when added.
- Add timed quest support (auto-fail after N minutes); currently timers only gate step advancement, not whole-quest expiration.
- Add parallel quests (multiple active step pointers within one quest) for escort plus gather compositions.
- Add quest dependency graphs with visualizable DOT output for Marketplace quest-pack authors.
- Migrate `condition.expression` to a formal BNF grammar with per-token AST once Marketplace creators can ship quest packs; current narrow DSL is sufficient for the vertical slice.
- Support effect plugins registered at runtime (third-party quest packs can bring effects beyond the built-in discriminated union).
- Add quest authoring skill `quest-json-schema` per M1 Section 9 priority 1 recommendation, with scaffold template and validator script bundled.
