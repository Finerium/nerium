# Agent Intent

**Contract Version:** 0.1.0
**Owner Agent(s):** Proteus (canonical IR schema definer)
**Consumer Agent(s):** Triton (renders translation demo from IR), Morpheus (displays IR in vendor adapter UI), all `VendorAdapter` implementations (serialize IR)
**Stability:** draft
**Last Updated:** 2026-04-22 (Day 1, post-kickoff)

## 1. Purpose

Defines the vendor-neutral intermediate representation (IR) of an agent prompt, preserving both the universal semantic payload (system, user, tools, context) and per-vendor nuance hints (cache markers, XML tag preferences, temperature, response_format) so adapters can faithfully translate without destroying vendor-specific capability signals.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor, Section 3 model flexibility)
- `CLAUDE.md` (root)
- `docs/contracts/protocol_adapter.contract.md` (serializer interface consuming this IR)

## 3. Schema Definition

```typescript
// app/protocol/schema/agent_intent.ts

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool_result';

export interface MessageContent {
  role: MessageRole;
  text?: string;
  tool_call_id?: string;             // references a prior tool_use
  tool_result_payload?: string;      // JSON serialized
  cache_marker?: boolean;            // indicates this content should be cached if vendor supports
  xml_tag_preference?: string;       // optional Claude-style XML wrapping hint
  multimodal_parts?: Array<{
    kind: 'image' | 'pdf' | 'audio' | 'video';
    reference: string;               // URI or local path
  }>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export interface ResponseFormat {
  kind: 'text' | 'json_object' | 'json_schema' | 'xml';
  schema?: Record<string, unknown>;
}

export interface AgentIntent {
  intent_id: string;                 // uuid v4
  created_at: string;
  originator_identity_id?: string;   // Registry identity pointer
  messages: MessageContent[];
  tools?: ToolDefinition[];
  tool_choice?: 'auto' | 'none' | { name: string };
  response_format?: ResponseFormat;
  generation_params?: {
    temperature?: number;
    max_output_tokens?: number;
    top_p?: number;
    stop_sequences?: string[];
  };
  vendor_preferences?: {
    preferred_vendor_id?: string;
    avoid_vendor_ids?: string[];
    require_feature?: string[];       // e.g., ['prompt_caching', 'tool_use']
  };
  locale?: 'en-US' | 'id-ID';        // binding to AdvisorSession.locale if applicable
  metadata?: Record<string, string>;
}
```

## 4. Interface / API Contract

```typescript
export interface AgentIntentValidator {
  validate(intent: AgentIntent): { valid: boolean; errors: string[] };
  hash(intent: AgentIntent): string;  // sha256 of canonicalized JSON for audit
  canonicalize(intent: AgentIntent): string;  // deterministic JSON ordering
}
```

- Canonicalization sorts object keys alphabetically and normalizes whitespace so identical intents produce identical hashes.
- Validator checks `messages` non-empty, role sequence sane (system first if present, user/assistant alternating reasonable), tool references valid, and response_format schema well-formed.

## 5. Event Signatures

- `protocol.intent.created` payload: `{ intent_id, originator_identity_id }`
- `protocol.intent.validated` payload: `{ intent_id, valid: boolean, error_count: number }`

## 6. File Path Convention

- Schema: `app/protocol/schema/agent_intent.ts`
- Validator: `app/protocol/schema/validator.ts`
- Canonicalizer: `app/protocol/schema/canonicalize.ts`

## 7. Naming Convention

- Field names: `snake_case`.
- Role values: lowercase single word or `snake_case` compound.
- Kind enums: lowercase `snake_case` string literals.
- Tool parameter schemas follow JSON Schema Draft 2020-12 conventions.

## 8. Error Handling

- Empty `messages` array: validator returns `valid: false`.
- Tool call referencing a nonexistent `name`: validator surfaces error.
- Multimodal part referenced without URI: validator surfaces error.
- Unknown locale: validator surfaces warning (not fatal) since adapters may gracefully ignore.
- Hash called on structurally invalid intent: still returns deterministic hash (based on current content) for audit; document that audits are meaningful only for valid intents.

## 9. Testing Surface

- Validation pass: build minimal valid intent with one system+user message, assert `valid: true`.
- Validation fail: intent with empty messages, assert `valid: false` and at least one error.
- Hash stability: same intent, two different field orderings, assert canonicalize produces identical strings and hashes.
- Tool use: add a tool_use message with a tool_result reply, validator passes.
- Multimodal: include an image part with valid reference, validator passes.

## 10. Open Questions

- None at contract draft. The `locale` field is present to bind currency/language concerns downstream; broader locale support is post-hackathon.

## 11. Post-Hackathon Refactor Notes

- Add schema versioning (`schema_version: 1`) so IR evolution supports staged migration.
- Extend multimodal kinds (structured data tables, maps) as vendors gain support.
- Add explicit prompt-caching hint granularity (per-block TTL hints) when more vendors adopt caching.
- Support conversation branching IR so IR can represent tree-of-thought style explorations without flattening.
- Formalize vendor-extension escape hatch (`vendor_extensions: Record<string, unknown>`) with strict discouragement so generic consumers ignore them.
