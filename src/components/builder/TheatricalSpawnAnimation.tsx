'use client';

//
// src/components/builder/TheatricalSpawnAnimation.tsx
//
// Reusable theatrical animation that visualizes the multi-terminal Builder
// spawn sequence WITHOUT invoking any backend. Pure visual scaffolding for
// the V6 demo theatrical lock.
//
// Rendered as a fixed-position overlay above the Phaser canvas. Sequence:
//
//   1. Terminal boxes fade in one by one (0..N).
//   2. Each terminal auto-types the spawn command from `spawn_command_template`
//      with the per-vendor flag substitution.
//   3. Connecting lines animate between parallel-group terminals.
//   4. "BUILD COMPLETE" reveal at the end.
//
// Accessibility:
//   - Skip button (default focus) finishes the animation immediately.
//   - aria-live="polite" on the sequence so screen readers track stage.
//   - `prefers-reduced-motion`: collapses the animation to a single static
//     frame with the final structure already in place.
//
// Honest-claim caption visible throughout. No live invocation, no cost burn.
//
// No em dash, no emoji.
//

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { motion, useReducedMotion, AnimatePresence } from 'framer-motion';

import type { SekuriTemplate } from '../../lib/sekuri';

const SPAWN_HONEST_CLAIM_CAPTION =
  'Demo flow uses pre-canned templates. Live runtime reactivates post-launch.';

export interface TheatricalSpawnAnimationProps {
  template: SekuriTemplate;
  perAgentVendorOverrides: Record<string, string>;
  spawnCommandTemplate?: string;
  onComplete?: () => void;
  onSkip?: () => void;
  // When true, the animation runs once on mount. When false, it stays
  // paused on its first frame until the prop flips true.
  active: boolean;
}

// Vendor accent palette mirrors ModelSelectionModal so the per-vendor
// terminal boxes color-match the badge selection.
const VENDOR_ACCENT: Record<string, string> = {
  anthropic_opus_4_7: 'oklch(0.88 0.15 140)',
  anthropic_sonnet_4_6: 'oklch(0.78 0.13 150)',
  anthropic_haiku_4_5: 'oklch(0.72 0.10 160)',
  google_gemini_pro: 'oklch(0.83 0.15 200)',
  google_gemini_flash: 'oklch(0.78 0.13 210)',
  openai: 'oklch(0.95 0.01 85)',
  higgsfield: 'oklch(0.66 0.27 5)',
  seedance: 'oklch(0.62 0.22 295)',
  meta: 'oklch(0.55 0.20 250)',
  mistral: 'oklch(0.78 0.17 55)',
};

function vendorAccent(vendorKey: string): string {
  // Normalize separators (Sekuri uses `anthropic_opus_4.7` and
  // `anthropic_opus_4_7`; mapping keeps both shapes).
  const norm = vendorKey
    .toLowerCase()
    .replace(/\./g, '_')
    .replace(/[\s-]/g, '_');
  if (VENDOR_ACCENT[norm]) return VENDOR_ACCENT[norm];
  if (norm.startsWith('anthropic')) return VENDOR_ACCENT.anthropic_opus_4_7;
  if (norm.startsWith('google')) return VENDOR_ACCENT.google_gemini_pro;
  if (norm.startsWith('openai')) return VENDOR_ACCENT.openai;
  if (norm.startsWith('meta')) return VENDOR_ACCENT.meta;
  if (norm.startsWith('mistral')) return VENDOR_ACCENT.mistral;
  if (norm.startsWith('higgsfield')) return VENDOR_ACCENT.higgsfield;
  if (norm.startsWith('seedance')) return VENDOR_ACCENT.seedance;
  return 'oklch(0.72 0.02 250)';
}

interface TerminalEntry {
  id: string;
  agent: string;
  vendor: string;
  group: string;
  command: string;
  accent: string;
}

function defaultCommand(vendor: string, complexity: string): string {
  if (vendor.startsWith('anthropic')) {
    const tier = complexity === 'large' ? 'max' : 'xhigh';
    return `claude --dangerously-skip-permissions /effort ${tier}`;
  }
  if (vendor.startsWith('google_gemini')) {
    return `gemini --model ${vendor.replace('google_', '')} --plan`;
  }
  if (vendor.startsWith('openai')) {
    return `codex --model ${vendor.replace('openai_', '')} --autonomous`;
  }
  if (vendor === 'higgsfield') {
    return 'higgsfield generate --asset-spec spec.json';
  }
  if (vendor === 'seedance') {
    return 'seedance render --scene scene.json';
  }
  if (vendor.startsWith('meta')) {
    return `llama-runner --model ${vendor.replace('meta_', '')} --workers 4`;
  }
  if (vendor.startsWith('mistral')) {
    return `mistral-cli --model ${vendor.replace('mistral_', '')} --plan`;
  }
  return `${vendor} run --autonomous`;
}

