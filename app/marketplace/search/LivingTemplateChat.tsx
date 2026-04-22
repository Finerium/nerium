'use client';

//
// LivingTemplateChat.tsx (Coeus P3a)
//
// Conforms to:
//   docs/contracts/search_ui.contract.md v0.1.0 (LivingTemplateChatProps)
//   docs/contracts/living_template_customize.contract.md v0.1.0
//   docs/contracts/advisor_interaction.contract.md v0.1.0 (brevity discipline mirror)
//
// Conversational surface that collects values for a source listing's
// living_template_params and submits a LivingTemplateRemixRequest back to the
// parent (parent dispatches to Apollo via pillar_lead_handoff.contract.md).
//
// Per coeus.md prompt, Coeus is NOT responsible for actually remixing (Apollo +
// Athena + specialists do). Coeus surfaces the request. The honest-claim
// filter hard constraint is respected via:
//   1. The submit confirmation line naming "Apollo dispatch" explicitly so the
//      user knows what happens on submit.
//   2. No implicit "we built it" language until the remix pipeline completes
//      (completion events surface elsewhere, not in this component).
//
// Erato bubble visual reuse per coeus.md soft guidance is implemented via a
// scoped <style> element that declares .coeus-bubble* class shapes that mirror
// the .advisor-bubble rules in app/advisor/ui/styles.css. Shared CSS custom
// properties (--advisor-*) cascade in when AdvisorChat is mounted alongside;
// sensible fallback defaults are inlined so the component looks correct even
// when rendered in isolation.
//

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactElement,
  type CSSProperties,
} from 'react';

import type { AgentListing } from '../schema/listing.schema';

import {
  coerceParamsFromListing,
  emitMarketplaceSearchEvent,
  type LivingTemplateChatProps,
  type LivingTemplateParamDefinition,
  type LivingTemplateParamKind,
} from './semantic_embedder';

// ---------- Props extension ----------

interface LivingTemplateChatExtendedProps extends LivingTemplateChatProps {
  /**
   * Resolver for the source listing. Parent injects a catalog-backed lookup
   * (Demeter's MarketplaceCatalog) or a pre-loaded fetch. Returns null if
   * the listing is unavailable (archived, not found) so the chat surfaces a
   * clean rejection.
   */
  resolveListing: (
    source_listing_id: string,
  ) => Promise<AgentListing | null>;
  /**
   * Optional locale binding so remix request persists the active Advisor
   * locale. Defaults to 'id-ID' per NarasiGhaisan voice. Parent can pass the
   * active AdvisorSession.locale to align.
   */
  locale?: 'en-US' | 'id-ID';
}

// ---------- Params form types ----------

interface AdvisorBubble {
  readonly id: string;
  readonly role: 'advisor' | 'user' | 'system';
  readonly content: string;
}

interface ParamFieldState {
  readonly def: LivingTemplateParamDefinition;
  value: string | number | boolean;
  error?: string;
  touched: boolean;
}

function initFieldState(
  defs: LivingTemplateParamDefinition[],
): ParamFieldState[] {
  return defs.map((def) => ({ def, value: def.default_value, touched: false }));
}

function validateField(
  def: LivingTemplateParamDefinition,
  value: string | number | boolean,
): string | undefined {
  if (def.required) {
    if (def.kind === 'string' && typeof value === 'string' && value.trim().length === 0) {
      return 'required';
    }
    if (def.kind === 'enum' && typeof value === 'string' && value.length === 0) {
      return 'required';
    }
  }
  if (def.kind === 'string' && def.validation_regex && typeof value === 'string') {
    try {
      const re = new RegExp(def.validation_regex);
      if (!re.test(value)) {
        return `must match ${def.validation_regex}`;
      }
    } catch {
      // Invalid regex from listing data is a listing-side defect, not user error.
    }
  }
  if (def.kind === 'number') {
    const n = typeof value === 'number' ? value : Number(value);
    if (Number.isNaN(n)) return 'must be a number';
    if (def.min !== undefined && n < def.min) return `must be >= ${def.min}`;
    if (def.max !== undefined && n > def.max) return `must be <= ${def.max}`;
  }
  if (def.kind === 'enum' && def.enum_values) {
    if (!def.enum_values.includes(String(value))) {
      return `must be one of ${def.enum_values.join(', ')}`;
    }
  }
  return undefined;
}

