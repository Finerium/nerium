// app/registry/schema/identity.schema.ts
//
// NERIUM Registry pillar: agent identity schema.
// Conforms to docs/contracts/agent_identity.contract.md v0.1.0.
//
// Scope per NarasiGhaisan Section 6: Registry is shallow by design.
// Mock data, zero real DNS, zero blockchain. prompt_hash and contract_hash
// are advisory SHA-256 hex strings, not cryptographically enforced.
//
// TrustScore type lives in ../trust/trust_types.ts per
// docs/contracts/trust_score.contract.md v0.1.0 Section 6.
// Re-exported here so consumers can import both from a single surface.

import type { TrustScore, TrustBand } from '../trust/trust_types';

export type IdentityKind = 'creator' | 'agent' | 'platform' | 'system';

export type VendorOrigin =
  | 'hand_coded'
  | 'cursor'
  | 'claude_code'
  | 'replit'
  | 'bolt'
  | 'lovable'
  | 'claude_skills'
  | 'gpt_store'
  | 'mcp_hub'
  | 'huggingface_space'
  | 'langchain_hub'
  | 'vercel_gallery'
  | 'cloudflare_marketplace'
  | 'other';

export type CapabilityTag =
  | 'code_generation'
  | 'research'
  | 'data_extraction'
  | 'customer_support'
  | 'marketing_copy'
  | 'design_asset'
  | 'video_generation'
  | 'trading_signal'
  | 'domain_automation'
  | 'analysis'
  | 'other';

export type CapabilitySelfConfidence = 'experimental' | 'stable' | 'verified';

export interface CapabilityDeclaration {
  tag: CapabilityTag;
  confidence_self_declared: CapabilitySelfConfidence;
}

export interface AuditSummary {
  first_seen: string;          // ISO 8601
  last_active: string;         // ISO 8601
  total_invocations: number;   // non-negative integer
  reported_incidents: number;  // non-negative integer
}

export interface AgentIdentity {
  identity_id: string;                 // UUID v4
  display_name: string;
  handle: string;                      // lowercase alphanumeric + underscore, max 40
  kind: IdentityKind;
  vendor_origin: VendorOrigin;
  version: string;                     // semver
  capabilities: CapabilityDeclaration[]; // at least one required
  prompt_hash?: string;                // SHA-256 hex, 64 chars, advisory
  contract_hash?: string;              // SHA-256 hex, 64 chars, advisory
  trust_score_pointer: string;         // relative path or URL to TrustScore artifact
  audit_summary: AuditSummary;
  created_at: string;                  // ISO 8601
  updated_at: string;                  // ISO 8601
}

export type AuditEntryKind = 'invocation' | 'incident' | 'attestation' | 'version_bump';

export type AuditOutcome = 'success' | 'failure' | 'partial';

export interface AuditEntry {
  entry_id: string;                // UUID v4
  identity_id: string;             // FK to AgentIdentity.identity_id
  kind: AuditEntryKind;
  pipeline_run_id?: string;        // correlation id across a Builder pipeline
  outcome: AuditOutcome;
  cost_usd?: number;               // optional, for invocation entries
  occurred_at: string;             // ISO 8601
  details: Record<string, unknown>;
}

// Registry interface per contract Section 4.
export interface IdentityRegistry {
  getIdentity(identity_id: string): Promise<AgentIdentity | null>;
  getByHandle(handle: string): Promise<AgentIdentity | null>;
  upsert(identity: AgentIdentity): Promise<AgentIdentity>;
  recordAudit(entry: AuditEntry): Promise<void>;
  getAuditForIdentity(identity_id: string, limit?: number): Promise<AuditEntry[]>;
  resolveTrustScore(pointer: string): Promise<number>;
}

// Error classes named per contract Section 8.
export class DuplicateHandleError extends Error {
  constructor(handle: string) {
    super(`Duplicate handle: ${handle}`);
    this.name = 'DuplicateHandleError';
  }
}

export class CapabilityRequiredError extends Error {
  constructor() {
    super('capabilities array must contain at least one entry');
    this.name = 'CapabilityRequiredError';
  }
}

// Handle validation per contract Section 7.
export const HANDLE_PATTERN = /^[a-z0-9_]{1,40}$/;

export function isValidHandle(handle: string): boolean {
  return HANDLE_PATTERN.test(handle);
}

// SHA-256 hex validation: 64 lowercase hex chars.
export const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;

export function isValidSha256Hex(value: string): boolean {
  return SHA256_HEX_PATTERN.test(value);
}

// Re-exports from trust package for consumer convenience.
export type { TrustScore, TrustBand };
