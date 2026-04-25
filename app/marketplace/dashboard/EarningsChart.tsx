//
// app/marketplace/dashboard/EarningsChart.tsx
//
// Iapetus W2 NP S2. Pure inline-SVG line chart. We deliberately avoid
// the Recharts dependency:
//   - Recharts is not in package.json and adding it for a single chart
//     bloats the bundle by ~150 KB gz.
//   - The chart shape is simple (12 monthly points, 2 series, axis +
//     tooltip), so a hand-rolled SVG fits in <120 lines and respects
//     the landing palette without theme overrides.
//
// Renders gross + net monthly earnings with a hover-state tooltip.
// Responsive via a viewBox + preserveAspectRatio plus a CSS width:
// 100% wrapper.
//

'use client';

import { useState } from 'react';
import {
  formatMonthLabel,
  formatUsdCents,
  type MonthlyEarning,
} from './seedData';

interface Props {
  readonly data: ReadonlyArray<MonthlyEarning>;
}

const VIEW_W = 720;
const VIEW_H = 280;
const PAD_LEFT = 56;
const PAD_RIGHT = 16;
const PAD_TOP = 16;
const PAD_BOTTOM = 36;

const PHOSPHOR = 'oklch(0.85 0.18 140)';
const PHOSPHOR_DIM = 'oklch(0.55 0.12 140)';
const RULE = 'oklch(0.32 0.02 250)';
const INK = 'oklch(0.14 0.012 250)';
const TEXT = 'oklch(0.85 0.02 250)';
const TEXT_DIM = 'oklch(0.6 0.02 250)';

export function EarningsChart({ data }: Props) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (data.length === 0) return null;

  const innerW = VIEW_W - PAD_LEFT - PAD_RIGHT;
  const innerH = VIEW_H - PAD_TOP - PAD_BOTTOM;
  const maxCents = Math.max(...data.map((d) => d.grossCents)) * 1.1;
  const yScale = (cents: number) =>
    PAD_TOP + innerH - (cents / maxCents) * innerH;
  const xScale = (i: number) =>
    PAD_LEFT + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);

  const grossPath = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'}${xScale(i).toFixed(2)},${yScale(d.grossCents).toFixed(2)}`)
    .join(' ');
  const netPath = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'}${xScale(i).toFixed(2)},${yScale(d.netCents).toFixed(2)}`)
    .join(' ');
  const grossArea =
    `M${xScale(0).toFixed(2)},${(PAD_TOP + innerH).toFixed(2)} ` +
    data.map((d, i) => `L${xScale(i).toFixed(2)},${yScale(d.grossCents).toFixed(2)}`).join(' ') +
    ` L${xScale(data.length - 1).toFixed(2)},${(PAD_TOP + innerH).toFixed(2)} Z`;

  const yTicks = 4;
  const ticks = Array.from({ length: yTicks + 1 }, (_, i) =>
    Math.round((maxCents / yTicks) * i),
  );

  const hovered = hoverIdx !== null ? data[hoverIdx] : null;

  return (
    <div
      style={{
        width: '100%',
        position: 'relative',
        background: 'oklch(0.18 0.015 250)',
        borderRadius: '12px',
        padding: '16px',
        border: `1px solid ${RULE}`,
      }}
      onMouseLeave={() => setHoverIdx(null)}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
          marginBottom: '12px',
          color: TEXT_DIM,
          fontSize: '12px',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '10px', height: '10px', background: PHOSPHOR, borderRadius: '2px' }} />
          Gross
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '10px', height: '10px', background: PHOSPHOR_DIM, borderRadius: '2px' }} />
          Net (after platform fee)
        </span>
      </div>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height: 'auto', display: 'block' }}
        role="img"
        aria-label={`Monthly earnings line chart with ${data.length} data points. Latest month gross ${formatUsdCents(data[data.length - 1].grossCents)}.`}
      >
        {ticks.map((t, i) => {
          const y = yScale(t);
          return (
            <g key={i}>
              <line
                x1={PAD_LEFT}
                x2={VIEW_W - PAD_RIGHT}
                y1={y}
                y2={y}
                stroke={RULE}
                strokeWidth={0.5}
              />
              <text
                x={PAD_LEFT - 6}
                y={y + 4}
                textAnchor="end"
                fontSize={10}
                fill={TEXT_DIM}
                fontFamily="JetBrains Mono, monospace"
              >
                {Math.round(t / 100).toLocaleString('en-US')}
              </text>
            </g>
          );
        })}
        <text
          x={PAD_LEFT - 44}
          y={PAD_TOP + 8}
          fontSize={9}
          fill={TEXT_DIM}
          fontFamily="JetBrains Mono, monospace"
        >
          USD
        </text>

        <path
          d={grossArea}
          fill={PHOSPHOR}
          fillOpacity={0.08}
          stroke="none"
        />
        <path d={grossPath} fill="none" stroke={PHOSPHOR} strokeWidth={2} />
        <path d={netPath} fill="none" stroke={PHOSPHOR_DIM} strokeWidth={1.5} strokeDasharray="4 3" />

        {data.map((d, i) => {
          const cx = xScale(i);
          const cy = yScale(d.grossCents);
          const isHover = hoverIdx === i;
          return (
            <g key={d.month}>
              <circle
                cx={cx}
                cy={cy}
                r={isHover ? 5 : 3}
                fill={INK}
                stroke={PHOSPHOR}
                strokeWidth={2}
              />
              <rect
                x={cx - 16}
                y={PAD_TOP}
                width={32}
                height={innerH}
                fill="transparent"
                onMouseEnter={() => setHoverIdx(i)}
                onFocus={() => setHoverIdx(i)}
                tabIndex={0}
                role="presentation"
              />
              <text
                x={cx}
                y={VIEW_H - 14}
                textAnchor="middle"
                fontSize={10}
                fill={TEXT_DIM}
                fontFamily="JetBrains Mono, monospace"
              >
                {formatMonthLabel(d.month)}
              </text>
            </g>
          );
        })}
      </svg>

      {hovered && hoverIdx !== null ? (
        <div
          style={{
            position: 'absolute',
            top: '40px',
            left: `${(xScale(hoverIdx) / VIEW_W) * 100}%`,
            transform: 'translateX(-50%)',
            background: INK,
            border: `1px solid ${PHOSPHOR_DIM}`,
            borderRadius: '6px',
            padding: '8px 12px',
            color: TEXT,
            fontSize: '12px',
            fontFamily: 'JetBrains Mono, monospace',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            zIndex: 2,
          }}
        >
          <div style={{ color: PHOSPHOR, fontWeight: 700 }}>{formatMonthLabel(hovered.month)}</div>
          <div>Gross {formatUsdCents(hovered.grossCents)}</div>
          <div style={{ color: TEXT_DIM }}>Net {formatUsdCents(hovered.netCents)}</div>
        </div>
      ) : null}
    </div>
  );
}
