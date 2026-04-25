'use client';
//
// app/registry/page.tsx
//
// Nemea Phase 5 QA emergency harness (2026-04-22). Renders the Phoebe
// IdentityCard against a single demo AgentIdentity and TrustScore. Multiple
// variants and trust bands shown side by side so the card's rendering
// surface is legible in a single screenshot.
//

import { IdentityCard } from './card/IdentityCard';
import type { AgentIdentity } from './schema/identity.schema';
import type { TrustScore } from './trust/trust_types';
import { HarnessShell } from '../_harness/HarnessShell';

function buildIdentity(
  suffix: string,
  override: Partial<AgentIdentity> = {},
): AgentIdentity {
  return {
    identity_id: `id_demo_${suffix}`,
    display_name: override.display_name ?? 'Lumio Reading Coach',
    handle: override.handle ?? `lumio_${suffix}`,
    kind: 'agent',
    vendor_origin: 'claude_code',
    version: '0.3.2',
    capabilities: [
      { tag: 'domain_automation', confidence_self_declared: 'stable' },
      { tag: 'research', confidence_self_declared: 'experimental' },
    ],
    prompt_hash:
      'a1b2c3d4e5f60708091011121314151617181920212223242526272829303132',
    contract_hash:
      'b2c3d4e5f607080910111213141516171819202122232425262728293031323a',
    trust_score_pointer: `trust/demo_${suffix}.json`,
    audit_summary: {
      first_seen: '2026-02-01T00:00:00.000Z',
      last_active: '2026-04-22T10:00:00.000Z',
      total_invocations: 1204,
      reported_incidents: 0,
    },
    created_at: '2026-02-01T00:00:00.000Z',
    updated_at: '2026-04-22T10:00:00.000Z',
    ...override,
  };
}

function buildTrust(
  identity_id: string,
  score: number,
  band: TrustScore['band'],
): TrustScore {
  return {
    identity_id,
    score,
    band,
    computed_at: '2026-04-22T10:05:00.000Z',
    inputs: {
      usage_count: 1204,
      usage_count_normalized: 0.72,
      positive_review_ratio: score,
      successful_execution_rate: 0.94,
      verifier_attestation_count: 3,
      verifier_attestation_weight: 0.65,
    },
    stability: 'stable',
  };
}

const CARDS: ReadonlyArray<{
  identity: AgentIdentity;
  trust: TrustScore;
  variant: 'compact' | 'default' | 'expanded';
}> = [
  (() => {
    const identity = buildIdentity('elite', {
      display_name: 'Lumio Reading Coach',
      handle: 'lumio_reading_coach',
    });
    return {
      identity,
      trust: buildTrust(identity.identity_id, 0.92, 'elite'),
      variant: 'expanded',
    };
  })(),
  (() => {
    const identity = buildIdentity('trusted', {
      display_name: 'Restaurant Shift Scheduler',
      handle: 'restaurant_scheduler',
      capabilities: [
        { tag: 'domain_automation', confidence_self_declared: 'stable' },
      ],
    });
    return {
      identity,
      trust: buildTrust(identity.identity_id, 0.72, 'trusted'),
      variant: 'default',
    };
  })(),
  (() => {
    const identity = buildIdentity('emerging', {
      display_name: 'PR Commentator',
      handle: 'pr_comment_agent',
      vendor_origin: 'cursor',
    });
    return {
      identity,
      trust: buildTrust(identity.identity_id, 0.28, 'emerging'),
      variant: 'compact',
    };
  })(),
];

export default function RegistryPage() {
  return (
    <HarnessShell
      heading="Registry"
      sub="Agent identity with verifiable capabilities, vendor origin, trust band, and audit trail. Registry in the hackathon scope is shallow by design; data below is demo seed."
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '1.25rem',
        }}
      >
        {CARDS.map((entry, i) => (
          <IdentityCard
            key={i}
            identity={entry.identity}
            trust={entry.trust}
            variant={entry.variant}
          />
        ))}
      </div>
    </HarnessShell>
  );
}
