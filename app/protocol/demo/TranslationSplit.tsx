'use client';

//
// TranslationSplit.tsx (Triton P3b Protocol Worker, root component).
//
// Conforms to:
// - docs/contracts/translation_demo.contract.md v0.1.0 (TranslationSplitProps,
//   mode 'prebaked' vs 'live_query', event signatures, error handling)
// - docs/contracts/protocol_adapter.contract.md v0.1.0 (consumes VendorAdapter)
// - docs/contracts/agent_intent.contract.md v0.1.0 (renders AgentIntent)
//
// Visual layout (CSS Grid):
//   +-------------------------------------------------------+
//   |  Header title + subtitle + mode chip                  |
//   +-------------------------------------------------------+
//   |  Intent summary + optional editable textarea          |
//   +-------------------------------------------------------+
//   |  Canonical IR hash node with animated flow arrow      |
//   +---------------------------+---------------------------+
//   |  ClaudePanel              |  GeminiMockPanel           |
//   +---------------------------+---------------------------+
//   |  Footer: honest-claim, event log hints                |
//   +-------------------------------------------------------+
//
// Strategic_decision_hard_stop (Triton prompt): pre-baked by default, with a
// "try your own" live option gated behind the liveQueryEnabled feature flag
// (see triton.decisions.md ADR-0001). Contract mode prop is still threaded so
// an embedder (Apollo) can force one path regardless of the flag.
//
// Honest-claim discipline per NarasiGhaisan Section 16:
// GeminiMockPanel owns its mock badge; TranslationSplit surfaces a second
// honest-claim line in the footer so the claim is visible even if a screenshot
// crops a single panel.
//
// Error handling per contract Section 8:
// - Adapter serializeIntent throws: the panel renders an error state without
//   crashing the split. Parent component sees no exception.
// - live_query mode without onUserEditIntent or without an Anthropic API key
//   in the runtime env: falls back to prebaked with a visible notice.
// - Invalid intent edit: the editor shows validation errors inline and does
//   not emit onUserEditIntent until valid.
// - Missing prebakedResponse: panels render the serialized prompt only and
//   surface a placeholder response notice.
//

import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';

import type { AgentIntent } from '../schema/agent_intent';
import { agentIntentValidator, validate } from '../schema/agent_intent';
import type {
  VendorAdapter,
  VendorNativePrompt,
  VendorNativeResponse,
} from '../adapters/VendorAdapter';

import ClaudePanel from './ClaudePanel';
import GeminiMockPanel from './GeminiMockPanel';
import './styles.css';
import {
  HONEST_CLAIM_ANNOTATION,
  PREBAKED_SCENARIO_META,
  type TranslationSplitProps,
  type TranslationDemoEventTopic,
} from './translation_demo_types';

type SerializedOrError =
  | { ok: true; prompt: VendorNativePrompt }
  | { ok: false; message: string };

function safeSerialize(adapter: VendorAdapter, intent: AgentIntent): SerializedOrError {
  try {
    return { ok: true, prompt: adapter.serializeIntent(intent) };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'adapter serialization failed',
    };
  }
}

function isLiveQueryRuntimeAvailable(): boolean {
  // Honest-claim fallback: even if mode is live_query, panels only render a
  // real call when the runtime exposes an Anthropic API key. In the hackathon
  // demo we ship without shipping a key in the bundle, so this returns false
  // by default and the component degrades to prebaked with a visible notice.
  if (typeof process === 'undefined') return false;
  const env = (process as { env?: Record<string, string | undefined> }).env ?? {};
  const key = env.ANTHROPIC_API_KEY ?? env.NEXT_PUBLIC_ANTHROPIC_API_KEY;
  return typeof key === 'string' && key.trim().length > 0;
}

