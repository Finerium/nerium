/**
 * Pure-function TCE (Trigger, Condition, Effect) runtime helpers.
 *
 * Contract: docs/contracts/quest_schema.contract.md v0.1.0 Section 4
 * Cross-ref: docs/contracts/game_state.contract.md Section 3.1 QuestStore
 *
 * No React imports. No JSX. Zustand stores are consumed at the call site, not
 * here; these helpers take plain snapshots and return either booleans or plain
 * transition descriptors.
 *
 * Event emission for cross-store effects travels via the local questEffectBus
 * (lightweight EventEmitter). Bridge modules forward bus events to Phaser
 * game.events topics per game_event_bus.contract.md Section 5.
 */
import {
  QuestSchema,
  type Condition,
  type Effect,
  type Quest,
  type Step,
  type Trigger,
} from '../data/quests/_schema';
import rawLumioOnboarding from '../data/quests/lumio_onboarding.json' with { type: 'json' };

/**
 * Maximum depth allowed for recursive fireTrigger calls. Effects that emit
 * triggers (e.g. award_item cascading to item_acquired) recurse through this
 * guard to prevent infinite loops from misauthored quests.
 */
export const MAX_TRIGGER_DEPTH = 10;

export interface EvaluationContext {
  questId: string;
  stepId: string;
  promptValue?: string;
  inventorySnapshot: {
    slots: ReadonlyArray<{ itemId: string; quantity: number }>;
  };
  trustSnapshot: Readonly<Record<string, number>>;
  variables: Readonly<Record<string, unknown>>;
  unlockedWorlds: ReadonlyArray<string>;
  completedSteps: Readonly<Record<string, ReadonlyArray<string>>>;
}

export interface QuestTransitionResult {
  matched: boolean;
  reason?: 'no_match' | 'condition_failed' | 'step_out_of_range';
  nextStepIndex: number;
  effectsToApply: ReadonlyArray<Effect>;
}

export function matchesTrigger(stepTrigger: Trigger, firedTrigger: Trigger): boolean {
  if (stepTrigger.type !== firedTrigger.type) return false;
  switch (stepTrigger.type) {
    case 'npc_interact':
      return (
        firedTrigger.type === 'npc_interact' &&
        firedTrigger.npcId === stepTrigger.npcId
      );
    case 'prompt_submitted':
      return (
        firedTrigger.type === 'prompt_submitted' &&
        firedTrigger.slot === stepTrigger.slot
      );
    case 'cinematic_complete':
      return (
        firedTrigger.type === 'cinematic_complete' &&
        firedTrigger.key === stepTrigger.key
      );
    case 'zone_enter':
      return (
        firedTrigger.type === 'zone_enter' &&
        firedTrigger.zoneId === stepTrigger.zoneId
      );
    case 'zone_exit':
      return (
        firedTrigger.type === 'zone_exit' &&
        firedTrigger.zoneId === stepTrigger.zoneId
      );
    case 'item_acquired':
      return (
        firedTrigger.type === 'item_acquired' &&
        firedTrigger.itemId === stepTrigger.itemId
      );
    case 'quest_complete':
      return (
        firedTrigger.type === 'quest_complete' &&
        firedTrigger.questId === stepTrigger.questId
      );
    case 'timer_elapsed':
      return (
        firedTrigger.type === 'timer_elapsed' &&
        firedTrigger.ms === stepTrigger.ms
      );
    case 'dialogue_node_reached':
      return (
        firedTrigger.type === 'dialogue_node_reached' &&
        firedTrigger.dialogueId === stepTrigger.dialogueId &&
        firedTrigger.nodeId === stepTrigger.nodeId
      );
    default: {
      const exhaustive: never = stepTrigger;
      void exhaustive;
      return false;
    }
  }
}

export function evaluateCondition(
  condition: Condition | undefined,
  ctx: EvaluationContext,
): boolean {
  if (!condition) return true;
  if (condition.minChars !== undefined) {
    const len = ctx.promptValue ? ctx.promptValue.length : 0;
    if (len < condition.minChars) return false;
  }
  if (condition.hasItem) {
    const { itemId, minQuantity } = condition.hasItem;
    const needed = typeof minQuantity === 'number' ? minQuantity : 1;
    const slot = ctx.inventorySnapshot.slots.find(
      (s) => s.itemId === itemId,
    );
    const have = slot ? slot.quantity : 0;
    if (have < needed) return false;
  }
  if (condition.trustAtLeast) {
    const cur = ctx.trustSnapshot[condition.trustAtLeast.npcId] ?? 0;
    if (cur < condition.trustAtLeast.value) return false;
  }
  if (condition.stepComplete) {
    const done = ctx.completedSteps[condition.stepComplete.questId];
    if (!done || !done.includes(condition.stepComplete.stepId)) return false;
  }
  if (condition.worldUnlocked) {
    if (!ctx.unlockedWorlds.includes(condition.worldUnlocked)) return false;
  }
  if (condition.expression) {
    if (!evaluateExpression(condition.expression, ctx)) return false;
  }
  return true;
}