function pickerLabelForKind(kind: LivingTemplateParamKind): string {
  switch (kind) {
    case 'enum':
      return 'pick one';
    case 'number':
      return 'number';
    case 'boolean':
      return 'toggle';
    default:
      return 'text';
  }
}

function genRequestId(): string {
  try {
    const c = (globalThis as unknown as { crypto?: { randomUUID?: () => string } })
      .crypto;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  } catch {
    /* fall through */
  }
  // Fallback deterministic-ish id; acceptable for hackathon demo scope.
  const rand = Math.random().toString(16).slice(2);
  const ts = Date.now().toString(16);
  return `coeus-remix-${ts}-${rand}`;
}

// ---------- Inline styles ----------

const ROOT: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
  padding: '1rem',
  borderRadius: '16px',
  border: '1px solid var(--advisor-border, rgba(0, 240, 255, 0.18))',
  background: 'var(--advisor-bg, #06060c)',
  color: 'var(--advisor-fg, #e7f2ff)',
  fontFamily:
    'var(--advisor-font-body, -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif)',
  fontSize: '14px',
  boxShadow: '0 12px 40px rgba(0, 240, 255, 0.08)',
};

const HEADER: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '0.75rem',
  paddingBottom: '0.5rem',
  borderBottom: '1px solid var(--advisor-border, rgba(0, 240, 255, 0.18))',
};

const HEADER_TITLE: CSSProperties = {
  margin: 0,
  fontFamily:
    'var(--advisor-font-display, "Space Grotesk", -apple-system, sans-serif)',
  fontSize: '13px',
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--advisor-accent-cyan, #00f0ff)',
};

const CANCEL_BUTTON: CSSProperties = {
  appearance: 'none',
  background: 'transparent',
  border: '1px solid var(--advisor-border, rgba(0, 240, 255, 0.18))',
  color: 'var(--advisor-fg-muted, #94a3c4)',
  fontFamily:
    'var(--advisor-font-mono, "JetBrains Mono", "Fira Code", ui-monospace, Menlo, monospace)',
  fontSize: '11px',
  padding: '0.25rem 0.625rem',
  borderRadius: '6px',
  cursor: 'pointer',
  letterSpacing: '0.04em',
};

const TRANSCRIPT: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
  paddingBottom: '0.5rem',
};

const FORM: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.625rem',
  marginTop: '0.25rem',
};

const FIELD: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
};

const FIELD_LABEL: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: '0.5rem',
  fontFamily:
    'var(--advisor-font-mono, "JetBrains Mono", "Fira Code", ui-monospace, Menlo, monospace)',
  fontSize: '11px',
  letterSpacing: '0.04em',
  color: 'var(--advisor-fg-muted, #94a3c4)',
  textTransform: 'uppercase',
};

const FIELD_DESCRIPTION: CSSProperties = {
  margin: 0,
  fontSize: '12px',
  color: 'var(--advisor-fg-muted, #94a3c4)',
  lineHeight: 1.4,
};

const FIELD_INPUT: CSSProperties = {
  background: 'var(--advisor-bg, #06060c)',
  color: 'var(--advisor-fg, #e7f2ff)',
  border: '1px solid var(--advisor-border, rgba(0, 240, 255, 0.18))',
  borderRadius: '8px',
  padding: '0.5rem 0.625rem',
  fontFamily: 'inherit',
  fontSize: '14px',
};

const FIELD_ERROR: CSSProperties = {
  color: 'var(--advisor-warn-halt, #ff4d6d)',
  fontFamily:
    'var(--advisor-font-mono, "JetBrains Mono", "Fira Code", ui-monospace, Menlo, monospace)',
  fontSize: '10px',
  letterSpacing: '0.04em',
};

const SUBMIT_ROW: CSSProperties = {
  display: 'flex',
  gap: '0.5rem',
  justifyContent: 'space-between',
  alignItems: 'center',
  paddingTop: '0.5rem',
  borderTop: '1px dashed var(--advisor-border, rgba(0, 240, 255, 0.18))',
};

const SUBMIT_BUTTON: CSSProperties = {
  appearance: 'none',
  background: 'var(--advisor-accent-magenta, #ff2e88)',
  color: 'var(--advisor-bg, #06060c)',
  border: 'none',
  borderRadius: '8px',
  padding: '0.5rem 1rem',
  fontFamily:
    'var(--advisor-font-display, "Space Grotesk", -apple-system, sans-serif)',
  fontSize: '12px',
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  cursor: 'pointer',
};

