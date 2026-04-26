'use client';

//
// src/components/builder/ApiKeyModal.tsx
//
// Aether-Vercel T6 Phase 1.5: BYOK + theatrical toggle modal.
//
// Triggered when the apolloBuilderDialogueStore phase advances to
// `awaiting_runtime_choice` (between structure_proposal accept and
// spawning). The user picks Theatrical (default canned demo flow) OR
// Live (Bring Your Own Key Anthropic API). Live keys are stored in
// sessionStorage NEVER localStorage, never sent to NERIUM logs/DB/Redis,
// and forwarded directly browser to Anthropic OR through a stateless
// backend forwarder that does not log the key value.
//
// Hard constraints
// ----------------
// - Default selection is Theatrical. Live requires explicit opt-in.
// - Client-side regex validation: /^sk-ant-api03-[A-Za-z0-9_-]{93,}$/
// - "Test key" button (optional) calls Anthropic /v1/messages with a
//   minimal ping; HTTP 200 = green check, HTTP 401 = red X. Network
//   error = neutral retry message.
// - sessionStorage only. Cleared on tab close. Never localStorage.
// - "Clear key" button visible whenever a key is currently stored.
// - Honest-claim caption pinned to bottom of modal.
// - Rate limit indicator: "Live runs remaining this session: X / 5"
// - ESC + click-outside both close the modal (default to theatrical).
// - Match landing palette OKLCH ink + phos + bone + cyberpunk accents.
//
// No em dash, no emoji.
//

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

import { useApolloBuilderDialogueStore } from '../../stores/apolloBuilderDialogueStore';

// Anthropic API key shape (post 2024 rotation): always starts with
// `sk-ant-api03-` and has a base64url tail of at least 93 characters.
// Keep the regex tolerant on the high end (no upper bound) so future
// length increases do not break the modal.
export const ANTHROPIC_API_KEY_REGEX = /^sk-ant-api03-[A-Za-z0-9_-]{93,}$/;

const HONEST_CLAIM_CAPTION =
  'Your API key is sent directly from your browser to Anthropic. ' +
  'NERIUM does not log, store, or transmit keys. Usage charges go to ' +
  'your Anthropic account, not NERIUM.';

const TEST_KEY_TIMEOUT_MS = 10_000;

type TestKeyState = 'idle' | 'testing' | 'ok' | 'invalid' | 'network_error';

export interface ApiKeyModalProps {
  // When omitted, the modal observes the apolloBuilderDialogueStore
  // phase === 'awaiting_runtime_choice' and renders itself. Tests can
  // pass `forceOpen` to mount unconditionally.
  forceOpen?: boolean;
  // Test hook: lets a Playwright spec swap the network call with a mock.
  testKeyEndpoint?: (apiKey: string) => Promise<TestKeyState>;
  // Optional callback fired after the user confirms the modal in either
  // mode. Default behavior: dispatch the dialogue store transition to
  // `spawning`. Tests can override.
  onConfirm?: (mode: 'theatrical' | 'live') => void;
}

