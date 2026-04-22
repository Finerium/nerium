'use client';

//
// AuditTrailExpand.tsx (Phoebe P3a Registry Worker).
//
// Conforms to:
// - docs/contracts/identity_card.contract.md v0.1.0 (Section 3, Section 4, Section 5, Section 8)
// - docs/contracts/agent_identity.contract.md v0.1.0 (AuditEntry shape)
//
// Lazy-loading panel. Renders last N audit entries for a given identity_id,
// fetched once on mount via the injected fetcher that resolves to
// IdentityRegistry.getAuditForIdentity. Embed surfaces (Artemis detail drawer,
// Apollo specialist expand) own the fetcher binding so this component stays
// presentation-only and testable without SQLite in the loop.
//
// States per contract Section 8 error handling:
//   1. loading                 skeleton rows with stable height
//   2. loaded with entries     virtual scroll container when total > 20
//   3. loaded empty            honest empty-state copy (zero invocations)
//   4. error                   retry affordance, preserves onClose
//
// Virtualization threshold per phoebe prompt soft-guidance is 20 entries.
// The implementation here uses CSS max-height + overflow-y instead of a
// virtualization library. Reason: hackathon scope, typical max_entries default
// is 5, and the fetcher already applies the N cap before the list reaches the
// renderer. See phoebe.decisions ADR 0005.
//
// Instrumentation per contract Section 5: when emitter prop is supplied and
// the lazy fetch completes successfully, we emit `registry.ui.audit.expanded`
// with `{ identity_id }` exactly once per mount.
//

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

import type { AuditEntry } from '../schema/identity.schema';
import {
  CARD_EVENT_TOPICS,
  type AuditTrailExpandProps,
  type CardInstrumentationProps,
} from './identity_card_types';

type Status = 'idle' | 'loading' | 'ready' | 'error';

const OUTCOME_COLOR: Record<AuditEntry['outcome'], string> = {
  success: '#22f59a',
  partial: '#ffb300',
  failure: '#ff3d5a',
};

const KIND_LABEL: Record<AuditEntry['kind'], string> = {
  invocation: 'Invocation',
  incident: 'Incident',
  attestation: 'Attestation',
  version_bump: 'Version bump',
};

type Props = AuditTrailExpandProps & CardInstrumentationProps;

function AuditTrailExpandImpl(props: Props): JSX.Element {
  const {
    identity_id,
    fetcher,
    max_entries = 5,
    virtualize_threshold = 20,
    onClose,
    emitter,
  } = props;

  const [status, setStatus] = useState<Status>('idle');
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const mountFetchedRef = useRef(false);
  const reduceMotion = useReducedMotion();

  const load = useCallback(async () => {
    setStatus('loading');
    setErrorMessage(null);
    try {
      const rows = await fetcher(identity_id, max_entries);
      setEntries(rows);
      setStatus('ready');
      if (!mountFetchedRef.current && emitter) {
        emitter.emit(CARD_EVENT_TOPICS.auditExpanded, { identity_id });
      }
      mountFetchedRef.current = true;
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Unknown error');
    }
  }, [fetcher, identity_id, max_entries, emitter]);

  useEffect(() => {
    if (mountFetchedRef.current) return;
    void load();
  }, [load]);

  const shouldVirtualize = entries.length > virtualize_threshold;

  return (
    <motion.section
      aria-label={`Audit trail for ${identity_id}`}
      data-audit-identity={identity_id}
      data-audit-status={status}
      initial={reduceMotion ? false : { opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
      transition={{ duration: 0.2 }}
      style={{
        padding: 12,
        borderRadius: 10,
        background: 'rgba(6, 6, 12, 0.82)',
        border: '1px solid rgba(0, 240, 255, 0.25)',
        color: '#e6ecff',
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        fontSize: 12,
        lineHeight: 1.45,
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <span
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, monospace',
            fontSize: 10,
            letterSpacing: 0.8,
            color: '#8892a6',
          }}
        >
          AUDIT TRAIL
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close audit trail"
          style={{
            background: 'transparent',
            border: '1px solid rgba(230, 236, 255, 0.2)',
            color: '#e6ecff',
            fontSize: 11,
            padding: '2px 8px',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          Close
        </button>
      </header>

      {status === 'loading' ? <LoadingRows count={Math.min(max_entries, 5)} /> : null}

      {status === 'error' ? (
        <ErrorState message={errorMessage} onRetry={load} />
      ) : null}

      {status === 'ready' && entries.length === 0 ? <EmptyState /> : null}

      {status === 'ready' && entries.length > 0 ? (
        <ul
          role="list"
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            maxHeight: shouldVirtualize ? 240 : undefined,
            overflowY: shouldVirtualize ? 'auto' : 'visible',
          }}
        >
          <AnimatePresence initial={!reduceMotion}>
            {entries.map((entry, index) => (
              <AuditEntryRow
                key={entry.entry_id}
                entry={entry}
                index={index}
                reduceMotion={reduceMotion === true}
              />
            ))}
          </AnimatePresence>
        </ul>
      ) : null}
    </motion.section>
  );
}

function AuditEntryRow(props: {
  entry: AuditEntry;
  index: number;
  reduceMotion: boolean;
}): JSX.Element {
  const { entry, index, reduceMotion } = props;
  const color = OUTCOME_COLOR[entry.outcome] ?? '#8892a6';
  const kind = KIND_LABEL[entry.kind] ?? entry.kind;
  const occurred = formatOccurredAt(entry.occurred_at);
  const cost =
    typeof entry.cost_usd === 'number' ? `$${entry.cost_usd.toFixed(2)}` : null;

  return (
    <motion.li
      layout={!reduceMotion}
      initial={reduceMotion ? false : { opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? undefined : { opacity: 0 }}
      transition={{ duration: 0.18, delay: reduceMotion ? 0 : index * 0.02 }}
      style={{
        display: 'grid',
        gridTemplateColumns: '10px 1fr auto',
        alignItems: 'center',
        gap: 10,
        padding: '6px 8px',
        borderRadius: 8,
        background: 'rgba(230, 236, 255, 0.03)',
        border: '1px solid rgba(230, 236, 255, 0.06)',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: color,
          boxShadow: `0 0 6px ${color}66`,
        }}
      />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, monospace',
            fontSize: 11,
            color: '#e6ecff',
            letterSpacing: 0.3,
          }}
        >
          {kind}
          <span style={{ color: '#8892a6', marginLeft: 6 }}>
            {entry.outcome}
          </span>
        </span>
        <span
          style={{
            fontSize: 10,
            color: '#8892a6',
            marginTop: 2,
            display: 'inline-flex',
            gap: 8,
          }}
        >
          <span>{occurred}</span>
          {entry.pipeline_run_id ? (
            <span title={entry.pipeline_run_id}>
              run {shortId(entry.pipeline_run_id)}
            </span>
          ) : null}
        </span>
      </div>
      {cost ? (
        <span
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, monospace',
            fontSize: 11,
            color: '#b0bccc',
          }}
        >
          {cost}
        </span>
      ) : (
        <span aria-hidden="true" />
      )}
    </motion.li>
  );
}

