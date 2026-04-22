// Abstract VendorAdapter contract.
// Contract: docs/contracts/protocol_adapter.contract.md v0.1.0
// Owner: Proteus. Consumers: Triton (translation demo), Morpheus (vendor adapter UI),
// Athena (BuilderSpecialistExecutor non-Anthropic lane, post-hackathon).

import type { AgentIntent } from '../schema/agent_intent';

export type VendorId =
  | 'anthropic'
  | 'gemini'
  | 'higgsfield'
  | 'openai_generic'
  | 'llama_generic';

export interface VendorCapabilityProfile {
  vendor_id: VendorId;
  supports_xml_tagging: boolean;
  supports_system_prompt: boolean;
  supports_prompt_caching: boolean;
  supports_tool_use: boolean;
  supports_multimodal_input: boolean;
  supports_streaming: boolean;
  max_context_window_tokens: number;
  native_format_name: string;
}

export interface VendorNativePrompt {
  vendor_id: VendorId;
  format_name: string;
  serialized: string;
  fidelity_notes: string[];
}

export interface VendorToolUseCall {
  name: string;
  input: Record<string, unknown>;
}

export interface VendorNativeResponse {
  vendor_id: VendorId;
  raw: string;
  extracted_text: string;
  tool_use_calls?: VendorToolUseCall[];
}

export class ContextOverflowError extends Error {
  readonly vendor_id: VendorId;
  readonly estimated_tokens: number;
  readonly max_context_window_tokens: number;
  constructor(vendor_id: VendorId, estimated_tokens: number, max_context_window_tokens: number) {
    super(
      `ContextOverflowError vendor=${vendor_id} estimated=${estimated_tokens} max=${max_context_window_tokens}`,
    );
    this.name = 'ContextOverflowError';
    this.vendor_id = vendor_id;
    this.estimated_tokens = estimated_tokens;
    this.max_context_window_tokens = max_context_window_tokens;
  }
}

export abstract class VendorAdapter {
  abstract readonly profile: VendorCapabilityProfile;

  abstract serializeIntent(intent: AgentIntent): VendorNativePrompt;

  abstract parseResponse(raw: string): VendorNativeResponse;

  // Mock adapters return true; honest-claim filter per NarasiGhaisan Section 16.
  // UI surfaces this to attach a "demo execution Anthropic only" badge.
  abstract isMock(): boolean;

  // Rough token estimate used by serializers to pre-check overflow before emitting
  // a vendor-native payload that a downstream API would reject. Heuristic: ~4 chars
  // per token; concrete adapters may override with a vendor-specific tokenizer.
  protected estimateTokens(serialized: string): number {
    return Math.ceil(serialized.length / 4);
  }

  protected assertWithinWindow(serialized: string): void {
    const estimated = this.estimateTokens(serialized);
    if (estimated > this.profile.max_context_window_tokens) {
      throw new ContextOverflowError(
        this.profile.vendor_id,
        estimated,
        this.profile.max_context_window_tokens,
      );
    }
  }
}

export interface VendorAdapterRegistry {
  get(vendor_id: VendorId): VendorAdapter | undefined;
  list(): VendorAdapter[];
}

export function makeRegistry(adapters: VendorAdapter[]): VendorAdapterRegistry {
  const byId = new Map<VendorId, VendorAdapter>();
  for (const a of adapters) byId.set(a.profile.vendor_id, a);
  return {
    get: (id) => byId.get(id),
    list: () => Array.from(byId.values()),
  };
}
