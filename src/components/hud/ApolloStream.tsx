'use client';

//
// src/components/hud/ApolloStream.tsx
//
// Erato-v2 wrapper over the Talos-translator ported
// `src/components/hud/ported/ApolloStream.tsx` skeleton. The ported skeleton
// is presentation-only; this wrapper supplies the session prop via narrow
// selectors over `useDialogueStore` and wires `onAcknowledgeWarning` plus
// `onReviseWarning` to Zustand store actions (gotcha 3: no prop drilling,
// gotcha 5: no window dispatch).
//
// The HUD-level Apollo stream surfaces two kinds of content:
//   1. Active dialogue stream (typewriter buffer) while `streaming === true`.
//   2. A placeholder message when no dialogue is active so the cell never
//      reads as broken during demo-facing idle moments.
//
// The ported skeleton expects an `AdvisorSession`. In W3 the game does not
// yet persist a full `AdvisorSession` so we synthesize a minimum session
// object from `dialogueStore` state. When the Apollo backend lands a real
// session object during live stream, the synthesized session is replaced
// with a selector over `useAdvisorStore` (deferred post-hackathon per
// Apollo roadmap; tracked in docs/erato-v2.decisions.md ADR-0004).
//

import { useMemo } from 'react';
import type { ReactNode } from 'react';

import PortedApolloStream from './ported/ApolloStream';
import type {
  AdvisorSession,
  AdvisorTurn,
  Locale,
  WorldAesthetic,
  ModelStrategy,
} from '../../../app/advisor/apollo';
import { useDialogueStore } from '../../stores/dialogueStore';
import { useUIPreferencesStore } from '../../stores/uiStore';
import { useT } from '../../lib/i18n';

export interface ApolloStreamWrapperProps {
  pipelineVizSlot?: ReactNode;
  blueprintRevealSlot?: ReactNode;
  onAcknowledgeWarning?: (warningId: string) => void;
  onReviseWarning?: (warningId: string) => void;
}

function buildSyntheticSession(
  locale: Locale,
  worldAesthetic: WorldAesthetic,
  activeModelStrategy: ModelStrategy,
  streamBuffer: string,
  streaming: boolean,
): AdvisorSession {
  const turns: AdvisorTurn[] = [];
  if (streaming || streamBuffer.length > 0) {
    turns.push({
      turn_id: 'hud-synthetic-current',
      role: 'advisor',
      content: streamBuffer.length > 0 ? streamBuffer : '...',
      question_count: 0,
      rendered_at: new Date().toISOString(),
    });
  }
  return {
    session_id: 'hud-synthetic-session',
    locale,
    active_model_strategy: activeModelStrategy,
    active_world_aesthetic: worldAesthetic,
    turns,
  };
}

export function ApolloStream({
  pipelineVizSlot,
  blueprintRevealSlot,
  onAcknowledgeWarning,
  onReviseWarning,
}: ApolloStreamWrapperProps) {
  const streaming = useDialogueStore((s) => s.streaming);
  const streamBuffer = useDialogueStore((s) => s.streamBuffer);
  const language = useUIPreferencesStore((s) => s.language);
  const modelChoice = useUIPreferencesStore((s) => s.modelChoice);
  const t = useT();

  const activeModelStrategy: ModelStrategy =
    modelChoice === 'opus-4-7' ? 'opus_all' : 'collaborative';

  const session = useMemo(
    () =>
      buildSyntheticSession(
        language,
        'medieval_desert',
        activeModelStrategy,
        streamBuffer,
        streaming,
      ),
    [language, activeModelStrategy, streamBuffer, streaming],
  );

  if (session.turns.length === 0) {
    return (
      <section
        className="font-mono text-[11px] text-foreground/60"
        aria-label="Apollo stream idle"
        data-hud-role="apollo-stream-idle"
      >
        {t('apollo.stream_empty')}
      </section>
    );
  }

  return (
    <PortedApolloStream
      session={session}
      isAwaitingAdvisorTurn={streaming}
      pipelineVizSlot={pipelineVizSlot}
      blueprintRevealSlot={blueprintRevealSlot}
      onAcknowledgeWarning={onAcknowledgeWarning}
      onReviseWarning={onReviseWarning}
    />
  );
}

export default ApolloStream;
