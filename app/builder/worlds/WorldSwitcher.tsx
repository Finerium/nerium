//
// WorldSwitcher.tsx
//
// Conforms to: docs/contracts/world_aesthetic.contract.md v0.1.0 Section 4
//              (WorldAestheticRegistry consumer) and docs/contracts/
//              design_tokens.contract.md v0.1.0 Section 4 (ThemeRuntime).
// Owner Agent: Thalia (Builder Worker, P3b, 2D pixel worlds).
//
// Segmented radiogroup control rendering the three world descriptors with
// their sigil sprite thumbnail. Clicking a world calls themeRuntime.applyWorld
// and worldAestheticRegistry.setActiveForSession so the token swap and
// session binding stay in sync. Free-choice (not tier-gated) per Thalia
// strategic_decision ADR-02; revisit post-hackathon if monetization surfaces
// demand premium worlds.
//

'use client';

import * as React from 'react';
import {
  worldAestheticRegistry,
  DEFAULT_WORLD,
} from './WorldAestheticRegistry';
import type { WorldDescriptor, WorldId } from './world_aesthetic_types';
import { slotFrame } from './sprite_slots';
import { themeRuntime } from '../../shared/design/theme_runtime';

export interface WorldSwitcherProps {
  readonly session_id: string;
  readonly onChange?: (world_id: WorldId) => void;
  readonly className?: string;
  readonly compact?: boolean;
}

const THUMB_PX = 28;

export function WorldSwitcher(props: WorldSwitcherProps): React.JSX.Element {
  const { session_id, onChange, className, compact = false } = props;
  const descriptors = React.useMemo<WorldDescriptor[]>(
    () => worldAestheticRegistry.list(),
    [],
  );
  const [active, setActive] = React.useState<WorldId>(DEFAULT_WORLD);

  React.useEffect(() => {
    let cancelled = false;
    worldAestheticRegistry
      .getActiveForSession(session_id)
      .then((id) => {
        if (cancelled) return;
        setActive(id);
        themeRuntime.applyWorld(id);
      })
      .catch(() => {
        // Fallback to default; runtime already applies default at hydration.
      });
    return () => {
      cancelled = true;
    };
  }, [session_id]);

  const handleSelect = React.useCallback(
    (world_id: WorldId) => {
      setActive(world_id);
      themeRuntime.applyWorld(world_id);
      worldAestheticRegistry
        .setActiveForSession(session_id, world_id)
        .catch(() => {
          // Session persistence is best-effort; in-memory fallback already set.
        });
      onChange?.(world_id);
    },
    [session_id, onChange],
  );

  const handleKey = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>, world_id: WorldId) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleSelect(world_id);
      }
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        const ids = descriptors.map((d) => d.world_id);
        const idx = ids.indexOf(world_id);
        const next =
          event.key === 'ArrowRight'
            ? ids[(idx + 1) % ids.length]
            : ids[(idx - 1 + ids.length) % ids.length];
        handleSelect(next);
      }
    },
    [descriptors, handleSelect],
  );

  return (
    <div
      role="radiogroup"
      aria-label="Choose a NERIUM Builder world aesthetic"
      className={className}
      style={{
        display: 'inline-flex',
        gap: 'var(--space-2, 0.5rem)',
        padding: 'var(--space-1, 0.25rem)',
        background: 'var(--color-background, #06060c)',
        border:
          '1px solid var(--color-border, rgba(255, 255, 255, 0.12))',
        borderRadius: 'var(--radius-md, 0.375rem)',
        boxShadow: 'var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.25))',
      }}
      data-active-world={active}
    >
      {descriptors.map((descriptor) => {
        const isActive = descriptor.world_id === active;
        const sigilFrame = slotFrame('sigil_world');
        return (
          <div
            key={descriptor.world_id}
            role="radio"
            tabIndex={isActive ? 0 : -1}
            aria-checked={isActive}
            aria-label={`Switch to ${descriptor.display_name}`}
            onClick={() => handleSelect(descriptor.world_id)}
            onKeyDown={(e) => handleKey(e, descriptor.world_id)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-2, 0.5rem)',
              padding: compact
                ? 'var(--space-1, 0.25rem) var(--space-2, 0.5rem)'
                : 'var(--space-2, 0.5rem) var(--space-3, 0.75rem)',
              cursor: 'pointer',
              borderRadius: 'var(--radius-sm, 0.125rem)',
              color: isActive
                ? 'var(--color-foreground, #e6ecff)'
                : 'var(--color-muted, #555577)',
              background: isActive
                ? 'var(--color-primary, #00f0ff)'
                : 'transparent',
              outline: isActive
                ? '2px solid var(--color-ring, var(--color-primary))'
                : 'none',
              outlineOffset: 2,
              transition:
                'background var(--duration-fast, 150ms) var(--ease-standard, cubic-bezier(0.4,0,0.2,1)), color var(--duration-fast, 150ms)',
              fontFamily: 'var(--font-family-body, Inter, sans-serif)',
              fontSize: compact ? 'var(--scale-xs, 0.75rem)' : 'var(--scale-sm, 0.875rem)',
              fontWeight: 'var(--weight-medium, 500)' as unknown as number,
            }}
          >
            <SigilThumb
              atlasUrl={atlasUrlFor(descriptor.world_id)}
              frame={sigilFrame}
              isActive={isActive}
            />
            {!compact ? <span>{descriptor.display_name}</span> : null}
          </div>
        );
      })}
    </div>
  );
}

function SigilThumb(props: {
  readonly atlasUrl: string;
  readonly frame: { x: number; y: number; w: number; h: number };
  readonly isActive: boolean;
}): React.JSX.Element {
  const { atlasUrl, frame, isActive } = props;
  const scale = THUMB_PX / frame.w;
  return (
    <span
      aria-hidden="true"
      style={{
        width: THUMB_PX,
        height: THUMB_PX,
        display: 'inline-block',
        backgroundImage: `url(${atlasUrl})`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: `-${frame.x * scale}px -${frame.y * scale}px`,
        backgroundSize: `${64 * scale}px ${64 * scale}px`,
        imageRendering: 'pixelated',
        borderRadius: 'var(--radius-sm, 0.125rem)',
        outline: isActive
          ? '1px solid var(--color-accent, rgba(255,255,255,0.25))'
          : 'none',
      }}
    />
  );
}

function atlasUrlFor(world_id: WorldId): string {
  return `/assets/worlds/${world_id}/atlas.png`;
}