const SUBMIT_BUTTON_DISABLED: CSSProperties = {
  ...SUBMIT_BUTTON,
  opacity: 0.45,
  cursor: 'not-allowed',
};

const SUBMIT_CAPTION: CSSProperties = {
  fontFamily:
    'var(--advisor-font-mono, "JetBrains Mono", "Fira Code", ui-monospace, Menlo, monospace)',
  fontSize: '10px',
  color: 'var(--advisor-fg-muted, #94a3c4)',
  letterSpacing: '0.04em',
  maxWidth: '42ch',
  lineHeight: 1.4,
};

const LOADING: CSSProperties = {
  fontFamily:
    'var(--advisor-font-mono, "JetBrains Mono", "Fira Code", ui-monospace, Menlo, monospace)',
  fontSize: '12px',
  color: 'var(--advisor-fg-muted, #94a3c4)',
  padding: '0.5rem 0',
};

const SYSTEM_BUBBLE: CSSProperties = {
  margin: 0,
  padding: '0.5rem 0.75rem',
  borderRadius: '10px',
  border: '1px dashed var(--advisor-border, rgba(0, 240, 255, 0.18))',
  background: 'transparent',
  fontFamily:
    'var(--advisor-font-mono, "JetBrains Mono", "Fira Code", ui-monospace, Menlo, monospace)',
  fontSize: '11px',
  color: 'var(--advisor-fg-muted, #94a3c4)',
  textAlign: 'center',
};

// ---------- Erato bubble visual reuse: scoped CSS ----------
//
// Matches .advisor-bubble shape in app/advisor/ui/styles.css so the living
// template chat and the Advisor chat read as one family visually. Colors rely
// on --advisor-* cascade with sensible fallback defaults for standalone use.

const BUBBLE_STYLE = `
.coeus-bubble {
  max-width: 82%;
  padding: 0.625rem 0.875rem;
  border-radius: 12px;
  position: relative;
  font-size: 13px;
  white-space: pre-wrap;
  word-wrap: break-word;
  line-height: 1.45;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.02);
}
.coeus-bubble[data-role="advisor"] {
  align-self: flex-start;
  background: linear-gradient(145deg, rgba(0, 240, 255, 0.1), rgba(0, 240, 255, 0.02));
  border: 1px solid var(--advisor-border-strong, rgba(0, 240, 255, 0.42));
  color: var(--advisor-fg, #e7f2ff);
  border-bottom-left-radius: 4px;
}
.coeus-bubble[data-role="user"] {
  align-self: flex-end;
  background: linear-gradient(145deg, rgba(255, 46, 136, 0.18), rgba(139, 92, 246, 0.14));
  border: 1px solid rgba(255, 46, 136, 0.38);
  color: var(--advisor-fg, #e7f2ff);
  border-bottom-right-radius: 4px;
}
.coeus-bubble-role {
  display: block;
  font-family: var(--advisor-font-mono, "JetBrains Mono", ui-monospace, Menlo, monospace);
  font-size: 9px;
  color: var(--advisor-fg-muted, #94a3c4);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  margin-bottom: 2px;
}
`;

// ---------- Welcome and prompt copy ----------

const WELCOME_ADVISOR_COPY: Record<'en-US' | 'id-ID', string> = {
  'en-US':
    'Tell me how you want this agent adapted. Example: swap the crop from chili to grape. I will collect the param values and dispatch a Builder remix.',
  'id-ID':
    'Mau customize apa? Contoh: ubah dari cabai ke anggur. Gw kumpulin param valuenya lalu dispatch ke Builder remix.',
};

const NO_LIVING_TEMPLATE_COPY: Record<'en-US' | 'id-ID', string> = {
  'en-US':
    'This listing does not expose living template params. Remix is unavailable.',
  'id-ID':
    'Listing ini belum expose living template params. Remix belum available.',
};

// ---------- Main component ----------

