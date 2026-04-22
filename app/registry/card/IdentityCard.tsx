'use client';

//
// IdentityCard.tsx (Phoebe P3a Registry Worker, primary component).
//
// Conforms to:
// - docs/contracts/identity_card.contract.md v0.1.0 (all sections)
// - docs/contracts/agent_identity.contract.md v0.1.0 (AgentIdentity schema)
// - docs/contracts/trust_score.contract.md v0.1.0 (TrustScore shape, stability)
//
// Reusable per-agent profile card. Three variants drive layout:
//   compact  ~120px tall, list row
//   default  ~200px tall, search result
//   expanded ~360px tall, detail drawer
//
// The card composes TrustScoreBadge (visual score) and offers a callback hook
// for AuditTrailExpand (owned by the parent surface so that expansion state is
// host-controlled: Artemis drawer, Apollo chat drawer, Coeus search result
// popover all manage their own expanded-row state).
//
// Shallow-by-design guardrails per NarasiGhaisan Section 6:
//   1. Hashes are advisory SHA-256 strings, exposed only in expanded variant
//      per Hecate ADR 0005 and phoebe.decisions ADR 0004.
//   2. The card does NOT perform real crypto verification; it renders the
//      prompt_hash / contract_hash values read from the identity record.
//   3. Honest-claim filter per NarasiGhaisan Section 8: TrustScore.stability
//      'provisional' is rendered by TrustScoreBadge and is additionally
//      surfaced as a small tag in the default + expanded variants so the
//      viewer sees "mock vs real" without requiring hover.
//
// Error handling per contract Section 8:
//   1. `trust` present is required by contract props; a caller deliberately
//      wanting the unverified pending state passes a trust object with
//      band: 'unverified', stability: 'provisional', score: 0, and the card
//      forwards that to TrustScoreBadge unchanged.
//   2. `audit_summary` fields missing from identity render as zero counts.
//   3. `vendor_origin: 'other'` renders the neutral "Custom" label.
//

