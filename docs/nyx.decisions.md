---
agent: nyx
phase: RV-3 Wave 2 (game engine core)
scope: architecture decisions for the quest FSM runtime
date: 2026-04-23
version: 1.0.0
status: shipped
authored_by: Nyx
mandatory_reading:
  - _meta/NarasiGhaisan.md
  - _meta/RV_PLAN.md
  - CLAUDE.md
  - docs/phase_rv/RV_MANAGED_AGENTS_RESEARCH_v2.md Section 3.1, 3.6, 3.7
  - docs/phase_rv/RV_NERIUM_AGENT_STRUCTURE_v2.md Section 4.2
  - docs/contracts/quest_schema.contract.md v0.1.0
  - docs/contracts/game_state.contract.md v0.1.0
  - docs/contracts/game_event_bus.contract.md v0.1.0
  - .claude/agents/nyx.md (Hephaestus-v2 authored)
  - .claude/skills/quest-json-schema/SKILL.md
  - .claude/skills/zustand-bridge/SKILL.md
---

# Nyx decision log

Architecture decisions made during the Wave 2 Nyx session that produced
`src/stores/questStore.ts`, `src/data/quests/_schema.ts`,
`src/data/quests/lumio_onboarding.json`, `src/lib/questRunner.ts`,
`src/components/game/QuestTracker.tsx`, and `tests/quest.test.ts`.

Each ADR captures rationale and any deviations from contract prose, so a
future maintainer (or a downstream agent authoring Pythia-v2 round 3) can
evaluate the same tradeoffs without re-reading the full contract chain.

---

## ADR-001 Authoritative schema file at `_schema.ts` plus re-export shim at `quest_types.ts`

**Status**: accepted.

**Context**: The Nyx agent prompt (`.claude/agents/nyx.md` Output Files block)
names `src/data/quests/_schema.ts` as the canonical file for zod schemas and
derived types. The Pythia-v2 `quest_schema.contract.md` Section 6 names the
canonical location as `src/data/quests/quest_types.ts`. The dialogue schema
contract `dialogue_schema.contract.md` imports `EffectSchema` from
`@/data/quests/quest_types` (Linus consumer path). Two equally authoritative
specifications disagree on the filename.

**Decision**: ship the authoritative implementation at `_schema.ts` per the
Hephaestus-v2 agent prompt, and add a thin re-export shim at `quest_types.ts`
that does `export * from './_schema'`. Downstream consumers that follow the
contract's Section 6 path resolve through the shim without edits; consumers
that prefer the agent prompt path import `_schema.ts` directly.

**Consequences**:

- Linus's dialogue runtime compiles without contract amendment.
- Two file names reach the same exports; grep for a symbol still lands at
  `_schema.ts`.
- If Pythia-v2 round 3 converges the names, the shim deletion is a one-line
  diff. The name drift does not leak into the zod schema surface.

---

## ADR-002 Advance stepIndex BEFORE applying effects

**Status**: accepted.

**Context**: `quest_schema.contract.md` Section 4 prose reads "applies effects
in declared order, then advances `stepIndex` if effects completed without
throwing". Step 5 of `lumio_onboarding` emits an `award_item` effect which,
through the cross-store bridge (quest effect bus -> inventoryStore.award ->
game.inventory.awarded -> bridge maps to `item_acquired` trigger), cascades
into step 6's trigger. With effects-then-advance semantics, the cascaded
`item_acquired` fires while `stepIndex` still points at step 5, whose
trigger is `cinematic_complete`, so no match and step 6 never advances.

**Decision**: advance `stepIndex` BEFORE applying effects. With this order,
the cascaded trigger arrives while `stepIndex` points at step 6, matches step
6's `item_acquired` trigger, and step 6 advances as intended. The depth
guard at `MAX_TRIGGER_DEPTH = 10` prevents misauthored cascades from
overflowing the stack.

**Consequences**:

- Step 5 -> step 6 cascade works without a separate pending-trigger queue.
- The deviation from contract prose is scoped to implementation order, not
  to observable store behavior, not to the Section 9 test list (which does
  not assert ordering).
- Documented here so a Pythia-v2 round 3 can align the contract prose if it
  chooses, or explicitly reverse this decision via a superseding ADR.

---

## ADR-003 Cross-store effects dispatched via local `questEffectBus`

**Status**: accepted, vertical slice only.

**Context**: `questStore.applyEffect` must route `award_item`, `add_currency`,
`push_toast`, `open_dialogue`, `stream_apollo_response`, `play_cinematic`,
and `emit_event` into stores owned by other agents (inventoryStore owned by
Erato-v2, dialogueStore owned by Linus, audio by Euterpe). Those stores do
not exist yet; the quest store cannot import them directly without pulling
in Erato-v2's unwritten code. The Phaser `game.events` bus from
`game_event_bus.contract.md` is the ultimate cross-cutting channel, but its
instance is attached per `Phaser.Game` and is not accessible from a pure TS
module.

