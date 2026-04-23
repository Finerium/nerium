//
// src/data/dialogues/_schema.ts
//
// Zod schemas plus TypeScript types for NERIUM RV dialogue data model.
// Owner: Linus (dialogue runtime). Contract: docs/contracts/dialogue_schema.contract.md v0.1.0.
//
// Shape conforms to contract Section 3. Effect subset lives here locally to keep the
// dialogue module independently compilable during W2 parallel build; the subset is a
// strict match for quest_schema.contract.md EffectSchema and consolidates post
// integration at Wave 3 polish. See docs/linus.decisions.md for rationale.
//

import { z } from 'zod';

// -------- Primitive aliases --------

export type DialogueId = string;
export type NodeId = string;
export type SpeakerId = string;
export type SlotId = string;
export type DialogueVars = Record<string, unknown>;

// -------- Effect (dialogue-local subset; discriminant 'type') --------

export const effectSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('complete_quest'), questId: z.string() }),
  z.object({ type: z.literal('fail_quest'), questId: z.string(), reason: z.string() }),
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
  z.object({ type: z.literal('add_trust'), npcId: z.string(), amount: z.number() }),
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
  z.object({
    type: z.literal('fire_trigger'),
    trigger: z.object({ type: z.string() }).passthrough(),
  }),
  z.object({
    type: z.literal('stream_apollo_response'),
    streamKey: z.string().default('apollo_stream'),
  }),
  z.object({
    type: z.literal('push_toast'),
    kind: z.enum(['inventory', 'quest', 'currency', 'info', 'warning']),
    message: z.string(),
    dismissAfterMs: z.number().int().positive().default(3000),
  }),
]);
export type Effect = z.infer<typeof effectSchema>;

// -------- Line --------

export const lineSchema = z.object({
  text: z.string().min(1),
  speaker: z.string().optional(),
  portrait: z.string().optional(),
  typewriterMsPerChar: z.number().int().positive().optional(),
  sfxKey: z.string().optional(),
});
export type Line = z.infer<typeof lineSchema>;

// -------- Choice --------

export const choiceSchema = z.object({
  label: z.string().min(1),
  next: z.string(),
  if: z.string().optional(),
  effects: z.array(effectSchema).default([]),
});
export type Choice = z.infer<typeof choiceSchema>;

// -------- Challenge (prompt-input node subtype) --------
// discriminant is `kind` per dialogue_schema.contract.md Section 3 to leave room for
// future kinds (multiple_choice, mini_game) without schema break.

export const promptChallengeSchema = z.object({
  kind: z.literal('prompt_input'),
  slotId: z.string().min(1),
  placeholder: z.string().default(''),
  minChars: z.number().int().positive().default(1),
  maxChars: z.number().int().positive().default(2000),
  label: z.string().optional(),
  helperText: z.string().optional(),
  multiline: z.boolean().default(true),
});
export type PromptChallenge = z.infer<typeof promptChallengeSchema>;

export const challengeSchema = z.discriminatedUnion('kind', [promptChallengeSchema]);
export type Challenge = z.infer<typeof challengeSchema>;

// -------- Phaser hook --------

export const phaserHookSchema = z.object({
  event: z.string().min(1),
  key: z.string().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
  resumeOnEvent: z.string().optional(),
});
export type PhaserHook = z.infer<typeof phaserHookSchema>;

// -------- OnSubmit --------

export const onSubmitSchema = z.object({
  stream: z.string().optional(),
  next: z.string().optional(),
  effects: z.array(effectSchema).default([]),
});
export type OnSubmit = z.infer<typeof onSubmitSchema>;

// -------- Node --------

export const nodeSchema = z.object({
  lines: z.array(lineSchema).default([]),
  choices: z.array(choiceSchema).default([]),
  challenge: challengeSchema.optional(),
  onSubmit: onSubmitSchema.optional(),
  phaser: phaserHookSchema.optional(),
  effects: z.array(effectSchema).default([]),
  next: z.string().optional(),
  end: z.boolean().default(false),
});
export type Node = z.infer<typeof nodeSchema>;

// -------- Dialogue envelope --------
// `source: 'ink'` is reserved scaffolding; runtime rejects until post-hackathon inkjs adapter lands.

export const dialogueSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z0-9_]+$/, 'dialogue id must match /^[a-z0-9_]+$/'),
  source: z.enum(['custom', 'ink']).default('custom'),
  speaker: z.string().min(1),
  start: z.string().min(1),
  vars: z.record(z.string(), z.unknown()).default({}),
  nodes: z.record(z.string(), nodeSchema),
  tags: z.array(z.string()).default([]),
});
export type Dialogue = z.infer<typeof dialogueSchema>;

// -------- Error classes --------

export class DialogueLoadError extends Error {
  constructor(
    message: string,
    public readonly filePath?: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'DialogueLoadError';
  }
}

export class DialogueSchemaError extends Error {
  constructor(
    message: string,
    public readonly dialogueId?: string,
    public readonly issues?: z.ZodIssue[],
  ) {
    super(message);
    this.name = 'DialogueSchemaError';
  }
}

export class UnsupportedDialogueSource extends Error {
  constructor(source: string) {
    super(
      `dialogue source '${source}' not supported in v0.1.0; reserved for post-hackathon inkjs adapter`,
    );
    this.name = 'UnsupportedDialogueSource';
  }
}

// -------- Safe parser helpers --------

export function parseDialogue(raw: unknown, hintId?: string): Dialogue {
  const result = dialogueSchema.safeParse(raw);
  if (!result.success) {
    throw new DialogueSchemaError(
      `dialogue validation failed${hintId ? ` for id '${hintId}'` : ''}`,
      hintId,
      result.error.issues,
    );
  }
  const d = result.data;
  if (d.source === 'ink') {
    throw new UnsupportedDialogueSource(d.source);
  }
  if (!d.nodes[d.start]) {
    throw new DialogueSchemaError(
      `dialogue '${d.id}' start node '${d.start}' missing from nodes record`,
      d.id,
    );
  }
  return d;
}
