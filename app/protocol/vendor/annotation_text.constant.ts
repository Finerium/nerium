// Locked honest-claim annotation phrasing.
// Contract: docs/contracts/vendor_adapter_ui.contract.md v0.1.0 Section 6.
// NarasiGhaisan Section 16 anchors this exact wording. CLAUDE.md anti-pattern 7
// forbids non-Anthropic execution in hackathon scope, so this phrase is the
// user-facing acknowledgement. Changing the default text requires halt-and-ferry
// per contract Section 4 ("documented as advisory; changing the locked text
// requires halt-and-ferry").
//
// Apollo publishes parallel copies in apollo.config.json
// model_strategy.modes.multi_vendor.honest_claim_annotation and in
// apollo.prompts.ts MULTI_VENDOR_ANNOTATION_EN / MULTI_VENDOR_ANNOTATION_ID.
// Morpheus mirrors the English locale here so the Vendor Adapter UI renders
// without a runtime config fetch. Keep in lockstep with Apollo if copy shifts.

export const HONEST_CLAIM_LOCKED_TEXT =
  'demo execution Anthropic only, multi-vendor unlock post-hackathon';

export const AUTO_ROUTING_LOCKED_TEXT =
  'Auto routing ships post-hackathon; current demo uses collaborative Anthropic.';

export const MOCK_BADGE_LABEL = 'simulated';

export const ANTHROPIC_BADGE_LABEL = 'live';
