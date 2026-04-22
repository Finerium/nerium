//
// HandoffEdge.tsx
//
// Conforms to: docs/contracts/pipeline_visualizer.contract.md v0.1.0
//
// Renders a single edge between two agent nodes. Active edges show a flowing
// particle along the path; inactive edges fall back to a thin static line.
// ma_bridge edges use the MA magenta hue to spotlight the Best Managed
// Agents Use lane during demo.
//

'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import type { HandoffEdgeProps } from './types';

const EDGE_COLOR: Record<string, string> = {
  handoff: '#00f0ff',
  dependency: '#3a4254',
  ma_bridge: '#ff2e88',
};

const ACTIVE_OPACITY = 0.9;
const INACTIVE_OPACITY = 0.35;

export function HandoffEdge(props: HandoffEdgeProps): React.JSX.Element {
  const { edge, from, to, reduceMotion } = props;
  const color = EDGE_COLOR[edge.kind] ?? EDGE_COLOR.handoff;

  const pathData = buildArcPath(from, to);
  const opacity = edge.is_active ? ACTIVE_OPACITY : INACTIVE_OPACITY;
  const strokeWidth = edge.is_active ? 2 : 1;
  const showFlow = edge.is_active && !reduceMotion;

  return (
    <g
      data-edge-from={edge.from_node_id}
      data-edge-to={edge.to_node_id}
      data-edge-active={edge.is_active}
      data-edge-kind={edge.kind}
      aria-hidden="true"
    >
      <path
        d={pathData}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        fill="none"
        opacity={opacity}
        strokeDasharray={edge.kind === 'dependency' ? '3 5' : undefined}
      />
      {showFlow ? (
        <motion.circle
          r={3}
          fill={color}
          initial={{ opacity: 0 }}
          animate={{
            opacity: [0, 1, 1, 0],
            offsetDistance: ['0%', '100%'],
          }}
          transition={{
            duration: edge.kind === 'ma_bridge' ? 1.4 : 1.8,
            repeat: Infinity,
            ease: 'linear',
          }}
          style={{
            offsetPath: `path("${pathData}")`,
            offsetRotate: '0deg',
          }}
        />
      ) : null}
    </g>
  );
}

// Simple quadratic arc so crossing edges are less visually stacked. Control
// point is perpendicular to the edge midpoint, offset by 12% of the edge
// length. Good enough for up to 22 nodes per contract Section 11 post-
// hackathon refactor notes.
export function buildArcPath(
  from: { x: number; y: number },
  to: { x: number; y: number },
): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const nx = -dy / len;
  const ny = dx / len;
  const offset = len * 0.12;
  const cx = mx + nx * offset;
  const cy = my + ny * offset;
  return `M ${from.x.toFixed(1)} ${from.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${to.x.toFixed(1)} ${to.y.toFixed(1)}`;
}
