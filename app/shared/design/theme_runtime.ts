//
// theme_runtime.ts
//
// Conforms to: docs/contracts/design_tokens.contract.md v0.1.0 Section 4
//              docs/contracts/world_aesthetic.contract.md v0.1.0 (default
//              world fallback, unknown world no-op).
// Owner Agent: Harmonia (Early-Harmonia split session 1 of 2, emits the
//              runtime surface alongside tokens.ts so downstream Workers
//              (Thalia world switcher UI, Apollo chat surface, Erato
//              Builder) can wire a single applyWorld call from anywhere
//              in the app without additional scaffolding).
// Consumers:   Every surface that needs to swap the active world. Typically
//              invoked once at boot (hydrateActiveWorld) and again from a
//              world switcher UI control.
//
// Design notes:
//   - Token key naming uses snake_case in tokens.ts; CSS custom property
//     names use kebab-case per design_tokens.contract.md Section 7. This
//     module performs the translation deterministically.
//   - Colors are prefixed with --color- to keep semantic names (primary,
//     ring) unambiguous in the CSS namespace; all other categories use the
//     key name directly because the token keys already carry a category
//     hint (space_4 becomes --space-4, duration_fast becomes
//     --duration-fast, and so on).
//   - Persistence uses localStorage so a browser reload restores the last
//     active world. Server-side rendering skips persistence and runs with
//     DEFAULT_WORLD until the client hydrates.
//

import {
  DEFAULT_WORLD,
  getTheme,
  themes,
} from './tokens';
import type {
  AnimationTokens,
  RadiusTokens,
  SemanticColorTokens,
  ShadowTokens,
  SpacingTokens,
  TypographyTokens,
  WorldTheme,
} from './tokens';
import {
  isWorldId,
  type WorldId,
} from '../../builder/worlds/world_aesthetic_types';

// ---------- Contract interface ----------

export interface ThemeRuntime {
  applyWorld(world_id: WorldId): void;
  getActive(): WorldId;
  onChange(handler: ThemeChangeHandler): () => void;
}

export type ThemeChangeHandler = (
  world_id: WorldId,
  previous_world_id: WorldId,
) => void;

export interface ThemeAppliedEventPayload {
  world_id: WorldId;
  previous_world_id: WorldId;
}

// ---------- Storage + DOM helpers ----------

const STORAGE_KEY = 'nerium.active_world';
const DOM_DATA_ATTR = 'data-world';

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function readPersistedWorld(): WorldId | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw && isWorldId(raw)) return raw;
    return null;
  } catch {
    // localStorage access may throw in privacy mode; silent fallback.
    return null;
  }
}

function writePersistedWorld(world_id: WorldId): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, world_id);
  } catch {
    // No-op on quota or access errors; runtime stays consistent in memory.
  }
}

// ---------- Property name translation ----------
//
// Flattens a WorldTheme to a list of [CSS custom property name, value]
// tuples. Colors are namespaced with --color-; other categories keep their
// key name. Numeric fields (weights) stringify naturally.

function kebab(key: string): string {
  return key.replace(/_/g, '-');
}

function colorEntries(colors: SemanticColorTokens): Array<[string, string]> {
  return (Object.keys(colors) as (keyof SemanticColorTokens)[]).map((key) => [
    `--color-${kebab(String(key))}`,
    colors[key],
  ]);
}

function spacingEntries(spacing: SpacingTokens): Array<[string, string]> {
  return (Object.keys(spacing) as (keyof SpacingTokens)[]).map((key) => [
    `--${kebab(String(key))}`,
    spacing[key],
  ]);
}

function radiusEntries(radius: RadiusTokens): Array<[string, string]> {
  return (Object.keys(radius) as (keyof RadiusTokens)[]).map((key) => [
    `--${kebab(String(key))}`,
    radius[key],
  ]);
}

function animationEntries(animation: AnimationTokens): Array<[string, string]> {
  return (Object.keys(animation) as (keyof AnimationTokens)[]).map((key) => [
    `--${kebab(String(key))}`,
    animation[key],
  ]);
}

function typographyEntries(
  typography: TypographyTokens,
): Array<[string, string]> {
  return (Object.keys(typography) as (keyof TypographyTokens)[]).map((key) => [
    `--${kebab(String(key))}`,
    String(typography[key]),
  ]);
}

function shadowEntries(shadow: ShadowTokens): Array<[string, string]> {
  return (Object.keys(shadow) as (keyof ShadowTokens)[]).map((key) => [
    `--${kebab(String(key))}`,
    shadow[key],
  ]);
}

export function flattenThemeToCustomProperties(
  theme: WorldTheme,
): Array<[string, string]> {
  return [
    ...colorEntries(theme.colors),
    ...spacingEntries(theme.spacing),
    ...radiusEntries(theme.radius),
    ...animationEntries(theme.animation),
    ...typographyEntries(theme.typography),
    ...shadowEntries(theme.shadow),
  ];
}

// ---------- Runtime ----------

function createThemeRuntime(): ThemeRuntime {
  let active: WorldId = DEFAULT_WORLD;
  const handlers = new Set<ThemeChangeHandler>();

  function applyToRoot(theme: WorldTheme): void {
    if (!isBrowser()) return;
    const root = document.documentElement;
    for (const [name, value] of flattenThemeToCustomProperties(theme)) {
      root.style.setProperty(name, value);
    }
    root.setAttribute(DOM_DATA_ATTR, theme.world_id);
  }

  function applyWorld(world_id: WorldId): void {
    if (!(world_id in themes)) {
      // Contract Section 8: unknown world_id logs and no-ops.
      if (isBrowser() && typeof console !== 'undefined') {
        console.error(
          `[nerium] applyWorld received unknown world_id: ${String(world_id)}`,
        );
      }
      return;
    }
    const previous = active;
    active = world_id;
    applyToRoot(getTheme(world_id));
    writePersistedWorld(world_id);
    for (const handler of handlers) {
      handler(world_id, previous);
    }
    if (isBrowser()) {
      const event = new CustomEvent<ThemeAppliedEventPayload>(
        'design.theme.applied',
        { detail: { world_id, previous_world_id: previous } },
      );
      window.dispatchEvent(event);
    }
  }

  function getActive(): WorldId {
    return active;
  }

  function onChange(handler: ThemeChangeHandler): () => void {
    handlers.add(handler);
    return () => {
      handlers.delete(handler);
    };
  }

  return { applyWorld, getActive, onChange };
}

// Module-scoped singleton. Consumers that need multi-runtime scenarios (for
// example, component tests across multiple worlds in a single suite) can
// instantiate fresh runtimes via createThemeRuntime directly.
export const themeRuntime: ThemeRuntime = createThemeRuntime();

/**
 * Hydrates the active world from localStorage on boot and applies it to the
 * DOM. Call once in the top-level client entry (app/layout.tsx client
 * boundary or an effect in the root RootProviders component). Safe to call
 * multiple times; idempotent apart from the handler notifications.
 */
export function hydrateActiveWorld(
  fallback: WorldId = DEFAULT_WORLD,
): WorldId {
  if (!isBrowser()) return fallback;
  const persisted = readPersistedWorld();
  const next = persisted ?? fallback;
  themeRuntime.applyWorld(next);
  return next;
}

export { createThemeRuntime };
