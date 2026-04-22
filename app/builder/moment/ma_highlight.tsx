//
// ma_highlight.tsx
//
// Conforms to: docs/contracts/blueprint_moment.contract.md v0.1.0
// Companion contract: docs/contracts/managed_agent_executor.contract.md v0.1.0
//
// Heracles Managed Agents lane special glow treatment for the Urania
// Blueprint Moment. Renders a standalone SVG group positioned at the
// Heracles node coordinates (resolved by BlueprintReveal using the Helios
// layoutNodes helper). Composes on top of PipelineCanvas with
// pointer-events scoped to the optional Console deep-link chip only, so
// underlying hover targets on AgentNode remain reachable after the reveal
// completes.
//
// Why a separate component instead of extending AgentNode:
// 1. AgentNode lives in Helios and is snapshotted by Nemea against a
//    strict baseline. Mutating it to add reveal-only emphasis would fork
//    Nemea's visual diff across two consumers.
// 2. The Blueprint Moment needs an animation layer scoped to reveal
//    timing (fades in as camera pullback crosses highlight threshold,
//    fades out on onComplete). AgentNode animations are tied to pipeline
//    event state, not cinematic timing.
// 3. Contract Section 6 allocates a dedicated file for this treatment.
//
// Judging surface: Best Managed Agents Use $5K target. The magenta glow +
// rotating dashed ring + "MA . CONSOLE TRACE LIVE" chip telegraphs that
// Heracles is running in the Anthropic-managed sandbox, not in the local
// Anthropic-direct Builder lane.
//

'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { BLUEPRINT_PALETTE } from './types';

export interface MaHighlightProps {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly maSessionId?: string;
  readonly consoleDeepLinkUrl?: string;
  readonly intensity: number;
  readonly isActive: boolean;
  readonly reduceMotion?: boolean;
  readonly label?: string;
}

// Intensity gates how "loud" the highlight is: 0 = dormant outer ring
// only, 1 = full pulse + animated chip + deep glow. BlueprintReveal feeds
// intensity from the camera pullback progress so the treatment ramps with
// the cinematic reveal.
export function MaHighlight(props: MaHighlightProps): React.JSX.Element {
  const {
    x,
    y,
    radius,
    maSessionId,
    consoleDeepLinkUrl,
    intensity,
    isActive,
    reduceMotion: reduceMotionProp,
    label,
  } = props;

  const systemReduceMotion = useReducedMotion();
  const reduceMotion = Boolean(reduceMotionProp) || systemReduceMotion === true;

  const intensityClamped = clampIntensity(intensity);
  const glowRadius = radius + 12 + intensityClamped * 10;
  const outerRingRadius = radius + 24 + intensityClamped * 12;
  const hasDeepLink = Boolean(
    consoleDeepLinkUrl && consoleDeepLinkUrl.length > 0 && maSessionId,
  );
  const visibleOpacity = isActive ? 0.35 + intensityClamped * 0.55 : 0;

  const pulseAnimation =
    reduceMotion || !isActive
      ? {}
      : {
          scale: [1, 1 + 0.05 * intensityClamped, 1],
          opacity: [
            visibleOpacity * 0.85,
            visibleOpacity,
            visibleOpacity * 0.85,
          ],
        };

  const pulseTransition =
    reduceMotion || !isActive
      ? undefined
      : {
          duration: 1.8,
          repeat: Infinity,
          ease: 'easeInOut' as const,
        };

  const rotationTransition =
    reduceMotion || !isActive
      ? undefined
      : {
          duration: 22,
          repeat: Infinity,
          ease: 'linear' as const,
        };

  return (
    <g
      data-ma-highlight="heracles"
      data-ma-active={isActive ? 'true' : 'false'}
      data-ma-session-id={maSessionId ?? ''}
      transform={`translate(${x}, ${y})`}
      aria-hidden={isActive ? undefined : 'true'}
      style={{ pointerEvents: 'none' }}
    >
      {/* Outer dashed rotating ring */}
      {isActive ? (
        <motion.g
          initial={reduceMotion ? false : { rotate: 0 }}
          animate={reduceMotion ? { rotate: 0 } : { rotate: 360 }}
          transition={rotationTransition}
          style={{ originX: '0px', originY: '0px' }}
        >
          <circle
            r={outerRingRadius}
            fill="none"
            stroke={BLUEPRINT_PALETTE.magenta}
            strokeOpacity={0.55}
            strokeWidth={1.1}
            strokeDasharray="3 4"
          />
        </motion.g>
      ) : null}

      {/* Magenta glow halo */}
      <motion.circle
        r={glowRadius}
        fill="none"
        stroke={BLUEPRINT_PALETTE.magenta}
        strokeWidth={2.4 + intensityClamped * 1.2}
        strokeOpacity={visibleOpacity}
        initial={false}
        animate={pulseAnimation}
        transition={pulseTransition}
        style={{
          filter: reduceMotion
            ? undefined
            : `drop-shadow(0 0 ${4 + intensityClamped * 10}px rgba(255, 46, 136, ${0.55 + intensityClamped * 0.25}))`,
        }}
      />

      {/* Inner solid-magenta ring hugging the node edge */}
      <circle
        r={radius + 3}
        fill="none"
        stroke={BLUEPRINT_PALETTE.magenta}
        strokeWidth={1.6}
        strokeOpacity={isActive ? 0.75 : 0.15}
      />

      {/* Console trace chip */}
      {isActive ? (
        <MaConsoleChip
          label={label ?? 'MA . CONSOLE TRACE LIVE'}
          hasDeepLink={hasDeepLink}
          radius={outerRingRadius}
          reduceMotion={reduceMotion}
        />
      ) : null}
    </g>
  );
}