function TranslationSplitInner(props: TranslationSplitProps): ReactElement {
  const {
    intent,
    leftAdapter,
    rightAdapter,
    mode,
    prebakedResponse,
    onUserEditIntent,
    onEmitEvent,
    liveQueryEnabled = false,
    className,
  } = props;

  const headingId = useId();
  const subtitleId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);

  const canEditIntent = typeof onUserEditIntent === 'function';
  const liveRuntimeReady = useMemo(isLiveQueryRuntimeAvailable, []);
  const effectiveMode: 'prebaked' | 'live_query' =
    mode === 'live_query' && liveQueryEnabled && liveRuntimeReady ? 'live_query' : 'prebaked';
  const liveDegradedNotice =
    mode === 'live_query' && effectiveMode === 'prebaked'
      ? 'Live query requested but runtime has no Anthropic API key; showing prebaked responses instead.'
      : null;

  const leftSerialized = useMemo(() => safeSerialize(leftAdapter, intent), [leftAdapter, intent]);
  const rightSerialized = useMemo(
    () => safeSerialize(rightAdapter, intent),
    [rightAdapter, intent],
  );

  const [editableText, setEditableText] = useState<string>(
    findFirstUserText(intent) ?? '',
  );
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    setEditableText(findFirstUserText(intent) ?? '');
  }, [intent]);

  // Emit protocol.demo.rendered once per adapter pair + intent_id combo. We do
  // not emit on every keystroke; edits fire protocol.demo.intent_edited.
  const renderedKey = `${leftAdapter.profile.vendor_id}:${rightAdapter.profile.vendor_id}:${intent.intent_id}`;
  const lastRenderedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!onEmitEvent) return;
    if (lastRenderedRef.current === renderedKey) return;
    lastRenderedRef.current = renderedKey;
    emit(onEmitEvent, 'protocol.demo.rendered', {
      mode: effectiveMode,
      left_vendor_id: leftAdapter.profile.vendor_id,
      right_vendor_id: rightAdapter.profile.vendor_id,
    });
  }, [renderedKey, onEmitEvent, effectiveMode, leftAdapter.profile.vendor_id, rightAdapter.profile.vendor_id]);

  const handleEditCommit = useCallback(() => {
    if (!canEditIntent) return;
    const trimmed = editableText.trim();
    if (trimmed.length === 0) {
      setEditError('Intent user text cannot be empty.');
      return;
    }
    const next = replaceFirstUserText(intent, trimmed);
    const result = validate(next);
    if (!result.valid) {
      setEditError(result.errors[0] ?? 'Intent schema invalid.');
      return;
    }
    setEditError(null);
    onUserEditIntent?.(next);
    emit(onEmitEvent, 'protocol.demo.intent_edited', {
      intent_id: next.intent_id,
      field_path: 'messages[first_user].text',
    });
  }, [canEditIntent, editableText, intent, onEmitEvent, onUserEditIntent]);

  const canonicalHash = useMemo(() => agentIntentValidator.hash(intent), [intent]);

  const claudePrompt = leftSerialized.ok ? leftSerialized.prompt : null;
  const claudeResponse = pickResponse(
    effectiveMode,
    'left',
    prebakedResponse,
    leftAdapter,
    claudePrompt,
  );

  const geminiPrompt = rightSerialized.ok ? rightSerialized.prompt : null;
  const geminiResponse = pickResponse(
    effectiveMode,
    'right',
    prebakedResponse,
    rightAdapter,
    geminiPrompt,
  );

  return (
    <div
      ref={rootRef}
      className={['translation-root', className].filter(Boolean).join(' ')}
      aria-labelledby={headingId}
      aria-describedby={subtitleId}
    >
      <header className="translation-header">
        <h2 id={headingId} className="translation-title">
          Same AgentIntent, two vendor-native renderings
        </h2>
        <p id={subtitleId} className="translation-subtitle">
          {PREBAKED_SCENARIO_META.summary}
        </p>
        <div className="translation-mode-row" role="status" aria-live="polite">
          <span className="translation-mode-chip" data-active={effectiveMode === 'prebaked'}>
            prebaked
          </span>
          <span className="translation-mode-chip" data-active={effectiveMode === 'live_query'}>
            live query
          </span>
          <span className="translation-mode-chip" aria-hidden="true">
            intent_id {intent.intent_id}
          </span>
        </div>
        {liveDegradedNotice ? (
          <div className="translation-notice" role="note">
            {liveDegradedNotice}
          </div>
        ) : null}
      </header>

      <section className="translation-intent" aria-label="Shared AgentIntent canonical IR">
        <span className="translation-intent-label">user turn (canonical IR message)</span>
        {canEditIntent ? (
          <>
            <label className="translation-sr-only" htmlFor="translation-intent-text">
              Edit the user turn and replay through both adapters
            </label>
            <textarea
              id="translation-intent-text"
              className="translation-intent-textarea"
              value={editableText}
              onChange={(event) => setEditableText(event.target.value)}
              onBlur={handleEditCommit}
              aria-describedby={editError ? 'translation-intent-error' : undefined}
              disabled={!canEditIntent}
            />
            <div className="translation-footer">
              <button
                type="button"
                className="translation-action-button"
                onClick={handleEditCommit}
                disabled={!canEditIntent}
              >
                Replay through both adapters
              </button>
              {editError ? (
                <span id="translation-intent-error" className="translation-error" role="alert">
                  {editError}
                </span>
              ) : null}
            </div>
          </>
        ) : (
          <p className="translation-intent-summary">{PREBAKED_SCENARIO_META.voice_sample}</p>
        )}
      </section>

      <section className="translation-ir-node" aria-label="Proteus canonical IR handoff">
        <div>
          <h2>AgentIntent IR</h2>
          <p className="translation-ir-hash">hash {canonicalHash}</p>
          <p className="translation-ir-hash">
            {intent.messages.length} messages, {(intent.tools ?? []).length} tools, locale{' '}
            {intent.locale ?? 'unset'}
          </p>
        </div>
        <div className="translation-ir-arrows" aria-hidden="true">
          <span className="translation-flow-pulse" />
          <span>translate</span>
          <span className="translation-flow-pulse" />
        </div>
        <div style={{ textAlign: 'right' }}>
          <h2>Adapter fanout</h2>
          <p className="translation-ir-hash">
            left {leftAdapter.profile.native_format_name}
          </p>
          <p className="translation-ir-hash">
            right {rightAdapter.profile.native_format_name}
          </p>
        </div>
      </section>

      <div className="translation-split">
        {leftSerialized.ok ? (
          <ClaudePanel
            vendor_id={leftAdapter.profile.vendor_id}
            adapter={leftAdapter}
            prompt={leftSerialized.prompt}
            response={claudeResponse}
            isMock={leftAdapter.isMock()}
          />
        ) : (
          <AdapterErrorPanel
            vendorLabel="Claude (Anthropic Messages API)"
            message={leftSerialized.message}
          />
        )}
        {rightSerialized.ok ? (
          <GeminiMockPanel
            vendor_id={rightAdapter.profile.vendor_id}
            adapter={rightAdapter}
            prompt={rightSerialized.prompt}
            response={geminiResponse}
            isMock={rightAdapter.isMock()}
          />
        ) : (
          <AdapterErrorPanel
            vendorLabel="Gemini (Google Generative Language API)"
            message={rightSerialized.message}
          />
        )}
      </div>

      <footer className="translation-footer" aria-label="Protocol pillar honest-claim footer">
        <span>
          Protocol thesis: preserve each model&apos;s uniqueness, do not force a universal prompt language.
        </span>
        <span className="translation-notice" role="note">
          {HONEST_CLAIM_ANNOTATION}
        </span>
      </footer>
    </div>
  );
}

