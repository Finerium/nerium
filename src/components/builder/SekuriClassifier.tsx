'use client';

//
// src/components/builder/SekuriClassifier.tsx
//
// Sekuri integration: client-side deterministic complexity classifier UI
// wrapper. Runs `classifyPrompt(text)` synchronously, shows a "yapping"
// thinking-dots animation for 2-3 seconds (V6 spec), then surfaces the
// matched tier + rationale. The yapping pause is purely theatrical: the
// underlying classifier is regex-only and resolves in < 1ms.
//
// Used inline in the Apollo Builder Workshop dialogue overlay (greeting ->
// classifying phase). Decoupled from the dialogue store so a future
// non-dialogue surface (e.g., a documentation playground) can mount it.
//
// No em dash, no emoji.
//

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { motion } from 'framer-motion';

import { classifyPrompt, type SekuriClassification } from '../../lib/sekuri';

export interface SekuriClassifierProps {
  prompt: string;
  // Theatrical pause before the result lands. Defaults to 2200 ms which
  // sits inside the V6 "2-3 seconds" yapping window.
  thinkingDelayMs?: number;
  onResult?: (result: SekuriClassification) => void;
  // When present, the classifier renders nothing until `active` flips true.
  // Mounting the component implicitly starts classification, so callers
  // gating the overlay phase should mount only when classification is
  // actually desired.
  active?: boolean;
}

export function SekuriClassifier({
  prompt,
  thinkingDelayMs = 2200,
  onResult,
  active = true,
}: SekuriClassifierProps) {
  const [stage, setStage] = useState<'thinking' | 'result'>('thinking');
  const [classification, setClassification] = useState<SekuriClassification | null>(null);
  const firedRef = useRef(false);

  useEffect(() => {
    if (!active) return;
    setStage('thinking');
    setClassification(null);
    firedRef.current = false;

    const handle = setTimeout(() => {
      const result = classifyPrompt(prompt);
      setClassification(result);
      setStage('result');
      if (!firedRef.current) {
        firedRef.current = true;
        onResult?.(result);
      }
    }, thinkingDelayMs);

    return () => clearTimeout(handle);
  }, [active, prompt, thinkingDelayMs, onResult]);

  if (!active) return null;

  return (
    <section
      style={containerStyle}
      data-testid="sekuri-classifier"
      data-stage={stage}
      aria-live="polite"
    >
      {stage === 'thinking' ? (
        <ThinkingState />
      ) : classification ? (
        <ResultState classification={classification} prompt={prompt} />
      ) : null}
    </section>
  );
}

function ThinkingState() {
  return (
    <div style={thinkingRowStyle} data-testid="sekuri-classifier-thinking">
      <span style={thinkingLabelStyle}>Apollo is reading your prompt</span>
      <span style={dotsStyle} aria-hidden="true">
        <motion.span
          style={dotStyle}
          animate={{ opacity: [0.2, 1, 0.2] }}
          transition={{ duration: 1.0, repeat: Infinity, delay: 0 }}
        />
        <motion.span
          style={dotStyle}
          animate={{ opacity: [0.2, 1, 0.2] }}
          transition={{ duration: 1.0, repeat: Infinity, delay: 0.18 }}
        />
        <motion.span
          style={dotStyle}
          animate={{ opacity: [0.2, 1, 0.2] }}
          transition={{ duration: 1.0, repeat: Infinity, delay: 0.36 }}
        />
      </span>
    </div>
  );
}

interface ResultStateProps {
  classification: SekuriClassification;
  prompt: string;
}

function ResultState({ classification, prompt }: ResultStateProps) {
  const matchedSummary = classification.matches[classification.tier];
  return (
    <div
      style={resultRowStyle}
      data-testid="sekuri-classifier-result"
      data-tier={classification.tier}
    >
      <div style={tierPillStyle}>
        <span style={tierPillLabelStyle}>Sekuri tier</span>
        <span style={tierPillValueStyle}>{classification.tier.toUpperCase()}</span>
      </div>
      <div style={rationaleColumnStyle}>
        <span style={rationaleLabelStyle}>Heuristic match</span>
        <span style={rationaleValueStyle}>{classification.rationale}</span>
        {matchedSummary.length > 0 ? (
          <div style={chipsRowStyle} aria-label="Matched signals">
            {matchedSummary.slice(0, 6).map((label) => (
              <span key={label} style={chipStyle}>
                {label}
              </span>
            ))}
          </div>
        ) : null}
        <span style={promptEchoStyle} aria-label="Prompt echo">
          "{prompt.length > 90 ? `${prompt.slice(0, 87)}...` : prompt}"
        </span>
      </div>
    </div>
  );
}

const FONT_DISPLAY =
  "var(--font-space-grotesk, 'Space Grotesk', system-ui, sans-serif)";
const FONT_MONO =
  "var(--font-jetbrains-mono, 'JetBrains Mono', 'Courier New', monospace)";
const FONT_RETRO = "var(--font-vt323, 'VT323', 'Courier New', monospace)";

const containerStyle: CSSProperties = {
  padding: '0.75rem 0.85rem',
  borderRadius: '0.5rem',
  background: 'oklch(0.18 0.015 250 / 0.55)',
  border: '1px solid oklch(0.32 0.02 250)',
  fontFamily: FONT_DISPLAY,
  color: 'oklch(0.95 0.01 85)',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
};

const thinkingRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.7rem',
};

const thinkingLabelStyle: CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: '12px',
  letterSpacing: '0.04em',
  color: 'oklch(0.88 0.15 140)',
};

const dotsStyle: CSSProperties = {
  display: 'inline-flex',
  gap: '0.25rem',
};

const dotStyle: CSSProperties = {
  display: 'inline-block',
  width: '8px',
  height: '8px',
  borderRadius: '999px',
  background: 'oklch(0.88 0.15 140)',
};

const resultRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '0.85rem',
};

const tierPillStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '0.15rem',
  padding: '0.5rem 0.7rem',
  borderRadius: '0.45rem',
  background: 'oklch(0.78 0.17 55 / 0.16)',
  border: '1.5px solid oklch(0.78 0.17 55)',
  minWidth: '92px',
};

const tierPillLabelStyle: CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: '9px',
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
  color: 'oklch(0.72 0.02 250)',
};

const tierPillValueStyle: CSSProperties = {
  fontFamily: FONT_RETRO,
  fontSize: '20px',
  letterSpacing: '0.06em',
  color: 'oklch(0.78 0.17 55)',
};

const rationaleColumnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.3rem',
  flex: 1,
};

const rationaleLabelStyle: CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: '9px',
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
  color: 'oklch(0.72 0.02 250)',
};

const rationaleValueStyle: CSSProperties = {
  fontFamily: FONT_DISPLAY,
  fontSize: '13px',
  color: 'oklch(0.95 0.01 85)',
};

const chipsRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.3rem',
};

const chipStyle: CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: '10px',
  letterSpacing: '0.04em',
  padding: '0.15rem 0.4rem',
  borderRadius: '999px',
  border: '1px solid oklch(0.32 0.02 250)',
  background: 'oklch(0.18 0.015 250 / 0.6)',
  color: 'oklch(0.72 0.02 250)',
};

const promptEchoStyle: CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: '11px',
  fontStyle: 'italic',
  color: 'oklch(0.72 0.02 250)',
};
