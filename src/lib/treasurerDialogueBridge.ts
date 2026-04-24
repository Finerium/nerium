//
// src/lib/treasurerDialogueBridge.ts
//
// Owner: Marshall (W2 NP P6 S2).
//
// Wires the treasurer NPC to the Linus dialogue runtime + adds the
// "Open pricing scrolls" navigation hop. Two responsibilities:
//
//   1. NPC interact -> dialogue open
//      The Thalia-v2 NPC class emits `game.npc.interact` with the npcId.
//      The shipped gameBridge routes that emission into questStore.
//      fireTrigger, which is a no-op for npcs that have no matching active
//      quest step (treasurer is intentionally NOT inside lumio_onboarding).
//      This bridge subscribes to the same window CustomEvent surface used
//      by Linus dialogueBridge + Thalia BusBridge. When `npc.interact`
//      with npcId === 'treasurer' fires, we open the treasurer_greet
//      dialogue with seeded vars: { tier, pricing_live }. Tier comes from
//      the Marshall S1 useTierStore. The pricing_live flag is hydrated by
//      a one-shot fetch against /v1/me/flags when the bridge first wires.
//
//   2. Pricing-open emit_event -> Next.js navigation
//      Treasurer dialogue choices fire `emit_event nerium.pricing.open`.
//      The gameBridge questEffectBus translates emit_event into a typed
//      bus emission, which is invisible to React. This bridge observes
//      the dialogue-side `game.dialogue.effect_pending` window event for
//      effects of that exact name and triggers a navigation to /pricing.
//      Navigation uses window.location.assign so it lands cleanly inside
//      a fresh history entry (back returns to /play).
//
// Why a separate file: gameBridge is owned by Thalia-v2 and quest-effect
// fan-out lives there; the npcId -> dialogueId map is a Marshall concern
// because it depends on dialogue authorship + tier state. Keeping the
// wiring local prevents cross-pillar coupling drift.
//
// No em dash, no emoji.
//

import { useTierStore } from '../hooks/useSubscriptionTier';
import { useDialogueStore } from '../stores/dialogueStore';

export type NpcId = string;

// Map from npcId -> dialogueId. Extension point for future NPCs that
// own dialogue but no quest step. Marshall ships only the treasurer in
// W2; subsequent agents (Helios-v2, Boreas) extend this map.
const NPC_DIALOGUE_MAP: Record<NpcId, string> = {
  treasurer: 'treasurer_greet',
};

const PRICING_OPEN_EVENT = 'nerium.pricing.open';
const PRICING_ROUTE = '/pricing';

interface TreasurerBridgeHandle {
  teardown: () => void;
}

let activeHandle: TreasurerBridgeHandle | null = null;
let pricingLiveCache: boolean | null = null;
let pricingFlagFetchInFlight: Promise<boolean> | null = null;

async function fetchPricingLive(): Promise<boolean> {
  if (pricingLiveCache !== null) return pricingLiveCache;
  if (pricingFlagFetchInFlight) return pricingFlagFetchInFlight;
  pricingFlagFetchInFlight = (async () => {
    try {
      const resp = await fetch('/v1/me/flags', {
        credentials: 'include',
        headers: { accept: 'application/json' },
      });
      if (!resp.ok) {
        // Default to true so the treasurer always has an actionable path.
        pricingLiveCache = true;
        return true;
      }
      const data = (await resp.json()) as {
        flags?: Array<{ flag_name: string; value: unknown }>;
      };
      const hit = data.flags?.find((f) => f.flag_name === 'pricing.page.live');
      const value = !hit ? true : hit.value !== false;
      pricingLiveCache = value;
      return value;
    } catch {
      pricingLiveCache = true;
      return true;
    } finally {
      pricingFlagFetchInFlight = null;
    }
  })();
  return pricingFlagFetchInFlight;
}

function openTreasurerDialogue(): void {
  const tier = useTierStore.getState().tier;
  const pricingLive = pricingLiveCache ?? true;
  useDialogueStore
    .getState()
    .openDialogue('treasurer_greet', undefined, {
      tier,
      pricing_live: pricingLive,
    });
}

function readEnvelope(evt: Event): { topic: string; payload?: Record<string, unknown> } | null {
  const detail = (evt as CustomEvent).detail;
  if (!detail || typeof detail !== 'object') return null;
  const topic = (detail as { topic?: unknown }).topic;
  if (typeof topic !== 'string') return null;
  const payload = (detail as { payload?: unknown }).payload;
  return {
    topic,
    payload:
      payload && typeof payload === 'object'
        ? (payload as Record<string, unknown>)
        : undefined,
  };
}

function navigateToPricing(): void {
  if (typeof window === 'undefined') return;
  // Use assign so the back button returns to the game scene; replace
  // would erase the play state from history.
  window.location.assign(PRICING_ROUTE);
}

export function wireTreasurerBridge(): TreasurerBridgeHandle {
  if (activeHandle) return activeHandle;

  // Hydrate the pricing flag in the background so the first treasurer
  // open already knows whether to route to the coming_soon branch.
  void fetchPricingLive();

  const handle = (evt: Event) => {
    const env = readEnvelope(evt);
    if (!env) return;
    if (env.topic === 'game.npc.interact') {
      const npcId = (env.payload?.npcId as string | undefined) ?? null;
      if (!npcId) return;
      const dialogueId = NPC_DIALOGUE_MAP[npcId];
      if (!dialogueId) return;
      // Refresh the flag opportunistically so a long-lived game session
      // picks up flag toggles without a page reload.
      void fetchPricingLive().then(() => openTreasurerDialogue());
      // Open immediately with the cached value too so the dialogue does
      // not visibly wait for a network round trip on warm sessions.
      if (pricingLiveCache !== null) openTreasurerDialogue();
      return;
    }
    if (env.topic === 'game.dialogue.effect_pending') {
      const effect = env.payload?.effect as
        | { type?: string; eventName?: string }
        | undefined;
      if (!effect) return;
      if (
        effect.type === 'emit_event' &&
        effect.eventName === PRICING_OPEN_EVENT
      ) {
        navigateToPricing();
      }
      return;
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('__NERIUM_GAME_EVENT__', handle);
  }

  activeHandle = {
    teardown: () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('__NERIUM_GAME_EVENT__', handle);
      }
      activeHandle = null;
    },
  };
  return activeHandle;
}

// Test affordance: clear cached flag so unit / e2e tests can flip the
// soft-launch state between cases without remounting the bridge.
export function __resetTreasurerBridgeForTests(): void {
  pricingLiveCache = null;
  pricingFlagFetchInFlight = null;
  if (activeHandle) {
    activeHandle.teardown();
  }
}