function LoadingRows(props: { count: number }): JSX.Element {
  const { count } = props;
  const rows = Array.from({ length: count });
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading audit entries"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      {rows.map((_, i) => (
        <div
          key={i}
          style={{
            height: 30,
            borderRadius: 8,
            background:
              'linear-gradient(90deg, rgba(230,236,255,0.04), rgba(230,236,255,0.09), rgba(230,236,255,0.04))',
            backgroundSize: '200% 100%',
            animation: 'phoebe-audit-pulse 1.4s ease-in-out infinite',
          }}
        />
      ))}
      <style>{`
        @keyframes phoebe-audit-pulse {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          [aria-label="Loading audit entries"] > div { animation: none; }
        }
      `}</style>
    </div>
  );
}

function ErrorState(props: {
  message: string | null;
  onRetry: () => void;
}): JSX.Element {
  const { message, onRetry } = props;
  return (
    <div
      role="alert"
      style={{
        padding: 10,
        borderRadius: 8,
        background: 'rgba(255, 61, 90, 0.08)',
        border: '1px solid rgba(255, 61, 90, 0.35)',
        color: '#ff8fa3',
        fontSize: 11,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}
    >
      <span>Failed to load audit trail{message ? `: ${message}` : ''}.</span>
      <button
        type="button"
        onClick={onRetry}
        style={{
          background: 'transparent',
          border: '1px solid #ff8fa3',
          color: '#ff8fa3',
          fontSize: 10,
          padding: '2px 8px',
          borderRadius: 6,
          cursor: 'pointer',
        }}
      >
        Retry
      </button>
    </div>
  );
}

function EmptyState(): JSX.Element {
  return (
    <p
      style={{
        margin: 0,
        padding: '10px 4px',
        color: '#8892a6',
        fontSize: 11,
        fontStyle: 'italic',
      }}
    >
      No audit entries yet. This agent has not been invoked since registration.
    </p>
  );
}

function formatOccurredAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const now = Date.now();
  const deltaSec = (now - date.getTime()) / 1000;
  if (deltaSec < 60) return 'just now';
  if (deltaSec < 3600) return `${Math.floor(deltaSec / 60)}m ago`;
  if (deltaSec < 86400) return `${Math.floor(deltaSec / 3600)}h ago`;
  if (deltaSec < 86400 * 7) return `${Math.floor(deltaSec / 86400)}d ago`;
  return date.toISOString().slice(0, 10);
}

function shortId(id: string): string {
  if (id.length <= 8) return id;
  return `${id.slice(0, 4)}..${id.slice(-4)}`;
}

export const AuditTrailExpand = memo(AuditTrailExpandImpl);
export default AuditTrailExpand;
