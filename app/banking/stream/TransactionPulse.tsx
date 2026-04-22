'use client';

// app/banking/stream/TransactionPulse.tsx
//
// Live pulsing transaction feed component.
// Schema conformance: docs/contracts/transaction_stream.contract.md v0.1.0
// Owner: Rhea (Banking Worker, P3a)
//
// Hackathon scope pure mock per Ghaisan Decision 2 (2026-04-22). Every
// rendered pulse represents a synthetic transaction and is annotated with
// data-synthetic="true" plus a visible honest-claim header so any demo
// screenshot remains faithfully labeled per NarasiGhaisan Section 16.

import type { CSSProperties, ReactElement } from 'react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

import type { TransactionKind } from '../schema/wallet.schema';
import type { CurrencyCode } from '../metering/meter_contract';
import {
  DENSITY_TO_SPAWN_HZ,
  FPS_DEGRADE_THRESHOLD,
  FPS_SAMPLE_WINDOW_MS,
  HONEST_CLAIM_HEADER,
  KIND_TO_LABEL,
  KIND_TO_OKLCH,
  MAX_VISIBLE_PULSES,
  PULSE_DWELL_MS,
  STREAM_RENDERED_TOPIC,
  VISUAL_LANE_COUNT,
  type DensityLevel,
  type SyntheticTransaction,
  type TransactionPulseProps,
} from './stream_types';
import { createMockGenerator } from './mock_generator';

const KNOWN_CURRENCIES: ReadonlySet<CurrencyCode> = new Set<CurrencyCode>(['USD', 'IDR']);

function sanitizeCurrency(currency: CurrencyCode): CurrencyCode {
  if (!KNOWN_CURRENCIES.has(currency)) {
    if (typeof console !== 'undefined') {
      console.warn(
        `[rhea] Unsupported currency "${currency}" received, falling back to USD.`,
      );
    }
    return 'USD';
  }
  return currency;
}

function stepDownDensity(current: DensityLevel): DensityLevel | null {
  if (current === 'high') return 'medium';
  if (current === 'medium') return 'low';
  return null;
}

function localeFromCurrency(currency: CurrencyCode): 'en' | 'id' {
  return currency === 'IDR' ? 'id' : 'en';
}

interface PulseVisual {
  id: string;
  kind: TransactionKind;
  lane: number;
  formatted_amount: string;
  amount_usd: number;
  currency: CurrencyCode;
  synthetic: true;
}

function toVisual(tx: SyntheticTransaction): PulseVisual {
  return {
    id: tx.pulse_id,
    kind: tx.kind,
    lane: tx.visual_lane,
    formatted_amount: tx.display_amount.formatted,
    amount_usd: tx.amount_usd,
    currency: tx.display_amount.currency,
    synthetic: true,
  };
}

