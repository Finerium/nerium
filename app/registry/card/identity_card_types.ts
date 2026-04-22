// app/registry/card/identity_card_types.ts
//
// NERIUM Registry pillar: identity card shared types.
// Conforms to docs/contracts/identity_card.contract.md v0.1.0.
//
// Props surface for Phoebe P3a card components. Types re-export from the
// Hecate-owned identity + trust modules so consumers (Eos, Artemis, Coeus,
// Apollo, Harmonia) import a single card-local barrel when embedding cards
// on Marketplace and Advisor surfaces.

import type { AgentIdentity, AuditEntry } from '../schema/identity.schema';
import type { TrustScore, TrustBand } from '../trust/trust_types';

export type CardVariant = 'compact' | 'default' | 'expanded';

export type TrustBadgeFormat = 'numeric' | 'band_label' | 'gauge' | 'star';

export interface IdentityCardProps {
  identity: AgentIdentity;
  trust: TrustScore;
  variant?: CardVariant;                 // default 'default'
  trustBadgeFormat?: TrustBadgeFormat;   // default 'band_label' per contract Section 4
  onExpandAudit?: () => void;
  onMessageCreator?: () => void;         // optional; absent in read-only contexts
  showVendorOriginBadge?: boolean;       // default true
  className?: string;                    // host layout class pass-through
}

export interface TrustScoreBadgeProps {
  score: number;                         // 0.0 to 1.0 per trust_score.contract.md
  band: TrustBand;
  format?: TrustBadgeFormat;             // default 'band_label'
  stability?: TrustScore['stability'];   // honest-claim provisional vs stable
  compact?: boolean;
  title?: string;                        // override tooltip, else derived
}

export interface AuditTrailExpandProps {
  identity_id: string;
  fetcher: AuditTrailFetcher;
  max_entries?: number;                  // default 5 per contract Section 8
  virtualize_threshold?: number;         // default 20 per prompt soft-guidance
  onClose: () => void;
}

export type AuditTrailFetcher = (
  identity_id: string,
  limit: number,
) => Promise<AuditEntry[]>;

// Vendor origin display labels. Keys mirror AgentIdentity.vendor_origin union.
// `other` maps to neutral "Custom" per contract Section 8 error handling.
export const VENDOR_ORIGIN_LABEL: Record<AgentIdentity['vendor_origin'], string> = {
  hand_coded: 'Hand Coded',
  cursor: 'Cursor',
  claude_code: 'Claude Code',
  replit: 'Replit',
  bolt: 'Bolt',
  lovable: 'Lovable',
  claude_skills: 'Claude Skills',
  gpt_store: 'GPT Store',
  mcp_hub: 'MCP Hub',
  huggingface_space: 'Hugging Face',
  langchain_hub: 'LangChain Hub',
  vercel_gallery: 'Vercel Gallery',
  cloudflare_marketplace: 'Cloudflare',
  other: 'Custom',
};

// Band to human-readable tier label. Design pick per phoebe.decisions ADR 0001:
// retain Hecate band taxonomy verbatim for cross-surface consistency, title-cased
// for visual rendering. No custom Bronze/Silver/Gold/Diamond scheme to prevent
// drift with trust_formula.deriveBand + consumer search ranking sorts.
export const TRUST_BAND_LABEL: Record<TrustBand, string> = {
  unverified: 'Unverified',
  emerging: 'Emerging',
  established: 'Established',
  trusted: 'Trusted',
  elite: 'Elite',
};

// Band color tokens resolved against Harmonia unified theme per
// design_tokens.contract.md Section 3. Inline hex mirrors the pattern used in
// app/builder/viz/AgentNode.tsx until Harmonia's per-band semantic token lands.
// Values deliberately align with AgentNode status halos so Trust and Pipeline
// surfaces share a visual vocabulary.
export const TRUST_BAND_COLOR: Record<TrustBand, { fill: string; stroke: string; glow: string }> = {
  unverified:  { fill: '#3a4254', stroke: '#5b6377', glow: 'rgba(91, 99, 119, 0.25)' },
  emerging:    { fill: '#8b5cf6', stroke: '#a985ff', glow: 'rgba(139, 92, 246, 0.45)' },
  established: { fill: '#00f0ff', stroke: '#00f0ff', glow: 'rgba(0, 240, 255, 0.5)' },
  trusted:     { fill: '#22f59a', stroke: '#22f59a', glow: 'rgba(34, 245, 154, 0.55)' },
  elite:       { fill: '#ffd166', stroke: '#ffd166', glow: 'rgba(255, 209, 102, 0.65)' },
};

// Height contract per identity_card.contract.md Section 4.
export const CARD_HEIGHT: Record<CardVariant, number> = {
  compact: 120,
  default: 200,
  expanded: 360,
};

// QA instrumentation event topic names per identity_card.contract.md Section 5.
export const CARD_EVENT_TOPICS = {
  cardRendered: 'registry.ui.card.rendered',
  auditExpanded: 'registry.ui.audit.expanded',
} as const;

export type CardEventTopic =
  (typeof CARD_EVENT_TOPICS)[keyof typeof CARD_EVENT_TOPICS];

// Optional emitter injection: card consumers that wire up the event bus
// pass an emit function. When absent, render paths no-op the instrumentation.
export interface CardInstrumentationEmitter {
  emit(topic: CardEventTopic, payload: Record<string, unknown>): void;
}

export interface CardInstrumentationProps {
  emitter?: CardInstrumentationEmitter;
}

// Re-exports so embedders import from this single barrel.
export type { AgentIdentity, AuditEntry, TrustScore, TrustBand };
