// Gemini mock adapter.
// Contract: docs/contracts/protocol_adapter.contract.md v0.1.0
//
// HONEST-CLAIM ANNOTATION (NarasiGhaisan Section 16):
// This module is a MOCK. It produces Gemini-native-LOOKING serialized output
// for demo purposes only. It does NOT call the Google Generative Language API.
// No real Gemini inference is executed during the hackathon. Downstream UI MUST
// surface `isMock() === true` as a "demo execution Anthropic only, multi-vendor
// unlock post-hackathon" badge when this adapter renders.

import type { AgentIntent, MessageContent, ToolDefinition } from '../schema/agent_intent';
import {
  VendorAdapter,
  VendorCapabilityProfile,
  VendorNativePrompt,
  VendorNativeResponse,
} from './VendorAdapter';

type GeminiRole = 'user' | 'model' | 'function';

interface GeminiPart {
  text?: string;
  inline_data?: { mime_type: string; data: string };
  file_data?: { mime_type: string; file_uri: string };
  function_call?: { name: string; args: Record<string, unknown> };
  function_response?: { name: string; response: Record<string, unknown> };
}

interface GeminiContent {
  role: GeminiRole;
  parts: GeminiPart[];
}

interface GeminiGenerationConfig {
  temperature?: number;
  max_output_tokens?: number;
  top_p?: number;
  stop_sequences?: string[];
  response_mime_type?: string;
  response_schema?: Record<string, unknown>;
}

interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

interface GeminiRequestBody {
  system_instruction?: { parts: Array<{ text: string }> };
  contents: GeminiContent[];
  generation_config?: GeminiGenerationConfig;
  tools?: Array<{ function_declarations: GeminiFunctionDeclaration[] }>;
  tool_config?: { function_calling_config: { mode: 'AUTO' | 'NONE' | 'ANY'; allowed_function_names?: string[] } };
  _mock_marker: 'proteus_gemini_mock_v0';
  _honest_claim: 'mock, no real Gemini API call in hackathon scope';
}

const GEMINI_PROFILE: VendorCapabilityProfile = {
  vendor_id: 'gemini',
  supports_xml_tagging: false,
  supports_system_prompt: true,
  supports_prompt_caching: false,
  supports_tool_use: true,
  supports_multimodal_input: true,
  supports_streaming: true,
  max_context_window_tokens: 1_000_000,
  native_format_name: 'gemini_generativelanguage_v1beta',
};

export class GeminiAdapterMock extends VendorAdapter {
  readonly profile: VendorCapabilityProfile = GEMINI_PROFILE;

  isMock(): boolean {
    return true;
  }

  serializeIntent(intent: AgentIntent): VendorNativePrompt {
    const fidelity_notes: string[] = [
      'mock adapter, no real Gemini API call in hackathon scope',
    ];

    const body: GeminiRequestBody = {
      contents: [],
      _mock_marker: 'proteus_gemini_mock_v0',
      _honest_claim: 'mock, no real Gemini API call in hackathon scope',
    };

    const systemTexts: string[] = [];
    const nonSystem: MessageContent[] = [];
    for (const m of intent.messages) {
      if (m.role === 'system') {
        if (m.text) systemTexts.push(m.text);
        if (m.xml_tag_preference) {
          fidelity_notes.push(
            `xml_tag_preference=${m.xml_tag_preference} dropped (Gemini does not surface XML tagging natively)`,
          );
        }
        if (m.cache_marker) {
          fidelity_notes.push('cache_marker dropped (Gemini prompt caching not supported in mock)');
        }
        if (m.multimodal_parts && m.multimodal_parts.length > 0) {
          fidelity_notes.push(
            'multimodal_parts on system message dropped (Gemini system_instruction is text only)',
          );
        }
      } else {
        nonSystem.push(m);
      }
    }
    if (systemTexts.length > 0) {
      body.system_instruction = { parts: [{ text: systemTexts.join('\n\n') }] };
    }

    body.contents = mergeRunsForGemini(nonSystem, fidelity_notes);

    if (intent.tools && intent.tools.length > 0) {
      body.tools = [{ function_declarations: intent.tools.map(toGeminiFunction) }];
    }

    if (intent.tool_choice) {
      if (intent.tool_choice === 'auto') {
        body.tool_config = { function_calling_config: { mode: 'AUTO' } };
      } else if (intent.tool_choice === 'none') {
        body.tool_config = { function_calling_config: { mode: 'NONE' } };
      } else {
        body.tool_config = {
          function_calling_config: { mode: 'ANY', allowed_function_names: [intent.tool_choice.name] },
        };
      }
    }

    if (intent.generation_params) {
      const g = intent.generation_params;
      body.generation_config = {
        ...(g.temperature !== undefined ? { temperature: g.temperature } : {}),
        ...(g.max_output_tokens !== undefined ? { max_output_tokens: g.max_output_tokens } : {}),
        ...(g.top_p !== undefined ? { top_p: g.top_p } : {}),
        ...(g.stop_sequences !== undefined ? { stop_sequences: g.stop_sequences } : {}),
      };
    }

    if (intent.response_format) {
      body.generation_config = body.generation_config ?? {};
      if (intent.response_format.kind === 'json_object' || intent.response_format.kind === 'json_schema') {
        body.generation_config.response_mime_type = 'application/json';
        if (intent.response_format.kind === 'json_schema' && intent.response_format.schema) {
          body.generation_config.response_schema = intent.response_format.schema;
        }
      } else if (intent.response_format.kind === 'xml') {
        fidelity_notes.push('response_format=xml not natively supported by Gemini, downgraded to text');
      }
    }

    const serialized = JSON.stringify(body);
    this.assertWithinWindow(serialized);
    return {
      vendor_id: 'gemini',
      format_name: this.profile.native_format_name,
      serialized,
      fidelity_notes,
    };
  }

