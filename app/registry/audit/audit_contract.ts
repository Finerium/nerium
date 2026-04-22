// app/registry/audit/audit_contract.ts
//
// NERIUM Registry pillar: audit log interface.
// Conforms to docs/contracts/agent_identity.contract.md v0.1.0 Sections 3, 5, 8.
//
// AuditStore is the canonical append-and-query surface for identity audit entries.
// Aggregate counters on AgentIdentity.audit_summary are recomputed by
// `refreshAuditSummary`, which reads the underlying log rather than trusting
// cached counts.

import type {
  AuditEntry,
  AuditEntryKind,
  AuditOutcome,
  AuditSummary,
} from '../schema/identity.schema';

// Event topics per agent_identity.contract.md Section 5.
export const AUDIT_EVENT_TOPICS = {
  identityCreated: 'registry.identity.created',
  identityUpdated: 'registry.identity.updated',
  auditRecorded: 'registry.audit.recorded',
} as const;

export type AuditEventTopic =
  (typeof AUDIT_EVENT_TOPICS)[keyof typeof AUDIT_EVENT_TOPICS];

export interface AuditEventEmitter {
  emit(topic: AuditEventTopic, payload: Record<string, unknown>): void;
}

export interface AuditQueryOptions {
  limit?: number;               // default 100
  kind?: AuditEntryKind;
  outcome?: AuditOutcome;
  since?: string;               // ISO 8601 inclusive
  until?: string;               // ISO 8601 inclusive
  pipeline_run_id?: string;
}

export interface AuditStore {
  record(entry: AuditEntry): Promise<void>;
  listForIdentity(
    identity_id: string,
    options?: AuditQueryOptions,
  ): Promise<AuditEntry[]>;
  listForPipelineRun(pipeline_run_id: string): Promise<AuditEntry[]>;
  countByOutcome(identity_id: string): Promise<Record<AuditOutcome, number>>;
  totalInvocations(identity_id: string): Promise<number>;
  incidentCount(identity_id: string): Promise<number>;
  firstSeen(identity_id: string): Promise<string | null>;
  lastActive(identity_id: string): Promise<string | null>;
}

// Recomputes AgentIdentity.audit_summary from the underlying AuditStore.
// Always prefer this over mutating counters directly so identity state stays
// derivable from the append-only log.
export async function refreshAuditSummary(
  store: AuditStore,
  identity_id: string,
): Promise<AuditSummary> {
  const [totalInvocations, reportedIncidents, firstSeen, lastActive] =
    await Promise.all([
      store.totalInvocations(identity_id),
      store.incidentCount(identity_id),
      store.firstSeen(identity_id),
      store.lastActive(identity_id),
    ]);

  const nowIso = new Date().toISOString();
  return {
    first_seen: firstSeen ?? nowIso,
    last_active: lastActive ?? nowIso,
    total_invocations: totalInvocations,
    reported_incidents: reportedIncidents,
  };
}

// Glue that combines record + event emit in the correct order.
export async function recordWithEmit(
  store: AuditStore,
  emitter: AuditEventEmitter,
  entry: AuditEntry,
): Promise<void> {
  await store.record(entry);
  emitter.emit(AUDIT_EVENT_TOPICS.auditRecorded, { entry });
}

// Minimal builder helpers so callers avoid stringly-typed entry construction.
export function makeInvocationEntry(params: {
  entry_id: string;
  identity_id: string;
  pipeline_run_id?: string;
  outcome: AuditOutcome;
  cost_usd?: number;
  occurred_at?: string;
  details?: Record<string, unknown>;
}): AuditEntry {
  return {
    entry_id: params.entry_id,
    identity_id: params.identity_id,
    kind: 'invocation',
    pipeline_run_id: params.pipeline_run_id,
    outcome: params.outcome,
    cost_usd: params.cost_usd,
    occurred_at: params.occurred_at ?? new Date().toISOString(),
    details: params.details ?? {},
  };
}

export function makeIncidentEntry(params: {
  entry_id: string;
  identity_id: string;
  outcome: AuditOutcome;
  occurred_at?: string;
  details: Record<string, unknown>;
}): AuditEntry {
  return {
    entry_id: params.entry_id,
    identity_id: params.identity_id,
    kind: 'incident',
    outcome: params.outcome,
    occurred_at: params.occurred_at ?? new Date().toISOString(),
    details: params.details,
  };
}

export function makeAttestationEntry(params: {
  entry_id: string;
  identity_id: string;
  attester_identity_id: string;
  occurred_at?: string;
  details?: Record<string, unknown>;
}): AuditEntry {
  return {
    entry_id: params.entry_id,
    identity_id: params.identity_id,
    kind: 'attestation',
    outcome: 'success',
    occurred_at: params.occurred_at ?? new Date().toISOString(),
    details: { attester_identity_id: params.attester_identity_id, ...(params.details ?? {}) },
  };
}
