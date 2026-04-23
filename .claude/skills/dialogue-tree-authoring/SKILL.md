---
name: dialogue-tree-authoring
description: >
  Author and validate NERIUM dialogue JSON files for Apollo and the other NPCs
  in the vertical slice. Covers the custom minimal JSON schema, node + line +
  choice + challenge types, condition expressions, the React reducer runtime,
  embedded prompt-challenge nodes, and the effects bridge to Nyx fireTrigger.
  Trigger: "dialogue", "dialogue tree", "npc dialog", "yarn node", "apollo
  intro", "prompt challenge", "choice", "dialogue json", "conversation".
---

<!-- SKILL ORIGIN: fresh authoring by Talos based on M1 Section 3.2 (dialogue tree format research). -->
<!-- LICENSE: original_mit (governed by NERIUM repo LICENSE) -->
<!-- TRANSPLANTED BY: Talos on 2026-04-23 -->
<!-- ADAPTATION: custom JSON schema, not inkjs or Yarn Spinner. Embedded prompt-challenge node type required for NERIUM's PromptInputChallenge React component (see Erato-v2 scope). Contracts: dialogue_schema.contract.md, game_state.contract.md. -->

# Dialogue Tree Authoring (NERIUM RV)

Write dialogue JSON that the Linus runtime (a small React reducer) can traverse, with first-class support for embedded React prompt-challenge nodes.

---

## When to Invoke This Skill

- creating or editing `src/data/dialogues/<dialogue_id>.json`
- defining a new NPC dialogue tree
- authoring a prompt-challenge node (user-input node mid-conversation)
- writing a conditional choice such as `"if": "trust.apollo >= 5"`
- debugging a dialogue that fails zod validation
- wiring a dialogue `onSubmit` effect back into Nyx via `fireTrigger`

---

## NERIUM Locks

Per M2 Section 4.3 (Linus owner) and M1 Section 3.2:

1. **Custom JSON schema only.** No inkjs, Yarn Spinner 3, Twine, or rex DialogQuest. These were rejected because they do not support embedded React prompt-challenge nodes as a first-class node type. A `source: "ink"` escape hatch is reserved in schema for future migration.
2. **React reducer parse, approximately 40 lines.** No external parser dependency. The runtime lives in `src/lib/dialogueRunner.ts`.
3. **Zod-validated.** `src/data/dialogues/_schema.ts` exposes the schemas below. Every dialogue file is parsed before Linus renders it.
4. **Dialogue renders in React.** The DialogueOverlay component is a React Client Component inside `src/components/game/`. It never renders on the Phaser canvas.
5. **Effects call `fireTrigger`.** Dialogue `onSubmit` or end-node effects call into the Nyx store, keeping quest state authoritative.
6. **Condition grammar minimal.** `"trust.apollo >= 5"` style expressions; evaluated via `jsep` or a single `new Function("ctx", "return " + expr)`. No arbitrary JS execution.

---

## Canonical Schema

```typescript
// src/data/dialogues/_schema.ts
import { z } from 'zod';

export const lineSchema = z.object({
  text: z.string().min(1),
  speaker: z.string().optional(),     // override dialogue-level speaker for interjections
  pause_ms: z.number().int().nonnegative().optional(),
});

export const challengeSchema = z.object({
  type: z.literal('prompt_input'),
  slotId: z.string(),
  placeholder: z.string().optional(),
  minChars: z.number().int().nonnegative().optional(),
  maxChars: z.number().int().positive().optional(),
});

export const effectSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('complete_quest'), questId: z.string() }),
  z.object({ type: z.literal('fire_trigger'), trigger: z.any() }),
  z.object({ type: z.literal('set_var'), name: z.string(), value: z.union([z.string(), z.number(), z.boolean()]) }),
]);

export const choiceSchema = z.object({
  label: z.string().min(1),
  next: z.string(),
  if: z.string().optional(),          // condition expression
});

export const nodeSchema = z.object({
  lines: z.array(lineSchema).optional(),
  choices: z.array(choiceSchema).optional(),
  challenge: challengeSchema.optional(),
  onSubmit: z
    .object({
      stream: z.string().optional(),  // e.g. 'apollo_stream'
      next: z.string().optional(),
      effects: z.array(effectSchema).optional(),
    })
    .optional(),
  phaser: z
    .object({
      event: z.string(),
      key: z.string().optional(),
    })
    .optional(),
  effects: z.array(effectSchema).optional(),
  next: z.string().optional(),
});

export const dialogueSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  source: z.literal('ink').or(z.literal('nerium')).default('nerium'),
  speaker: z.string(),
  start: z.string(),
  vars: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  nodes: z.record(z.string(), nodeSchema),
});

export type Dialogue = z.infer<typeof dialogueSchema>;
export type DialogueNode = z.infer<typeof nodeSchema>;
```