import { memo, useCallback, useEffect, useRef } from 'react';
import type {
  JSX,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from 'react';
import { motion, useReducedMotion } from 'framer-motion';

import type { CapabilityDeclaration } from '../schema/identity.schema';
import {
  CARD_EVENT_TOPICS,
  CARD_HEIGHT,
  TRUST_BAND_COLOR,
  VENDOR_ORIGIN_LABEL,
  type CardInstrumentationProps,
  type IdentityCardProps,
} from './identity_card_types';
import TrustScoreBadge from './TrustScoreBadge';

const CAPABILITY_LABEL: Record<CapabilityDeclaration['tag'], string> = {
  code_generation: 'Code',
  research: 'Research',
  data_extraction: 'Data',
  customer_support: 'Support',
  marketing_copy: 'Copy',
  design_asset: 'Design',
  video_generation: 'Video',
  trading_signal: 'Trading',
  domain_automation: 'Automation',
  analysis: 'Analysis',
  other: 'Other',
};

const CONFIDENCE_BORDER: Record<
  CapabilityDeclaration['confidence_self_declared'],
  string
> = {
  experimental: 'rgba(255, 179, 0, 0.55)',
  stable: 'rgba(0, 240, 255, 0.45)',
  verified: 'rgba(34, 245, 154, 0.55)',
};

type Props = IdentityCardProps & CardInstrumentationProps;

function IdentityCardImpl(props: Props): JSX.Element {
  const {
    identity,
    trust,
    variant = 'default',
    trustBadgeFormat = 'band_label',
    onExpandAudit,
    onMessageCreator,
    showVendorOriginBadge = true,
    className,
    emitter,
  } = props;

  const reduceMotion = useReducedMotion();
  const renderEmittedRef = useRef(false);

  useEffect(() => {
    if (renderEmittedRef.current) return;
    emitter?.emit(CARD_EVENT_TOPICS.cardRendered, {
      identity_id: identity.identity_id,
      variant,
    });
    renderEmittedRef.current = true;
  }, [emitter, identity.identity_id, variant]);

  const minHeight = CARD_HEIGHT[variant];
  const bandColor = TRUST_BAND_COLOR[trust.band];
  const vendorLabel = VENDOR_ORIGIN_LABEL[identity.vendor_origin];
  const auditSummary = normalizeAuditSummary(identity.audit_summary);
  const isProvisional = trust.stability === 'provisional';

  const handleExpandAudit = useCallback(
    (ev: ReactMouseEvent | ReactKeyboardEvent) => {
      ev.stopPropagation();
      onExpandAudit?.();
    },
    [onExpandAudit],
  );

  const handleMessageCreator = useCallback(
    (ev: ReactMouseEvent | ReactKeyboardEvent) => {
      ev.stopPropagation();
      onMessageCreator?.();
    },
    [onMessageCreator],
  );

  return (
    <motion.article
      className={className}
      data-identity-id={identity.identity_id}
      data-identity-handle={identity.handle}
      data-card-variant={variant}
      data-trust-band={trust.band}
      data-trust-stability={trust.stability}
      aria-label={`${identity.display_name}, ${trust.band} trust band`}
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      style={{
        boxSizing: 'border-box',
        minHeight,
        padding: variant === 'compact' ? 10 : 14,
        borderRadius: 12,
        background:
          'linear-gradient(180deg, rgba(10, 12, 24, 0.92), rgba(6, 6, 12, 0.92))',
        border: `1px solid ${bandColor.stroke}55`,
        color: '#e6ecff',
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        fontSize: 13,
        lineHeight: 1.45,
        display: 'flex',
        flexDirection: 'column',
        gap: variant === 'compact' ? 6 : 10,
        boxShadow: `0 0 24px ${bandColor.glow}`,
        position: 'relative',
      }}
    >
      <CardHeader
        displayName={identity.display_name}
        handle={identity.handle}
        variant={variant}
        trust={trust}
        trustBadgeFormat={trustBadgeFormat}
      />

      {variant !== 'compact' && showVendorOriginBadge ? (
        <VendorOriginRow
          vendorLabel={vendorLabel}
          version={identity.version}
          isProvisional={isProvisional}
        />
      ) : null}

      <CapabilityRow
        capabilities={identity.capabilities}
        variant={variant}
      />

      {variant !== 'compact' ? (
        <AuditSummaryRow
          auditSummary={auditSummary}
          variant={variant}
        />
      ) : null}

      {variant === 'expanded' ? (
        <HashDisclosure
          promptHash={identity.prompt_hash}
          contractHash={identity.contract_hash}
        />
      ) : null}

      <CardActions
        variant={variant}
        onExpandAudit={onExpandAudit ? handleExpandAudit : undefined}
        onMessageCreator={onMessageCreator ? handleMessageCreator : undefined}
        strokeColor={bandColor.stroke}
      />
    </motion.article>
  );
}

function CardHeader(props: {
  displayName: string;
  handle: string;
  variant: IdentityCardProps['variant'];
  trust: IdentityCardProps['trust'];
  trustBadgeFormat: NonNullable<IdentityCardProps['trustBadgeFormat']>;
}): JSX.Element {
  const { displayName, handle, variant, trust, trustBadgeFormat } = props;
  const compact = variant === 'compact';
  const format =
    compact && trustBadgeFormat === 'gauge' ? 'numeric' : trustBadgeFormat;

  return (
    <header
      style={{
        display: 'flex',
        alignItems: compact ? 'center' : 'flex-start',
        justifyContent: 'space-between',
        gap: 10,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
        }}
      >
        <span
          style={{
            fontSize: compact ? 13 : 15,
            fontWeight: 600,
            color: '#e6ecff',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: compact ? 160 : 240,
          }}
          title={displayName}
        >
          {displayName}
        </span>
        <span
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, monospace',
            fontSize: compact ? 10 : 11,
            color: '#8892a6',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={`@${handle}`}
        >
          @{handle}
        </span>
      </div>
      <TrustScoreBadge
        score={trust.score}
        band={trust.band}
        stability={trust.stability}
        format={format}
        compact={compact}
      />
    </header>
  );
}

function VendorOriginRow(props: {
  vendorLabel: string;
  version: string;
  isProvisional: boolean;
}): JSX.Element {
  const { vendorLabel, version, isProvisional } = props;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        flexWrap: 'wrap',
      }}
    >
      <span
        data-vendor-origin={vendorLabel}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '3px 8px',
          borderRadius: 6,
          fontSize: 10,
          letterSpacing: 0.4,
          fontFamily: 'ui-monospace, SFMono-Regular, monospace',
          color: '#b0bccc',
          background: 'rgba(230, 236, 255, 0.06)',
          border: '1px solid rgba(230, 236, 255, 0.12)',
        }}
      >
        <span aria-hidden="true">origin</span>
        <span style={{ color: '#e6ecff' }}>{vendorLabel}</span>
      </span>
      <span
        style={{
          fontSize: 10,
          fontFamily: 'ui-monospace, SFMono-Regular, monospace',
          color: '#8892a6',
          padding: '3px 6px',
          borderRadius: 6,
          background: 'rgba(230, 236, 255, 0.04)',
          border: '1px solid rgba(230, 236, 255, 0.08)',
        }}
      >
        v{version}
      </span>
      {isProvisional ? (
        <span
          title="Provisional: limited signal, score may shift as usage grows."
          style={{
            fontSize: 10,
            letterSpacing: 0.4,
            padding: '3px 6px',
            borderRadius: 6,
            color: '#ffb300',
            background: 'rgba(255, 179, 0, 0.1)',
            border: '1px dashed rgba(255, 179, 0, 0.55)',
            fontFamily: 'ui-monospace, SFMono-Regular, monospace',
          }}
        >
          PROVISIONAL
        </span>
      ) : null}
    </div>
  );
}

