# Agent Identity

**Contract Version:** 0.1.0
**Owner Agent(s):** Hecate (schema owner, Registry Lead)
**Consumer Agent(s):** Phoebe (identity card UI render), Demeter (listing creator identity FK), Eos (submission identity-check step), Tyche (transaction attribution), Heracles (Managed Agents sessions register identity), Ananke (audit trail aggregation)
**Stability:** draft
**Last Updated:** 2026-04-22 (Day 1, post-kickoff)

## 1. Purpose

Defines the canonical agent identity schema (unique ID, display name, capabilities declaration, vendor origin, version, hash of prompt/contract, trust score pointer, audit summary) so every agent operating in NERIUM has a verifiable KTP surface per NarasiGhaisan Section 6 shallow-by-design Registry.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor, Section 6 Registry shallow-by-design)
- `CLAUDE.md` (root)
- `docs/contracts/trust_score.contract.md` (companion contract)
- `docs/contracts/marketplace_listing.contract.md` (creator linkage)

## 3. Schema Definition

```typescript
// app/registry/schema/identity.schema.ts

export type IdentityKind = 'creator' | 'agent' | 'platform' | 'system';

export type CapabilityDeclaration = {
  tag: 'code_generation' | 'research' | 'data_extraction' | 'customer_support' | 'marketing_copy' | 'design_asset' | 'video_generation' | 'trading_signal' | 'domain_automation' | 'analysis' | 'other';
  confidence_self_declared: 'experimental' | 'stable' | 'verified';
};

export interface AgentIdentity {
  identity_id: string;               // uuid v4
  display_name: string;
  handle: string;                    // unique lowercase handle, e.g., 'lumio_copywriter_v2'
  kind: IdentityKind;
  vendor_origin: 'hand_coded' | 'cursor' | 'claude_code' | 'replit' | 'bolt' | 'lovable' | 'claude_skills' | 'gpt_store' | 'mcp_hub' | 'huggingface_space' | 'langchain_hub' | 'vercel_gallery' | 'cloudflare_marketplace' | 'other';
  version: string;                   // semver
  capabilities: CapabilityDeclaration[];
  prompt_hash?: string;              // sha256 of prompt text, present for agent kind
  contract_hash?: string;            // sha256 of contract file content
  trust_score_pointer: string;       // path or URL resolving to a TrustScore
  audit_summary: {
    first_seen: string;
    last_active: string;
    total_invocations: number;
    reported_incidents: number;
  };
  created_at: string;
  updated_at: string;
}

export interface AuditEntry {
  entry_id: string;
  identity_id: string;
  kind: 'invocation' | 'incident' | 'attestation' | 'version_bump';
  pipeline_run_id?: string;
  outcome: 'success' | 'failure' | 'partial';
  cost_usd?: number;
  occurred_at: string;
  details: Record<string, unknown>;
}
```

## 4. Interface / API Contract

```typescript
export interface IdentityRegistry {
  getIdentity(identity_id: string): Promise<AgentIdentity | null>;
  getByHandle(handle: string): Promise<AgentIdentity | null>;
  upsert(identity: AgentIdentity): Promise<AgentIdentity>;
  recordAudit(entry: AuditEntry): Promise<void>;
  getAuditForIdentity(identity_id: string, limit?: number): Promise<AuditEntry[]>;
  resolveTrustScore(pointer: string): Promise<number>;
}
```

- Hackathon implementation uses SQLite; `trust_score_pointer` is a local relative path that resolves to a JSON artifact managed by `trust_score.contract.md` implementation.
- `prompt_hash` and `contract_hash` are advisory (not cryptographically enforced) for hackathon; post-hackathon they anchor verifiability.

## 5. Event Signatures

- `registry.identity.created` payload: `{ identity_id, handle, kind }`
- `registry.identity.updated` payload: `{ identity_id, changed_fields: string[] }`
- `registry.audit.recorded` payload: `{ entry: AuditEntry }`

## 6. File Path Convention

- Schema: `app/registry/schema/identity.schema.ts`
- Registry implementation: `app/registry/registry/SqliteIdentityRegistry.ts`
- Audit log store: `app/registry/audit/audit_store.ts`
- Trust resolver glue: `app/registry/trust/trust_resolver.ts`

## 7. Naming Convention

- Handles: lowercase alphanumeric with underscore, max 40 chars.
- IdentityKind values: single lowercase word.
- Hashes: lowercase hex, sha256 output length 64.
- Field names: `snake_case`.

## 8. Error Handling

- Duplicate handle on upsert: throws `DuplicateHandleError`.
- Unknown `identity_id` on `getAuditForIdentity`: returns empty array, does not throw.
- `trust_score_pointer` resolution failure: returns default neutral score (0.5) and logs warning; callers receive a synthetic fallback.
- `capabilities` array empty: throws; at least one declaration required.

## 9. Testing Surface

- Upsert round trip: create identity, read by handle, assert match.
- Audit aggregation: record 5 audit entries, assert `total_invocations` in identity audit_summary reflects accurate count after refresh.
- Duplicate handle prevention: upsert two identities with the same handle, second throws.
- Trust resolution fallback: point to a nonexistent pointer, assert `resolveTrustScore` returns 0.5 with a warning logged.
- Capability validation: upsert with empty capabilities array, assert throws.

## 10. Open Questions

- None at contract draft. Mock vs limited-real trust signal origin is a Hecate strategic_decision, handled inside `trust_score.contract.md`.

## 11. Post-Hackathon Refactor Notes

- Replace advisory `prompt_hash` and `contract_hash` with cryptographic signing (Ed25519 or similar) so identities are tamper-evident.
- Add decentralized identifier (DID) support bridging to W3C DID methods for cross-platform portability.
- Support identity delegation (agent acts on behalf of creator) via scoped attestation chains.
- Expand `IdentityKind` with `organization` for multi-agent teams.
- Integrate with external reputation oracles (GitHub stars, prior platform ratings) to bootstrap initial trust.
