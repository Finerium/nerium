'use client';

//
// GeminiMockPanel.tsx (Triton P3b Protocol Worker, Gemini-native mock panel).
//
// Conforms to:
// - docs/contracts/translation_demo.contract.md v0.1.0 (VendorPanelProps)
// - docs/contracts/protocol_adapter.contract.md v0.1.0 (GeminiAdapterMock
//   emits system_instruction, contents[], generation_config, tools, plus
//   _mock_marker and _honest_claim envelope fields)
//
// HONEST-CLAIM DISCIPLINE (NarasiGhaisan Section 16, mandatory):
//   1. Panel header always shows a high-contrast "mock, no live Gemini API
//      call" badge when the adapter reports `isMock() === true`.
//   2. Serialized body highlights `_mock_marker` and `_honest_claim` keys
//      with a distinct color so a viewer cannot miss them.
//   3. Panel footer reiterates the canonical annotation text from
//      translation_demo_types: "demo execution Anthropic only, multi-vendor
//      unlock post-hackathon" so a video frame crop of this panel alone still
//      carries the claim.
//   4. Fidelity notes surface Claude-only features that were dropped so the
//      viewer sees concretely what the mock cannot do.
//
// The honest framing is the point: judges who read this panel must understand
// that no live Gemini inference happens during the hackathon demo. Removing
// any of the four markers above would violate Ghaisan's Section 16 directive.
//

import { memo, useMemo, type ReactElement } from 'react';

import type {
  VendorCapabilityProfile,
  VendorNativeResponse,
} from '../adapters/VendorAdapter';

import {
  HONEST_CLAIM_ANNOTATION,
  MOCK_MARKER_TAG,
  VENDOR_DISPLAY_LABEL,
  classifyFidelityNote,
  type CapabilityChip,
  type VendorPanelProps,
} from './translation_demo_types';

function buildCapabilityChips(profile: VendorCapabilityProfile): CapabilityChip[] {
  return [
    { key: 'xml', label: 'xml tagging', supported: profile.supports_xml_tagging },
    { key: 'system', label: 'system_instruction', supported: profile.supports_system_prompt },
    { key: 'cache', label: 'prompt caching', supported: profile.supports_prompt_caching },
    { key: 'tools', label: 'function calling', supported: profile.supports_tool_use },
    { key: 'multimodal', label: 'multimodal parts', supported: profile.supports_multimodal_input },
    { key: 'streaming', label: 'streaming', supported: profile.supports_streaming },
  ];
}

