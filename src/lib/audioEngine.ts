/**
 * Howler.js wrapper for NERIUM Revision audio.
 *
 * Contract: docs/contracts/game_event_bus.contract.md v0.1.0 Section 3 audio
 * topics plus docs/contracts/game_state.contract.md v0.1.0 Section 3.5
 * audioStore.
 * Owner: Euterpe.
 *
 * Responsibilities:
 *   - Lazy-instantiate Howl objects for every cue declared in cues.json.
 *   - Route category volumes (master times sfx, master times music, master
 *     times ambient) through Howler on every audioStore change.
 *   - Autoplay-policy gate: Howler.autoUnlock handles the common path, but
 *     AudioInitGate mounts an explicit user-gesture overlay that calls
 *     audioEngine.unlock before the first ambient starts; unlock is idempotent.
 *   - Cross-fade ambient swaps at 200 ms minimum to prevent audible seam.
 *   - Clean up on scene shutdown: stopAmbient stops the current Howl id,
 *     detachBus unsubscribes from game.events, dispose unloads every Howl.
 *   - Type-only imports of GameEventBus per gotcha 17 (avoid circular import
 *     into state module while still participating in the bus protocol).
 *
 * What this module does NOT do:
 *   - Synthesize audio (no Web Audio API oscillator nodes; curate CC0 only).
 *   - Dispatch window.dispatchEvent('nerium:*') events (gotcha 5).
 *   - Mutate audioStore directly beyond markInitialized; volume plus mute
 *     flow the other direction (store to engine).
 */

'use client';

import { Howl, Howler } from 'howler';

import cuesData from '../data/audio/cues.json';
import {
  getEffectiveVolume,
  registerOneShotListener,
  useAudioStore,
} from '../stores/audioStore';
import type { GameEventBus } from '../state/GameEventBus';
import type { GameEventTopic } from '../state/game_events';

export type CueCategory = 'sfx' | 'music' | 'ambient';

export interface CueConfig {
  src: string;
  sourceFile?: string;
  baseVolume: number;
  loop: boolean;
  category: CueCategory;
  html5?: boolean;
  throttleMs?: number;
}

interface CueFile {
  defaults?: { preload?: boolean; html5?: boolean };
  cues: Record<string, CueConfig>;
  ambientLoopIdMap: Record<string, string>;
  eventRouting: Array<Record<string, unknown>>;
}

const CROSS_FADE_MS = 200;
const DEFAULT_AMBIENT_FADE_IN_MS = 800;
const DEFAULT_AMBIENT_FADE_OUT_MS = 600;

class AudioEngine {
  private readonly data: CueFile;
  private readonly howls = new Map<string, Howl>();
  private currentAmbient: { cueName: string; howl: Howl; soundId: number } | null = null;
  private initialized = false;
  private busUnsubscribers: Array<() => void> = [];
  private storeUnsubscribe: (() => void) | null = null;
  private oneShotUnsubscribe: (() => void) | null = null;
  private throttleMarks = new Map<string, number>();

  constructor() {
    this.data = cuesData as unknown as CueFile;
  }

  /**
   * Idempotent unlock after user gesture. Safe to call from AudioInitGate
   * onClick or from the first emit; subsequent calls are no-ops.
   */
  unlock(): void {
    if (this.initialized) return;
    this.initialized = true;
    Howler.autoUnlock = true;
    this.applyGlobalVolume();
    this.applyGlobalMute();
    this.subscribeStore();
    this.attachOneShotListener();
    useAudioStore.getState().markInitialized();
  }

  /**
   * Play a one-shot cue by name. Sfx plus music categories route here.
   * Ambient loops should flow through playAmbient for fade handling.
   */
  play(cueName: string, volumeOverride?: number): void {
    if (!this.initialized) {
      this.unlock();
    }
    const cfg = this.data.cues[cueName];
    if (!cfg) {
      console.warn(`[audioEngine] unknown cue ${cueName}`);
      return;
    }
    if (cfg.category === 'ambient') {
      this.playAmbient(cueName);
      return;
    }
    if (!this.shouldEmit(cueName, cfg)) return;
    const howl = this.getHowl(cueName, cfg);
    const effective = getEffectiveVolume(cfg.category);
    const base = typeof volumeOverride === 'number' ? volumeOverride : cfg.baseVolume;
    const mix = clamp01(effective * base);
    if (mix <= 0) return;
    const id = howl.play();
    howl.volume(mix, id);
  }

