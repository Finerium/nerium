// Canonical Agent Intent IR.
// Contract: docs/contracts/agent_intent.contract.md v0.1.0
// Owner: Proteus (Protocol Lead). Consumers: all VendorAdapter impls, Triton, Morpheus.

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool_result';

export type MultimodalKind = 'image' | 'pdf' | 'audio' | 'video';

export interface MultimodalPart {
  kind: MultimodalKind;
  reference: string;
}

export interface MessageContent {
  role: MessageRole;
  text?: string;
  tool_call_id?: string;
  tool_result_payload?: string;
  cache_marker?: boolean;
  xml_tag_preference?: string;
  multimodal_parts?: MultimodalPart[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export type ToolChoice = 'auto' | 'none' | { name: string };

export type ResponseFormatKind = 'text' | 'json_object' | 'json_schema' | 'xml';

export interface ResponseFormat {
  kind: ResponseFormatKind;
  schema?: Record<string, unknown>;
}

export interface GenerationParams {
  temperature?: number;
  max_output_tokens?: number;
  top_p?: number;
  stop_sequences?: string[];
}

export interface VendorPreferences {
  preferred_vendor_id?: string;
  avoid_vendor_ids?: string[];
  require_feature?: string[];
}

export type IntentLocale = 'en-US' | 'id-ID';

export interface AgentIntent {
  intent_id: string;
  created_at: string;
  originator_identity_id?: string;
  messages: MessageContent[];
  tools?: ToolDefinition[];
  tool_choice?: ToolChoice;
  response_format?: ResponseFormat;
  generation_params?: GenerationParams;
  vendor_preferences?: VendorPreferences;
  locale?: IntentLocale;
  metadata?: Record<string, string>;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

export interface AgentIntentValidator {
  validate(intent: AgentIntent): ValidationResult;
  hash(intent: AgentIntent): string;
  canonicalize(intent: AgentIntent): string;
}

export class IntentSchemaViolation extends Error {
  readonly intent_id?: string;
  readonly violations: string[];
  constructor(message: string, violations: string[], intent_id?: string) {
    super(message);
    this.name = 'IntentSchemaViolation';
    this.violations = violations;
    this.intent_id = intent_id;
  }
}

// Deterministic canonicalization: sort keys alphabetically at every object level,
// drop undefined, normalize whitespace-insensitive strings as-is (text content is
// preserved verbatim; only key ordering and JSON whitespace are normalized).
export function canonicalize(intent: AgentIntent): string {
  return JSON.stringify(sortKeysDeep(intent));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value && typeof value === 'object') {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(src).sort()) {
      const v = src[key];
      if (v === undefined) continue;
      out[key] = sortKeysDeep(v);
    }
    return out;
  }
  return value;
}

// SHA-256 via WebCrypto when available (browser, edge, modern Node).
// Falls back to a deterministic non-crypto fingerprint in environments lacking subtle.
// Audits requiring crypto-grade collision resistance should run in a WebCrypto-capable env.
export async function hash(intent: AgentIntent): Promise<string> {
  const canonical = canonicalize(intent);
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const bytes = new TextEncoder().encode(canonical);
    const digest = await subtle.digest('SHA-256', bytes);
    return bytesToHex(new Uint8Array(digest));
  }
  return fallbackFingerprint(canonical);
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

function fallbackFingerprint(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h2 = Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  const u = (h2 >>> 0) * 0x100000000 + (h1 >>> 0);
  return `fp_${u.toString(16).padStart(16, '0')}`;
}

export function validate(intent: AgentIntent): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!intent.intent_id) errors.push('intent_id missing');
  if (!intent.created_at) errors.push('created_at missing');

  if (!Array.isArray(intent.messages) || intent.messages.length === 0) {
    errors.push('messages must be a non-empty array');
  } else {
    intent.messages.forEach((m, i) => {
      if (!m.role) errors.push(`messages[${i}].role missing`);
      const hasText = typeof m.text === 'string' && m.text.length > 0;
      const hasToolResult = typeof m.tool_result_payload === 'string';
      const hasMultimodal = Array.isArray(m.multimodal_parts) && m.multimodal_parts.length > 0;
      if (!hasText && !hasToolResult && !hasMultimodal) {
        errors.push(`messages[${i}] has no textual, tool_result, or multimodal content`);
      }
      if (hasMultimodal) {
        m.multimodal_parts!.forEach((p, j) => {
          if (!p.reference) errors.push(`messages[${i}].multimodal_parts[${j}].reference missing`);
        });
      }
      if (m.role === 'tool_result' && !m.tool_call_id) {
        errors.push(`messages[${i}] tool_result requires tool_call_id`);
      }
    });

    const systemIndices = intent.messages
      .map((m, i) => (m.role === 'system' ? i : -1))
      .filter((i) => i >= 0);
    if (systemIndices.length > 0 && systemIndices[0] !== 0) {
      warnings.push('system message should be the first message if present');
    }
    if (systemIndices.length > 1) {
      warnings.push('multiple system messages present; most adapters collapse to the first');
    }
  }

  if (intent.tools) {
    const names = new Set<string>();
    intent.tools.forEach((t, i) => {
      if (!t.name) errors.push(`tools[${i}].name missing`);
      if (names.has(t.name)) errors.push(`tools[${i}].name duplicate: ${t.name}`);
      names.add(t.name);
      if (!t.parameters || typeof t.parameters !== 'object') {
        errors.push(`tools[${i}].parameters must be a JSON Schema object`);
      }
    });

    if (intent.tool_choice && typeof intent.tool_choice === 'object' && 'name' in intent.tool_choice) {
      if (!names.has(intent.tool_choice.name)) {
        errors.push(`tool_choice.name ${intent.tool_choice.name} does not match any tools[].name`);
      }
    }

    intent.messages.forEach((m, i) => {
      if (m.tool_call_id && m.role === 'tool_result') {
        // tool_call_id references are pairwise with prior assistant tool_use blocks; deep
        // pairing validation is adapter-level. Schema validation only ensures shape.
      }
      if (m.role === 'tool_result' && m.tool_call_id) {
        const earlier = intent.messages.slice(0, i);
        const hasMatch = earlier.some((prev) => prev.role === 'assistant');
        if (!hasMatch) {
          warnings.push(`messages[${i}] tool_result appears with no prior assistant turn`);
        }
      }
    });
  }

  if (intent.response_format?.kind === 'json_schema' && !intent.response_format.schema) {
    errors.push('response_format.kind=json_schema requires schema');
  }

  if (intent.locale && intent.locale !== 'en-US' && intent.locale !== 'id-ID') {
    warnings.push(`locale ${intent.locale} unrecognized; adapters may ignore`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

export const agentIntentValidator: AgentIntentValidator = {
  validate,
  hash: (intent) => {
    // Synchronous hash surface required by the contract interface. We use the
    // fallback fingerprint here; callers needing crypto-grade SHA-256 should
    // invoke the async `hash` export directly.
    return fallbackFingerprint(canonicalize(intent));
  },
  canonicalize,
};
