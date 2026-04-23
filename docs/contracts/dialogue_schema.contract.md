# Dialogue Schema

**Contract Version:** 0.1.0
**Owner Agent(s):** Linus (dialogue runtime owner, authors dialogue JSON files plus React reducer plus DialogueOverlay surface)
**Consumer Agent(s):** Nyx (quest `open_dialogue` effect initiates, choice effects fire quest triggers), Erato-v2 (DialogueOverlay is a React HUD component), Thalia-v2 (`game.npc.interact` bridge events trigger dialogue opening), Euterpe (dialogue node transitions map to typewriter plus dialog advance sfx), Harmonia-RV-A (integration check across quest to dialogue to inventory handoff)
**Stability:** draft
**Last Updated:** 2026-04-23 (RV Day 0, Pythia-v2 round 2)

## 1. Purpose

Defines the canonical Dialogue data model, React reducer evaluation contract, and JSON authoring shape for NERIUM RV. Per Metis-v2 M1 Section 3.2, the dialogue runtime is a custom minimal JSON schema parsed by a narrow React reducer (approximately 40 lines of state transition logic). This is the only sanctioned dialogue pattern for the vertical slice. Ink, Yarn Spinner, Twine, Dialogic, and rex DialogQuest are explicitly excluded per M1 Section 3.2 evaluation table and CLAUDE.md anti-pattern inheritance.

The schema embeds a first-class prompt-challenge node type so React challenge components render mid-dialogue, a capability Ink and Yarn Spinner do not natively provide without custom bindings. A `source` discriminator on the envelope reserves future adoption of `inkjs` compiled stories without a schema migration.

Schema is zod-derived. `Dialogue`, `Node`, `Choice`, `Challenge`, `Line`, and `Effect` types are `z.infer<typeof ...Schema>` so Claude-authored JSON validates at load time with the same types runtime code consumes.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor, Section 9 modular contract discipline)
- `CLAUDE.md` (root)
- `_meta/RV_PLAN.md` (RV.1 game pivot, RV.2 vertical slice scope)
- `docs/phase_rv/RV_MANAGED_AGENTS_RESEARCH_v2.md` (Section 3.2 dialogue tree format, Section 3.7 tooling decisions, Section 7 dialogue runtime cross-cutting decision)
- `docs/phase_rv/RV_NERIUM_AGENT_STRUCTURE_v2.md` (Section 4.3 Linus role)
- `docs/contracts/game_state.contract.md` (dialogueStore consumes these types)
- `docs/contracts/quest_schema.contract.md` (`open_dialogue` effect calls the runtime, choice effects dispatch `fireTrigger`)
- `docs/contracts/item_schema.contract.md` (effects on nodes may award items)
- `docs/contracts/game_event_bus.contract.md` (node transitions emit bridge events)

## 3. Schema Definition