  /**
   * Swap ambient loop. Cross-fade 200 ms minimum to avoid audible seam.
   * loopId accepts either a cue name (apollo-village-loop) or an
   * AmbientLoopId alias mapped in cues.json ambientLoopIdMap.
   */
  playAmbient(loopId: string, fadeInMs: number = DEFAULT_AMBIENT_FADE_IN_MS): void {
    if (!this.initialized) {
      this.unlock();
    }
    const cueName = this.resolveAmbientCue(loopId);
    if (!cueName) {
      console.warn(`[audioEngine] unknown ambient loop ${loopId}`);
      return;
    }
    const cfg = this.data.cues[cueName];
    if (!cfg || cfg.category !== 'ambient') {
      console.warn(`[audioEngine] ambient cue mismatch for ${cueName}`);
      return;
    }
    if (this.currentAmbient && this.currentAmbient.cueName === cueName) {
      return;
    }
    const fadeIn = Math.max(CROSS_FADE_MS, fadeInMs);
    const next = this.getHowl(cueName, cfg);
    const targetVolume = clamp01(getEffectiveVolume('ambient') * cfg.baseVolume);
    const nextId = next.play();
    next.volume(0, nextId);
    next.loop(true, nextId);
    next.fade(0, targetVolume, fadeIn, nextId);

    const prior = this.currentAmbient;
    this.currentAmbient = { cueName, howl: next, soundId: nextId };

    if (prior) {
      const currentVolume = prior.howl.volume(prior.soundId) as number;
      const fadeOut = Math.max(CROSS_FADE_MS, DEFAULT_AMBIENT_FADE_OUT_MS);
      prior.howl.fade(currentVolume, 0, fadeOut, prior.soundId);
      const priorId = prior.soundId;
      const priorHowl = prior.howl;
      setTimeout(() => {
        priorHowl.stop(priorId);
      }, fadeOut + 50);
    }
  }

  stopAmbient(fadeOutMs: number = DEFAULT_AMBIENT_FADE_OUT_MS): void {
    const prior = this.currentAmbient;
    if (!prior) return;
    this.currentAmbient = null;
    const duration = Math.max(CROSS_FADE_MS, fadeOutMs);
    const currentVolume = prior.howl.volume(prior.soundId) as number;
    prior.howl.fade(currentVolume, 0, duration, prior.soundId);
    const priorId = prior.soundId;
    const priorHowl = prior.howl;
    setTimeout(() => {
      priorHowl.stop(priorId);
    }, duration + 50);
  }

  setVolume(category: 'master' | CueCategory, value: number): void {
    const store = useAudioStore.getState();
    switch (category) {
      case 'master':
        store.setMasterVolume(value);
        break;
      case 'music':
        store.setMusicVolume(value);
        break;
      case 'sfx':
        store.setSfxVolume(value);
        break;
      case 'ambient':
        store.setAmbientVolume(value);
        break;
    }
  }

  mute(muted: boolean): void {
    useAudioStore.getState().setMuted(muted);
  }

  toggleMute(): void {
    useAudioStore.getState().toggleMute();
  }

  /**
   * Subscribe the engine to a live GameEventBus. Returns an unsubscribe
   * function tied to the bus instance. Typed via import-type so this module
   * never imports Phaser at top level.
   */
  attachBus(bus: GameEventBus): () => void {
    const routing = this.data.eventRouting;
    const subs: Array<() => void> = [];

    for (const rule of routing) {
      const topic = rule.topic as GameEventTopic;
      const handler = this.buildHandler(rule);
      const off = bus.on(topic, handler as (payload: unknown) => void);
      subs.push(off);
    }

    this.busUnsubscribers.push(...subs);
    return () => {
      for (const off of subs) off();
      this.busUnsubscribers = this.busUnsubscribers.filter((u) => !subs.includes(u));
    };
  }

  detachBus(): void {
    for (const off of this.busUnsubscribers) {
      try {
        off();
      } catch (err) {
        console.warn('[audioEngine] detachBus threw', err);
      }
    }
    this.busUnsubscribers = [];
  }

