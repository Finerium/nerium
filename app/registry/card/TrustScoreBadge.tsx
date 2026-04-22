'use client';

//
// TrustScoreBadge.tsx (Phoebe P3a Registry Worker).
//
// Conforms to:
// - docs/contracts/identity_card.contract.md v0.1.0 (Section 3, Section 4, Section 8)
// - docs/contracts/trust_score.contract.md v0.1.0 (score in [0,1], band derivation, stability)
//
// Four render formats per contract Section 4:
//   1. numeric     display percent 0 to 100 via toDisplayPercent helper (Hecate)
//   2. band_label  chip with Hecate band taxonomy, default format
//   3. gauge       circular 0 to 100 arc, SVG stroke tween
//   4. star        5-star rating mapped from percent
//
// The component NEVER recomputes band or score; it consumes what Hecate's
// trust_formula already produced. When score is missing (card rendered from
// partial data per identity_card.contract.md Section 8), caller passes the
// unverified band and the component renders a pending visual with the
// provisional stability flag surfaced as tooltip text.
//
// Honest-claim filter (NarasiGhaisan Section 6 shallow-by-design, Hecate
// ADR 0004 hybrid mock+real): `stability: 'provisional'` renders a subtle
// pulsing border + tooltip text so viewers see mock-vs-real distinction
// without a separate legend. See phoebe.decisions ADR 0003.
//

import { memo } from 'react';
import type { JSX } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

import { toDisplayPercent } from '../trust/trust_formula';
import {
  TRUST_BAND_COLOR,
  TRUST_BAND_LABEL,
  type TrustScoreBadgeProps,
} from './identity_card_types';

function TrustScoreBadgeImpl(props: TrustScoreBadgeProps): JSX.Element {
  const {
    score,
    band,
    format = 'band_label',
    stability = 'stable',
    compact = false,
    title,
  } = props;

  const displayPercent = toDisplayPercent(score);
  const color = TRUST_BAND_COLOR[band];
  const label = TRUST_BAND_LABEL[band];
  const systemReduceMotion = useReducedMotion();
  const isProvisional = stability === 'provisional';

  const tooltip =
    title ??
    (isProvisional
      ? `${label} ${displayPercent} of 100, provisional (limited signal)`
      : `${label} ${displayPercent} of 100`);

  const common = {
    'data-trust-band': band,
    'data-trust-format': format,
    'data-trust-stability': stability,
    role: 'img' as const,
    'aria-label': tooltip,
    title: tooltip,
  };

  switch (format) {
    case 'numeric':
      return (
        <NumericBadge
          displayPercent={displayPercent}
          color={color}
          isProvisional={isProvisional}
          compact={compact}
          reduceMotion={systemReduceMotion === true}
          common={common}
        />
      );
    case 'gauge':
      return (
        <GaugeBadge
          displayPercent={displayPercent}
          color={color}
          isProvisional={isProvisional}
          compact={compact}
          reduceMotion={systemReduceMotion === true}
          common={common}
        />
      );
    case 'star':
      return (
        <StarBadge
          displayPercent={displayPercent}
          color={color}
          isProvisional={isProvisional}
          compact={compact}
          common={common}
        />
      );
    case 'band_label':
    default:
      return (
        <BandLabelBadge
          label={label}
          displayPercent={displayPercent}
          color={color}
          isProvisional={isProvisional}
          compact={compact}
          common={common}
        />
      );
  }
}

interface SubBadgeProps {
  displayPercent: number;
  color: { fill: string; stroke: string; glow: string };
  isProvisional: boolean;
  compact: boolean;
  common: Record<string, string>;
}

interface MotionBadgeProps extends SubBadgeProps {
  reduceMotion: boolean;
}

function BandLabelBadge(
  props: SubBadgeProps & { label: string },
): JSX.Element {
  const { label, displayPercent, color, isProvisional, compact, common } = props;
  const padX = compact ? 6 : 10;
  const padY = compact ? 2 : 4;
  const fontSize = compact ? 10 : 11;
  const dotSize = compact ? 5 : 6;

  return (
    <span
      {...common}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: compact ? 4 : 6,
        padding: `${padY}px ${padX}px`,
        borderRadius: 999,
        fontSize,
        lineHeight: 1,
        fontFamily: 'ui-monospace, SFMono-Regular, monospace',
        letterSpacing: 0.4,
        color: color.stroke,
        background: `${color.fill}22`,
        border: `1px solid ${color.stroke}`,
        boxShadow: isProvisional ? 'none' : `0 0 8px ${color.glow}`,
        outline: isProvisional ? `1px dashed ${color.stroke}` : 'none',
        outlineOffset: isProvisional ? 1 : 0,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: dotSize,
          height: dotSize,
          borderRadius: '50%',
          background: color.stroke,
          boxShadow: `0 0 6px ${color.glow}`,
        }}
      />
      <span>{label.toUpperCase()}</span>
      <span
        aria-hidden="true"
        style={{ opacity: 0.75, marginLeft: compact ? 2 : 4 }}
      >
        {displayPercent}
      </span>
      {isProvisional ? (
        <ProvisionalMarker color={color.stroke} compact={compact} />
      ) : null}
    </span>
  );
}