export function transition(
  quest: Quest,
  currentStepIndex: number,
  firedTrigger: Trigger,
  ctx: EvaluationContext,
): QuestTransitionResult {
  if (currentStepIndex < 0 || currentStepIndex >= quest.steps.length) {
    return {
      matched: false,
      reason: 'step_out_of_range',
      nextStepIndex: currentStepIndex,
      effectsToApply: [],
    };
  }
  const step: Step = quest.steps[currentStepIndex]!;
  if (!matchesTrigger(step.trigger, firedTrigger)) {
    return {
      matched: false,
      reason: 'no_match',
      nextStepIndex: currentStepIndex,
      effectsToApply: [],
    };
  }
  if (!evaluateCondition(step.condition, ctx)) {
    return {
      matched: false,
      reason: 'condition_failed',
      nextStepIndex: currentStepIndex,
      effectsToApply: [],
    };
  }
  return {
    matched: true,
    nextStepIndex: currentStepIndex + 1,
    effectsToApply: step.effects,
  };
}

export function isEligible(
  quest: Quest,
  completedQuestIds: ReadonlyArray<string>,
  inventorySlots: ReadonlyArray<{ itemId: string; quantity: number }>,
  trust: Readonly<Record<string, number>>,
): boolean {
  for (const prereqId of quest.prerequisites.completedQuests) {
    if (!completedQuestIds.includes(prereqId)) return false;
  }
  for (const reqItem of quest.prerequisites.items) {
    const have = inventorySlots.find((s) => s.itemId === reqItem);
    if (!have || have.quantity < 1) return false;
  }
  for (const [npcId, minVal] of Object.entries(quest.prerequisites.trust)) {
    if ((trust[npcId] ?? 0) < minVal) return false;
  }
  return true;
}

/**
 * Narrow DSL evaluator for `condition.expression`. Supports:
 *   trust.<npcId> <op> <number>      op in >=, <=, >, <, ==, !=
 *   hasItem.<itemId>                 truthy when quantity >= 1
 *   worldUnlocked.<worldId>          truthy when world id is in unlockedWorlds
 *   variable.<name>                  truthy when variable present and non-null
 * Unresolvable expressions return false per contract Section 8. No `new Function`,
 * no `eval`, no jsep dependency. Post-hackathon upgrade to jsep is documented
 * in docs/nyx.decisions.md.
 */
function evaluateExpression(expr: string, ctx: EvaluationContext): boolean {
  const trimmed = expr.trim();
  if (!trimmed) return true;
  const trustMatch = trimmed.match(
    /^trust\.([A-Za-z0-9_]+)\s*(>=|<=|==|!=|>|<)\s*(-?\d+(?:\.\d+)?)$/,
  );
  if (trustMatch) {
    const [, npcId, op, valStr] = trustMatch as unknown as [string, string, string, string];
    const lhs = ctx.trustSnapshot[npcId] ?? 0;
    const rhs = Number(valStr);
    return compare(lhs, op, rhs);
  }
  const hasItemMatch = trimmed.match(/^hasItem\.([A-Za-z0-9_]+)$/);
  if (hasItemMatch) {
    const [, itemId] = hasItemMatch as unknown as [string, string];
    return ctx.inventorySnapshot.slots.some(
      (s) => s.itemId === itemId && s.quantity > 0,
    );
  }
  const worldMatch = trimmed.match(/^worldUnlocked\.([A-Za-z0-9_]+)$/);
  if (worldMatch) {
    const [, worldId] = worldMatch as unknown as [string, string];
    return ctx.unlockedWorlds.includes(worldId);
  }
  const variableMatch = trimmed.match(/^variable\.([A-Za-z0-9_]+)$/);
  if (variableMatch) {
    const [, name] = variableMatch as unknown as [string, string];
    const v = ctx.variables[name];
    return v !== undefined && v !== null && v !== false;
  }
  return false;
}

function compare(lhs: number, op: string, rhs: number): boolean {
  switch (op) {
    case '>=':
      return lhs >= rhs;
    case '<=':
      return lhs <= rhs;
    case '>':
      return lhs > rhs;
    case '<':
      return lhs < rhs;
    case '==':
      return lhs === rhs;
    case '!=':
      return lhs !== rhs;
    default:
      return false;
  }
}

/**
 * Lightweight in-process bus for cross-store effect dispatch. Store actions
 * emit here. Consumers that bridge into Phaser `game.events` or Zustand
 * inventoryStore subscribe via `on`. Tests subscribe for assertion. In a
 * browser with a bridge mounted, the bridge forwards to game.events per
 * game_event_bus.contract.md Section 5.
 */
export type QuestEffectBusPayload = {
  effect: Effect;
  context: { questId: string; stepId: string };
};

type Listener = (payload: QuestEffectBusPayload) => void;

class QuestEffectBus {
  private listeners = new Set<Listener>();

  emit(payload: QuestEffectBusPayload): void {
    for (const listener of this.listeners) {
      try {
        listener(payload);
      } catch (err) {
        console.error('[questEffectBus] listener threw', err);
      }
    }
  }

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  reset(): void {
    this.listeners.clear();
  }
}

export const questEffectBus = new QuestEffectBus();

/**
 * Synchronous quest loader. The vertical slice ships a single quest JSON
 * (`lumio_onboarding.json`) statically imported; post-hackathon this expands
 * to glob-style discovery once Marketplace quest packs arrive.
 *
 * Validation throws `QuestSchemaError` on zod failure; caller (bootstrap code)
 * halts the app with a diagnostic so malformed JSON never ships silent.
 */
export function loadAllQuestsSync(): Quest[] {
  const parsed = QuestSchema.parse(rawLumioOnboarding);
  return [parsed];
}

export async function loadAllQuests(): Promise<Quest[]> {
  return loadAllQuestsSync();
}
