---
agent: Nemea-RV-v2
phase: NP
wave: W4
ferry: 4 + 5b
date: 2026-04-26
purpose: per-spec audit of obsolete React HUD selector references in tests/e2e/ post Helios-v2 S11
sibling_doc: docs/adr/ADR-S11-react-hud-removal-test-obsolescence.md
---

# E2E Obsolescence Inventory (Post Helios-v2 S11)

## 1. Scope

Helios-v2 S11 commit `8fadf4b` titled "React HUD cleanup on /play (Gate 5 REVISED)"
removed the entire React HUD layer from `/play`. The shipped surface is now
pure Phaser canvas. GameShell.tsx mounts `GameHUDLean` instead of `GameHUD`;
the lean HUD only mounts `BusBridge` (non-visual event-bus translator) plus
`TierBadge` (P6 Marshall pricing tier indicator).

Pre-S11, the following React HUD components mounted on `/play`:

- `QuestTracker` exposing `[aria-label="Quest tracker"]` plus
  `.quest-tracker-progress` plus `.quest-tracker-step-title`
- `DialogueOverlay` exposing `.dialogue-overlay` plus
  `.dialogue-overlay-speaker` plus `.dialogue-overlay-choice` plus
  `.dialogue-overlay-choice-item` plus `[data-dialogue-id]` plus
  `[data-node-id]`
- `InventoryToast` exposing `[data-hud-role="inventory-toast"]`
- `PromptInputChallenge` exposing
  `[data-hud-role="prompt-input-challenge"]` plus `[data-slot-id]`
- `PromptChallengeNode` exposing `[data-slot-id]` on the wrapping form

Post-S11, all of the above are unmounted on `/play`. The component files
remain on disk under `src/components/hud/` and `src/components/game/`
preserved for opt-in mount on non-/play routes (per the S11 commit body),
but the `/play` route does not mount them.

## 2. Spec inventory

`find tests/e2e/ -name "*.spec.ts"` returns 5 files. Per-spec audit of
obsolete selector references plus retirement decision:

| Spec | Tests | Obsolete selectors | Retire? |
|------|-------|--------------------|---------|
| `tests/e2e/lumio_quest.spec.ts` | 6 | `[aria-label="Quest tracker"]`, `.quest-tracker-progress`, `.quest-tracker-step-title` | YES |
| `tests/e2e/dialogue_flow.spec.ts` | 6 | `.dialogue-overlay`, `.dialogue-overlay-speaker`, `.dialogue-overlay-choice-item`, `.dialogue-overlay-choice`, `[data-slot-id]`, `[data-hud-role="prompt-input-challenge"]` | YES |
| `tests/e2e/inventory_award.spec.ts` | 6 | `[data-hud-role="inventory-toast"]` (5 references) | YES |
| `tests/e2e/caravan_unlock.spec.ts` | 5 | `[aria-label="Quest tracker"]`, `.quest-tracker-progress` | YES |
| `tests/e2e/creator-submit.spec.ts` | 2 | NONE (targets `/creator/submit`, not `/play`) | NO |

Total retired: 4 specs / 23 tests. Total preserved valid: 1 spec / 2 tests.

The 23-test obsolescence count matches the W0 verify pre-fix baseline
(`docs/qa/nemea_rv_v2_w0_verify_report.md` Section 1: 9 of 23 green
pre-fix, 20 of 23 green post-fix). The W0 report flagged the 3 remaining
post-fix failures as "test harness timing flakes". Reality post-S11:
all 23 are now architecturally invalid because the assertions target
React HUD nodes that no longer mount.

## 3. Per-spec selector reference detail

### 3.1 `tests/e2e/lumio_quest.spec.ts`

| Line | Selector | Purpose |
|------|----------|---------|
| 95 | `[aria-label="Quest tracker"]` | Read QuestTracker root for quest id + state |
| 100 | `.quest-tracker-progress` | Read inner progress label "Step N of 9" |
| 101 | `.quest-tracker-step-title` | Read current step title |

Tests retired: 6 of 6. Retirement marker: `test.describe.skip(...)`.

### 3.2 `tests/e2e/dialogue_flow.spec.ts`

| Line | Selector | Purpose |
|------|----------|---------|
| 96 | `.dialogue-overlay` | Read DialogueOverlay root + dialogueId/nodeId attrs |
| 108 | `.dialogue-overlay-speaker` | Read speaker name |
| 109 | `.dialogue-overlay-choice-item` | Count choice items |
| 110 | `[data-slot-id]` | Detect prompt challenge node |
| 118 | `[data-slot-id]` | Read challenge slot id |
| 163 | `.dialogue-overlay-choice` | Click first choice button |
| 189 | `[data-hud-role="prompt-input-challenge"]` | Locate HUD prompt form |
| 212 | `[data-hud-role="prompt-input-challenge"] textarea` | Fill prompt textarea |
| 219 | `[data-hud-role="prompt-input-challenge"] button[type="submit"]` | Click submit |

Tests retired: 6 of 6. Retirement marker: `test.describe.skip(...)`.

### 3.3 `tests/e2e/inventory_award.spec.ts`

| Line | Selector | Purpose |
|------|----------|---------|
| 123, 133, 142, 153, 188 | `[data-hud-role="inventory-toast"]` | Locate toast root |

Tests retired: 6 of 6. Retirement marker: `test.describe.skip(...)`.

### 3.4 `tests/e2e/caravan_unlock.spec.ts`

| Line | Selector | Purpose |
|------|----------|---------|
| 91 | `[aria-label="Quest tracker"]` | Read QuestTracker root |
| 96 | `.quest-tracker-progress` | Read inner progress label |

Tests retired: 5 of 5. Retirement marker: `test.describe.skip(...)`.
The final test (`canvas survives the full 8-trigger drive without detach`)
asserts only against canvas + `__NERIUM_TEST__.ready` and is conceptually
post-S11 valid; it ships under the same describe.skip umbrella for audit
trail simplicity. Re-introducible as a standalone test once the
observability seam roadmap lands.

### 3.5 `tests/e2e/creator-submit.spec.ts`

NO obsolete selector references. The spec targets `/creator/submit` which
is a different route surface, unaffected by the S11 `/play` HUD removal.
All assertions are against `getByTestId(...)` on creator wizard form
elements which are owned by Phanes and unrelated to the HUD layer. Spec
remains active.

## 4. Smoke replacement

A new spec `tests/e2e/play_phaser_smoke.spec.ts` ships in the same commit.
Three tests covering:

1. `/play` boots and Phaser scene reaches ready with canvas mounted
   (asserts `canvas` count + `__NERIUM_TEST__.ready` + `phaserMounted`)
2. `/play` exposes `ApolloVillage` as the active scene at boot
   (asserts `activeSceneKey === 'ApolloVillage'` + `worldId === 'medieval_desert'`)
3. `/play` does not mount the legacy React HUD root (S11 contract canary)
   (asserts `[data-hud-role="game-hud-root"]` count 0 + `[data-hud-role="game-hud-lean-root"]` count 1)

Coverage scope: smoke only, not feature regression. Adequate for hackathon
submission demo surface verification. Inadequate for ongoing CI quality
gates; the post-submit roadmap restores feature coverage via Phaser
observability seams.

## 5. Anti-pattern check

- No em dash: confirmed via grep (zero matches in the changed files)
- No emoji: confirmed via grep (zero matches in the changed files)

End of inventory.
