//
// MAConsoleDeepLink.tsx
//
// Conforms to: docs/contracts/pipeline_visualizer.contract.md v0.1.0
// Upstream shape: docs/contracts/managed_agent_executor.contract.md v0.1.0
//
// Renders the "Live Console Trace" button that opens the Anthropic Console
// session trace in a new tab. Honest-claim filter: button only enables when
// Heracles has populated `consoleDeepLinks[ma_session_id]` with a real URL
// returned by the actual `POST /v1/sessions` call. When session unavailable
// (no id, no URL, or URL empty), the button disables and shows the
// "MA session unavailable" affordance required by the Helios prompt.
//

'use client';

import * as React from 'react';
import type { MAConsoleDeepLinkProps } from './types';

const BUTTON_BASE_STYLE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 14px',
  borderRadius: 999,
  fontFamily: 'ui-monospace, SFMono-Regular',
  fontSize: 12,
  letterSpacing: 0.8,
  textTransform: 'uppercase',
  border: '1px solid rgba(255, 46, 136, 0.55)',
  background:
    'linear-gradient(135deg, rgba(255, 46, 136, 0.18), rgba(139, 92, 246, 0.12))',
  color: '#ff2e88',
  textDecoration: 'none',
  cursor: 'pointer',
  transition: 'transform 120ms ease, box-shadow 120ms ease',
};

const BUTTON_DISABLED_STYLE: React.CSSProperties = {
  ...BUTTON_BASE_STYLE,
  borderColor: 'rgba(106, 118, 135, 0.45)',
  background: 'rgba(20, 24, 34, 0.75)',
  color: '#6a7687',
  cursor: 'not-allowed',
};

export function MAConsoleDeepLink(
  props: MAConsoleDeepLinkProps,
): React.JSX.Element {
  const { ma_session_id, consoleDeepLinks, label, className } = props;
  const url =
    ma_session_id && typeof consoleDeepLinks[ma_session_id] === 'string'
      ? consoleDeepLinks[ma_session_id]
      : '';
  const enabled = url.length > 0 && isReasonableConsoleUrl(url);
  const displayLabel = enabled
    ? (label ?? 'Live Console Trace')
    : 'MA session unavailable';

  if (!enabled) {
    return (
      <span
        className={className}
        style={BUTTON_DISABLED_STYLE}
        role="button"
        aria-disabled="true"
        aria-label="Managed Agents console trace unavailable"
        data-ma-link-state="disabled"
        title="Heracles has not published a Console URL for this session yet"
      >
        <DotIndicator color="#6a7687" pulsing={false} />
        {displayLabel}
      </span>
    );
  }

  return (
    <a
      className={className}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={BUTTON_BASE_STYLE}
      aria-label={`Open Anthropic Console trace for managed agents session ${ma_session_id}`}
      data-ma-link-state="enabled"
      data-ma-session-id={ma_session_id}
    >
      <DotIndicator color="#ff2e88" pulsing={true} />
      {displayLabel}
    </a>
  );
}

// Honest-claim guard: only accept URLs that plausibly point at the Anthropic
// Console sessions surface. Rejects obvious junk (empty string, relative
// path, unknown scheme) so a mis-wired deep link never renders to judges.
export function isReasonableConsoleUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const pathOk = parsed.pathname.toLowerCase().includes('/session');
    const hostOk =
      host === 'console.anthropic.com' ||
      host === 'anthropic.com' ||
      host.endsWith('.anthropic.com');
    return hostOk && pathOk;
  } catch {
    return false;
  }
}

function DotIndicator(props: {
  color: string;
  pulsing: boolean;
}): React.JSX.Element {
  const { color, pulsing } = props;
  return (
    <span
      aria-hidden="true"
      style={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: color,
        boxShadow: pulsing ? `0 0 10px ${color}` : 'none',
        animation: pulsing ? 'ma-dot-pulse 1.6s infinite ease-in-out' : 'none',
      }}
    />
  );
}
