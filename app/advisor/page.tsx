'use client';
//
// app/advisor/page.tsx
//
// Nemea Phase 5 QA emergency harness (2026-04-22). Renders the Erato
// AdvisorChat with a minimal demo session. Callbacks wired to local state
// so the surface is interactive; the returned advisor turn is a canned
// response so the demo remains offline and honest-claim compliant.
//

import { useCallback, useState } from 'react';
import AdvisorChat from './ui/AdvisorChat';
import type {
  AdvisorSession,
  AdvisorTurn,
  Locale,
  ModelStrategy,
  WorldAesthetic,
} from './apollo';
import { HarnessShell } from '../_harness/HarnessShell';
import { themeRuntime } from '../shared/design/theme_runtime';

const INITIAL_SESSION: AdvisorSession = {
  session_id: 'session_demo_advisor',
  locale: 'en-US',
  active_model_strategy: 'collaborative',
  active_world_aesthetic: 'cyberpunk_shanghai',
  turns: [
    {
      turn_id: 'turn_welcome',
      role: 'advisor',
      content:
        'Tell me in one sentence what you want to build. Examples or constraints optional.',
      question_count: 0,
      rendered_at: '2026-04-22T10:00:00.000Z',
    },
  ],
  active_pipeline_run_id: undefined,
  user_intent_summary: undefined,
};

function canned(
  content: string,
  attached?: AdvisorTurn['attached_components'],
): AdvisorTurn {
  return {
    turn_id: `turn_${Math.random().toString(36).slice(2, 10)}`,
    role: 'advisor',
    content,
    question_count: (content.match(/\?/g) ?? []).length,
    rendered_at: new Date().toISOString(),
    attached_components: attached,
  };
}

export default function AdvisorPage() {
  const [session, setSession] = useState<AdvisorSession>(INITIAL_SESSION);
  const [awaiting, setAwaiting] = useState(false);

  const onUserTurnSubmit = useCallback(async (content: string) => {
    const userTurn: AdvisorTurn = {
      turn_id: `turn_${Math.random().toString(36).slice(2, 10)}`,
      role: 'user',
      content,
      question_count: (content.match(/\?/g) ?? []).length,
      rendered_at: new Date().toISOString(),
    };
    setSession((prev) => ({ ...prev, turns: [...prev.turns, userTurn] }));
    setAwaiting(true);
    await new Promise((r) => setTimeout(r, 550));
    const reply = canned(
      'Understood. Demo session stops here. In the full Builder flow the Advisor would now kick off pillar leads, open the pipeline visualizer, and surface the first prediction warning.',
    );
    setSession((prev) => ({ ...prev, turns: [...prev.turns, reply] }));
    setAwaiting(false);
  }, []);

  const onLocaleToggle = useCallback(async (next: Locale) => {
    setSession((prev) => ({ ...prev, locale: next }));
  }, []);

  const onStrategyChange = useCallback(async (next: ModelStrategy) => {
    setSession((prev) => ({ ...prev, active_model_strategy: next }));
  }, []);

  const onWorldAestheticChange = useCallback(
    async (next: WorldAesthetic) => {
      setSession((prev) => ({ ...prev, active_world_aesthetic: next }));
      themeRuntime.applyWorld(next);
    },
    [],
  );

  return (
    <HarnessShell
      heading="Advisor"
      sub="The single conversational surface above every pillar. Demo session is offline; replies are canned. Model strategy and world pills are interactive."
    >
      <AdvisorChat
        session={session}
        onUserTurnSubmit={onUserTurnSubmit}
        onLocaleToggle={onLocaleToggle}
        onStrategyChange={onStrategyChange}
        onWorldAestheticChange={onWorldAestheticChange}
        isAwaitingAdvisorTurn={awaiting}
      />
    </HarnessShell>
  );
}