  parseResponse(raw: string): VendorNativeResponse {
    try {
      const parsed = JSON.parse(raw) as {
        candidates?: Array<{
          content?: { parts?: GeminiPart[] };
        }>;
      };
      let extracted_text = '';
      const tool_use_calls: Array<{ name: string; input: Record<string, unknown> }> = [];
      for (const cand of parsed.candidates ?? []) {
        for (const part of cand.content?.parts ?? []) {
          if (part.text) extracted_text += part.text;
          if (part.function_call) {
            tool_use_calls.push({ name: part.function_call.name, input: part.function_call.args ?? {} });
          }
        }
      }
      return {
        vendor_id: 'gemini',
        raw,
        extracted_text,
        tool_use_calls: tool_use_calls.length > 0 ? tool_use_calls : undefined,
      };
    } catch {
      return { vendor_id: 'gemini', raw, extracted_text: '' };
    }
  }

  // Demo helper (NOT part of the VendorAdapter contract). Returns a plausible
  // Gemini-native response body for the translation demo. Clearly labeled mock.
  produceMockResponseFor(intent: AgentIntent): string {
    const lastUser = [...intent.messages].reverse().find((m) => m.role === 'user');
    const seed = lastUser?.text?.slice(0, 120) ?? 'mock prompt';
    const body = {
      candidates: [
        {
          content: {
            role: 'model',
            parts: [
              {
                text: `[Gemini mock response, no real API call] Received intent targeting vendor=gemini. Context echo: ${seed}`,
              },
            ],
          },
          finish_reason: 'STOP',
          index: 0,
        },
      ],
      usage_metadata: { prompt_token_count: 0, candidates_token_count: 0, total_token_count: 0 },
      _mock_marker: 'proteus_gemini_mock_v0',
      _honest_claim: 'mock, no real Gemini API call in hackathon scope',
    };
    return JSON.stringify(body);
  }
}

function toGeminiFunction(t: ToolDefinition): GeminiFunctionDeclaration {
  return { name: t.name, description: t.description, parameters: t.parameters };
}

function multimodalPart(
  kind: string,
  reference: string,
  fidelity_notes: string[],
): GeminiPart | null {
  if (kind !== 'image' && kind !== 'pdf' && kind !== 'audio' && kind !== 'video') return null;
  const mime = kindToMime(kind);
  if (!/^https?:/i.test(reference)) {
    fidelity_notes.push(
      `multimodal reference ${reference} is not an http(s) URL; mock emits file_data with file_uri unchanged (real Gemini would require prior Files API upload)`,
    );
  }
  return { file_data: { mime_type: mime, file_uri: reference } };
}

function kindToMime(kind: string): string {
  switch (kind) {
    case 'image':
      return 'image/png';
    case 'pdf':
      return 'application/pdf';
    case 'audio':
      return 'audio/mpeg';
    case 'video':
      return 'video/mp4';
    default:
      return 'application/octet-stream';
  }
}

function mergeRunsForGemini(messages: MessageContent[], fidelity_notes: string[]): GeminiContent[] {
  const out: GeminiContent[] = [];
  for (const m of messages) {
    let role: GeminiRole;
    if (m.role === 'assistant') role = 'model';
    else if (m.role === 'tool_result') role = 'function';
    else role = 'user';

    const parts: GeminiPart[] = [];
    if (m.role === 'tool_result') {
      const payload = safeParseJson(m.tool_result_payload);
      parts.push({
        function_response: {
          name: m.tool_call_id ?? 'unknown_tool',
          response: payload ?? { raw: m.tool_result_payload ?? '' },
        },
      });
    } else if (typeof m.text === 'string' && m.text.length > 0) {
      parts.push({ text: m.text });
      if (m.xml_tag_preference) {
        fidelity_notes.push(
          `xml_tag_preference=${m.xml_tag_preference} dropped on Gemini (no native XML tag semantics)`,
        );
      }
      if (m.cache_marker) {
        fidelity_notes.push('cache_marker dropped (Gemini prompt caching not supported in mock)');
      }
    }

    if (m.multimodal_parts) {
      for (const p of m.multimodal_parts) {
        const part = multimodalPart(p.kind, p.reference, fidelity_notes);
        if (part) parts.push(part);
        else fidelity_notes.push(`multimodal kind ${p.kind} not mapped for Gemini, dropped`);
      }
    }

    if (parts.length === 0) {
      fidelity_notes.push(`message with role=${m.role} produced no content, skipped`);
      continue;
    }

    const prev = out[out.length - 1];
    if (prev && prev.role === role) {
      prev.parts.push(...parts);
    } else {
      out.push({ role, parts });
    }
  }
  return out;
}

function safeParseJson(s: string | undefined): Record<string, unknown> | null {
  if (!s) return null;
  try {
    const v = JSON.parse(s);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export const geminiAdapterMock = new GeminiAdapterMock();
