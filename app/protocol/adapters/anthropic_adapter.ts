// Anthropic (Claude) real adapter.
// Contract: docs/contracts/protocol_adapter.contract.md v0.1.0
// Preserves Claude Messages API semantics: system-prompt separation, XML wrapping
// hints, tool_use blocks, cache_control markers (ephemeral), multimodal image parts.
// Reference: Anthropic Messages API public docs (system field, messages array,
// content blocks type=text|tool_use|tool_result|image, cache_control ephemeral).

import type {
  AgentIntent,
  MessageContent,
  MultimodalPart,
  ToolDefinition,
} from '../schema/agent_intent';
import {
  ContextOverflowError,
  VendorAdapter,
  VendorCapabilityProfile,
  VendorNativePrompt,
  VendorNativeResponse,
  VendorToolUseCall,
} from './VendorAdapter';

type AnthropicImageSource =
  | { type: 'url'; url: string }
  | { type: 'base64'; media_type: string; data: string }
  | { type: 'file'; file_id: string };

type AnthropicContentBlock =
  | { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }
  | { type: 'image'; source: AnthropicImageSource }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: AnthropicContentBlock[];
}

interface AnthropicSystemBlock {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
}

interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

interface AnthropicRequestBody {
  model?: string;
  system?: string | AnthropicSystemBlock[];
  messages: AnthropicMessage[];
  tools?: AnthropicTool[];
  tool_choice?: { type: 'auto' | 'none' | 'tool'; name?: string };
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stop_sequences?: string[];
  metadata?: Record<string, string>;
}

const ANTHROPIC_PROFILE: VendorCapabilityProfile = {
  vendor_id: 'anthropic',
  supports_xml_tagging: true,
  supports_system_prompt: true,
  supports_prompt_caching: true,
  supports_tool_use: true,
  supports_multimodal_input: true,
  supports_streaming: true,
  max_context_window_tokens: 200_000,
  native_format_name: 'anthropic_messages_v1',
};

export class AnthropicAdapter extends VendorAdapter {
  readonly profile: VendorCapabilityProfile = ANTHROPIC_PROFILE;

  isMock(): boolean {
    return false;
  }

  serializeIntent(intent: AgentIntent): VendorNativePrompt {
    const fidelity_notes: string[] = [];
    const body: AnthropicRequestBody = { messages: [] };

    const systemBlocks: AnthropicSystemBlock[] = [];
    const nonSystem: MessageContent[] = [];
    for (const m of intent.messages) {
      if (m.role === 'system') {
        if (m.multimodal_parts && m.multimodal_parts.length > 0) {
          fidelity_notes.push(
            'multimodal_parts on system message dropped (Anthropic system field is text only)',
          );
        }
        if (!m.text) {
          fidelity_notes.push('system message without text skipped');
          continue;
        }
        const block: AnthropicSystemBlock = { type: 'text', text: wrapXml(m) };
        if (m.cache_marker) block.cache_control = { type: 'ephemeral' };
        systemBlocks.push(block);
      } else {
        nonSystem.push(m);
      }
    }
    if (systemBlocks.length === 1 && !systemBlocks[0].cache_control) {
      body.system = systemBlocks[0].text;
    } else if (systemBlocks.length > 0) {
      body.system = systemBlocks;
    }

    body.messages = mergeRunsForAnthropic(nonSystem, fidelity_notes);

    if (intent.tools && intent.tools.length > 0) {
      body.tools = intent.tools.map(toAnthropicTool);
    }

    if (intent.tool_choice) {
      if (intent.tool_choice === 'auto') body.tool_choice = { type: 'auto' };
      else if (intent.tool_choice === 'none') body.tool_choice = { type: 'none' };
      else body.tool_choice = { type: 'tool', name: intent.tool_choice.name };
    }

    if (intent.generation_params) {
      const g = intent.generation_params;
      if (g.temperature !== undefined) body.temperature = g.temperature;
      if (g.max_output_tokens !== undefined) body.max_tokens = g.max_output_tokens;
      if (g.top_p !== undefined) body.top_p = g.top_p;
      if (g.stop_sequences !== undefined) body.stop_sequences = g.stop_sequences;
    }

    if (intent.response_format) {
      // Anthropic Messages API does not take a response_format field; json/xml
      // shape is coerced via system instruction. Record the fidelity note rather
      // than silently dropping the signal.
      if (intent.response_format.kind === 'json_object' || intent.response_format.kind === 'json_schema') {
        fidelity_notes.push(
          'response_format mapped to system instruction (Anthropic Messages API has no native response_format field)',
        );
      } else if (intent.response_format.kind === 'xml') {
        fidelity_notes.push(
          'response_format=xml requires per-message xml_tag_preference or system instruction, not a top-level API field on Anthropic',
        );
      }
    }

    if (intent.metadata) body.metadata = { ...intent.metadata };

    const serialized = JSON.stringify(body);
    this.assertWithinWindow(serialized);
    return {
      vendor_id: 'anthropic',
      format_name: this.profile.native_format_name,
      serialized,
      fidelity_notes,
    };
  }