function CapabilityRow(props: {
  capabilities: CapabilityDeclaration[];
  variant: IdentityCardProps['variant'];
}): JSX.Element {
  const { capabilities, variant } = props;
  const compact = variant === 'compact';
  const limit = variant === 'expanded' ? capabilities.length : compact ? 3 : 5;
  const visible = capabilities.slice(0, limit);
  const hiddenCount = capabilities.length - visible.length;

  return (
    <ul
      role="list"
      style={{
        listStyle: 'none',
        margin: 0,
        padding: 0,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 4,
      }}
    >
      {visible.map((cap, i) => (
        <li key={`${cap.tag}-${i}`}>
          <span
            data-capability={cap.tag}
            data-capability-confidence={cap.confidence_self_declared}
            title={`${CAPABILITY_LABEL[cap.tag]} (${cap.confidence_self_declared})`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: compact ? '2px 6px' : '3px 8px',
              borderRadius: 999,
              fontSize: compact ? 9 : 10,
              fontFamily: 'ui-monospace, SFMono-Regular, monospace',
              letterSpacing: 0.5,
              color: '#e6ecff',
              background: 'rgba(0, 240, 255, 0.06)',
              border: `1px solid ${CONFIDENCE_BORDER[cap.confidence_self_declared]}`,
            }}
          >
            {CAPABILITY_LABEL[cap.tag]}
            {!compact ? (
              <span style={{ color: '#8892a6', fontSize: 9 }}>
                {shortConfidence(cap.confidence_self_declared)}
              </span>
            ) : null}
          </span>
        </li>
      ))}
      {hiddenCount > 0 ? (
        <li>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: compact ? '2px 6px' : '3px 8px',
              borderRadius: 999,
              fontSize: compact ? 9 : 10,
              fontFamily: 'ui-monospace, SFMono-Regular, monospace',
              color: '#8892a6',
              background: 'rgba(230, 236, 255, 0.04)',
              border: '1px solid rgba(230, 236, 255, 0.08)',
            }}
          >
            +{hiddenCount}
          </span>
        </li>
      ) : null}
    </ul>
  );
}