function buildTerminals(
  template: SekuriTemplate,
  perAgentOverrides: Record<string, string>,
  commandTemplate?: string,
): TerminalEntry[] {
  const out: TerminalEntry[] = [];
  for (const group of template.parallel_groups) {
    for (const agent of group.agents) {
      const vendor =
        perAgentOverrides[agent] ??
        template.user_options.per_agent_vendor_overrides[agent] ??
        'anthropic_opus_4.7';
      const cmd = commandTemplate
        ? commandTemplate
            .replace('{vendor}', vendor)
            .replace('{agent}', agent)
        : defaultCommand(vendor, template.complexity);
      out.push({
        id: `${group.group}_${agent}`,
        agent,
        vendor,
        group: group.group,
        command: cmd,
        accent: vendorAccent(vendor),
      });
    }
  }
  return out;
}

const TYPE_INTERVAL_MS = 14;
const STAGGER_MS = 220;

export function TheatricalSpawnAnimation({
  template,
  perAgentVendorOverrides,
  spawnCommandTemplate,
  onComplete,
  onSkip,
  active,
}: TheatricalSpawnAnimationProps) {
  const reducedMotion = useReducedMotion();

  const terminals = useMemo<TerminalEntry[]>(
    () => buildTerminals(template, perAgentVendorOverrides, spawnCommandTemplate),
    [template, perAgentVendorOverrides, spawnCommandTemplate],
  );

  const [revealedCount, setRevealedCount] = useState(0);
  const [typedChars, setTypedChars] = useState<Record<string, number>>({});
  const [showFinal, setShowFinal] = useState(false);
  const skipBtnRef = useRef<HTMLButtonElement | null>(null);
  const completedFiredRef = useRef(false);

  const finalize = useCallback(() => {
    setRevealedCount(terminals.length);
    setTypedChars(
      terminals.reduce<Record<string, number>>((acc, t) => {
        acc[t.id] = t.command.length;
        return acc;
      }, {}),
    );
    setShowFinal(true);
    if (!completedFiredRef.current) {
      completedFiredRef.current = true;
      onComplete?.();
    }
  }, [terminals, onComplete]);

  useEffect(() => {
    if (!active) return;
    completedFiredRef.current = false;
    setRevealedCount(0);
    setTypedChars({});
    setShowFinal(false);

    if (reducedMotion) {
      finalize();
      return;
    }

    let mounted = true;
    const timeouts: Array<ReturnType<typeof setTimeout>> = [];
    const intervals: Array<ReturnType<typeof setInterval>> = [];

    terminals.forEach((t, idx) => {
      const revealAt = idx * STAGGER_MS;
      const revealHandle = setTimeout(() => {
        if (!mounted) return;
        setRevealedCount((c) => Math.max(c, idx + 1));
        // Begin auto-typing after reveal.
        const cmd = t.command;
        let cursor = 0;
        const interval = setInterval(() => {
          if (!mounted) return;
          cursor += 1;
          setTypedChars((prev) => ({ ...prev, [t.id]: cursor }));
          if (cursor >= cmd.length) {
            clearInterval(interval);
          }
        }, TYPE_INTERVAL_MS);
        intervals.push(interval);
      }, revealAt);
      timeouts.push(revealHandle);
    });

    const finalDelay =
      terminals.length * STAGGER_MS +
      (terminals[terminals.length - 1]?.command.length ?? 0) * TYPE_INTERVAL_MS +
      400;
    const finalHandle = setTimeout(() => {
      if (!mounted) return;
      setShowFinal(true);
      if (!completedFiredRef.current) {
        completedFiredRef.current = true;
        onComplete?.();
      }
    }, finalDelay);
    timeouts.push(finalHandle);

    return () => {
      mounted = false;
      timeouts.forEach((h) => clearTimeout(h));
      intervals.forEach((h) => clearInterval(h));
    };
  }, [active, reducedMotion, terminals, finalize, onComplete]);

  useEffect(() => {
    if (active && skipBtnRef.current) {
      skipBtnRef.current.focus();
    }
  }, [active]);

  if (!active) return null;

  // Group terminals by parallel group label so we can visually box per group.
  const groupedByLabel = new Map<string, TerminalEntry[]>();
  for (const t of terminals) {
    const arr = groupedByLabel.get(t.group) ?? [];
    arr.push(t);
    groupedByLabel.set(t.group, arr);
  }
  const groupLabels = Array.from(groupedByLabel.keys());

  return (
    <div
      style={overlayStyle}
      role="dialog"
      aria-modal="true"
      aria-label="Theatrical Builder spawn animation"
      data-testid="theatrical-spawn-animation"
    >
      <header style={headerStyle}>
        <span style={eyebrowStyle}>NERIUM Builder // Theatrical spawn</span>
        <button
          ref={skipBtnRef}
          type="button"
          onClick={() => {
            finalize();
            onSkip?.();
          }}
          style={skipBtnStyle}
          aria-label="Skip animation"
          data-testid="theatrical-spawn-skip"
        >
          Skip
        </button>
      </header>

      <p style={honestClaimStyle} role="note">
        {SPAWN_HONEST_CLAIM_CAPTION}
      </p>

      <section
        aria-live="polite"
        aria-label={`Spawning ${terminals.length} agents across ${groupLabels.length} parallel groups`}
        style={contentStyle}
        data-testid="theatrical-spawn-content"
      >
        <div style={groupsContainerStyle}>
          {groupLabels.map((groupLabel) => (
            <div key={groupLabel} style={groupBoxStyle}>
              <span style={groupLabelStyle}>{groupLabel}</span>
              <div style={terminalsRowStyle}>
                {groupedByLabel.get(groupLabel)!.map((t) => {
                  const idx = terminals.findIndex((x) => x.id === t.id);
                  const isRevealed = idx < revealedCount;
                  const typed = typedChars[t.id] ?? 0;
                  return (
                    <AnimatePresence key={t.id}>
                      {isRevealed ? (
                        <motion.div
                          initial={
                            reducedMotion
                              ? { opacity: 1 }
                              : { opacity: 0, y: 10, scale: 0.95 }
                          }
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          transition={{ duration: 0.18 }}
                          style={{
                            ...terminalBoxStyle,
                            borderColor: t.accent,
                            boxShadow: `0 0 0 1px ${t.accent} inset, 0 0 18px -8px ${t.accent}`,
                          }}
                          data-testid={`terminal-${t.id}`}
                          data-vendor={t.vendor}
                        >
                          <div style={terminalChromeStyle}>
                            <span style={{ ...terminalDotStyle, background: '#ff5f56' }} />
                            <span style={{ ...terminalDotStyle, background: '#ffbd2e' }} />
                            <span style={{ ...terminalDotStyle, background: '#27c93f' }} />
                            <span style={terminalTitleStyle}>{t.agent}</span>
                          </div>
                          <pre style={terminalBodyStyle}>
                            <span style={{ color: t.accent }}>{'>'} </span>
                            {t.command.slice(0, typed)}
                            {typed < t.command.length ? (
                              <span style={blinkCursorStyle}>_</span>
                            ) : (
                              <span style={{ ...okBadgeStyle, color: t.accent }}>OK</span>
                            )}
                          </pre>
                          <span style={{ ...terminalVendorChipStyle, color: t.accent, borderColor: t.accent }}>
                            {t.vendor.replace(/_/g, ' ')}
                          </span>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <AnimatePresence>
          {showFinal ? (
            <motion.div
              initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.24 }}
              style={finalReveealStyle}
              data-testid="theatrical-spawn-final"
            >
              <span style={appIconStyle} aria-hidden="true">
                APP
              </span>
              <span style={finalLabelStyle}>BUILD COMPLETE</span>
              <span style={finalDetailStyle}>
                {terminals.length} agents, {groupLabels.length} parallel groups,
                ~{template.estimated_duration_minutes} min wallclock estimate.
              </span>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </section>
    </div>
  );
}

const FONT_DISPLAY =
  "var(--font-space-grotesk, 'Space Grotesk', system-ui, sans-serif)";
const FONT_RETRO = "var(--font-vt323, 'VT323', 'Courier New', monospace)";
const FONT_MONO =
  "var(--font-jetbrains-mono, 'JetBrains Mono', 'Courier New', monospace)";

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 60,
  background: 'oklch(0.10 0.012 250 / 0.92)',
  backdropFilter: 'blur(4px)',
  display: 'flex',
  flexDirection: 'column',
  padding: '1.25rem 1.5rem',
  fontFamily: FONT_DISPLAY,
  color: 'oklch(0.95 0.01 85)',
  overflowY: 'auto',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '0.4rem',
};

const eyebrowStyle: CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: '10px',
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
  color: 'oklch(0.88 0.15 140)',
};

const skipBtnStyle: CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: '11px',
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  padding: '0.4rem 0.7rem',
  borderRadius: '0.4rem',
  background: 'transparent',
  border: '1px solid oklch(0.32 0.02 250)',
  color: 'oklch(0.72 0.02 250)',
  cursor: 'pointer',
};

const honestClaimStyle: CSSProperties = {
  margin: '0 0 0.85rem 0',
  padding: '0.45rem 0.7rem',
  borderRadius: '0.4rem',
  background: 'oklch(0.18 0.015 250 / 0.65)',
  border: '1px dashed oklch(0.32 0.02 250)',
  fontFamily: FONT_MONO,
  fontSize: '11px',
  color: 'oklch(0.72 0.02 250)',
};

const contentStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
};

const groupsContainerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.85rem',
};

const groupBoxStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
  padding: '0.75rem',
  borderRadius: '0.6rem',
  background: 'oklch(0.14 0.012 250 / 0.7)',
  border: '1px solid oklch(0.32 0.02 250)',
};

const groupLabelStyle: CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: '10px',
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
  color: 'oklch(0.88 0.15 140)',
};

const terminalsRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '0.6rem',
};

const terminalBoxStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.35rem',
  padding: '0.5rem 0.6rem',
  borderRadius: '0.45rem',
  background: 'oklch(0.10 0.012 250)',
  border: '1.5px solid oklch(0.32 0.02 250)',
  fontFamily: FONT_MONO,
  fontSize: '11px',
};

const terminalChromeStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.3rem',
};

const terminalDotStyle: CSSProperties = {
  width: '8px',
  height: '8px',
  borderRadius: '999px',
};

const terminalTitleStyle: CSSProperties = {
  fontFamily: FONT_RETRO,
  fontSize: '13px',
  marginLeft: '0.3rem',
  color: 'oklch(0.95 0.01 85)',
};

const terminalBodyStyle: CSSProperties = {
  margin: 0,
  padding: '0.3rem 0',
  fontFamily: FONT_MONO,
  fontSize: '11px',
  color: 'oklch(0.95 0.01 85)',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  minHeight: '1.4rem',
};

const blinkCursorStyle: CSSProperties = {
  display: 'inline-block',
  marginLeft: '2px',
  animation: 'sekuri-cursor-blink 1s steps(1) infinite',
};

const okBadgeStyle: CSSProperties = {
  marginLeft: '0.5rem',
  fontFamily: FONT_MONO,
  fontSize: '10px',
  letterSpacing: '0.22em',
};

const terminalVendorChipStyle: CSSProperties = {
  alignSelf: 'flex-start',
  fontFamily: FONT_MONO,
  fontSize: '9px',
  textTransform: 'uppercase',
  letterSpacing: '0.18em',
  padding: '0.1rem 0.35rem',
  borderRadius: '999px',
  border: '1px solid currentColor',
};

const finalReveealStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.5rem',
  padding: '1rem',
  borderRadius: '0.6rem',
  background: 'oklch(0.14 0.012 250)',
  border: '1.5px solid oklch(0.88 0.15 140)',
  boxShadow: '0 0 0 1px oklch(0.88 0.15 140) inset, 0 0 32px -8px oklch(0.88 0.15 140)',
};

const appIconStyle: CSSProperties = {
  fontFamily: FONT_RETRO,
  fontSize: '32px',
  letterSpacing: '0.08em',
  color: 'oklch(0.88 0.15 140)',
  padding: '0.4rem 0.85rem',
  borderRadius: '0.45rem',
  border: '2px solid oklch(0.88 0.15 140)',
};

const finalLabelStyle: CSSProperties = {
  fontFamily: FONT_DISPLAY,
  fontSize: '1.5rem',
  fontWeight: 700,
  color: 'oklch(0.88 0.15 140)',
  letterSpacing: '0.18em',
};

const finalDetailStyle: CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: '11px',
  color: 'oklch(0.72 0.02 250)',
};

// Inject the cursor blink keyframe into a style tag once. Avoids global CSS
// dependency at the route level so the component is portable.
function CursorBlinkKeyframes() {
  return (
    <style>{`
      @keyframes sekuri-cursor-blink {
        50% { opacity: 0; }
      }
    `}</style>
  );
}

export default function TheatricalSpawnAnimationWithKeyframes(
  props: TheatricalSpawnAnimationProps,
) {
  return (
    <>
      <CursorBlinkKeyframes />
      <TheatricalSpawnAnimation {...props} />
    </>
  );
}
