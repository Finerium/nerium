/**
 * Quest zod schemas plus derived TypeScript types.
 *
 * Contract: docs/contracts/quest_schema.contract.md v0.1.0
 * Cross-ref: docs/contracts/game_state.contract.md Section 3.1 questStore
 *
 * Nyx authority. Loaded at boot by questStore + questRunner. Downstream
 * consumers (Linus dialogue effect EffectSchema import, Erato-v2 QuestTracker
 * types, Thalia-v2 scene bridge trigger construction) import from here.
 *
 * Contract Section 6 names the canonical file `src/data/quests/quest_types.ts`.
 * This file is the authoritative implementation per Nyx agent prompt output
 * spec. A re-export shim at `quest_types.ts` preserves contract path imports.
 */
import { z } from 'zod';

export type QuestId = string;
export type StepId = string;
export type NpcId = string;
export type SlotId = string;
export type ZoneId = string;
export type ItemId = string;
export type DialogueId = string;
export type NodeId = string;
export type WorldId = string;

export const TriggerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('npc_interact'), npcId: z.string() }),
  z.object({ type: z.literal('prompt_submitted'), slot: z.string() }),
  z.object({ type: z.literal('cinematic_complete'), key: z.string() }),
  z.object({ type: z.literal('zone_enter'), zoneId: z.string() }),
  z.object({ type: z.literal('zone_exit'), zoneId: z.string() }),
  z.object({ type: z.literal('item_acquired'), itemId: z.string() }),
  z.object({ type: z.literal('quest_complete'), questId: z.string() }),
  z.object({ type: z.literal('timer_elapsed'), ms: z.number().int().nonnegative() }),
  z.object({
    type: z.literal('dialogue_node_reached'),
    dialogueId: z.string(),
    nodeId: z.string(),
  }),
]);
export type Trigger = z.infer<typeof TriggerSchema>;

export const ConditionSchema = z
  .object({
    minChars: z.number().int().positive().optional(),
    hasItem: z
      .object({
        itemId: z.string(),
        minQuantity: z.number().int().positive().default(1),
      })
      .optional(),
    trustAtLeast: z
      .object({ npcId: z.string(), value: z.number() })
      .optional(),
    stepComplete: z
      .object({ questId: z.string(), stepId: z.string() })
      .optional(),
    worldUnlocked: z.string().optional(),
    expression: z.string().optional(),
  })
  .partial();
export type Condition = z.infer<typeof ConditionSchema>;

export const EffectSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('open_dialogue'),
    dialogueId: z.string(),
    startNode: z.string().optional(),
  }),
  z.object({
    type: z.literal('stream_apollo_response'),
    streamKey: z.string().default('apollo_stream'),
  }),
  z.object({
    type: z.literal('award_item'),
    itemId: z.string(),
    quantity: z.number().int().positive().default(1),
  }),
  z.object({
    type: z.literal('consume_item'),
    itemId: z.string(),
    quantity: z.number().int().positive().default(1),
  }),
  z.object({
    type: z.literal('add_trust'),
    npcId: z.string(),
    amount: z.number(),
  }),
  z.object({
    type: z.literal('add_currency'),
    code: z.enum(['USD', 'IDR']),
    amount: z.number().nonnegative(),
  }),
  z.object({ type: z.literal('unlock_world'), worldId: z.string() }),
  z.object({ type: z.literal('play_cinematic'), key: z.string() }),
  z.object({
    type: z.literal('emit_event'),
    eventName: z.string(),
    payload: z.unknown().optional(),
  }),
  z.object({
    type: z.literal('set_variable'),
    scope: z.enum(['quest', 'dialogue']),
    name: z.string(),
    value: z.unknown(),
  }),
  z.object({ type: z.literal('complete_quest'), questId: z.string() }),
  z.object({
    type: z.literal('fail_quest'),
    questId: z.string(),
    reason: z.string(),
  }),
  z.object({
    type: z.literal('push_toast'),
    kind: z.enum(['inventory', 'quest', 'currency', 'info', 'warning']),
    message: z.string(),
    dismissAfterMs: z.number().int().positive().default(3000),
  }),
]);
export type Effect = z.infer<typeof EffectSchema>;

export const StepSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  trigger: TriggerSchema,
  condition: ConditionSchema.optional(),
  effects: z.array(EffectSchema).default([]),
  hintText: z.string().optional(),
  optional: z.boolean().default(false),
});
export type Step = z.infer<typeof StepSchema>;

export const RewardSchema = z.object({
  currency: z.record(z.enum(['USD', 'IDR']), z.number().nonnegative()).optional(),
  items: z.array(z.string()).default([]),
  trust: z.record(z.string(), z.number()).optional(),
  unlockedWorlds: z.array(z.string()).default([]),
});
export type Reward = z.infer<typeof RewardSchema>;

export const QuestSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  title: z.string().min(1),
  description: z.string().default(''),
  giver: z.string(),
  world: z.string(),
  autostart: z.boolean().default(false),
  prerequisites: z
    .object({
      completedQuests: z.array(z.string()).default([]),
      items: z.array(z.string()).default([]),
      trust: z.record(z.string(), z.number()).default({}),
    })
    .default({ completedQuests: [], items: [], trust: {} }),
  steps: z.array(StepSchema).min(1),
  rewards: RewardSchema.default({ items: [], unlockedWorlds: [] }),
  tags: z.array(z.string()).default([]),
});
export type Quest = z.infer<typeof QuestSchema>;

export class QuestLoadError extends Error {
  constructor(message: string, public readonly path?: string) {
    super(message);
    this.name = 'QuestLoadError';
  }
}

export class QuestSchemaError extends Error {
  constructor(
    message: string,
    public readonly questId: string,
    public readonly issues: z.ZodIssue[],
  ) {
    super(message);
    this.name = 'QuestSchemaError';
  }
}

export function parseQuest(raw: unknown, path?: string): Quest {
  const result = QuestSchema.safeParse(raw);
  if (!result.success) {
    const id =
      raw && typeof raw === 'object' && 'id' in raw && typeof (raw as { id: unknown }).id === 'string'
        ? (raw as { id: string }).id
        : 'unknown';
    throw new QuestSchemaError(
      `Quest at ${path ?? 'unknown path'} failed zod validation for id=${id}`,
      id,
      result.error.issues,
    );
  }
  if (result.data.prerequisites.completedQuests.includes(result.data.id)) {
    throw new QuestLoadError(
      `Quest id=${result.data.id} has itself in prerequisites.completedQuests (cycle)`,
      path,
    );
  }
  return result.data;
}
