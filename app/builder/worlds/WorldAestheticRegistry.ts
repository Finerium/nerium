//
// WorldAestheticRegistry.ts
//
// Conforms to: docs/contracts/world_aesthetic.contract.md v0.1.0 Section 4.
// Owner Agent: Thalia (Builder Worker, P3b, 2D pixel worlds).
//
// Registry surface for the three world descriptors. Session binding uses
// localStorage when the browser is available and falls back to an in-memory
// map during server-side rendering or privacy modes. The default world is
// cyberpunk_shanghai per Thalia strategic_decision (surfaced as a V3 ferry
// in thalia.decisions.md ADR-01).
//

import {
  UnknownWorldError,
  type WorldDescriptor,
  type WorldId,
} from './world_aesthetic_types';
import { medievalDesertDescriptor } from './medieval_desert/descriptor';
import { cyberpunkShanghaiDescriptor } from './cyberpunk_shanghai/descriptor';
import { steampunkVictorianDescriptor } from './steampunk_victorian/descriptor';

const DEFAULT_WORLD: WorldId = 'cyberpunk_shanghai';
const SESSION_STORAGE_PREFIX = 'nerium.session.world.';

const DESCRIPTORS: Record<WorldId, WorldDescriptor> = {
  medieval_desert: medievalDesertDescriptor,
  cyberpunk_shanghai: cyberpunkShanghaiDescriptor,
  steampunk_victorian: steampunkVictorianDescriptor,
};

const DESCRIPTOR_ORDER: readonly WorldId[] = [
  'medieval_desert',
  'cyberpunk_shanghai',
  'steampunk_victorian',
];

const memoryStore = new Map<string, WorldId>();

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function isWorldIdValue(value: string): value is WorldId {
  return value in DESCRIPTORS;
}

function storageKey(session_id: string): string {
  return `${SESSION_STORAGE_PREFIX}${session_id}`;
}

function readSessionStorage(session_id: string): WorldId | null {
  if (!isBrowser()) return memoryStore.get(session_id) ?? null;
  try {
    const raw = window.localStorage.getItem(storageKey(session_id));
    if (raw && isWorldIdValue(raw)) return raw;
    return null;
  } catch {
    return memoryStore.get(session_id) ?? null;
  }
}

function writeSessionStorage(session_id: string, world_id: WorldId): void {
  memoryStore.set(session_id, world_id);
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(storageKey(session_id), world_id);
  } catch {
    // Quota or privacy mode: in-memory map covers the read path.
  }
}

export interface WorldAestheticRegistry {
  list(): WorldDescriptor[];
  get(world_id: WorldId): WorldDescriptor;
  setActiveForSession(session_id: string, world_id: WorldId): Promise<void>;
  getActiveForSession(session_id: string): Promise<WorldId>;
}

function createWorldAestheticRegistry(): WorldAestheticRegistry {
  return {
    list(): WorldDescriptor[] {
      return DESCRIPTOR_ORDER.map((id) => DESCRIPTORS[id]);
    },
    get(world_id: WorldId): WorldDescriptor {
      const descriptor = DESCRIPTORS[world_id];
      if (!descriptor) throw new UnknownWorldError(String(world_id));
      return descriptor;
    },
    async setActiveForSession(
      session_id: string,
      world_id: WorldId,
    ): Promise<void> {
      if (!(world_id in DESCRIPTORS)) {
        throw new UnknownWorldError(String(world_id));
      }
      writeSessionStorage(session_id, world_id);
    },
    async getActiveForSession(session_id: string): Promise<WorldId> {
      const stored = readSessionStorage(session_id);
      if (stored) return stored;
      if (isBrowser() && typeof console !== 'undefined') {
        console.warn(
          `[nerium] no active world for session ${session_id}; falling back to ${DEFAULT_WORLD}`,
        );
      }
      return DEFAULT_WORLD;
    },
  };
}

export const worldAestheticRegistry: WorldAestheticRegistry =
  createWorldAestheticRegistry();

export { DEFAULT_WORLD, DESCRIPTOR_ORDER };
export { createWorldAestheticRegistry };