export function ApiKeyModal({
  forceOpen,
  testKeyEndpoint,
  onConfirm,
}: ApiKeyModalProps = {}) {
  const phase = useApolloBuilderDialogueStore((s) => s.phase);
  const runtimeMode = useApolloBuilderDialogueStore((s) => s.runtimeMode);
  const userApiKey = useApolloBuilderDialogueStore((s) => s.userApiKey);
  const liveRunsRemaining = useApolloBuilderDialogueStore(
    (s) => s.liveRunsRemaining,
  );
  const selectTheatrical = useApolloBuilderDialogueStore(
    (s) => s.selectTheatrical,
  );
  const selectLive = useApolloBuilderDialogueStore((s) => s.selectLive);
  const clearApiKey = useApolloBuilderDialogueStore((s) => s.clearApiKey);
  const goSpawning = useApolloBuilderDialogueStore((s) => s.goSpawning);

  const reducedMotion = useReducedMotion();
  const titleId = useId();
  const open = forceOpen ?? phase === 'awaiting_runtime_choice';

  // -------------------------------------------------------------------------
  // Local form state. The user's draft API key only lives in component state
  // until they Confirm; even then it is committed to sessionStorage NOT
  // localStorage. We never echo the key into a log, never send it to NERIUM
  // persistence.
  // -------------------------------------------------------------------------
  const [mode, setMode] = useState<'theatrical' | 'live'>(runtimeMode);
  const [draftKey, setDraftKey] = useState<string>(userApiKey ?? '');
  const [showLivePanel, setShowLivePanel] = useState<boolean>(
    runtimeMode === 'live',
  );
  const [testKeyState, setTestKeyState] = useState<TestKeyState>('idle');
  const [validationError, setValidationError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  // Re-sync local state when the store changes (e.g. user closes and
  // reopens the modal mid-session).
  useEffect(() => {
    if (open) {
      setMode(runtimeMode);
      setDraftKey(userApiKey ?? '');
      setShowLivePanel(runtimeMode === 'live');
      setTestKeyState('idle');
      setValidationError(null);
    }
  }, [open, runtimeMode, userApiKey]);

  // -------------------------------------------------------------------------
  // ESC + click-outside both close the modal. ESC defaults to theatrical
  // (per spec: "ESC + click-outside closes (defaults to theatrical)").
  // -------------------------------------------------------------------------
  const handleClose = useCallback(() => {
    selectTheatrical();
    onConfirm?.('theatrical');
    goSpawning();
  }, [selectTheatrical, onConfirm, goSpawning]);

  useEffect(() => {
    if (!open) return;
    const handler = (evt: KeyboardEvent) => {
      if (evt.key === 'Escape') {
        evt.preventDefault();
        handleClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, handleClose]);

  // Focus the close button on open so keyboard nav has a sensible anchor.
  useEffect(() => {
    if (open && closeBtnRef.current) {
      closeBtnRef.current.focus();
    }
  }, [open]);

  // -------------------------------------------------------------------------
  // Test key flow. Default endpoint hits Anthropic directly with a minimal
  // 1-token ping. CORS support depends on Anthropic's headers; if browser
  // blocks the call, the modal surfaces a neutral "Test unavailable" state
  // and the user can still confirm. This matches the V6 ferry decision: if
  // CORS fails, halt + ferry, V6 may switch to backend-proxy-only Test path.
  // -------------------------------------------------------------------------
  const defaultTestKey = useCallback(
    async (apiKey: string): Promise<TestKeyState> => {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), TEST_KEY_TIMEOUT_MS);
      try {
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          mode: 'cors',
          headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'ping' }],
          }),
          signal: ctrl.signal,
        });
        clearTimeout(timeout);
        if (resp.status >= 200 && resp.status < 300) return 'ok';
        if (resp.status === 401 || resp.status === 403) return 'invalid';
        return 'network_error';
      } catch {
        clearTimeout(timeout);
        return 'network_error';
      }
    },
    [],
  );

  const runTestKey = useCallback(async () => {
    setValidationError(null);
    if (!ANTHROPIC_API_KEY_REGEX.test(draftKey)) {
      setValidationError(
        'Key format invalid. Expected sk-ant-api03-... (Anthropic API key).',
      );
      setTestKeyState('idle');
      return;
    }
    setTestKeyState('testing');
    const fn = testKeyEndpoint ?? defaultTestKey;
    const result = await fn(draftKey);
    setTestKeyState(result);
  }, [draftKey, testKeyEndpoint, defaultTestKey]);

  // -------------------------------------------------------------------------
  // Confirm button: persist BYOK choice to store + advance dialogue phase.
  // -------------------------------------------------------------------------
  const handleConfirm = useCallback(() => {
    if (mode === 'theatrical') {
      selectTheatrical();
      onConfirm?.('theatrical');
      goSpawning();
      return;
    }
    // Live mode requires a validated key.
    const trimmed = draftKey.trim();
    if (!ANTHROPIC_API_KEY_REGEX.test(trimmed)) {
      setValidationError(
        'Key format invalid. Expected sk-ant-api03-... (Anthropic API key).',
      );
      return;
    }
    if (liveRunsRemaining <= 0) {
      setValidationError(
        'Live runs exhausted for this session. Falling back to theatrical demo.',
      );
      return;
    }
    selectLive(trimmed);
    onConfirm?.('live');
    goSpawning();
  }, [
    mode,
    draftKey,
    liveRunsRemaining,
    selectTheatrical,
    selectLive,
    onConfirm,
    goSpawning,
  ]);

  const handleClearKey = useCallback(() => {
    clearApiKey();
    setDraftKey('');
    setTestKeyState('idle');
    setValidationError(null);
    setMode('theatrical');
    setShowLivePanel(false);
  }, [clearApiKey]);

  const liveModeDisabled = useMemo(
    () => liveRunsRemaining <= 0,
    [liveRunsRemaining],
  );

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="api-key-modal-backdrop"
        initial={reducedMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        style={overlayStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="api-key-modal"
      >
        <div
          aria-hidden="true"
          onClick={handleClose}
          style={backdropStyle}
          data-testid="api-key-modal-backdrop"
        />
        <motion.section
          ref={dialogRef}
          initial={reducedMotion ? false : { opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
          transition={{ duration: 0.2 }}
          style={panelStyle}
        >
          <header style={headerStyle}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <span style={eyebrowStyle}>NERIUM Builder // Runtime mode</span>
              <h2 id={titleId} style={titleStyle}>
                Theatrical or Live runtime
              </h2>
            </div>
            <button
              ref={closeBtnRef}
              type="button"
              onClick={handleClose}
              style={closeBtnStyle}
              aria-label="Close runtime mode modal (defaults to theatrical)"
              data-testid="api-key-modal-close"
            >
              Close
            </button>
          </header>

          <p style={runsRemainingStyle} data-testid="api-key-modal-runs">
            Live runs remaining this session: {liveRunsRemaining} / 5
          </p>

          <div style={modeChoiceRowStyle}>
            <ModeChoiceCard
              label="Theatrical"
              description="Watch the demo with pre-canned agent structure templates. Free. No API key needed."
              recommended
              selected={mode === 'theatrical'}
              onSelect={() => {
                setMode('theatrical');
                setShowLivePanel(false);
              }}
              testId="api-key-modal-mode-theatrical"
            />
            <ModeChoiceCard
              label="Live"
              description="Enter your own Anthropic API key for real Builder runtime invocation."
              selected={mode === 'live'}
              disabled={liveModeDisabled}
              onSelect={() => {
                if (liveModeDisabled) return;
                setMode('live');
                setShowLivePanel(true);
              }}
              testId="api-key-modal-mode-live"
            />
          </div>

          {showLivePanel ? (
            <section
              style={livePanelStyle}
              data-testid="api-key-modal-live-panel"
            >
              <label style={inputLabelStyle} htmlFor="api-key-modal-input">
                Anthropic API key
              </label>
              <div style={inputRowStyle}>
                <input
                  id="api-key-modal-input"
                  ref={inputRef}
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={draftKey}
                  onChange={(e) => {
                    setDraftKey(e.target.value);
                    setTestKeyState('idle');
                    setValidationError(null);
                  }}
                  placeholder="sk-ant-api03-..."
                  style={inputStyle}
                  data-testid="api-key-modal-input"
                />
                <button
                  type="button"
                  onClick={runTestKey}
                  disabled={
                    draftKey.trim().length === 0 || testKeyState === 'testing'
                  }
                  style={
                    draftKey.trim().length === 0 || testKeyState === 'testing'
                      ? secondaryCtaDisabledStyle
                      : secondaryCtaStyle
                  }
                  data-testid="api-key-modal-test"
                >
                  {testKeyState === 'testing' ? 'Testing' : 'Test key'}
                </button>
                {userApiKey ? (
                  <button
                    type="button"
                    onClick={handleClearKey}
                    style={dangerCtaStyle}
                    data-testid="api-key-modal-clear"
                  >
                    Clear key
                  </button>
                ) : null}
              </div>
              <TestKeyIndicator state={testKeyState} />
              {validationError ? (
                <span
                  style={errorTextStyle}
                  role="alert"
                  data-testid="api-key-modal-validation-error"
                >
                  {validationError}
                </span>
              ) : null}
            </section>
          ) : null}

          <footer style={footerStyle}>
            <p
              style={honestClaimStyle}
              role="note"
              data-testid="api-key-modal-honest-claim"
            >
              {HONEST_CLAIM_CAPTION}
            </p>
            <div style={ctaRowStyle}>
              <button
                type="button"
                onClick={handleClose}
                style={tertiaryCtaStyle}
                data-testid="api-key-modal-cancel"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                style={primaryCtaStyle}
                data-testid="api-key-modal-confirm"
              >
                {mode === 'theatrical' ? 'Watch demo' : 'Start live run'}
              </button>
            </div>
          </footer>
        </motion.section>
      </motion.div>
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Mode choice card
// ---------------------------------------------------------------------------

interface ModeChoiceCardProps {
  label: string;
  description: string;
  selected: boolean;
  recommended?: boolean;
  disabled?: boolean;
  onSelect: () => void;
  testId: string;
}

function ModeChoiceCard({
  label,
  description,
  selected,
  recommended,
  disabled,
  onSelect,
  testId,
}: ModeChoiceCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      style={
        disabled
          ? modeChoiceCardDisabledStyle
          : selected
            ? modeChoiceCardSelectedStyle
            : modeChoiceCardStyle
      }
      aria-pressed={selected}
      data-testid={testId}
      data-selected={selected ? 'true' : 'false'}
    >
      <header style={modeChoiceHeaderStyle}>
        <span style={modeChoiceLabelStyle}>{label}</span>
        {recommended ? (
          <span style={recommendedBadgeStyle}>Recommended</span>
        ) : null}
      </header>
      <p style={modeChoiceDescStyle}>{description}</p>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Test key indicator
// ---------------------------------------------------------------------------

function TestKeyIndicator({ state }: { state: TestKeyState }) {
  if (state === 'idle') return null;
  let text = '';
  let color = 'oklch(0.72 0.02 250)';
  let testId = 'api-key-modal-test-result';
  if (state === 'testing') {
    text = 'Testing key with Anthropic ping...';
  } else if (state === 'ok') {
    text = 'Key valid (Anthropic returned 200 OK)';
    color = 'oklch(0.78 0.13 150)';
  } else if (state === 'invalid') {
    text = 'Key invalid (Anthropic returned 401)';
    color = 'oklch(0.66 0.27 5)';
  } else if (state === 'network_error') {
    text =
      'Test unavailable. Browser CORS blocked or network error. You can still proceed.';
    color = 'oklch(0.78 0.17 55)';
  }
  return (
    <span
      style={{
        ...testKeyStateStyle,
        color,
      }}
      data-testid={testId}
      data-state={state}
    >
      {text}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const FONT_DISPLAY =
  "var(--font-space-grotesk, 'Space Grotesk', system-ui, sans-serif)";
const FONT_RETRO = "var(--font-vt323, 'VT323', 'Courier New', monospace)";
const FONT_MONO =
  "var(--font-jetbrains-mono, 'JetBrains Mono', 'Courier New', monospace)";

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 80,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  pointerEvents: 'auto',
};

const backdropStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'oklch(0.06 0.01 250 / 0.78)',
  backdropFilter: 'blur(6px)',
};

const panelStyle: CSSProperties = {
  position: 'relative',
  zIndex: 1,
  width: 'min(620px, calc(100vw - 2rem))',
  maxHeight: 'calc(100vh - 2rem)',
  padding: '1.4rem 1.5rem 1.25rem',
  borderRadius: '0.75rem',
  background: 'oklch(0.14 0.012 250)',
  color: 'oklch(0.95 0.01 85)',
  border: '1px solid oklch(0.32 0.02 250)',
  boxShadow:
    '0 24px 64px -32px oklch(0.06 0.01 250 / 0.7), 0 0 0 1px oklch(0.88 0.15 140 / 0.18)',
  fontFamily: FONT_DISPLAY,
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
  overflowY: 'auto',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: '1rem',
};

const eyebrowStyle: CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: '10px',
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
  color: 'oklch(0.88 0.15 140)',
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontFamily: FONT_DISPLAY,
  fontSize: '1.4rem',
  fontWeight: 700,
  letterSpacing: '-0.01em',
};

const closeBtnStyle: CSSProperties = {
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

const runsRemainingStyle: CSSProperties = {
  margin: 0,
  fontFamily: FONT_MONO,
  fontSize: '11px',
  color: 'oklch(0.72 0.02 250)',
};

const modeChoiceRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '0.6rem',
};

const modeChoiceCardBase: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.35rem',
  padding: '0.85rem',
  borderRadius: '0.55rem',
  background: 'oklch(0.18 0.015 250 / 0.6)',
  border: '1.5px solid oklch(0.32 0.02 250)',
  textAlign: 'left',
  cursor: 'pointer',
  fontFamily: FONT_DISPLAY,
};

const modeChoiceCardStyle: CSSProperties = {
  ...modeChoiceCardBase,
};

const modeChoiceCardSelectedStyle: CSSProperties = {
  ...modeChoiceCardBase,
  borderColor: 'oklch(0.88 0.15 140)',
  boxShadow: '0 0 0 1px oklch(0.88 0.15 140) inset',
  background: 'oklch(0.20 0.025 250 / 0.7)',
};

const modeChoiceCardDisabledStyle: CSSProperties = {
  ...modeChoiceCardBase,
  opacity: 0.45,
  cursor: 'not-allowed',
};

const modeChoiceHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '0.4rem',
};

const modeChoiceLabelStyle: CSSProperties = {
  fontFamily: FONT_RETRO,
  fontSize: '20px',
  color: 'oklch(0.88 0.15 140)',
};

const recommendedBadgeStyle: CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: '9px',
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  padding: '0.15rem 0.45rem',
  borderRadius: '999px',
  background: 'oklch(0.78 0.13 150 / 0.18)',
  color: 'oklch(0.78 0.13 150)',
  border: '1px solid oklch(0.78 0.13 150)',
};

const modeChoiceDescStyle: CSSProperties = {
  margin: 0,
  fontFamily: FONT_DISPLAY,
  fontSize: '13px',
  lineHeight: 1.45,
  color: 'oklch(0.95 0.01 85)',
};

const livePanelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.55rem',
  padding: '0.85rem',
  borderRadius: '0.55rem',
  background: 'oklch(0.10 0.012 250 / 0.55)',
  border: '1px solid oklch(0.32 0.02 250)',
};

