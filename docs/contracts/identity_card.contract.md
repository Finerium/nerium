# Identity Card

**Contract Version:** 0.1.0
**Owner Agent(s):** Phoebe (identity card component author)
**Consumer Agent(s):** Eos (listing submission preview), Artemis (browse grid), Coeus (search result list), Apollo (Advisor chat surfaces when specialist discussed), Harmonia (aesthetic sweep)
**Stability:** draft
**Last Updated:** 2026-04-22 (Day 1, post-kickoff)

## 1. Purpose

Defines the reusable agent identity card component that renders Registry data (identity, capabilities, trust score, audit summary) consistently across Marketplace surfaces and the Advisor chat, so every mention of an agent carries its verifiable KTP.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor, Section 6 Registry shallow-by-design)
- `CLAUDE.md` (root)
- `docs/contracts/agent_identity.contract.md` (data source)
- `docs/contracts/trust_score.contract.md` (trust badge data source)
- `docs/contracts/design_tokens.contract.md` (styling)

## 3. Schema Definition

```typescript
// app/registry/card/identity_card_types.ts

import type { AgentIdentity } from '@/registry/schema/identity.schema';
import type { TrustScore, TrustBand } from '@/registry/trust/trust_types';

export type CardVariant = 'compact' | 'default' | 'expanded';

export interface IdentityCardProps {
  identity: AgentIdentity;
  trust: TrustScore;
  variant?: CardVariant;              // default 'default'
  onExpandAudit?: () => void;
  onMessageCreator?: () => void;      // optional CTA; absent in read-only contexts
  showVendorOriginBadge?: boolean;    // default true
}

export interface TrustScoreBadgeProps {
  score: number;                      // 0.0 to 1.0
  band: TrustBand;
  format: 'numeric' | 'band_label' | 'gauge' | 'star';
  compact?: boolean;
}

export interface AuditTrailExpandProps {
  identity_id: string;
  max_entries?: number;               // default 5
  onClose: () => void;
}
```

## 4. Interface / API Contract

- `<IdentityCard>` renders a compact card variant (~120px height) suitable for grid layouts, a default variant (~200px) for search results, and an expanded variant (~360px) for detail drawers.
- `<TrustScoreBadge>` supports four rendering formats to satisfy different surface constraints. Default is `band_label`.
- `<AuditTrailExpand>` lazy-loads recent audit entries via `IdentityRegistry.getAuditForIdentity`.
- All card variants visually disclose `vendor_origin` when `showVendorOriginBadge` is true, supporting NarasiGhaisan Section 5 cross-vendor transparency.

## 5. Event Signatures

- `registry.ui.card.rendered` payload: `{ identity_id, variant }` (primarily for QA instrumentation)
- `registry.ui.audit.expanded` payload: `{ identity_id }`

## 6. File Path Convention

- Card: `app/registry/card/IdentityCard.tsx`
- Trust badge: `app/registry/card/TrustScoreBadge.tsx`
- Audit expand: `app/registry/card/AuditTrailExpand.tsx`
- Types: `app/registry/card/identity_card_types.ts`

## 7. Naming Convention

- Component files: `PascalCase.tsx`.
- Variant values: lowercase single word.
- Trust score format values: lowercase single word or `snake_case`.

## 8. Error Handling

- Missing `trust` prop: render the badge in `unverified` band with visual indicator that score is pending.
- Missing `identity.audit_summary` fields: render defaults (0 counts) without throwing.
- Audit fetch failure in `<AuditTrailExpand>`: render retry affordance.
- Vendor origin `other`: render a neutral "Custom" badge rather than the raw string.

## 9. Testing Surface

- Three variants: render each variant with the same identity, assert CSS differs measurably (height, layout).
- Badge formats: render a trust score of 0.72 in each of the 4 formats, assert correct visual output and consistent underlying text label.
- Audit expand: mount `<AuditTrailExpand>`, assert lazy fetch is triggered exactly once.
- Missing trust prop: mount without `trust`, assert `<TrustScoreBadge>` renders the unverified state.
- Vendor origin badge: set `vendor_origin: 'claude_code'`, assert badge renders with label "Claude Code".

## 10. Open Questions

- None at contract draft. Trust score visual format (numeric vs band vs gauge vs star) defaults to `band_label` but is an exposed prop, satisfying the Phoebe strategic_decision at the contract layer.

## 11. Post-Hackathon Refactor Notes

- Add interactive creator profile hover (mini-profile popover with last 3 agents published).
- Integrate cross-platform identity verification badges (GitHub, verified business, domain verification).
- Support multilingual card rendering (hackathon: English labels only).
- Add trust score history sparkline in the expanded variant.
- Wire "Message Creator" CTA to a real communication surface post-hackathon (hackathon: the CTA is a no-op stub).
