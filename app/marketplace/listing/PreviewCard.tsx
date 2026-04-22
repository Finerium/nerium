'use client';

//
// PreviewCard.tsx (Eos P3a).
//
// Conforms to:
// - docs/contracts/listing_submission.contract.md v0.1.0 (PreviewCardProps)
// - docs/contracts/marketplace_listing.contract.md v0.1.0 (AgentListing schema)
// - docs/contracts/identity_card.contract.md v0.1.0 (IdentityCard shape, stubbed)
// - docs/contracts/design_tokens.contract.md v0.1.0 (token-based styling)
//
// Renders a listing as buyers will see it on Marketplace browse and detail
// surfaces. Dual-mode: "preview" before publish (shown inside SubmissionForm
// final step) and "published" after publish (shown on PublishConfirm + can be
// reused by Artemis). Harmonia will reskin per active world aesthetic in P4.
//
// Phoebe's IdentityCard is stubbed locally because P3a Phoebe runs in
// parallel and the shared component file is not yet guaranteed to exist.
// When Phoebe ships app/registry/card/IdentityCard.tsx, swap the stub import
// here and delete the local placeholder. Eos ADR-03 documents the handoff.
//

import type { ReactElement } from 'react';
import { motion } from 'framer-motion';

import type { AgentListing, PricingTier, VendorOrigin } from '../schema/listing.schema';
import type { PreviewCardProps } from './submission_types';

import './styles.css';

const VENDOR_LABELS: Record<VendorOrigin, string> = {
  hand_coded: 'Hand coded',
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
  cloudflare_marketplace: 'Cloudflare Marketplace',
  nerium_builder: 'NERIUM Builder',
  other: 'Custom',
};

const TIER_BADGE_COPY: Record<PricingTier, string> = {
  free: 'Free',
  cheap: 'Cheap',
  mid: 'Mid',
  premium: 'Premium',
};

function formatUsd(amount: number): string {
  if (!Number.isFinite(amount)) return '$0';
  if (amount === 0) return 'Free';
  if (amount < 0.01) return `<$0.01`;
  if (amount < 1) return `$${amount.toFixed(3)}`;
  return `$${amount.toFixed(2)}`;
}

function humanizeCapability(tag: string): string {
  return tag.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

export default function PreviewCard({ listing, mode }: PreviewCardProps): ReactElement {
  const vendorLabel = VENDOR_LABELS[listing.vendor_origin] ?? 'Custom';
  const tierLabel = TIER_BADGE_COPY[listing.pricing_tier] ?? listing.pricing_tier;
  const { low_usd, high_usd } = listing.usage_cost_hint.estimate_range;
  const costBlurb =
    listing.pricing_tier === 'free'
      ? 'Free to call'
      : `${formatUsd(low_usd)} to ${formatUsd(high_usd)} per ${listing.usage_cost_hint.per_execution_unit}`;

  return (
    <motion.article
      className="eos-preview-card"
      data-mode={mode}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      role="article"
      aria-label={`Listing preview for ${listing.display_name}`}
    >
      <header className="eos-preview-header">
        <div className="eos-preview-title-row">
          <h3 className="eos-preview-title">{listing.display_name || 'Untitled agent'}</h3>
          <span className={`eos-preview-tier eos-preview-tier-${listing.pricing_tier}`}>{tierLabel}</span>
        </div>
        <p className="eos-preview-slug" aria-label="Listing slug">
          /{listing.slug || 'unnamed'}
        </p>
      </header>

      <IdentityStub
        creator_identity_id={listing.creator_identity_id}
        vendor_label={vendorLabel}
      />

      <p className="eos-preview-short">{listing.short_description || 'No short description provided.'}</p>

      <div className="eos-preview-meta">
        <div className="eos-preview-meta-item">
          <span className="eos-preview-meta-label">Vendor origin</span>
          <span className="eos-preview-meta-value">{vendorLabel}</span>
        </div>
        <div className="eos-preview-meta-item">
          <span className="eos-preview-meta-label">Cost hint</span>
          <span className="eos-preview-meta-value">{costBlurb}</span>
        </div>
        <div className="eos-preview-meta-item">
          <span className="eos-preview-meta-label">Trust</span>
          <span className="eos-preview-meta-value" title={listing.trust_score_pointer}>
            Pending verification
          </span>
        </div>
      </div>

      <ul className="eos-preview-tags" aria-label="Capability tags">
        {(listing.capability_tags ?? []).map((tag) => (
          <li key={tag} className="eos-preview-tag">
            {humanizeCapability(tag)}
          </li>
        ))}
        {listing.capability_tags && listing.capability_tags.length === 0 && (
          <li className="eos-preview-tag eos-preview-tag-empty">No tags yet</li>
        )}
      </ul>

      {listing.living_template_params && listing.living_template_params.length > 0 && (
        <section className="eos-preview-living" aria-label="Living template parameters">
          <h4 className="eos-preview-section-heading">Remixable parameters</h4>
          <ul className="eos-preview-living-list">
            {listing.living_template_params.map((param) => (
              <li key={param.key} className="eos-preview-living-item">
                <span className="eos-preview-living-key">{param.label || param.key}</span>
                <span className="eos-preview-living-kind">({param.kind})</span>
                <p className="eos-preview-living-desc">{param.description}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="eos-preview-footer">
        <p className="eos-preview-audit" aria-label="Audit summary">
          {listing.audit_summary}
        </p>
        {mode === 'preview' ? (
          <p className="eos-preview-mode-note" role="note">
            Preview only. Publishing ships this card to the public Marketplace browse.
          </p>
        ) : (
          <p className="eos-preview-mode-note" role="note">
            Live on Marketplace prototype. Not cross-posted to vendor storefronts in hackathon scope.
          </p>
        )}
      </footer>
    </motion.article>
  );
}

interface IdentityStubProps {
  creator_identity_id: string;
  vendor_label: string;
}

function IdentityStub({ creator_identity_id, vendor_label }: IdentityStubProps): ReactElement {
  const initials = creator_identity_id.slice(0, 2).toUpperCase();
  return (
    <div className="eos-preview-identity" aria-label="Creator identity">
      <span className="eos-preview-identity-avatar" aria-hidden="true">
        {initials || '??'}
      </span>
      <div className="eos-preview-identity-meta">
        <span className="eos-preview-identity-id">
          <code>{creator_identity_id || 'unknown identity'}</code>
        </span>
        <span className="eos-preview-identity-vendor">{vendor_label}</span>
      </div>
    </div>
  );
}