export function TransactionPulse(props: TransactionPulseProps): ReactElement {
  const {
    currency: rawCurrency,
    density: initialDensity,
    height_px = 200,
    opacity = 0.6,
    pauseOnHover = true,
    className,
  } = props;

  const currency = sanitizeCurrency(rawCurrency);
  const locale = localeFromCurrency(currency);
  const header = HONEST_CLAIM_HEADER[locale];
  const reduceMotion = useReducedMotion();

  const [density, setDensity] = useState<DensityLevel>(initialDensity);
  const [pulses, setPulses] = useState<PulseVisual[]>([]);
  const [paused, setPaused] = useState<boolean>(false);

  const generatorRef = useRef<ReturnType<typeof createMockGenerator> | null>(null);
  const steadyStateEmittedRef = useRef<boolean>(false);

  const effectiveSpawnHz = DENSITY_TO_SPAWN_HZ[density];

  const handleEmit = useCallback((tx: SyntheticTransaction) => {
    const visual = toVisual(tx);
    setPulses((prev) => {
      const next = [...prev, visual];
      if (next.length > MAX_VISIBLE_PULSES) {
        return next.slice(next.length - MAX_VISIBLE_PULSES);
      }
      return next;
    });

    // Retire the pulse after its full dwell window. Framer Motion handles
    // the exit animation via AnimatePresence once the entry leaves state.
    window.setTimeout(() => {
      setPulses((prev) => prev.filter((p) => p.id !== visual.id));
    }, PULSE_DWELL_MS);
  }, []);

  // Emit a steady-state signal exactly once so Nemea regression hooks can
  // latch on without polling. Fires when the visible queue first reaches
  // 3 concurrent pulses, which is a reliable rendered milestone.
  useEffect(() => {
    if (steadyStateEmittedRef.current) return;
    if (typeof window === 'undefined') return;
    if (pulses.length < 3) return;
    steadyStateEmittedRef.current = true;
    window.dispatchEvent(
      new CustomEvent(STREAM_RENDERED_TOPIC, {
        detail: {
          visible_pulse_count: pulses.length,
          spawn_hz_effective: effectiveSpawnHz,
          synthetic: true,
        },
      }),
    );
  }, [pulses.length, effectiveSpawnHz]);

  // Spin up and tear down the generator alongside the component lifecycle.
  useEffect(() => {
    const generator = createMockGenerator({ currency, density });
    generatorRef.current = generator;
    generator.start(handleEmit);
    return () => {
      generator.stop();
      generatorRef.current = null;
    };
  }, [currency, density, handleEmit]);

  // Auto-degrade density when the tab sustains a sub-threshold FPS rate.
  // Runs only while unmounted-to-degraded path is available (high -> medium
  // -> low). Once at low the sampler detaches and leaves the component idle.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (density === 'low') return;

    let frameId = 0;
    let frames = 0;
    const started = performance.now();

    const loop = (now: number) => {
      frames += 1;
      if (now - started < FPS_SAMPLE_WINDOW_MS) {
        frameId = window.requestAnimationFrame(loop);
        return;
      }
      const elapsedSeconds = (now - started) / 1000;
      const fps = frames / Math.max(elapsedSeconds, 0.001);
      if (fps < FPS_DEGRADE_THRESHOLD) {
        const next = stepDownDensity(density);
        if (next) {
          if (typeof console !== 'undefined') {
            console.warn(
              `[rhea] TransactionPulse degraded density "${density}" -> "${next}" (fps ~${fps.toFixed(1)}).`,
            );
          }
          setDensity(next);
        }
      }
    };

    frameId = window.requestAnimationFrame(loop);
    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [density]);

  // Hover pause wiring. Only acts when pauseOnHover is true per contract
  // testing surface section 9. Generator pause means new pulses stop; the
  // existing pulses finish their dwell so the UI never flashes empty.
  const onMouseEnter = useCallback(() => {
    if (!pauseOnHover) return;
    setPaused(true);
    generatorRef.current?.pause();
  }, [pauseOnHover]);

  const onMouseLeave = useCallback(() => {
    if (!pauseOnHover) return;
    setPaused(false);
    generatorRef.current?.resume();
  }, [pauseOnHover]);

  const laneHeight = useMemo(() => {
    const headerHeight = 48;
    return Math.max((height_px - headerHeight) / VISUAL_LANE_COUNT, 20);
  }, [height_px]);

  const containerStyle = useMemo<CSSProperties>(() => ({
    position: 'relative',
    width: '100%',
    height: `${height_px}px`,
    overflow: 'hidden',
    opacity,
    borderRadius: '12px',
    background:
      'linear-gradient(180deg, oklch(0.18 0.02 260 / 0.55) 0%, oklch(0.12 0.03 280 / 0.35) 100%)',
    border: '1px solid oklch(0.45 0.08 260 / 0.35)',
    fontFamily: 'var(--font-family-body, system-ui, -apple-system, sans-serif)',
    color: 'oklch(0.94 0.01 260)',
  }), [height_px, opacity]);

  return (
    <section
      role="region"
      aria-label={`${header.title}: ${header.subtitle}`}
      data-testid="transaction-pulse"
      data-synthetic="true"
      data-paused={paused ? 'true' : 'false'}
      data-density={density}
      className={className}
      style={containerStyle}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <header
        style={{
          position: 'relative',
          zIndex: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          borderBottom: '1px solid oklch(0.45 0.08 260 / 0.25)',
          background: 'oklch(0.14 0.02 270 / 0.75)',
          backdropFilter: 'blur(6px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span
            aria-hidden="true"
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '999px',
              background: paused
                ? 'oklch(0.70 0.18 55)'
                : 'oklch(0.80 0.18 150)',
              boxShadow: paused
                ? 'none'
                : '0 0 12px oklch(0.80 0.18 150 / 0.85)',
              animation: paused ? 'none' : 'rhea-breathe 1.8s ease-in-out infinite',
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
            <strong style={{ fontSize: '0.88rem', letterSpacing: '0.01em' }}>
              {header.title}
            </strong>
            <span
              style={{
                fontSize: '0.72rem',
                opacity: 0.78,
                marginTop: '2px',
              }}
            >
              {header.subtitle}
            </span>
          </div>
        </div>
        <span
          aria-label="Mock data badge"
          style={{
            fontSize: '0.68rem',
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            padding: '4px 10px',
            borderRadius: '999px',
            background: 'oklch(0.72 0.22 340 / 0.18)',
            color: 'oklch(0.88 0.15 340)',
            border: '1px solid oklch(0.72 0.22 340 / 0.45)',
          }}
        >
          MOCK
        </span>
      </header>

      <div
        style={{
          position: 'relative',
          height: `calc(100% - 48px)`,
          width: '100%',
        }}
        aria-hidden="true"
      >
        {Array.from({ length: VISUAL_LANE_COUNT }).map((_, laneIdx) => (
          <div
            key={`lane-${laneIdx}`}
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: `${laneIdx * laneHeight}px`,
              height: '1px',
              background:
                'linear-gradient(90deg, transparent 0%, oklch(0.55 0.08 260 / 0.25) 15%, oklch(0.55 0.08 260 / 0.25) 85%, transparent 100%)',
            }}
          />
        ))}

        <AnimatePresence>
          {pulses.map((pulse) => {
            const color = KIND_TO_OKLCH[pulse.kind];
            const label = KIND_TO_LABEL[pulse.kind];
            const topPx = pulse.lane * laneHeight + laneHeight / 2 - 14;
            return (
              <motion.div
                key={pulse.id}
                aria-hidden="true"
                title={`${label}: ${pulse.formatted_amount} (synthetic demo data)`}
                data-synthetic="true"
                data-kind={pulse.kind}
                data-amount-usd={pulse.amount_usd.toString()}
                data-currency={pulse.currency}
                data-pulse-id={pulse.id}
                initial={{
                  left: '-12%',
                  opacity: 0,
                  scale: reduceMotion ? 1 : 0.85,
                }}
                animate={{
                  left: ['-12%', '42%', '102%'],
                  opacity: [0, 1, 0],
                  scale: reduceMotion ? 1 : [0.85, 1, 0.9],
                }}
                exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.85 }}
                transition={{
                  duration: PULSE_DWELL_MS / 1000,
                  ease: 'easeInOut',
                  times: [0, 0.5, 1],
                }}
                style={{
                  position: 'absolute',
                  top: `${topPx}px`,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '4px 10px',
                  borderRadius: '999px',
                  background: `color-mix(in oklch, ${color} 26%, transparent)`,
                  border: `1px solid ${color}`,
                  color,
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  letterSpacing: '0.02em',
                  whiteSpace: 'nowrap',
                  boxShadow: reduceMotion
                    ? 'none'
                    : `0 0 18px color-mix(in oklch, ${color} 35%, transparent)`,
                  backdropFilter: 'blur(4px)',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '999px',
                    background: color,
                    boxShadow: reduceMotion ? 'none' : `0 0 8px ${color}`,
                  }}
                />
                <span>{label}</span>
                <span style={{ opacity: 0.75 }}>{pulse.formatted_amount}</span>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {pulses.length === 0 && (
          <div
            aria-live="polite"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              fontSize: '0.72rem',
              opacity: 0.5,
              pointerEvents: 'none',
            }}
          >
            Spinning up synthetic activity...
          </div>
        )}
      </div>

      <style>{`
        @keyframes rhea-breathe {
          0%, 100% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.35); opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-testid="transaction-pulse"] [aria-hidden="true"] { animation: none !important; }
        }
      `}</style>
    </section>
  );
}

export default TransactionPulse;