function NumericBadge(props: MotionBadgeProps): JSX.Element {
  const { displayPercent, color, isProvisional, compact, reduceMotion, common } =
    props;
  const size = compact ? 28 : 40;
  const fontSize = compact ? 13 : 18;

  return (
    <motion.span
      {...common}
      initial={reduceMotion ? false : { opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: 10,
        fontFamily: 'ui-monospace, SFMono-Regular, monospace',
        fontWeight: 600,
        fontSize,
        color: color.stroke,
        background: `${color.fill}1f`,
        border: `1px solid ${color.stroke}`,
        boxShadow: isProvisional ? 'none' : `0 0 10px ${color.glow}`,
        outline: isProvisional ? `1px dashed ${color.stroke}` : 'none',
        outlineOffset: isProvisional ? 1 : 0,
        position: 'relative',
      }}
    >
      {displayPercent}
      {isProvisional ? (
        <ProvisionalMarker color={color.stroke} compact={compact} anchorCorner />
      ) : null}
    </motion.span>
  );
}

function GaugeBadge(props: MotionBadgeProps): JSX.Element {
  const { displayPercent, color, isProvisional, compact, reduceMotion, common } =
    props;
  const size = compact ? 40 : 56;
  const stroke = compact ? 5 : 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, displayPercent));
  const dashOffset = circumference * (1 - pct / 100);

  return (
    <span
      {...common}
      style={{
        display: 'inline-flex',
        position: 'relative',
        width: size,
        height: size,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
        style={{ overflow: 'visible' }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`${color.fill}33`}
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color.stroke}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={reduceMotion ? { strokeDashoffset: dashOffset } : { strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: dashOffset }}
          transition={{ duration: reduceMotion ? 0 : 0.6, ease: 'easeOut' }}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{
            filter: isProvisional ? 'none' : `drop-shadow(0 0 4px ${color.glow})`,
          }}
        />
      </svg>
      <span
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'ui-monospace, SFMono-Regular, monospace',
          fontWeight: 600,
          fontSize: compact ? 11 : 13,
          color: color.stroke,
        }}
      >
        {displayPercent}
      </span>
      {isProvisional ? (
        <ProvisionalMarker color={color.stroke} compact={compact} anchorCorner />
      ) : null}
    </span>
  );
}

function StarBadge(props: SubBadgeProps): JSX.Element {
  const { displayPercent, color, isProvisional, compact, common } = props;
  const starSize = compact ? 10 : 13;
  const filled = displayPercent / 20; // 0..5 range
  const stars = [0, 1, 2, 3, 4].map((i) => {
    const diff = filled - i;
    const fillPct = diff >= 1 ? 100 : diff <= 0 ? 0 : Math.round(diff * 100);
    return { i, fillPct };
  });

  return (
    <span
      {...common}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: compact ? 2 : 3,
        padding: compact ? '2px 4px' : '3px 6px',
        borderRadius: 6,
        background: `${color.fill}14`,
        border: `1px solid ${color.stroke}55`,
        position: 'relative',
      }}
    >
      {stars.map(({ i, fillPct }) => (
        <StarGlyph
          key={i}
          size={starSize}
          fillPct={fillPct}
          color={color.stroke}
          muted={`${color.stroke}33`}
        />
      ))}
      <span
        style={{
          fontSize: compact ? 9 : 10,
          fontFamily: 'ui-monospace, SFMono-Regular, monospace',
          color: color.stroke,
          marginLeft: compact ? 2 : 4,
          opacity: 0.75,
        }}
      >
        {displayPercent}
      </span>
      {isProvisional ? (
        <ProvisionalMarker color={color.stroke} compact={compact} anchorCorner />
      ) : null}
    </span>
  );
}

function StarGlyph(props: {
  size: number;
  fillPct: number;
  color: string;
  muted: string;
}): JSX.Element {
  const { size, fillPct, color, muted } = props;
  const clipId = `phoebe-star-${Math.round(fillPct)}-${size}-${color.replace('#', '')}`;
  const path =
    'M12 2 L14.9 8.6 L22 9.3 L16.5 14.1 L18.1 21 L12 17.3 L5.9 21 L7.5 14.1 L2 9.3 L9.1 8.6 Z';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x="0" y="0" width={(24 * fillPct) / 100} height="24" />
        </clipPath>
      </defs>
      <path d={path} fill={muted} stroke={color} strokeWidth={1} />
      <path d={path} fill={color} clipPath={`url(#${clipId})`} />
    </svg>
  );
}

function ProvisionalMarker(props: {
  color: string;
  compact: boolean;
  anchorCorner?: boolean;
}): JSX.Element {
  const { color, compact, anchorCorner = false } = props;
  const size = compact ? 6 : 8;
  const common = {
    width: size,
    height: size,
    borderRadius: '50%',
    background: 'transparent',
    border: `1px dashed ${color}`,
    display: 'inline-block',
  } as const;
  if (anchorCorner) {
    return (
      <span
        aria-hidden="true"
        style={{
          ...common,
          position: 'absolute',
          top: -2,
          right: -2,
        }}
      />
    );
  }
  return <span aria-hidden="true" style={common} />;
}

export const TrustScoreBadge = memo(TrustScoreBadgeImpl);
export default TrustScoreBadge;