function GeminiMockPanelInner(props: VendorPanelProps): ReactElement {
  const { vendor_id, adapter, prompt, response, isMock } = props;
  const profile = adapter.profile;
  const displayLabel = VENDOR_DISPLAY_LABEL[vendor_id] ?? vendor_id;
  const chips = useMemo(() => buildCapabilityChips(profile), [profile]);
  const highlighted = useMemo(
    () => highlightGeminiJson(prompt.serialized),
    [prompt.serialized],
  );
  const responseView = useMemo(() => buildResponseView(response), [response]);
  const showMockBadge = Boolean(isMock);

  return (
    <section
      className="translation-panel"
      data-vendor={vendor_id}
      aria-label={`Gemini mock panel for ${displayLabel}`}
    >
      <header className="translation-panel-header">
        <div>
          <h3 className="translation-panel-title">{displayLabel}</h3>
          <span className="translation-panel-format">{prompt.format_name}</span>
        </div>
        {showMockBadge ? (
          <span
            className="translation-mock-badge"
            role="note"
            aria-label="This panel renders a mock, no live Gemini API call happens during the hackathon demo"
            title="mock, no live Gemini API call in hackathon scope"
          >
            mock, no live API
          </span>
        ) : null}
      </header>

      {showMockBadge ? (
        <div
          className="translation-notice"
          role="note"
          aria-live="polite"
          style={{ color: 'var(--translation-mock-chip-fg)' }}
        >
          Gemini body is produced by a serialization-only mock adapter. The mock preserves
          the shape of a real {profile.native_format_name} request so the thesis is legible,
          but no request leaves the browser and no Google billing is incurred.
        </div>
      ) : null}

      <div
        className="translation-capability-row"
        role="list"
        aria-label="Gemini capability profile"
      >
        {chips.map((chip) => (
          <span
            key={chip.key}
            role="listitem"
            className="translation-capability-chip"
            data-supported={String(chip.supported)}
            title={`${chip.label} ${chip.supported ? 'supported' : 'not supported'}`}
          >
            {chip.label}
          </span>
        ))}
        <span
          className="translation-capability-chip"
          aria-label={`max context window ${profile.max_context_window_tokens.toLocaleString()} tokens`}
        >
          ctx {formatTokens(profile.max_context_window_tokens)}
        </span>
      </div>

      <p className="translation-section-label">serialized prompt (gemini generativelanguage v1beta)</p>
      <pre
        className="translation-code"
        aria-label="Gemini generativelanguage v1beta request body, mock-serialized"
      >
        <code dangerouslySetInnerHTML={{ __html: highlighted }} />
      </pre>

      {prompt.fidelity_notes.length > 0 ? (
        <>
          <p className="translation-section-label">fidelity notes</p>
          <div
            className="translation-fidelity"
            role="list"
            aria-label="Gemini mock fidelity notes"
          >
            {prompt.fidelity_notes.map((note, idx) => {
              const classified = classifyFidelityNote(note);
              return (
                <div
                  key={`${idx}-${note.slice(0, 24)}`}
                  role="listitem"
                  className="translation-fidelity-item"
                  data-severity={classified.severity}
                >
                  {classified.text}
                </div>
              );
            })}
          </div>
        </>
      ) : null}

      <p className="translation-section-label">response</p>
      {responseView.present ? (
        <>
          {responseView.text ? (
            <p className="translation-response-text">{responseView.text}</p>
          ) : null}
          {responseView.toolCalls.length > 0 ? (
            <div
              role="list"
              aria-label="Gemini function_call entries"
              style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
            >
              {responseView.toolCalls.map((call, idx) => (
                <div
                  key={`${call.name}-${idx}`}
                  role="listitem"
                  className="translation-tool-call"
                >
                  <span className="translation-tool-call-name">
                    function_call: {call.name}
                  </span>
                  <span>{JSON.stringify(call.input)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <div className="translation-notice" role="note">
          Response is a mock fixture. No live Gemini inference occurs.
        </div>
      )}

      <footer className="translation-footer">
        <span className="translation-intent-label">mock marker</span>
        <span className="translation-ir-hash" aria-label={`mock marker ${MOCK_MARKER_TAG}`}>
          {MOCK_MARKER_TAG}
        </span>
      </footer>
      <div className="translation-notice" role="note">
        {HONEST_CLAIM_ANNOTATION}
      </div>
    </section>
  );
}

interface ResponseView {
  present: boolean;
  text: string;
  toolCalls: Array<{ name: string; input: Record<string, unknown> }>;
}

function buildResponseView(response: VendorNativeResponse | undefined): ResponseView {
  if (!response) return { present: false, text: '', toolCalls: [] };
  return {
    present: true,
    text: response.extracted_text,
    toolCalls: response.tool_use_calls ?? [],
  };
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

// Gemini JSON highlighter: same structural shape as the Claude panel helper
// but additionally flags `_mock_marker` and `_honest_claim` keys with a
// distinct color so the honest-claim envelope cannot be visually lost inside
// the larger body. Keeping this as a local function keeps the client bundle
// free of a generic syntax-highlighting dependency for a demo-only surface.
function highlightGeminiJson(serialized: string): string {
  const pretty = prettifyJson(serialized);
  return highlightTokens(pretty);
}

function prettifyJson(serialized: string): string {
  try {
    const value = JSON.parse(serialized);
    return JSON.stringify(value, null, 2);
  } catch {
    return serialized;
  }
}

function highlightTokens(source: string): string {
  let out = '';
  let i = 0;
  const len = source.length;
  while (i < len) {
    const ch = source.charAt(i);
    if (ch === '"') {
      const [str, next] = readJsonString(source, i);
      out += `<span class="tok-string">${escapeHtml(str)}</span>`;
      i = next;
      continue;
    }
    if (/[0-9-]/.test(ch) && !isInWord(source, i)) {
      const [num, next] = readJsonNumber(source, i);
      out += `<span class="tok-number">${escapeHtml(num)}</span>`;
      i = next;
      continue;
    }
    if (source.startsWith('true', i) && !isInWord(source, i + 4)) {
      out += '<span class="tok-bool">true</span>';
      i += 4;
      continue;
    }
    if (source.startsWith('false', i) && !isInWord(source, i + 5)) {
      out += '<span class="tok-bool">false</span>';
      i += 5;
      continue;
    }
    if (source.startsWith('null', i) && !isInWord(source, i + 4)) {
      out += '<span class="tok-null">null</span>';
      i += 4;
      continue;
    }
    if (/[{}\[\],]/.test(ch)) {
      out += `<span class="tok-punct">${escapeHtml(ch)}</span>`;
      i += 1;
      continue;
    }
    out += escapeHtml(ch);
    i += 1;
  }
  return markSpecialKeys(markObjectKeys(out));
}

function readJsonString(source: string, start: number): [string, number] {
  let i = start + 1;
  let out = '"';
  while (i < source.length) {
    const ch = source.charAt(i);
    if (ch === '\\') {
      out += ch + source.charAt(i + 1);
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
    if (ch === '"') break;
  }
  return [out, i];
}

function readJsonNumber(source: string, start: number): [string, number] {
  let i = start;
  let out = '';
  while (i < source.length && /[-0-9.eE+]/.test(source.charAt(i))) {
    out += source.charAt(i);
    i += 1;
  }
  return [out, i];
}

function isInWord(source: string, idx: number): boolean {
  if (idx < 0 || idx >= source.length) return false;
  return /[A-Za-z0-9_]/.test(source.charAt(idx));
}

function markObjectKeys(input: string): string {
  return input.replace(
    /<span class="tok-string">"([^"<]*)"<\/span>(\s*)<span class="tok-punct">:<\/span>/g,
    (_match, key: string, ws: string) =>
      `<span class="tok-key">&quot;${escapeHtml(key)}&quot;</span>${ws}<span class="tok-punct">:</span>`,
  );
}

function markSpecialKeys(input: string): string {
  // Flip `_mock_marker` and `_honest_claim` key spans to the mock color so the
  // honest envelope is impossible to miss inside a long body.
  return input.replace(
    /<span class="tok-key">&quot;(_mock_marker|_honest_claim)&quot;<\/span>/g,
    (_match, key: string) =>
      `<span class="tok-mock">&quot;${escapeHtml(key)}&quot;</span>`,
  );
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const GeminiMockPanel = memo(GeminiMockPanelInner);

export default GeminiMockPanel;
export { GeminiMockPanel };