function AdapterErrorPanel({
  vendorLabel,
  message,
}: {
  vendorLabel: string;
  message: string;
}): ReactElement {
  return (
    <section className="translation-panel" aria-label={`${vendorLabel} adapter error`}>
      <div className="translation-panel-header">
        <h3 className="translation-panel-title">{vendorLabel}</h3>
      </div>
      <div className="translation-error" role="alert">
        Adapter serialization failed: {message}
      </div>
    </section>
  );
}

function pickResponse(
  effectiveMode: 'prebaked' | 'live_query',
  side: 'left' | 'right',
  prebakedResponse: TranslationSplitProps['prebakedResponse'],
  adapter: VendorAdapter,
  prompt: VendorNativePrompt | null,
): VendorNativeResponse | undefined {
  if (effectiveMode === 'prebaked') {
    const candidate = prebakedResponse
      ? side === 'left'
        ? prebakedResponse.left
        : prebakedResponse.right
      : undefined;
    if (candidate) return candidate;
    return undefined;
  }
  // live_query branch: Claude side permitted to call a real adapter by an
  // embedder; Triton does NOT own the live driver, it accepts a prebaked
  // response as a fallback. When prebaked is absent in live_query mode we
  // let the panel render the prompt-only view with a placeholder notice.
  if (prompt && prebakedResponse) {
    return side === 'left' ? prebakedResponse.left : prebakedResponse.right;
  }
  return undefined;
}

function findFirstUserText(intent: AgentIntent): string | null {
  for (const m of intent.messages) {
    if (m.role === 'user' && typeof m.text === 'string' && m.text.length > 0) {
      return m.text;
    }
  }
  return null;
}

function replaceFirstUserText(intent: AgentIntent, text: string): AgentIntent {
  let replaced = false;
  const messages = intent.messages.map((m) => {
    if (!replaced && m.role === 'user' && typeof m.text === 'string') {
      replaced = true;
      return { ...m, text };
    }
    return m;
  });
  return { ...intent, messages };
}

function emit(
  handler: TranslationSplitProps['onEmitEvent'],
  topic: TranslationDemoEventTopic,
  payload: Record<string, unknown>,
): void {
  if (!handler) return;
  try {
    handler(topic, payload);
  } catch {
    // Instrumentation failures must not break the split view. Ananke audit
    // captures these out of band through the pipeline event bus.
  }
}

const TranslationSplit = memo(TranslationSplitInner);

export default TranslationSplit;
export { TranslationSplit };
