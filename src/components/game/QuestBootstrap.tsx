'use client';
//
// src/components/game/QuestBootstrap.tsx
//
// Client Component that closes the Epimetheus W0 B1 and B2 gaps:
//
//   B1. On first mount, invoke useQuestStore.getState().autostartFromCatalog()
//       so quests marked autostart:true in the catalog promote into
//       activeQuests before the first NPC interact fires. Without this call
//       the lumio_onboarding quest stays dormant and every fireTrigger from
//       the bridge becomes a no-op.
//
//   B2. On the same mount, register the dialogue definitions the game scripts
//       open at runtime. DialogueOverlay calls getDialogue(id) inside its
//       render path; an empty registry short-circuits to null and no overlay
//       ever surfaces.
//
// This component renders nothing. It is mounted above GameHUD inside
// GameShell so the bootstrap side-effects run before PhaserCanvas finishes
// its dynamic import and boots the first scene.
//
// Registration is idempotent via a module-level flag. Strict Mode double
// mount and hot-reload both skip the second invocation so autostart does
// not double-queue active quests.
//

import { useEffect } from 'react';

import apolloIntroJson from '../../data/dialogues/apollo_intro.json';
import caravanVendorGreetJson from '../../data/dialogues/caravan_vendor_greet.json';
import treasurerGreetJson from '../../data/dialogues/treasurer_greet.json';
import { parseDialogue } from '../../data/dialogues/_schema';
import { registerDialogues } from '../../stores/dialogueStore';
import { useQuestStore } from '../../stores/questStore';
import { wireTreasurerBridge } from '../../lib/treasurerDialogueBridge';
import { useTierStore } from '../../hooks/useSubscriptionTier';

let bootstrapped = false;

export default function QuestBootstrap() {
  useEffect(() => {
    if (bootstrapped) return;
    bootstrapped = true;

    try {
      registerDialogues([
        parseDialogue(apolloIntroJson, 'apollo_intro'),
        parseDialogue(caravanVendorGreetJson, 'caravan_vendor_greet'),
        parseDialogue(treasurerGreetJson, 'treasurer_greet'),
      ]);
    } catch (err) {
      console.error('[QuestBootstrap] dialogue registration failed', err);
      bootstrapped = false;
      return;
    }

    try {
      useQuestStore.getState().autostartFromCatalog();
    } catch (err) {
      console.error('[QuestBootstrap] quest autostart failed', err);
    }

    // Marshall W2 P6 S2: treasurer NPC -> dialogue bridge + pricing
    // navigation hop. This is purely additive and lives outside the
    // Thalia-v2-owned gameBridge so it stays editable from Marshall
    // territory without touching cross-pillar wiring.
    let treasurerHandle: { teardown: () => void } | null = null;
    try {
      treasurerHandle = wireTreasurerBridge();
    } catch (err) {
      console.error('[QuestBootstrap] treasurer bridge wire failed', err);
    }

    // Hydrate the subscription tier on first mount so the HUD tier
    // badge + treasurer dialogue both render with the live value
    // instead of the default-free fallback.
    try {
      void useTierStore.getState().refresh();
    } catch (err) {
      console.error('[QuestBootstrap] tier refresh failed', err);
    }

    return () => {
      treasurerHandle?.teardown();
    };
  }, []);

  return null;
}
