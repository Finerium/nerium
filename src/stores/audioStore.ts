/**
 * Audio state store.
 *
 * Contract: docs/contracts/game_state.contract.md v0.1.0 Section 3.5 (audioStore).
 * Owner: Euterpe.
 *
 * Zustand with subscribeWithSelector middleware per contract Section 4. Stores
 * master plus per-category volumes, muted flag, and the active ambient loop
 * id. All volume setters clamp to the closed interval [0, 1]; non-finite input
 * is coerced to zero per contract Section 8.
 *
 * Side effects (Howler playback, cross-fade, bus subscription) live in
 * src/lib/audioEngine.ts; this store only holds reactive state that HUD
 * components and the engine subscribe to. The engine mirrors volume plus mute
 * changes into Howler globals via its subscription in syncFromStore.
 *
 * The playAmbient, stopAmbient, and playOneShot actions defined by the
 * contract are intent signals rather than side-effect drivers: the engine
 * subscribes to currentAmbient changes and starts or stops Howler instances
 * accordingly. playOneShot is retained as an API-compatible escape hatch that
 * forwards to the engine when imported from the same module boundary.
 */

'use client';

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { AmbientLoopId } from '../state/types';

function clampVolume(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

export interface AudioStoreState {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  ambientVolume: number;
  muted: boolean;
  currentAmbient: AmbientLoopId | null;
  musicFadeInMs: number;
  musicFadeOutMs: number;
  initialized: boolean;
}

export interface AudioStoreActions {
  setMasterVolume: (v: number) => void;
  setMusicVolume: (v: number) => void;
  setSfxVolume: (v: number) => void;
  setAmbientVolume: (v: number) => void;
  toggleMute: () => void;
  setMuted: (muted: boolean) => void;
  playAmbient: (loopId: AmbientLoopId) => void;
  stopAmbient: () => void;
  playOneShot: (sfxKey: string) => void;
  markInitialized: () => void;
  resetForNewSession: () => void;
}

export type AudioStore = AudioStoreState & AudioStoreActions;

const DEFAULT_STATE: AudioStoreState = {
  masterVolume: 0.8,
  musicVolume: 0.6,
  sfxVolume: 0.7,
  ambientVolume: 0.5,
  muted: false,
  currentAmbient: null,
  musicFadeInMs: 800,
  musicFadeOutMs: 600,
  initialized: false,
};

type OneShotListener = (sfxKey: string) => void;
const oneShotListeners = new Set<OneShotListener>();

export function registerOneShotListener(listener: OneShotListener): () => void {
  oneShotListeners.add(listener);
  return () => {
    oneShotListeners.delete(listener);
  };
}

export const useAudioStore = create<AudioStore>()(
  subscribeWithSelector((set) => ({
    ...DEFAULT_STATE,
    setMasterVolume: (v) => set({ masterVolume: clampVolume(v) }),
    setMusicVolume: (v) => set({ musicVolume: clampVolume(v) }),
    setSfxVolume: (v) => set({ sfxVolume: clampVolume(v) }),
    setAmbientVolume: (v) => set({ ambientVolume: clampVolume(v) }),
    toggleMute: () => set((s) => ({ muted: !s.muted })),
    setMuted: (muted) => set({ muted }),
    playAmbient: (loopId) => set({ currentAmbient: loopId }),
    stopAmbient: () => set({ currentAmbient: null }),
    playOneShot: (sfxKey) => {
      if (oneShotListeners.size === 0) {
        console.warn('[audioStore] playOneShot invoked before engine attached', sfxKey);
        return;
      }
      oneShotListeners.forEach((listener) => {
        try {
          listener(sfxKey);
        } catch (err) {
          console.error('[audioStore] oneShot listener threw', err);
        }
      });
    },
    markInitialized: () => set({ initialized: true }),
    resetForNewSession: () => set({ ...DEFAULT_STATE }),
  })),
);

export function getEffectiveVolume(category: 'music' | 'sfx' | 'ambient'): number {
  const state = useAudioStore.getState();
  if (state.muted) return 0;
  const categoryVolume =
    category === 'music'
      ? state.musicVolume
      : category === 'ambient'
        ? state.ambientVolume
        : state.sfxVolume;
  return clampVolume(state.masterVolume * categoryVolume);
}