```typescript
// src/data/dialogues/dialogue_types.ts

import { z } from 'zod';
import { EffectSchema } from '@/data/quests/quest_types';

export type DialogueId = string;
export type NodeId = string;
export type SpeakerId = string;

// Variables scoped to a single dialogue session. Mutable during play via
// set_variable effects, cleared when the dialogue closes.
export type DialogueVars = Record<string, unknown>;

// ------- Line --------

export const LineSchema = z.object({
  text: z.string(),
  speaker: z.string().optional(),             // override envelope speaker for this line
  portrait: z.string().optional(),            // asset_id of portrait sprite
  typewriterMsPerChar: z.number().int().positive().optional(),
  sfxKey: z.string().optional(),              // one-shot sfx to play when the line begins
});
export type Line = z.infer<typeof LineSchema>;

// ------- Choice --------

export const ChoiceSchema = z.object({
  label: z.string(),
  next: z.string(),                            // NodeId to advance to
  if: z.string().optional(),                   // DSL expression; falsy means hidden
  effects: z.array(EffectSchema).default([]),  // fire on choice select, before navigating
});
export type Choice = z.infer<typeof ChoiceSchema>;

// ------- Challenge --------

// Prompt-challenge node type. This is the reason dialogue stays custom JSON
// rather than adopting Ink or Yarn Spinner: challenges render as React
// components embedded mid-dialogue, and the onSubmit handler both fires a
// Trigger and advances the node.

export const PromptChallengeSchema = z.object({
  kind: z.literal('prompt_input'),
  slotId: z.string(),                          // SlotId recorded into questStore.promptSubmissions
  placeholder: z.string().default(''),
  minChars: z.number().int().positive().default(1),
  maxChars: z.number().int().positive().default(2000),
  label: z.string().optional(),
  helperText: z.string().optional(),
  multiline: z.boolean().default(true),
});
export type PromptChallenge = z.infer<typeof PromptChallengeSchema>;

export const ChallengeSchema = z.discriminatedUnion('kind', [
  PromptChallengeSchema,
  // Room reserved for additional challenge kinds post-hackathon (e.g., 'multiple_choice', 'mini_game').
]);
export type Challenge = z.infer<typeof ChallengeSchema>;

// ------- Phaser hook --------

// Allows a dialogue node to trigger a Phaser-side event (cinematic, camera pan)
// without coupling the reducer to Phaser. The hook emits a bridge event; the
// reducer awaits a matching `resolveNodeId` before advancing.

export const PhaserHookSchema = z.object({
  event: z.string(),
  key: z.string().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
  resumeOnEvent: z.string().optional(),        // bridge event to wait for before advancing
});
export type PhaserHook = z.infer<typeof PhaserHookSchema>;

// ------- OnSubmit --------

export const OnSubmitSchema = z.object({
  stream: z.string().optional(),               // streamKey for ApolloStream when an LLM response attaches
  next: z.string().optional(),                 // advance to this node after submission (and stream, if any)
  effects: z.array(EffectSchema).default([]),
});
export type OnSubmit = z.infer<typeof OnSubmitSchema>;

// ------- Node --------

export const NodeSchema = z.object({
  lines: z.array(LineSchema).default([]),
  choices: z.array(ChoiceSchema).default([]),
  challenge: ChallengeSchema.optional(),
  onSubmit: OnSubmitSchema.optional(),         // required when `challenge` is present
  phaser: PhaserHookSchema.optional(),
  effects: z.array(EffectSchema).default([]),  // fire on node enter, before rendering lines
  next: z.string().optional(),                 // linear advance after all lines consumed and no choices
  end: z.boolean().default(false),             // terminal node, closes dialogue on exit
});
export type Node = z.infer<typeof NodeSchema>;

// ------- Dialogue envelope --------

export const DialogueSchema = z.object({
  id: z.string(),
  source: z.enum(['custom', 'ink']).default('custom'),
  speaker: z.string(),
  start: z.string(),                            // starting NodeId
  vars: z.record(z.string(), z.unknown()).default({}),
  nodes: z.record(z.string(), NodeSchema),
  tags: z.array(z.string()).default([]),
});
export type Dialogue = z.infer<typeof DialogueSchema>;
```

The `source: 'ink'` option is reserved scaffolding. Runtime in v0.1.0 rejects dialogues with `source: 'ink'` at load time with a clear not-yet-implemented error. The field is present so post-hackathon adoption of `inkjs` compiled stories does not require a schema migration.

## 4. Interface / API Contract

```typescript
// src/data/dialogues/DialogueRunner.ts

import type { Trigger } from '@/data/quests/quest_types';

export type DialogueAction =
  | { type: 'OPEN'; dialogueId: DialogueId; startNode?: NodeId }
  | { type: 'ADVANCE_TO'; nodeId: NodeId }
  | { type: 'SELECT_CHOICE'; index: number }
  | { type: 'SUBMIT_CHALLENGE'; value: string }
  | { type: 'STREAM_CHUNK'; chunk: string }
  | { type: 'STREAM_COMPLETE' }
  | { type: 'PHASER_RESUMED'; event: string }
  | { type: 'CLOSE' };

export interface DialogueReducerState {
  activeDialogueId: DialogueId | null;
  currentNodeId: NodeId | null;
  streaming: boolean;
  streamBuffer: string;
  vars: DialogueVars;
  awaitingPhaserEvent: string | null;
}

export interface DialogueRunner {
  loadAll(): Promise<Dialogue[]>;
  reducer(state: DialogueReducerState, action: DialogueAction): DialogueReducerState;
  availableChoices(state: DialogueReducerState): Choice[];      // applies `if` expression filter
  shouldFireTriggerOnChoice(choice: Choice): Trigger | null;
  isTerminal(state: DialogueReducerState): boolean;
}
```

- `reducer` is pure: state in, state out, no side effects. Effects declared on nodes, choices, or onSubmit are collected and surfaced as derived `pendingEffects` for a dispatcher outside the reducer to apply to `useQuestStore` and `useInventoryStore`.
- `availableChoices` evaluates the optional `if` expression per choice against the current `vars`, `npcTrust` snapshot, and inventory snapshot. Hidden choices are omitted from the returned array.
- `shouldFireTriggerOnChoice` derives a `dialogue_choice_selected` Trigger when the choice has an `effects[].type === 'emit_event'` or when the quest layer should be notified; otherwise returns null.
- `reducer` with unknown `action.type`: returns state unchanged (defensive default).
- `loadAll` validates every dialogue file at module import time. Invalid shapes throw `DialogueSchemaError` identifying the failing dialogue id and zod path.

## 5. Event Signatures

Handled by `game_event_bus.contract.md`. Dialogue runtime emits and subscribes to:

- Emitted: `game.dialogue.opened`, `game.dialogue.node_entered`, `game.dialogue.choice_selected`, `game.dialogue.challenge_submitted`, `game.dialogue.stream_chunk`, `game.dialogue.stream_complete`, `game.dialogue.closed`.
- Subscribed: `game.dialogue.open` (from Nyx `open_dialogue` effect), `game.dialogue.advance` (external nudge), `game.dialogue.stream_chunk_received` (from Apollo streaming backend), `game.phaser.cinematic_complete` (to resume awaiting Phaser nodes).

## 6. File Path Convention

- Types and zod schemas: `src/data/dialogues/dialogue_types.ts`
- Runner implementation plus reducer: `src/data/dialogues/DialogueRunner.ts`
- React container component: `src/components/hud/DialogueOverlay.tsx` (Erato-v2 wiring)
- Dialogue JSON files: `src/data/dialogues/<dialogue_id>.json` (e.g., `src/data/dialogues/apollo_intro.json`)
- Validator CLI: `scripts/validate-dialogues.ts` (Linus maintains; runs in CI plus pre-commit)
- Condition DSL parser (shared with quest): `src/data/quests/condition_parser.ts`

## 7. Naming Convention

- Dialogue ids: `snake_case`, speaker-anchored (`apollo_intro`, `daedalus_shop_greet`).
- Node ids: `snake_case`, narrative-anchored (`greet`, `prompt_brief`, `builder_cinematic`, `end`).
- Challenge kinds: `snake_case` discriminant tags.
- SlotId: `snake_case`, quest-scoped (`lumio_brief`, `apollo_first_ask`).
- Speaker ids: match `NpcId` in questStore.
- File names: `snake_case.json`.

## 8. Error Handling

- JSON parse failure at `loadAll`: throws `DialogueLoadError` with file path.
- Zod validation failure: throws `DialogueSchemaError`.
- `source: 'ink'` on v0.1.0: throws `UnsupportedDialogueSource` with clear forward-reference to post-hackathon adoption plan.
- `reducer` action `ADVANCE_TO` with unknown `nodeId`: returns state unchanged, logs warn with dialogue id plus requested node.
- `SELECT_CHOICE` with out-of-range index: no-op, logs warn.
- `SUBMIT_CHALLENGE` on a node without a `challenge`: no-op, logs warn.
- `STREAM_CHUNK` when `streaming: false`: starts a new stream silently (treats as implicit stream open) and logs debug note.
- `PHASER_RESUMED` when `awaitingPhaserEvent` does not match: ignored.
- Challenge `minChars` not met on submit: reducer does not advance, caller surfaces validation error via inline HUD.
- Runtime `vars` mutation attempted with a non-serializable value: stringified via `JSON.stringify` guard; if that throws, the mutation is rejected with warn.

## 9. Testing Surface

- Sample dialogue `apollo_intro.json` round-trips through `DialogueSchema.parse`.
- `reducer` with `OPEN` on `apollo_intro` sets `currentNodeId` to the declared `start`.
- `reducer` with `SELECT_CHOICE` advances to the choice's `next` when index valid, unchanged when invalid.
- `availableChoices` filters out choices whose `if` evaluates false with current vars.
- `SUBMIT_CHALLENGE` with value shorter than `minChars` does not advance; with value meeting `minChars` advances to `onSubmit.next` (or waits for stream if `onSubmit.stream` is set).
- `STREAM_CHUNK` + `STREAM_COMPLETE` buffer round-trip: buffer accumulates, `streaming` flips true then false on complete.
- `PHASER_RESUMED` with matching event id advances from the Phaser-hooked node.
- Terminal node with `end: true` triggers implicit `CLOSE` action after its effects apply.
- Schema violation: dialogue JSON with unknown challenge kind rejected at `loadAll`.
- `source: 'ink'` rejected explicitly.

## 10. Open Questions

- None blocking v0.1.0. Prompt-challenge kinds beyond `prompt_input` (e.g., `multiple_choice`, `rhythm_mini`) are deliberately deferred; the discriminated union leaves room for additive schema extension without breakage.

## 11. Post-Hackathon Refactor Notes

- Wire `inkjs` adapter for `source: 'ink'` dialogues so Inky-authored stories import without schema change.
- Add portrait preloading hook so Erato-v2 DialogueOverlay does not flicker on first speaker render.
- Extend condition DSL to reference quest state (`quest.lumio_onboarding.stepIndex >= 2`) as first-class paths.
- Add auto-typewriter cancellation (space plus click fast-forward) with per-dialogue override.
- Add history replay surface so Apollo Advisor can quote prior dialogue lines verbatim into the main chat panel.
- Add dialogue locale bundles (`en-US`, `id-ID`) keyed off the Apollo Advisor session locale.
- Author the `dialogue-tree-authoring` skill per M1 Section 9 priority 2 recommendation with node templates and two example dialogues.