const inputLabelStyle: CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: '10px',
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
  color: 'oklch(0.88 0.15 140)',
};

const inputRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.4rem',
  alignItems: 'center',
};

const inputStyle: CSSProperties = {
  flex: 1,
  minWidth: '240px',
  padding: '0.55rem 0.7rem',
  borderRadius: '0.4rem',
  border: '1px solid oklch(0.32 0.02 250)',
  background: 'oklch(0.10 0.012 250)',
  color: 'oklch(0.95 0.01 85)',
  fontFamily: FONT_MONO,
  fontSize: '12px',
};

const testKeyStateStyle: CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: '11px',
};

const errorTextStyle: CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: '11px',
  color: 'oklch(0.66 0.27 5)',
};

const footerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.7rem',
  marginTop: '0.4rem',
  paddingTop: '0.7rem',
  borderTop: '1px solid oklch(0.32 0.02 250 / 0.6)',
};

const honestClaimStyle: CSSProperties = {
  margin: 0,
  padding: '0.5rem 0.7rem',
  borderRadius: '0.4rem',
  background: 'oklch(0.18 0.015 250 / 0.65)',
  border: '1px dashed oklch(0.32 0.02 250)',
  fontFamily: FONT_MONO,
  fontSize: '10.5px',
  lineHeight: 1.5,
  color: 'oklch(0.72 0.02 250)',
};

const ctaRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  alignItems: 'center',
  gap: '0.5rem',
};

const primaryCtaStyle: CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: '12px',
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  padding: '0.55rem 1.1rem',
  borderRadius: '0.4rem',
  background: 'oklch(0.88 0.15 140)',
  border: '1px solid oklch(0.88 0.15 140)',
  color: 'oklch(0.14 0.012 250)',
  cursor: 'pointer',
  fontWeight: 700,
};

const secondaryCtaStyle: CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: '11px',
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  padding: '0.5rem 0.85rem',
  borderRadius: '0.4rem',
  background: 'transparent',
  border: '1px solid oklch(0.78 0.13 150)',
  color: 'oklch(0.78 0.13 150)',
  cursor: 'pointer',
};

const secondaryCtaDisabledStyle: CSSProperties = {
  ...secondaryCtaStyle,
  opacity: 0.45,
  cursor: 'not-allowed',
};

const tertiaryCtaStyle: CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: '11px',
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  padding: '0.5rem 0.85rem',
  borderRadius: '0.4rem',
  background: 'transparent',
  border: '1px solid oklch(0.32 0.02 250)',
  color: 'oklch(0.72 0.02 250)',
  cursor: 'pointer',
};

const dangerCtaStyle: CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: '11px',
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  padding: '0.5rem 0.85rem',
  borderRadius: '0.4rem',
  background: 'transparent',
  border: '1px solid oklch(0.66 0.27 5)',
  color: 'oklch(0.66 0.27 5)',
  cursor: 'pointer',
};

export default ApiKeyModal;