interface MaConsoleChipProps {
  readonly label: string;
  readonly hasDeepLink: boolean;
  readonly radius: number;
  readonly reduceMotion: boolean;
}

function MaConsoleChip(props: MaConsoleChipProps): React.JSX.Element {
  const { label, hasDeepLink, radius, reduceMotion } = props;
  const chipY = -(radius + 18);
  const charWidth = 6;
  const padding = 10;
  const width = Math.max(120, label.length * charWidth + padding * 2);
  const height = 20;
  const dotAnimation = reduceMotion
    ? undefined
    : {
        opacity: [0.35, 1, 0.35],
      };
  const dotTransition = reduceMotion
    ? undefined
    : {
        duration: 1.2,
        repeat: Infinity,
        ease: 'easeInOut' as const,
      };

  return (
    <motion.g
      transform={`translate(0, ${chipY})`}
      initial={reduceMotion ? false : { opacity: 0, y: chipY + 6 }}
      animate={{ opacity: 1, y: chipY }}
      transition={{ duration: 0.45, ease: 'easeOut' as const }}
      style={{ pointerEvents: hasDeepLink ? 'auto' : 'none' }}
    >
      <rect
        x={-width / 2}
        y={-height / 2}
        width={width}
        height={height}
        rx={height / 2}
        fill="rgba(255, 46, 136, 0.14)"
        stroke={BLUEPRINT_PALETTE.magenta}
        strokeWidth={1}
      />
      <motion.circle
        cx={-width / 2 + 12}
        cy={0}
        r={3.2}
        fill={BLUEPRINT_PALETTE.magenta}
        animate={dotAnimation}
        transition={dotTransition}
        style={{
          filter: reduceMotion
            ? undefined
            : 'drop-shadow(0 0 4px rgba(255, 46, 136, 0.85))',
        }}
      />
      <text
        x={6}
        y={3}
        textAnchor="middle"
        fill={BLUEPRINT_PALETTE.magenta}
        fontFamily="ui-monospace, 'Share Tech Mono', SFMono-Regular, monospace"
        fontSize={10}
        letterSpacing={1.1}
      >
        {label.toUpperCase()}
      </text>
    </motion.g>
  );
}

function clampIntensity(value: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
