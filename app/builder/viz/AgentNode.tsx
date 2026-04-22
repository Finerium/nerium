//
// AgentNode.tsx
//
// Conforms to: docs/contracts/pipeline_visualizer.contract.md v0.1.0
//
// Per-specialist animated node. Rendered as an SVG group to keep the canvas
// snapshotable for Nemea visual regression (Pixi.js surface can land later
// per contract Section 11 post-hackathon refactor notes). Framer Motion
// drives status halo and pulse; confidence ring is a simple stroke tween.
// Reduced motion path drops all animation to honor prefers-reduced-motion
// plus the 30 FPS battery-safe fallback.
//
// Error boundary is applied at the PipelineCanvas layer so a failed single
// node renders a red placeholder without taking down siblings, per contract
// Section 8.
//

'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { AgentNodeProps } from './types';
import { confidenceVisual } from './confidence_overlay';

const TIER_COLORS: Record<string, string> = {
  advisor: '#ffd166',
  lead: '#00f0ff',
  worker: '#8b5cf6',
  ma_lane: '#ff2e88',
};

const STATUS_HALO: Record<string, { stroke: string; glow: string }> = {
  idle: { stroke: '#3a4254', glow: 'rgba(58, 66, 84, 0.25)' },
  active: { stroke: '#00f0ff', glow: 'rgba(0, 240, 255, 0.65)' },
  completed: { stroke: '#22f59a', glow: 'rgba(34, 245, 154, 0.45)' },
  failed: { stroke: '#ff3d5a', glow: 'rgba(255, 61, 90, 0.7)' },
  halted: { stroke: '#ffb300', glow: 'rgba(255, 179, 0, 0.55)' },
};

const STATUS_LABEL: Record<string, string> = {
  idle: 'Idle',
  active: 'Running',
  completed: 'Done',
  failed: 'Failed',
  halted: 'Halted',
};

export function AgentNode(props: AgentNodeProps): React.JSX.Element {
  const { node, x, y, radius, showConfidenceOverlay, consoleDeepLink, onClick } =
    props;
  const systemReduceMotion = useReducedMotion();
  const reduceMotion = props.reduceMotion || systemReduceMotion === true;

  const tierColor = TIER_COLORS[node.tier] ?? TIER_COLORS.worker;
  const halo = STATUS_HALO[node.status] ?? STATUS_HALO.idle;
  const confidence = confidenceVisual(node.confidence);
  const isMaLane = node.tier === 'ma_lane';
  const hasMaLink = Boolean(
    consoleDeepLink && consoleDeepLink.length > 0 && node.ma_session_id,
  );

  const pulseAnimation = reduceMotion
    ? {}
    : node.status === 'active'
      ? {
          scale: [1, 1.08, 1],
          filter: [
            `drop-shadow(0 0 6px ${halo.glow})`,
            `drop-shadow(0 0 14px ${halo.glow})`,
            `drop-shadow(0 0 6px ${halo.glow})`,
          ],
        }
      : {};

  const pulseTransition = reduceMotion
    ? undefined
    : node.status === 'active'
      ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' as const }
      : { duration: 0.25 };

  const handleClick = React.useCallback(() => {
    onClick?.(node.node_id);
  }, [onClick, node.node_id]);

  const handleKey = React.useCallback(
    (ev: React.KeyboardEvent<SVGGElement>) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        onClick?.(node.node_id);
      }
    },
    [onClick, node.node_id],
  );

  return (
    <motion.g
      data-node-id={node.node_id}
      data-node-status={node.status}
      data-node-tier={node.tier}
      transform={`translate(${x}, ${y})`}
      initial={reduceMotion ? false : { opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1, ...pulseAnimation }}
      transition={pulseTransition}
      role="button"
      tabIndex={onClick ? 0 : -1}
      aria-label={buildAriaLabel(node, confidence.tooltip)}
      onClick={handleClick}
      onKeyDown={handleKey}
      style={{ cursor: onClick ? 'pointer' : 'default', outline: 'none' }}
    >
      <circle
        r={radius + 6}
        fill="none"
        stroke={halo.stroke}
        strokeWidth={2}
        opacity={0.6}
      />
      {showConfidenceOverlay ? (
        <motion.circle
          r={radius + 12}
          fill="none"
          stroke={confidence.stroke}
          strokeWidth={3}
          strokeDasharray="4 3"
          initial={{ opacity: 0 }}
          animate={{ opacity: confidence.opacity }}
          transition={{ duration: 0.3 }}
          aria-hidden="true"
        />
      ) : null}
      <circle
        r={radius}
        fill="rgba(6, 6, 12, 0.92)"
        stroke={tierColor}
        strokeWidth={isMaLane ? 3 : 2}
      />
      <text
        textAnchor="middle"
        y={-2}
        fill="#e6ecff"
        fontSize={12}
        fontFamily="ui-sans-serif, system-ui"
        fontWeight={600}
      >
        {truncate(node.label, 18)}
      </text>
      <text
        textAnchor="middle"
        y={12}
        fill={tierColor}
        fontSize={9}
        fontFamily="ui-monospace, SFMono-Regular"
        letterSpacing={0.8}
      >
        {node.tier.toUpperCase()}
      </text>
      <text
        textAnchor="middle"
        y={26}
        fill={halo.stroke}
        fontSize={9}
        fontFamily="ui-monospace, SFMono-Regular"
      >
        {STATUS_LABEL[node.status] ?? node.status}
      </text>
      {typeof node.tokens_consumed === 'number' ? (
        <text
          textAnchor="middle"
          y={radius + 14}
          fill="#8892a6"
          fontSize={8}
          fontFamily="ui-monospace, SFMono-Regular"
        >
          {`${formatTokens(node.tokens_consumed)} tok`}
          {typeof node.cost_usd === 'number'
            ? ` | $${node.cost_usd.toFixed(2)}`
            : ''}
        </text>
      ) : null}
      {node.current_tool_call ? (
        <text
          textAnchor="middle"
          y={radius + 26}
          fill="#b0bccc"
          fontSize={9}
          fontFamily="ui-monospace, SFMono-Regular"
        >
          {truncate(node.current_tool_call, 22)}
        </text>
      ) : null}
      {isMaLane && hasMaLink ? (
        <g transform={`translate(0, ${-(radius + 16)})`} aria-hidden="true">
          <rect
            x={-34}
            y={-10}
            width={68}
            height={16}
            rx={8}
            fill="rgba(255, 46, 136, 0.15)"
            stroke="#ff2e88"
            strokeWidth={1}
          />
          <text
            textAnchor="middle"
            y={2}
            fill="#ff2e88"
            fontSize={9}
            fontFamily="ui-monospace, SFMono-Regular"
            letterSpacing={0.6}
          >
            MA LIVE
          </text>
        </g>
      ) : null}
    </motion.g>
  );
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}...`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`;
  return `${tokens}`;
}

function buildAriaLabel(
  node: { label: string; status: string; tier: string },
  confidenceTooltip: string,
): string {
  return `${node.label}, ${node.tier} tier, status ${node.status}. ${confidenceTooltip}.`;
}
