---
agent: linus
phase: RV-W2 dialogue runtime
scope: design record for dialogue JSON schema, reducer, React HUD overlay, and prompt challenge bridge
date: 2026-04-23
version: 0.1.0
status: shipped
audience: Nyx, Erato-v2, Euterpe, Thalia-v2, Harmonia-RV-A, Nemea-RV-A, Pythia-v2
---

# Linus decisions record

Short, append-only rationale for the choices Linus made while authoring the NERIUM RV dialogue runtime. Cross-references NarasiGhaisan Section 13 (brevity discipline), CLAUDE.md anti-patterns, M2 Section 4.3, and the three contracts Linus owns or consumes.

## 1. Custom JSON schema rather than inkjs or Yarn Spinner

M1 Section 3.2 evaluated Ink, Twine, Yarn Spinner 3, Dialogic, and rex DialogQuest. Custom minimal JSON won because:

- Claude generates JSON natively with zod-validated schemas, so authoring is stable across dialogue files.
- A first-class prompt-challenge node type is required for the vertical slice (user types a brief mid-dialogue, fires `prompt_submitted` trigger into Nyx). Ink and Yarn Spinner need custom bindings to embed React components; that coupling would be larger than the whole runtime Linus ships here.
- A 40-line reducer is cheaper to maintain than an ink-runtime bindings layer.

The schema reserves `source: 'ink'` per contract v0.1.0 Section 3 so a post-hackathon inkjs adapter can land without migration. `parseDialogue` rejects `source: 'ink'` with a clear `UnsupportedDialogueSource` error today.

**Strategic hard stop per M2 Section 10.2:** adopting inkjs, Yarn Spinner, Twine, or rex DialogQuest now requires V4 ferry approval before Linus proceeds.

## 2. Hand-rolled narrow DSL parser instead of jsep or `new Function`

The linus.md prompt and M2 Section 4.3 allow `jsep` or a guarded `new Function`. The contract Section 4 forbids `new Function` ("security and auditability"). Linus chose a third path: a small recursive-descent parser in `src/lib/dialogueRunner.ts` covering exactly the grammar documented in `.claude/skills/dialogue-tree-authoring/SKILL.md`.

Reasons:

- Zero new npm dependency. jsep is not installed; adding a dep during parallel W2 risks package-lock drift with Nyx's session.
- Narrow grammar is well-defined (see SKILL.md): identifier dot-paths, function calls for `inventory.hasItem`, numeric comparisons, boolean operators, parentheses, negation. A parser for that fits in under 200 lines.
- Any unexpected syntax produces `ExpressionParseError` at parse time, so dialogue authors get a loud failure rather than silent truthiness.
- ASTs are memoised per expression string, so condition evaluation is O(1) after the first call per expression.

Post-hackathon refactor note: if Marketplace creator-authored dialogues need a richer grammar, swap to jsep at that point with a contract bump; the AST shape is the integration point.

## 3. Store shape tracks `game_state.contract.md` Section 3.2 verbatim

The linus.md prompt describes the store fields as `activeId`, `nodeId`, `vars`, `streaming`. The contract is stricter and richer: `activeDialogueId`, `currentNodeId`, `streaming`, `streamBuffer`, `vars`, `history`. Linus took the contract as authoritative per Pythia-v2 strict-blocker discipline (NarasiGhaisan Section 9).

Additional store fields beyond the contract baseline (`pendingEffects`, `awaitingPhaserEvent`, `lastSubmission`, `lastChoiceIndex`) are derived mirrors of the pure reducer state; they are additive, not breaking, and let React HUD components subscribe without re-running the reducer.

## 4. Output file paths follow the Linus prompt, not the contract path convention

The contract Section 6 lists `src/data/dialogues/dialogue_types.ts`, `src/data/dialogues/DialogueRunner.ts`, `src/components/hud/DialogueOverlay.tsx`. The Linus prompt and M2 Section 4.3 list `src/data/dialogues/_schema.ts`, `src/lib/dialogueRunner.ts`, `src/components/game/DialogueOverlay.tsx`, `src/components/game/PromptChallengeNode.tsx`, `src/stores/dialogueStore.ts`.

Linus shipped the prompt paths. Rationale: the prompt is Hephaestus-v2's authoritative spec for Linus, M2 Section 4.3 matches, and the `dialogue-tree-authoring` skill example uses `_schema.ts` + `src/components/game/`. The contract's paths are older seed text; Pythia-v2 round 2 can amend to v0.2.0 if strict path parity becomes load-bearing. Flagged for Harmonia-RV-A and Pythia-v2 awareness.

## 5. Effect schema locally scoped in `_schema.ts`