Pythia-v2 `dialogue_schema.contract.md` is authoritative. If a field here disagrees with the contract, halt and ferry to V4.

---

## Vertical Slice Example: `apollo_intro`

```json
{
  "id": "apollo_intro",
  "source": "nerium",
  "speaker": "apollo",
  "start": "greet",
  "vars": { "playerName": "" },
  "nodes": {
    "greet": {
      "lines": [
        { "text": "Welcome to Apollo Village, {playerName}." },
        { "text": "I am Apollo. Ready to build Lumio?" }
      ],
      "choices": [
        { "label": "Yes, show me.", "next": "prompt_brief" },
        { "label": "Who are you?", "next": "lore", "if": "trust.apollo < 5" }
      ]
    },
    "lore": {
      "lines": [
        { "text": "I am the advisor. Every NERIUM build starts with a question." }
      ],
      "next": "greet"
    },
    "prompt_brief": {
      "challenge": {
        "type": "prompt_input",
        "slotId": "lumio_brief",
        "placeholder": "Describe Lumio in one sentence",
        "minChars": 20
      },
      "onSubmit": {
        "stream": "apollo_stream",
        "next": "builder_cinematic"
      }
    },
    "builder_cinematic": {
      "phaser": { "event": "play_cinematic", "key": "mini_builder" },
      "next": "end"
    },
    "end": {
      "effects": [{ "type": "complete_quest", "questId": "lumio_onboarding" }]
    }
  }
}
```

Line text supports `{varName}` substitution using `vars` plus any values set via `set_var` effects. Linus replaces at render time, not parse time.

---

## Condition Grammar

Allowed identifiers:

- `trust.<npcId>` (number)
- `inventory.hasItem("<itemId>")` (boolean, read-only helper)
- `vars.<varName>` (string/number/boolean)
- `quest.<questId>.stepIndex` (number, read-only)

Allowed operators: `===`, `!==`, `>`, `>=`, `<`, `<=`, `&&`, `||`, `!`, parentheses.

```
trust.apollo >= 5
quest.lumio_onboarding.stepIndex === 1
!inventory.hasItem("lumio_blueprint_v1") && trust.apollo >= 10
```

Anything outside this grammar halts the author and requires a Pythia-v2 contract revision.

---

## Authoring Checklist

- [ ] `id` matches filename; `/^[a-z0-9_]+$/`.
- [ ] Every `next` points to a node that exists.
- [ ] Every choice has either a bare `next` or a valid `if` expression.
- [ ] Challenge nodes set `slotId` unique across the project.
- [ ] Phaser events referenced in `phaser.event` match `docs/contracts/game_event_bus.contract.md`.
- [ ] Effect `complete_quest` targets a real quest id.
- [ ] Passes `dialogueSchema.parse(...)` via `tests/dialogue.test.ts`.
- [ ] Typewriter timing does not conflict with Euterpe audio cues.

---

## Anti-Patterns

| Anti-Pattern | Why it breaks | What to do instead |
|---|---|---|
| Free-form JavaScript in `if` | Eval risk, unparseable | Restrict to the condition grammar |
| Rendering dialogue inside Phaser | Loses Tailwind tokens, a11y | React DialogueOverlay; Phaser only emits `npc:interact` |
| Challenge with no `slotId` | `prompts.submissions[slot]` collides | Unique slotId per prompt input |
| Choice with no `next` | Runtime dead end | Every choice advances or completes |
| Hardcoding player name in text | Breaks i18n | Use `{playerName}` var substitution |
| Adopting inkjs mid-project | Schema churn | Reserve `source: "ink"` for a post-hackathon migration |

---

## Related Skills

- `quest-json-schema`: quests receive `fire_trigger` effects from dialogue nodes.
- `zustand-bridge`: DialogueOverlay subscribes to `useDialogueStore` with a narrow selector.
- `phaser-scene-authoring`: NPC zones emit `npc:interact` which opens the dialogue.
