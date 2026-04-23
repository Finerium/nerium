'use client';
//
// src/components/AudioInitGate.tsx
//
// Browser autoplay policy gate. Renders a compact overlay prompt on first
// mount until a user gesture unlocks the audio context. On click, calls
// audioEngine.unlock(), then disappears. Subsequent mounts honor the
// initialized flag on audioStore so the gate does not re-appear.
//
// Owner: Euterpe.
// Hard constraint per docs/phase_rv/RV_NERIUM_AGENT_STRUCTURE_v2.md Section
// 4.7: first-load audio must be user-gesture-gated per the HTML Living
// Standard autoplay policy. Howler.autoUnlock is a defense-in-depth layer on
// top of this gate, not a substitute; the visible prompt is what prevents
// silent demo surprises on reviewer laptops.
//

import { useEffect, useState } from 'react';
import { audioEngine } from '../lib/audioEngine';
import { useAudioStore } from '../stores/audioStore';

interface AudioInitGateProps {
  label?: string;
  subtitle?: string;
}

export default function AudioInitGate({
  label = 'Tap to enable audio',
  subtitle = 'Browsers block autoplay until the first click or key.',
}: AudioInitGateProps) {
  const initialized = useAudioStore((s) => s.initialized);
  const [dismissed, setDismissed] = useState(initialized);

  useEffect(() => {
    if (initialized) setDismissed(true);
  }, [initialized]);

  useEffect(() => {
    if (initialized) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleUnlock();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized]);

  function handleUnlock() {
    audioEngine.unlock();
    setDismissed(true);
  }

  if (dismissed || initialized) return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Enable audio"
      className="audio-init-gate"
      onClick={handleUnlock}
    >
      <button
        type="button"
        className="audio-init-gate__button"
        onClick={(e) => {
          e.stopPropagation();
          handleUnlock();
        }}
      >
        <span className="audio-init-gate__label">{label}</span>
        <span className="audio-init-gate__subtitle">{subtitle}</span>
      </button>
    </div>
  );
}
