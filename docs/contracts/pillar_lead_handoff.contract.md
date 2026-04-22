# Pillar Lead Handoff

**Contract Version:** 0.1.0
**Owner Agent(s):** Apollo (caller side, dispatches to Leads)
**Consumer Agent(s):** Athena (Builder Lead callee), Demeter (Marketplace Lead callee), Tyche (Banking Lead callee), Hecate (Registry Lead callee), Proteus (Protocol Lead callee)
**Stability:** draft
**Last Updated:** 2026-04-22 (Day 1, post-kickoff)

## 1. Purpose

Defines the uniform dispatch protocol Apollo uses to hand off a user sub-intent to the appropriate pillar Lead, so each Lead receives a predictable envelope and Apollo can aggregate Lead responses into a coherent cross-pillar orchestration.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor, especially Section 15 trust and delegation)
- `CLAUDE.md` (root)
- `docs/contracts/advisor_interaction.contract.md` (upstream: Advisor-level schemas that this handoff descends from)
- `docs/contracts/event_bus.contract.md` (events emitted during handoff)

## 3. Schema Definition

```typescript
// app/shared/orchestration/pillar_handoff.ts

export type PillarId = 'builder' | 'marketplace' | 'banking' | 'registry' | 'protocol';

export interface PillarHandoffRequest {
  request_id: string;
  pipeline_run_id: string;
  pillar: PillarId;
  user_intent_summary: string;      // natural language, max 500 chars, Apollo-authored
  structured_params: Record<string, unknown>;  // pillar-specific, validated by Lead
  upstream_context: {
    prior_lead_outputs: Array<{ pillar: PillarId; summary: string; artifact_paths: string[] }>;
    active_model_strategy: 'opus_all' | 'collaborative' | 'multi_vendor' | 'auto';
    active_world_aesthetic: 'medieval_desert' | 'cyberpunk_shanghai' | 'steampunk_victorian';
  };
}

export interface PillarHandoffResponse {
  request_id: string;
  pillar: PillarId;
  status: 'accepted' | 'rejected' | 'deferred';
  summary: string;                  // natural language, max 500 chars
  artifact_paths: string[];
  delegated_to_specialists: string[];  // specialist_ids spawned by the Lead
  rejection_reason?: string;        // populated when status = 'rejected'
  defer_until_event?: string;       // event topic to await before retrying
}
```

## 4. Interface / API Contract

```typescript
export interface PillarLead {
  readonly pillar: PillarId;
  handle(request: PillarHandoffRequest): Promise<PillarHandoffResponse>;
  capabilities(): { advertised_params: string[]; max_concurrent_requests: number };
}
```

- Apollo dispatches via `lead.handle(request)` where `lead` is resolved from a `PillarLeadRegistry` keyed by `PillarId`.
- Each Lead's `capabilities()` is surfaced in the Advisor UI so users see which pillar handles which sub-intent.
- Handoff is non-blocking from the user's perspective: Apollo may fan out to multiple Leads in parallel and aggregate responses.

## 5. Event Signatures

- `pipeline.handoff` (via event bus) emitted by Apollo before calling `lead.handle`.
- `pipeline.step.completed` emitted by the Lead after its handler returns.
- If rejected, Apollo additionally emits a `pipeline.handoff` reversal event with `status: 'rejected'` in payload extension.

## 6. File Path Convention

- Types: `app/shared/orchestration/pillar_handoff.ts`
- Registry: `app/shared/orchestration/PillarLeadRegistry.ts`
- Per-pillar Lead output specs: `app/{pillar}/leads/{greek_name}.output.md`
- Per-pillar Lead implementations: `app/{pillar}/leads/{greek_name}.ts`

## 7. Naming Convention

- Pillar enum values: lowercase singular (`builder`, not `Builder` or `builders`).
- Lead file basenames: lowercase Greek name (`athena`, `demeter`, `tyche`, `hecate`, `proteus`).
- Request/response field names: `snake_case`.
- `PascalCase` for TypeScript interfaces.

## 8. Error Handling

- Invalid `structured_params`: Lead returns `status: 'rejected'` with `rejection_reason: 'invalid_params: <field>'`.
- Lead overwhelmed (beyond `max_concurrent_requests`): returns `status: 'deferred'` with `defer_until_event: 'pipeline.step.completed'` for the next completion.
- Lead internal error: returns `status: 'rejected'` with `rejection_reason: 'internal_error'`. Apollo does not retry automatically; surfaces to user via Erato.
- Apollo-side timeout: if no response in 60s, Apollo marks request failed and emits user-visible warning through Erato.

## 9. Testing Surface

- Round trip per pillar: build a minimal valid `PillarHandoffRequest`, call each Lead's `handle`, assert returned `PillarHandoffResponse` conforms to schema and `status: 'accepted'`.
- Invalid params: send request with malformed `structured_params`, assert `status: 'rejected'` with expected reason prefix.
- Concurrency: fire 2x `max_concurrent_requests` in rapid sequence, assert excess returns `deferred`.
- Registry lookup: register all 5 Leads, assert `registry.get('banking')` returns the Tyche instance.

## 10. Open Questions

- None at contract draft. Lead implementations will expand their pillar-specific `structured_params` schemas in their respective Lead output specs.

## 11. Post-Hackathon Refactor Notes

- Replace in-process Lead calls with HTTP or message-queue-based dispatch when pillars split into separate services.
- Add authentication/authorization layer: each Lead verifies the caller is Apollo (or an approved upstream orchestrator) via signed request context.
- Introduce result streaming for long-running Leads (current interface assumes Promise returns single response; streaming responses need `AsyncIterable<PillarHandoffResponse>` variant).
- Formalize pillar capability schema with versioning so Leads can advertise feature flags and Apollo can degrade gracefully when encountering older Lead versions.