export default function LivingTemplateChat(
  props: LivingTemplateChatExtendedProps,
): ReactElement {
  const {
    source_listing_id,
    onRemixRequest,
    onCancel,
    resolveListing,
    locale,
  } = props;

  const resolvedLocale: 'en-US' | 'id-ID' = locale ?? 'id-ID';
  const [listing, setListing] = useState<AgentListing | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [fields, setFields] = useState<ParamFieldState[]>([]);
  const [transcript, setTranscript] = useState<AdvisorBubble[]>([]);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const bubbleRootId = useRef<string>(`coeus-lt-${genRequestId().slice(-8)}`);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setResolveError(null);
    resolveListing(source_listing_id)
      .then((result) => {
        if (cancelled) return;
        if (result === null) {
          setResolveError('listing_unavailable');
          setListing(null);
          setFields([]);
          setLoading(false);
          return;
        }
        setListing(result);
        const defs = coerceParamsFromListing(result.living_template_params);
        setFields(initFieldState(defs));
        setTranscript([
          {
            id: `${bubbleRootId.current}-welcome`,
            role: 'advisor',
            content: WELCOME_ADVISOR_COPY[resolvedLocale],
          },
        ]);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setResolveError(
          err instanceof Error && err.message.length > 0
            ? err.message.slice(0, 140)
            : 'resolve_failed',
        );
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [resolveListing, source_listing_id, resolvedLocale]);

  const handleCancel = useCallback(() => {
    onCancel();
  }, [onCancel]);

  const hasDefinedParams = fields.length > 0;

  const all_valid = useMemo(() => {
    if (!hasDefinedParams) return false;
    return fields.every(
      (f) => validateField(f.def, f.value) === undefined,
    );
  }, [fields, hasDefinedParams]);

  const updateField = useCallback(
    (index: number, next_value: string | number | boolean) => {
      setFields((prev) => {
        const copy = prev.slice();
        const current = copy[index];
        if (current === undefined) return prev;
        const error = validateField(current.def, next_value);
        copy[index] = {
          ...current,
          value: next_value,
          error,
          touched: true,
        };
        return copy;
      });
    },
    [],
  );

  const runSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!all_valid || submitting || listing === null) return;
      setSubmitting(true);
      setSubmitError(null);

      const param_values: Record<string, string | number | boolean> = {};
      const user_summary_parts: string[] = [];
      for (const f of fields) {
        const key = f.def.key;
        const value = f.value;
        param_values[key] = value;
        user_summary_parts.push(`${f.def.label}: ${String(value)}`);
      }
      const user_summary = user_summary_parts.join(' . ');

      setTranscript((prev) => [
        ...prev,
        {
          id: `${bubbleRootId.current}-user-${prev.length}`,
          role: 'user',
          content: user_summary,
        },
      ]);

      emitMarketplaceSearchEvent({
        topic: 'marketplace.search.remix_requested',
        source_listing_id: listing.listing_id,
        params: param_values,
      });

      try {
        await onRemixRequest(param_values);
        setTranscript((prev) => [
          ...prev,
          {
            id: `${bubbleRootId.current}-advisor-${prev.length}`,
            role: 'advisor',
            content:
              resolvedLocale === 'id-ID'
                ? 'Remix request ke-dispatch ke Apollo. Progress tampil di Advisor chat.'
                : 'Remix request dispatched to Apollo. Progress surfaces in the Advisor chat.',
          },
        ]);
      } catch (err: unknown) {
        const message =
          err instanceof Error && err.message.length > 0
            ? err.message.slice(0, 180)
            : 'remix_dispatch_failed';
        setSubmitError(message);
        setTranscript((prev) => [
          ...prev,
          {
            id: `${bubbleRootId.current}-advisor-err-${prev.length}`,
            role: 'advisor',
            content:
              resolvedLocale === 'id-ID'
                ? `Dispatch gagal: ${message}. Silakan coba lagi.`
                : `Dispatch failed: ${message}. Please try again.`,
          },
        ]);
      } finally {
        setSubmitting(false);
      }
    },
    [
      all_valid,
      fields,
      listing,
      onRemixRequest,
      resolvedLocale,
      submitting,
    ],
  );

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      void runSubmit(event);
    },
    [runSubmit],
  );

  const submitCaption =
    resolvedLocale === 'id-ID'
      ? 'Klik Submit Remix buat dispatch request ke Apollo. Builder remix pipeline jalan parameterized by param values. Results nongol di Advisor chat.'
      : 'Click Submit Remix to dispatch the request to Apollo. The Builder remix pipeline runs parameterized by these values. Results surface in the Advisor chat.';

  return (
    <section
      style={ROOT}
      role="region"
      aria-label="Living template remix chat"
    >
      <style>{BUBBLE_STYLE}</style>
      <header style={HEADER}>
        <h3 style={HEADER_TITLE}>
          {resolvedLocale === 'id-ID' ? 'Customize agent' : 'Customize agent'}
        </h3>
        <button
          type="button"
          style={CANCEL_BUTTON}
          onClick={handleCancel}
          aria-label="Close living template chat"
        >
          Close
        </button>
      </header>

      {loading ? (
        <div style={LOADING} aria-live="polite">
          Loading listing details...
        </div>
      ) : resolveError !== null || listing === null ? (
        <div style={SYSTEM_BUBBLE} role="status">
          {resolveError === 'listing_unavailable'
            ? resolvedLocale === 'id-ID'
              ? 'Listing tidak tersedia atau archived. Remix ditolak.'
              : 'Listing unavailable or archived. Remix rejected.'
            : resolveError}
        </div>
      ) : (
        <>
          <div style={TRANSCRIPT} aria-live="polite" aria-relevant="additions">
            {transcript.map((b) => (
              <div
                key={b.id}
                className="coeus-bubble"
                data-role={b.role}
                aria-label={`${b.role} turn`}
              >
                <span className="coeus-bubble-role">{b.role}</span>
                <span>{b.content}</span>
              </div>
            ))}
          </div>

          {!hasDefinedParams ? (
            <div style={SYSTEM_BUBBLE} role="status">
              {NO_LIVING_TEMPLATE_COPY[resolvedLocale]}
            </div>
          ) : (
            <form style={FORM} onSubmit={handleSubmit}>
              {fields.map((f, idx) => (
                <div key={f.def.key} style={FIELD}>
                  <div style={FIELD_LABEL}>
                    <span>{f.def.label}</span>
                    <span>{pickerLabelForKind(f.def.kind)}</span>
                  </div>
                  {f.def.description.length > 0 && (
                    <p style={FIELD_DESCRIPTION}>{f.def.description}</p>
                  )}
                  {f.def.kind === 'enum' ? (
                    <select
                      style={FIELD_INPUT}
                      value={String(f.value)}
                      onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                        updateField(idx, e.target.value)
                      }
                      aria-label={f.def.label}
                    >
                      {(f.def.enum_values ?? []).map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : f.def.kind === 'number' ? (
                    <input
                      type="number"
                      style={FIELD_INPUT}
                      value={String(f.value)}
                      min={f.def.min}
                      max={f.def.max}
                      onChange={(e: ChangeEvent<HTMLInputElement>) =>
                        updateField(idx, Number(e.target.value))
                      }
                      aria-label={f.def.label}
                    />
                  ) : f.def.kind === 'boolean' ? (
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        fontSize: '13px',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(f.value)}
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                          updateField(idx, e.target.checked)
                        }
                        aria-label={f.def.label}
                      />
                      <span>{Boolean(f.value) ? 'enabled' : 'disabled'}</span>
                    </label>
                  ) : (
                    <input
                      type="text"
                      style={FIELD_INPUT}
                      value={String(f.value)}
                      onChange={(e: ChangeEvent<HTMLInputElement>) =>
                        updateField(idx, e.target.value)
                      }
                      aria-label={f.def.label}
                    />
                  )}
                  {f.error !== undefined && f.touched && (
                    <span style={FIELD_ERROR} role="alert">
                      {f.error}
                    </span>
                  )}
                </div>
              ))}

              <div style={SUBMIT_ROW}>
                <p style={SUBMIT_CAPTION}>{submitCaption}</p>
                <button
                  type="submit"
                  style={
                    !all_valid || submitting
                      ? SUBMIT_BUTTON_DISABLED
                      : SUBMIT_BUTTON
                  }
                  disabled={!all_valid || submitting}
                  aria-label="Submit remix request"
                >
                  {submitting ? 'Dispatching...' : 'Submit Remix'}
                </button>
              </div>

              {submitError !== null && (
                <div style={FIELD_ERROR} role="alert" aria-live="assertive">
                  {submitError}
                </div>
              )}
            </form>
          )}
        </>
      )}
    </section>
  );
}

export type { LivingTemplateChatExtendedProps as Props };
