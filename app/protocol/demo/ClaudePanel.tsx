'use client';

//
// ClaudePanel.tsx (Triton P3b Protocol Worker, Claude-native panel).
//
// Conforms to:
// - docs/contracts/translation_demo.contract.md v0.1.0 (VendorPanelProps)
// - docs/contracts/protocol_adapter.contract.md v0.1.0 (AnthropicAdapter
//   output shape: JSON body with system string or AnthropicSystemBlock array,
//   messages, tools, tool_choice, generation_params, cache_control markers)
//
// Renders the Anthropic Messages API native payload with syntax-aware
// highlighting that also preserves Claude XML tag visibility inside string
// literals. The panel is deliberately NOT a generic JSON viewer: it highlights
// <xml_tag> blocks with a distinct color so a viewer sees the XML-wrapped
// system message as XML, not as an escaped JSON string blur.
//
// Honest-claim (NarasiGhaisan Section 16): this panel renders a real
// Anthropic adapter output; `isMock` is propagated from props but defaults to
// false here per AnthropicAdapter.isMock(). A mock Anthropic adapter is not
// used in the hackathon, so the mock badge should never render on this panel
// in shipped scope. The check is kept for contract symmetry.
//

import { memo, useMemo, type ReactElement } from 'react';

import type {
  VendorCapabilityProfile,
  VendorNativeResponse,
} from '../adapters/VendorAdapter';

import {
  VENDOR_DISPLAY_LABEL,
  classifyFidelityNote,
  type CapabilityChip,
  type VendorPanelProps,
} from './translation_demo_types';

function buildCapabilityChips(profile: VendorCapabilityProfile): CapabilityChip[] {
  return [
    { key: 'xml', label: 'xml tagging', supported: profile.supports_xml_tagging },
    { key: 'system', label: 'system prompt', supported: profile.supports_system_prompt },
    { key: 'cache', label: 'prompt caching', supported: profile.supports_prompt_caching },
    { key: 'tools', label: 'tool use', supported: profile.supports_tool_use },
    { key: 'multimodal', label: 'multimodal', supported: profile.supports_multimodal_input },
    { key: 'streaming', label: 'streaming', supported: profile.supports_streaming },
  ];
}

function ClaudePanelInner(props: VendorPanelProps): ReactElement {
  const { vendor_id, adapter, prompt, response, isMock } = props;
  const profile = adapter.profile;
  const displayLabel = VENDOR_DISPLAY_LABEL[vendor_id] ?? vendor_id;
  const chips = useMemo(() => buildCapabilityChips(profile), [profile]);
  const highlighted = useMemo(
    () => highlightAnthropicJson(prompt.serialized),
    [prompt.serialized],
  );
  const responseView = useMemo(() => buildResponseView(response), [response]);

  return (
    <section
      className="translation-panel"
      data-vendor={vendor_id}
      aria-label={`Claude native panel for ${displayLabel}`}
    >
      <header className="translation-panel-header">
        <div>
          <h3 className="translation-panel-title">{displayLabel}</h3>
          <span className="translation-panel-format">{prompt.format_name}</span>
        </div>
        {isMock ? (
          <span
            className="translation-mock-badge"
            role="note"
            aria-label="mock execution annotation"
          >
            mock
          </span>
        ) : null}
      </header>

      <div
        className="translation-capability-row"
        role="list"
        aria-label="Claude capability profile"
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

      <p className="translation-section-label">serialized prompt (anthropic messages v1)</p>
      <pre className="translation-code" aria-label="Anthropic Messages API request body">
        <code dangerouslySetInnerHTML={{ __html: highlighted }} />
      </pre>

      {prompt.fidelity_notes.length > 0 ? (
        <>
          <p className="translation-section-label">fidelity notes</p>
          <div className="translation-fidelity" role="list" aria-label="Claude fidelity notes">
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
      ) : (
        <>
          <p className="translation-section-label">fidelity notes</p>
          <div className="translation-notice" role="note">
            All AgentIntent fields preserved natively by Anthropic adapter.
          </div>
        </>
      )}

      <p className="translation-section-label">response</p>
      {responseView.present ? (
        <>
          {responseView.text ? (
            <p className="translation-response-text">{responseView.text}</p>
          ) : null}
          {responseView.toolCalls.length > 0 ? (
            <div
              role="list"
              aria-label="Claude tool_use calls"
              style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
            >
              {responseView.toolCalls.map((call, idx) => (
                <div
                  key={`${call.name}-${idx}`}
                  role="listitem"
                  className="translation-tool-call"
                >
                  <span className="translation-tool-call-name">
                    tool_use: {call.name}
                  </span>
                  <span>{JSON.stringify(call.input)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <div className="translation-notice" role="note">
          Response will populate when a live Anthropic call returns or when a prebaked
          response is provided.
        </div>
      )}
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

// Syntax-aware highlighter for Anthropic Messages API JSON. Walks the
// serialized string character by character so XML tags that appear inside
// JSON string literals stay visually distinct. This is a narrow hand-roll
// rather than pulling Prism or Shiki to avoid a heavy client bundle for a
// demo surface that never needs to cover arbitrary grammars.
function highlightAnthropicJson(serialized: string): string {
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
      out += `<span class="tok-string">${highlightXmlInside(escapeHtml(str))}</span>`;
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
  return markObjectKeys(out);
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

// After tokens are emitted we flip string tokens that end with `":` into key
// classes. Safer to post-process than to track whether the next non-space
// char is `:` during the initial walk.
function markObjectKeys(input: string): string {
  return input.replace(
    /<span class="tok-string">"([^"<]*)"<\/span>(\s*)<span class="tok-punct">:<\/span>/g,
    (_match, key: string, ws: string) =>
      `<span class="tok-key">&quot;${escapeHtml(key)}&quot;</span>${ws}<span class="tok-punct">:</span>`,
  );
}

function highlightXmlInside(escaped: string): string {
  return escaped.replace(
    /&lt;(\/?)([a-zA-Z][a-zA-Z0-9_-]*)&gt;/g,
    (_match, slash: string, tag: string) =>
      `<span class="tok-xml-tag">&lt;${slash}${tag}&gt;</span>`,
  );
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const ClaudePanel = memo(ClaudePanelInner);

export default ClaudePanel;
export { ClaudePanel };