function AuditSummaryRow(props: {
  auditSummary: {
    first_seen: string;
    last_active: string;
    total_invocations: number;
    reported_incidents: number;
  };
  variant: IdentityCardProps['variant'];
}): JSX.Element {
  const { auditSummary, variant } = props;
  const expanded = variant === 'expanded';
  const cells: Array<{ label: string; value: string; critical?: boolean }> = [
    {
      label: 'Runs',
      value: formatCount(auditSummary.total_invocations),
    },
    {
      label: 'Incidents',
      value: formatCount(auditSummary.reported_incidents),
      critical: auditSummary.reported_incidents > 0,
    },
    {
      label: 'Last',
      value: formatRelative(auditSummary.last_active),
    },
  ];
  if (expanded) {
    cells.push({
      label: 'Since',
      value: formatRelative(auditSummary.first_seen),
    });
  }

  return (
    <dl
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))`,
        gap: 8,
        margin: 0,
        padding: '6px 8px',
        borderRadius: 8,
        background: 'rgba(230, 236, 255, 0.03)',
        border: '1px solid rgba(230, 236, 255, 0.06)',
      }}
    >
      {cells.map((cell) => (
        <div
          key={cell.label}
          style={{
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
          }}
        >
          <dt
            style={{
              fontSize: 9,
              fontFamily: 'ui-monospace, SFMono-Regular, monospace',
              letterSpacing: 0.5,
              color: '#8892a6',
              textTransform: 'uppercase',
            }}
          >
            {cell.label}
          </dt>
          <dd
            style={{
              margin: 0,
              fontSize: 12,
              fontFamily: 'ui-monospace, SFMono-Regular, monospace',
              color: cell.critical ? '#ff8fa3' : '#e6ecff',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {cell.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function HashDisclosure(props: {
  promptHash?: string;
  contractHash?: string;
}): JSX.Element | null {
  const { promptHash, contractHash } = props;
  if (!promptHash && !contractHash) return null;
  return (
    <details
      style={{
        fontSize: 10,
        fontFamily: 'ui-monospace, SFMono-Regular, monospace',
        color: '#8892a6',
      }}
    >
      <summary
        style={{
          cursor: 'pointer',
          padding: '2px 0',
          letterSpacing: 0.4,
        }}
      >
        ADVISORY HASHES (SHA-256)
      </summary>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'max-content 1fr',
          columnGap: 8,
          rowGap: 2,
          marginTop: 4,
          padding: '6px 8px',
          borderRadius: 6,
          background: 'rgba(0, 0, 0, 0.35)',
          border: '1px solid rgba(230, 236, 255, 0.08)',
        }}
      >
        {promptHash ? (
          <>
            <span>prompt</span>
            <span
              style={{
                color: '#b0bccc',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={promptHash}
            >
              {promptHash}
            </span>
          </>
        ) : null}
        {contractHash ? (
          <>
            <span>contract</span>
            <span
              style={{
                color: '#b0bccc',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={contractHash}
            >
              {contractHash}
            </span>
          </>
        ) : null}
      </div>
    </details>
  );
}

function CardActions(props: {
  variant: IdentityCardProps['variant'];
  onExpandAudit?: (ev: ReactMouseEvent | ReactKeyboardEvent) => void;
  onMessageCreator?: (ev: ReactMouseEvent | ReactKeyboardEvent) => void;
  strokeColor: string;
}): JSX.Element | null {
  const { variant, onExpandAudit, onMessageCreator, strokeColor } = props;
  if (!onExpandAudit && !onMessageCreator) return null;
  const compact = variant === 'compact';

  return (
    <footer
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        marginTop: compact ? 0 : 4,
      }}
    >
      {onExpandAudit ? (
        <button
          type="button"
          onClick={onExpandAudit}
          onKeyDown={(ev) => {
            if (ev.key === 'Enter' || ev.key === ' ') {
              ev.preventDefault();
              onExpandAudit(ev);
            }
          }}
          style={{
            fontSize: 11,
            fontFamily: 'ui-monospace, SFMono-Regular, monospace',
            letterSpacing: 0.4,
            padding: compact ? '3px 6px' : '4px 10px',
            borderRadius: 6,
            color: strokeColor,
            background: 'transparent',
            border: `1px solid ${strokeColor}66`,
            cursor: 'pointer',
          }}
        >
          View audit trail
        </button>
      ) : null}
      {onMessageCreator ? (
        <button
          type="button"
          onClick={onMessageCreator}
          onKeyDown={(ev) => {
            if (ev.key === 'Enter' || ev.key === ' ') {
              ev.preventDefault();
              onMessageCreator(ev);
            }
          }}
          style={{
            fontSize: 11,
            fontFamily: 'ui-monospace, SFMono-Regular, monospace',
            letterSpacing: 0.4,
            padding: compact ? '3px 6px' : '4px 10px',
            borderRadius: 6,
            color: '#e6ecff',
            background: 'rgba(230, 236, 255, 0.08)',
            border: '1px solid rgba(230, 236, 255, 0.2)',
            cursor: 'pointer',
          }}
        >
          Message creator
        </button>
      ) : null}
    </footer>
  );
}

function normalizeAuditSummary(
  summary: IdentityCardProps['identity']['audit_summary'] | undefined,
): {
  first_seen: string;
  last_active: string;
  total_invocations: number;
  reported_incidents: number;
} {
  if (!summary) {
    const nowIso = new Date().toISOString();
    return {
      first_seen: nowIso,
      last_active: nowIso,
      total_invocations: 0,
      reported_incidents: 0,
    };
  }
  return {
    first_seen: summary.first_seen,
    last_active: summary.last_active,
    total_invocations: Math.max(0, summary.total_invocations ?? 0),
    reported_incidents: Math.max(0, summary.reported_incidents ?? 0),
  };
}

function shortConfidence(
  confidence: CapabilityDeclaration['confidence_self_declared'],
): string {
  switch (confidence) {
    case 'experimental':
      return 'exp';
    case 'stable':
      return 'stbl';
    case 'verified':
      return 'vrf';
    default:
      return confidence;
  }
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

function formatRelative(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const deltaSec = (Date.now() - date.getTime()) / 1000;
  if (deltaSec < 60) return 'now';
  if (deltaSec < 3600) return `${Math.floor(deltaSec / 60)}m`;
  if (deltaSec < 86400) return `${Math.floor(deltaSec / 3600)}h`;
  if (deltaSec < 86400 * 30) return `${Math.floor(deltaSec / 86400)}d`;
  if (deltaSec < 86400 * 365) return `${Math.floor(deltaSec / (86400 * 30))}mo`;
  return `${Math.floor(deltaSec / (86400 * 365))}y`;
}

export const IdentityCard = memo(IdentityCardImpl);
export default IdentityCard;