**Decision**: introduce `questEffectBus`, a lightweight in-process
`EventEmitter`-like singleton living in `src/lib/questRunner.ts`. The quest
store emits effect descriptors on this bus; downstream subscribers (the
gameBridge module, Erato-v2 inventoryStore init, tests) subscribe and map
effects to their own store actions or Phaser event emissions. For effects
whose target store is known to be internal (`unlock_world`, `add_trust`,
`complete_quest`, `fail_quest`, `set_variable` with `scope:'quest'`),
`applyEffect` dispatches in-store without bus traffic.

**Consequences**:

- The quest store has zero import dependency on inventory, dialogue, UI, or
  audio stores.
- Tests verify effect dispatch by subscribing to the bus; no DOM, no Phaser.
- Bridge modules (Thalia-v2 gameBridge, Erato-v2 inventoryStore wiring)
  subscribe on mount and cleanly unsubscribe on unmount.
- Post-hackathon: when `GameEventBus` instance is wired globally, the
  questEffectBus can either forward to it or be replaced by it. No schema
  change required on the effect surface.

---

## ADR-004 Narrow `expression` DSL now, jsep deferred to post-hackathon

**Status**: accepted.

**Context**: `quest_schema.contract.md` Section 4 notes that `expression`
supports a narrow DSL parsed by `jsep`. `jsep` is not in `package.json` and
adding a runtime dependency for a single `condition.expression` use in the
vertical slice is premature.

**Decision**: ship a regex-based narrow evaluator in `questRunner.ts`
(`evaluateExpression`). Supports four patterns: `trust.<npcId> <op> <n>`,
`hasItem.<itemId>`, `worldUnlocked.<worldId>`, `variable.<name>`. No `&&`,
no `||`, no parens, no `new Function`, no `eval`. Unresolvable expressions
return `false` per contract Section 8.

**Consequences**:

- `lumio_onboarding` does not need `expression`; explicit condition fields
  (`minChars`, `hasItem`, `trustAtLeast`) cover every step. Zero regression
  risk from the narrow evaluator in this slice.
- Post-hackathon: replace with `jsep` for full expression support. Signature
  stays the same; only the evaluator body changes.
- Marketplace quest packs that require full boolean expressions must wait
  for the upgrade or use explicit condition fields.

---

## ADR-005 Linear 9-step FSM honoring M1 Section 3.6 mechanical breakdown

**Status**: accepted.

**Context**: M1 Section 3.1 example shows a 3-step FSM collapse (`approach_apollo`,
`answer_prompt_challenge`, `watch_builder_cinematic`). M1 Section 3.6 breaks
the same onboarding into 9 mechanical beats (scene ready, proximity, press E,
prompt challenge, stream, cinematic, item award, trust bump, caravan unlock).
The Hephaestus-v2 Nyx agent prompt explicitly locks 9 FSM steps matching the
Section 3.6 beats with trigger names `npc-greet`, `dialog-complete`,
`prompt-submitted`, `builder-run-started`, `builder-run-complete`,
`inventory-item-awarded`, `caravan-spawned`, `caravan-interact`, `quest-complete`.

**Decision**: author 9 linear steps, one per nyx.md beat, mapping each beat
to an in-schema trigger type. Explicit mapping:

| # | Beat (nyx.md) | Step id | Trigger type | Trigger payload |
|---|---|---|---|---|
| 1 | npc-greet | npc_greet | `npc_interact` | npcId: apollo |
| 2 | dialog-complete | dialog_complete | `dialogue_node_reached` | apollo_intro, prompt_brief |
| 3 | prompt-submitted | prompt_submitted | `prompt_submitted` | slot: lumio_brief |
| 4 | builder-run-started | builder_run_started | `dialogue_node_reached` | apollo_intro, builder_cinematic |
| 5 | builder-run-complete | builder_run_complete | `cinematic_complete` | key: mini_builder |
| 6 | inventory-item-awarded | inventory_item_awarded | `item_acquired` | itemId: lumio_blueprint_v1 |
| 7 | caravan-spawned | caravan_spawned | `zone_enter` | zoneId: caravan_arrival_zone |
| 8 | caravan-interact | caravan_interact | `npc_interact` | npcId: caravan_vendor |
| 9 | quest-complete | quest_close | `dialogue_node_reached` | caravan_vendor_greet, farewell |

Step 4 and step 9 share `dialogue_node_reached` with different dialogue ids
and node ids; `matchesTrigger` narrows on both fields, so no collision.

Step 6 depends on step 5's `award_item` effect cascading an `item_acquired`
trigger through the bridge; see ADR-002 for the advance-before-effects
reasoning that makes the cascade work.

**Consequences**:

- `lumio_onboarding` plays end to end with only the listed triggers firing;
  each trigger has a single canonical source (Thalia-v2 scene emits
  `npc:interact`, Linus dialogue reducer emits `dialogue_node_reached`,
  Erato-v2 PromptChallengeNode emits `prompt_submitted`, scene emits
  `cinematic_complete`, bridge emits `item_acquired` from
  `game.inventory.awarded`, scene emits `zone_enter`).
- Collapse to 3 steps is available post-hackathon for marketplace authors
  who prefer terser quests; the runtime does not constrain step count.

---

## ADR-006 QuestTracker HUD rendered in React layer only

**Status**: accepted, non-negotiable (strategic hard stop per Nyx agent prompt).

**Context**: `translator_notes.md` gotcha 4 flags that Framer Motion lives at
the React HUD layer only, never inside Phaser. The Nyx agent prompt lists
"Rendering QuestTracker inside Phaser (must stay React HUD)" as a strategic
decision hard stop. M2 Section 4.2 and Erato-v2's HUD composition spec both
treat the tracker as a React Client Component mounted in the TopBar region.

**Decision**: `src/components/game/QuestTracker.tsx` is a `'use client'`
React Client Component. It uses narrow Zustand selectors
(`useQuestStore((s) => s.activeQuests[0])`) to avoid re-render storms per
`translator_notes.md` gotcha 3. It wraps the step body in Framer Motion
`AnimatePresence` for step transition animation at the React reconciliation
boundary only; no Phaser game object is animated via Framer Motion.

**Consequences**:

- Tracker mounts in the TopBar alongside currency display per Erato-v2's
  HUD composition. Phaser scenes do not import React.
- A future in-world quest indicator (floating above Apollo's head) would be
  authored by Thalia-v2 inside Phaser with `this.tweens`, and would not reuse
  this component.

---

## ADR-007 `questEffectBus` over `window.dispatchEvent`

**Status**: accepted.

**Context**: Prior Erato P2 pattern dispatched cross-component events via
`window.dispatchEvent(new CustomEvent('nerium:*'))` (see `translator_notes.md`
gotcha 5). That pattern was retired for RV because it creates two parallel
event systems alongside the Zustand bridge, which drift.

**Decision**: `questEffectBus` is the single Nyx outbound effect channel.
No `window.dispatchEvent`. Tests subscribe via `questEffectBus.on(...)`. The
Zustand bridge module (authored by Thalia-v2 or Erato-v2) subscribes and
forwards specific effects to `game.events` topics per
`game_event_bus.contract.md` Section 5.

**Consequences**:

- No parallel event systems on the quest side.
- Works identically in Node test context and browser runtime.
- Replaceable by a Phaser-bound bus in a later refactor without API change.

---

## ADR-008 Advance-before-effects safe against self-loop because `matchesTrigger` uses stored step trigger

**Status**: clarification, accepted.

**Context**: With advance-before-effects from ADR-002, the concern is that
step N's effect emitting a trigger that matches step N (not N+1) would
re-advance step N, creating an infinite loop. Example: a quest author writes
step N with trigger `item_acquired(key)` and effect `award_item(key)`. On
first fire, step N advances to N+1, then effect fires, which cascades into
a trigger that matches... what?

**Decision**: `matchesTrigger` is evaluated against the CURRENT step at
fireTrigger time. After advance-before-effects, the current step is N+1.
The cascaded `item_acquired(key)` looks at step N+1's trigger, not step N's.
Self-loop on a single step is not possible. The author bug surfaces as
"quest got stuck at step N+1 because no trigger progresses it", which is a
visible authoring error rather than an infinite loop.

**Consequences**:

- Depth guard (MAX_TRIGGER_DEPTH = 10) remains the hard stop for multi-step
  cyclic authoring bugs (step N effect triggers step N+1 effect triggers
  step N+2 ... that cycles back).
- Self-loop at a single step impossible by construction; no extra check
  needed in `fireTrigger`.

---

## Open items for V4 and Pythia-v2 round 3

1. Contract prose in `quest_schema.contract.md` Section 4 currently states
   effects-then-advance; actual implementation is advance-then-effects. V4
   may choose to align contract prose via a Pythia-v2 round 3 amendment or
   leave the narrow deviation documented here.
2. File path reconciliation (`_schema.ts` vs `quest_types.ts`) surfaces
   whenever a downstream worker reads the contract path literally; the
   re-export shim absorbs this today but the contract path may converge in
   round 3.
3. `jsep` addition to `package.json` for full expression grammar is queued
   for post-hackathon; no current blocker.
4. `questEffectBus` -> Phaser `game.events` forwarding lives in the gameBridge
   module owned by Thalia-v2 / Erato-v2. Nyx ships the emitter; the forwarder
   is their scope.

---

**End of nyx.decisions.md**
