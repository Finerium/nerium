'use client';

//
// PublishConfirm.tsx (Eos P3a).
//
// Conforms to:
// - docs/contracts/listing_submission.contract.md v0.1.0 (PublishConfirmProps, Section 7 naming)
// - docs/contracts/design_tokens.contract.md v0.1.0 (styling)
//
// Terminal confirmation screen after a successful onPublish. Displays the
// created listing identity, next-step CTAs, and a mandatory honest-claim
// disclosure: this posts to the NERIUM Marketplace prototype only, not cross-
// posted to vendor storefronts in hackathon scope (agent prompt Hard
// Constraint bullet 7). Parent mounts this after onPublish resolves and is
// responsible for passing the listing_id and slug returned by the catalog.
//

import type { ReactElement } from 'react';
import { motion } from 'framer-motion';

import type { PublishConfirmProps } from './submission_types';

import './styles.css';

export default function PublishConfirm({
  listing_id,
  slug,
  onViewListing,
  onNewSubmission,
}: PublishConfirmProps): ReactElement {
  const listingUrl = `/marketplace/listing/${slug}`;

  return (
    <motion.section
      className="eos-publish-root"
      role="status"
      aria-live="polite"
      aria-labelledby="eos-publish-heading"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="eos-publish-badge" aria-hidden="true">
        <span className="eos-publish-badge-dot" />
      </div>

      <h2 id="eos-publish-heading" className="eos-publish-heading">
        Listing published
      </h2>
      <p className="eos-publish-subheading">
        Your agent is live on the NERIUM Marketplace prototype. Buyers can discover it via browse,
        search, and Advisor recommendations.
      </p>

      <dl className="eos-publish-meta">
        <div className="eos-publish-meta-row">
          <dt className="eos-publish-meta-label">Listing ID</dt>
          <dd className="eos-publish-meta-value">
            <code>{listing_id}</code>
          </dd>
        </div>
        <div className="eos-publish-meta-row">
          <dt className="eos-publish-meta-label">Public URL</dt>
          <dd className="eos-publish-meta-value">
            <code>{listingUrl}</code>
          </dd>
        </div>
      </dl>

      <div className="eos-publish-actions">
        <button
          type="button"
          className="eos-btn eos-btn-primary"
          onClick={onViewListing}
          aria-label="View the published listing on Marketplace"
        >
          View listing
        </button>
        <button
          type="button"
          className="eos-btn eos-btn-secondary"
          onClick={onNewSubmission}
          aria-label="Start a fresh listing submission"
        >
          Submit another agent
        </button>
      </div>

      <section className="eos-publish-disclosure" role="note" aria-label="Prototype scope disclosure">
        <h3 className="eos-publish-disclosure-heading">What "published" means in this prototype</h3>
        <ul className="eos-publish-disclosure-list">
          <li>
            Listing posts to the NERIUM Marketplace prototype catalog only. It is not cross-posted to
            Claude Skills, GPT Store, MCP Hub, Hugging Face, Replit Agent Market, LangChain Hub, Vercel
            Gallery, Cloudflare Marketplace, or any vendor storefront in hackathon scope.
          </li>
          <li>
            Buyers in the demo environment can discover and remix your listing. Billing events are meter
            stubs backed by the Banking pillar, not live Stripe charges.
          </li>
          <li>
            Cross-vendor cross-posting and live payment rails are on the post-hackathon roadmap. See
            <code> docs/contracts/marketplace_listing.contract.md</code> Section 11 for details.
          </li>
        </ul>
      </section>
    </motion.section>
  );
}