  parseResponse(raw: string): VendorNativeResponse {
    try {
      const parsed = JSON.parse(raw) as {
        content?: Array<
          | { type: 'text'; text: string }
          | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
        >;
      };
      let extracted_text = '';
      const tool_use_calls: VendorToolUseCall[] = [];
      for (const block of parsed.content ?? []) {
        if (block.type === 'text') extracted_text += block.text;
        else if (block.type === 'tool_use') {
          tool_use_calls.push({ name: block.name, input: block.input ?? {} });
        }
      }
      return {
        vendor_id: 'anthropic',
        raw,
        extracted_text,
        tool_use_calls: tool_use_calls.length > 0 ? tool_use_calls : undefined,
      };
    } catch {
      return { vendor_id: 'anthropic', raw, extracted_text: '' };
    }
  }
}

function wrapXml(m: MessageContent): string {
  const text = m.text ?? '';
  if (!m.xml_tag_preference) return text;
  const tag = sanitizeTag(m.xml_tag_preference);
  return `<${tag}>\n${text}\n</${tag}>`;
}

function sanitizeTag(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_');
  return cleaned.length > 0 ? cleaned : 'context';
}

function toAnthropicTool(t: ToolDefinition): AnthropicTool {
  return {
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  };
}

function multimodalToBlock(
  p: MultimodalPart,
  fidelity_notes: string[],
): AnthropicContentBlock | null {
  if (p.kind !== 'image') {
    fidelity_notes.push(`multimodal kind ${p.kind} not supported by Anthropic adapter, dropped`);
    return null;
  }
  const ref = p.reference;
  if (/^https?:/i.test(ref)) {
    return { type: 'image', source: { type: 'url', url: ref } };
  }
  if (/^file_[A-Za-z0-9_-]+$/.test(ref)) {
    return { type: 'image', source: { type: 'file', file_id: ref } };
  }
  fidelity_notes.push(
    `multimodal image reference ${ref} is not an http(s) URL or Files API id, dropped (base64 encoding required upstream)`,
  );
  return null;
}

function mergeRunsForAnthropic(
  messages: MessageContent[],
  fidelity_notes: string[],
): AnthropicMessage[] {
  const out: AnthropicMessage[] = [];
  for (const m of messages) {
    const role: 'user' | 'assistant' = m.role === 'assistant' ? 'assistant' : 'user';
    const blocks: AnthropicContentBlock[] = [];

    if (m.role === 'tool_result') {
      if (!m.tool_call_id) {
        fidelity_notes.push('tool_result without tool_call_id dropped');
        continue;
      }
      blocks.push({
        type: 'tool_result',
        tool_use_id: m.tool_call_id,
        content: m.tool_result_payload ?? '',
      });
    } else if (typeof m.text === 'string' && m.text.length > 0) {
      const textBlock: AnthropicContentBlock = { type: 'text', text: wrapXml(m) };
      if (m.cache_marker) (textBlock as { cache_control?: { type: 'ephemeral' } }).cache_control = { type: 'ephemeral' };
      blocks.push(textBlock);
    }

    if (m.multimodal_parts) {
      for (const p of m.multimodal_parts) {
        const block = multimodalToBlock(p, fidelity_notes);
        if (block) blocks.push(block);
      }
    }

    if (blocks.length === 0) {
      fidelity_notes.push(`message with role=${m.role} produced no content, skipped`);
      continue;
    }

    const prev = out[out.length - 1];
    if (prev && prev.role === role) {
      prev.content.push(...blocks);
    } else {
      out.push({ role, content: blocks });
    }
  }
  return out;
}

// Convenience: shared instance. Consumers can instantiate directly for testing.
export const anthropicAdapter = new AnthropicAdapter();

// Re-export error type for callers that want to catch overflow specifically.
export { ContextOverflowError };