  /**
   * Tear down on page unload or provider unmount. Stops all Howls, unloads
   * cached audio buffers, and clears subscriptions. Idempotent.
   */
  dispose(): void {
    this.detachBus();
    if (this.storeUnsubscribe) {
      this.storeUnsubscribe();
      this.storeUnsubscribe = null;
    }
    if (this.oneShotUnsubscribe) {
      this.oneShotUnsubscribe();
      this.oneShotUnsubscribe = null;
    }
    if (this.currentAmbient) {
      this.currentAmbient.howl.stop(this.currentAmbient.soundId);
      this.currentAmbient = null;
    }
    for (const [, howl] of this.howls) {
      howl.stop();
      howl.unload();
    }
    this.howls.clear();
    this.throttleMarks.clear();
    this.initialized = false;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getCueConfig(cueName: string): CueConfig | undefined {
    return this.data.cues[cueName];
  }

  private getHowl(cueName: string, cfg: CueConfig): Howl {
    const existing = this.howls.get(cueName);
    if (existing) return existing;
    const preferHtml5 = cfg.html5 ?? this.data.defaults?.html5 ?? false;
    const howl = new Howl({
      src: [cfg.src],
      html5: preferHtml5,
      loop: cfg.loop,
      volume: cfg.baseVolume,
      preload: this.data.defaults?.preload ?? true,
    });
    this.howls.set(cueName, howl);
    return howl;
  }

  private shouldEmit(cueName: string, cfg: CueConfig): boolean {
    const throttleMs = cfg.throttleMs ?? 0;
    if (throttleMs <= 0) return true;
    const now = Date.now();
    const last = this.throttleMarks.get(cueName) ?? 0;
    if (now - last < throttleMs) return false;
    this.throttleMarks.set(cueName, now);
    return true;
  }

  private resolveAmbientCue(loopId: string): string | null {
    if (loopId in this.data.cues) return loopId;
    const mapped = this.data.ambientLoopIdMap[loopId];
    if (mapped && mapped in this.data.cues) return mapped;
    return null;
  }

  private subscribeStore(): void {
    if (this.storeUnsubscribe) return;
    this.storeUnsubscribe = useAudioStore.subscribe(
      (s) => ({
        masterVolume: s.masterVolume,
        musicVolume: s.musicVolume,
        sfxVolume: s.sfxVolume,
        ambientVolume: s.ambientVolume,
        muted: s.muted,
      }),
      () => {
        this.applyGlobalVolume();
        this.applyGlobalMute();
        this.refreshAmbientVolume();
      },
    );
  }

  private attachOneShotListener(): void {
    if (this.oneShotUnsubscribe) return;
    this.oneShotUnsubscribe = registerOneShotListener((sfxKey) => {
      this.play(sfxKey);
    });
  }

  private applyGlobalVolume(): void {
    const { masterVolume } = useAudioStore.getState();
    Howler.volume(clamp01(masterVolume));
  }

  private applyGlobalMute(): void {
    const { muted } = useAudioStore.getState();
    Howler.mute(muted);
  }

  private refreshAmbientVolume(): void {
    if (!this.currentAmbient) return;
    const cfg = this.data.cues[this.currentAmbient.cueName];
    if (!cfg) return;
    const target = clamp01(getEffectiveVolume('ambient') * cfg.baseVolume);
    this.currentAmbient.howl.volume(target, this.currentAmbient.soundId);
  }

  private buildHandler(rule: Record<string, unknown>): (payload: unknown) => void {
    const action = rule.action as string | undefined;
    const cue = rule.cue as string | undefined;
    const cueFrom = rule.cueFrom as string | undefined;
    const cueFromAmbientLoopId = rule.cueFromAmbientLoopId as string | undefined;
    const fadeInMsFrom = rule.fadeInMsFrom as string | undefined;
    const fadeOutMsFrom = rule.fadeOutMsFrom as string | undefined;
    const volumeOverrideFrom = rule.volumeOverrideFrom as string | undefined;
    const maxOncePerMs = rule.maxOncePerMs as number | undefined;
    const routeKey = `route:${rule.topic as string}`;

    return (payload: unknown) => {
      if (typeof maxOncePerMs === 'number' && maxOncePerMs > 0) {
        const now = Date.now();
        const last = this.throttleMarks.get(routeKey) ?? 0;
        if (now - last < maxOncePerMs) return;
        this.throttleMarks.set(routeKey, now);
      }

      if (action === 'stop_ambient') {
        const fadeOut = readNumber(payload, fadeOutMsFrom) ?? DEFAULT_AMBIENT_FADE_OUT_MS;
        this.stopAmbient(fadeOut);
        return;
      }
      if (action === 'stop_music') {
        this.stopAllMusic();
        return;
      }

      let resolvedCue: string | null = null;
      if (cueFromAmbientLoopId) {
        const loopId = readString(payload, cueFromAmbientLoopId);
        if (loopId) {
          const fadeIn = readNumber(payload, fadeInMsFrom) ?? DEFAULT_AMBIENT_FADE_IN_MS;
          this.playAmbient(loopId, fadeIn);
        }
        return;
      }
      if (cueFrom) {
        resolvedCue = readString(payload, cueFrom);
      } else if (cue) {
        resolvedCue = cue;
      }
      if (!resolvedCue) return;

      const volumeOverride = volumeOverrideFrom ? readNumber(payload, volumeOverrideFrom) : undefined;
      this.play(resolvedCue, volumeOverride);
    };
  }

  private stopAllMusic(): void {
    for (const [cueName, howl] of this.howls) {
      const cfg = this.data.cues[cueName];
      if (cfg?.category === 'music') {
        howl.stop();
      }
    }
  }
}

function readString(payload: unknown, path: string): string | null {
  const value = readPath(payload, path);
  return typeof value === 'string' ? value : null;
}

function readNumber(payload: unknown, path: string | undefined): number | null {
  if (!path) return null;
  const value = readPath(payload, path);
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readPath(payload: unknown, dotted: string): unknown {
  const parts = dotted.split('.');
  let current: unknown = { payload };
  for (const part of parts) {
    if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

export const audioEngine = new AudioEngine();

export type { AudioEngine };