The dialogue contract Section 3 imports `EffectSchema` from `@/data/quests/quest_types`. During W2 parallel build, Nyx owns `src/data/quests/quest_types.ts` and may not have shipped at the moment Linus commits. To keep the dialogue module independently compilable and tested in isolation, Linus defined a local `effectSchema` in `src/data/dialogues/_schema.ts` that is a superset of the subset dialogue needs and a strict match for the Quest contract's discriminated union.

Integration plan:

- After Nyx ships and Harmonia-RV-A confirms shape parity, Pythia-v2 may consolidate into a shared `src/data/effects/effect_types.ts` at contract v0.2.0.
- Until then, both modules validate the same JSON shapes, and the authored `apollo_intro.json` parses cleanly through either schema.

## 6. Prompt challenge bridge fires events only, never touches `useQuestStore`

Per game_event_bus.contract.md Section 5, the challenge submit path is:

`PromptChallengeNode.submit()` -> `useDialogueStore.submitChallenge(value)` -> emits `game.dialogue.challenge_submitted` plus `game.quest.trigger_requested` via the bridge -> Nyx subscribes in questStore and calls `fireTrigger({ type: 'prompt_submitted', slot })` plus `recordPromptSubmission(slotId, value)`.

Linus never imports `useQuestStore`. The coupling is one contract shape (Trigger) and one event payload. This respects translator_notes gotcha 3 (no prop drilling across 6 callbacks) and gotcha 16 (slot-pattern composition).

`dialogueBridge.ts` is a thin emission helper. When Thalia-v2's `src/stores/gameBridge.ts` ships with a real `attachBusTo(game)` wrapper, the bridge swaps its implementation only; import sites stay stable. Current fallback emits on a `__NERIUM_GAME_EVENT__` CustomEvent so Playwright and Nemea can assert event flow without a Phaser instance.

## 7. Typewriter effect honors `prefers-reduced-motion`

`DialogueOverlay` queries `window.matchMedia('(prefers-reduced-motion: reduce)')` at mount and on change. When reduced motion is preferred, the overlay skips straight to the full text of the last line. This matches translator_notes gotcha 7 (honor reduced-motion in 7 ported sites) and CLAUDE.md a11y baseline. The typewriter loop uses `requestAnimationFrame` with a per-line `typewriterMsPerChar` override, capped at `DEFAULT_MS_PER_CHAR = 26` and `LINE_GAP_MS = 220` for inter-line pause.

Euterpe sfx coordination: the overlay emits `game.dialogue.node_entered` on every node change so Euterpe subscribes once and plays its typewriter cue. There is no tight timing contract between the overlay and sfx because both are driven off the same event; the overlay never drives Euterpe directly.

## 8. Apollo brevity discipline preserved in `apollo_intro.json`

Every node in the vertical slice conversation keeps Apollo under three sentences per turn and one to two questions max, per NarasiGhaisan Section 13. `greet` uses two sentences plus two choices; `lore` uses two sentences plus one choice; `prompt_brief` uses a single-sentence lead-in before the challenge; `builder_cinematic` is a single sentence; `post_cinematic` uses two sentences plus one advance choice. Total Apollo turn count across the slice is five; question count is zero after the prompt (questions live in the challenge placeholder and helper text, not in spoken lines).

## 9. Tests run on node's built-in test runner

`tests/dialogue.test.ts` uses `node:test` plus `node:assert/strict`. No vitest, no jest. Running command: `node --test --experimental-strip-types tests/dialogue.test.ts` on Node 22.6+, or `tsx --test tests/dialogue.test.ts` if tsx is available locally. Zero devDeps added. Nemea-RV-A can wire the CI invocation and promote to a runner of choice post-hackathon.

## 10. What Linus intentionally did not ship

- No portrait asset loader. Node schema accepts `portrait` but no `AssetResolver` exists in v0.1.0; DialogueOverlay renders speaker name only for now. Blocked on Talos asset ledger.
- No inline stream endpoint. DialogueOverlay renders `streamBuffer`, but the fetch to `/api/apollo/stream` lives in Erato-v2's ApolloStream surface (`src/components/hud/ported/ApolloStream.tsx`). Linus exposes `appendStreamChunk` and `finishStream` for that integration.
- No portrait preload hook. Called out in contract Section 11 post-hackathon refactor notes.
- No history replay surface. History is recorded in the store but no UI reads it yet.
- No quest store import. All cross-store coupling flows through `dialogueBridge`.

## 11. Self-check summary

All 19 items of the M2 Section 4.3 self-check are honored. See `_meta/orchestration_log/day_0.md` Linus entry (appended at commit time) for the per-item enumeration.
