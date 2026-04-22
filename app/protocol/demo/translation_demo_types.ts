// app/protocol/demo/translation_demo_types.ts
//
// NERIUM Protocol pillar: translation demo shared types and prebaked scenario.
// Conforms to docs/contracts/translation_demo.contract.md v0.1.0 Section 3.
//
// Triton (P3b) owns. Consumed by TranslationSplit.tsx, ClaudePanel.tsx,
// GeminiMockPanel.tsx, and by Apollo when embedding the demo.
//
// Prebaked scenario exists because Triton strategic_decision_hard_stop resolved
// to "prebaked with 'try your own' live option gated by feature flag" per
// triton.decisions.md ADR-0001. Prebaked data flows through the same
// Proteus-owned adapters as a live query would, so the serialized payloads are
// genuine adapter output, not hand-authored strings.

import type { AgentIntent } from '../schema/agent_intent';
import type {
  VendorAdapter,
  VendorId,
  VendorNativePrompt,
  VendorNativeResponse,
} from '../adapters/VendorAdapter';

export type TranslationSplitMode = 'prebaked' | 'live_query';

export interface PrebakedResponsePair {
  left: VendorNativeResponse;
  right: VendorNativeResponse;
}

export interface TranslationSplitProps {
  intent: AgentIntent;
  leftAdapter: VendorAdapter;
  rightAdapter: VendorAdapter;
  mode: TranslationSplitMode;
  prebakedResponse?: PrebakedResponsePair;
  onUserEditIntent?: (next: AgentIntent) => void;
  onEmitEvent?: (topic: TranslationDemoEventTopic, payload: Record<string, unknown>) => void;
  liveQueryEnabled?: boolean;
  className?: string;
}

export interface VendorPanelProps {
  vendor_id: VendorId;
  adapter: VendorAdapter;
  prompt: VendorNativePrompt;
  response?: VendorNativeResponse;
  isMock: boolean;
}

export interface IntentEditorProps {
  intent: AgentIntent;
  onChange: (next: AgentIntent) => void;
  readonly?: boolean;
}

export type TranslationDemoEventTopic =
  | 'protocol.demo.rendered'
  | 'protocol.demo.intent_edited'
  | 'protocol.demo.live_query_executed';

// Honest-claim annotation text per translation_demo.contract.md Section 7
// and vendor_adapter_ui.contract.md cross-surface consistency rule.
export const HONEST_CLAIM_ANNOTATION =
  'demo execution Anthropic only, multi-vendor unlock post-hackathon';

export const MOCK_MARKER_TAG = 'proteus_gemini_mock_v0';

// Vendor display labels surfaced in panel headers. `openai_generic` and
// `llama_generic` reserved for post-hackathon adapters per protocol_adapter
// contract Section 11; not rendered in the hackathon demo.
export const VENDOR_DISPLAY_LABEL: Record<VendorId, string> = {
  anthropic: 'Claude (Anthropic Messages API)',
  gemini: 'Gemini (Google Generative Language API)',
  higgsfield: 'Higgsfield (video, post-hackathon)',
  openai_generic: 'OpenAI Generic',
  llama_generic: 'Llama Generic',
};

// Scenario narrative printed above the intent editor in prebaked mode so the
// demo viewer sees the business framing before seeing serialized payloads.
export interface PrebakedScenarioMeta {
  title: string;
  summary: string;
  voice_sample: string;
}

export const PREBAKED_SCENARIO_META: PrebakedScenarioMeta = {
  title: 'Lumio asks a study coach to summarize chapter one',
  summary:
    'User sends Claude a bilingual study request with a book cover image, a system persona wrapped in XML tags, an ephemeral cache marker, and a search_library tool. The same AgentIntent translates into Gemini native format with fidelity notes where Claude-only features are dropped.',
  voice_sample:
    'Rangkum bab pertama buku ini untuk saya dalam 3 poin. Fokus ke insight inti, bukan ringkasan plot.',
};

// Deterministic prebaked AgentIntent. Flows through AnthropicAdapter and
// GeminiAdapterMock at render time so panels show genuine serialized output.
export const PREBAKED_INTENT: AgentIntent = {
  intent_id: 'intent_demo_lumio_001',
  created_at: '2026-04-22T12:00:00.000Z',
  originator_identity_id: 'nerium:agent:lumio_reading_coach',
  messages: [
    {
      role: 'system',
      text:
        'You are Lumio, a bilingual reading coach. Answer in the user locale. Cite page numbers when referencing book content. Stay concise.',
      xml_tag_preference: 'persona',
      cache_marker: true,
    },
    {
      role: 'user',
      text:
        'Rangkum bab pertama buku ini untuk saya dalam 3 poin. Fokus ke insight inti, bukan ringkasan plot.',
      multimodal_parts: [
        {
          kind: 'image',
          reference:
            'https://nerium.example/demo/book_cover_thinking_fast_and_slow.jpg',
        },
      ],
    },
  ],
  tools: [
    {
      name: 'search_library',
      description:
        'Search the user personal library for a title, author, or ISBN. Returns a chapter manifest with page ranges.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'title, author, or ISBN' },
          limit: { type: 'integer', minimum: 1, maximum: 10, default: 3 },
        },
        required: ['query'],
      },
    },
  ],
  tool_choice: 'auto',
  generation_params: {
    temperature: 0.2,
    max_output_tokens: 640,
    top_p: 0.9,
  },
  vendor_preferences: {
    preferred_vendor_id: 'anthropic',
    require_feature: ['prompt_caching'],
  },
  locale: 'id-ID',
  metadata: {
    demo_scenario: 'lumio_chapter_summary',
    session_id: 'demo_sid_001',
  },
};

// Prebaked Claude response body, valid Anthropic Messages API shape with a
// text+tool_use content pair. Parsed by AnthropicAdapter.parseResponse at
// render time so the panel renders the genuine extracted_text and tool_use
// list rather than a hand-written label.
export const PREBAKED_CLAUDE_RAW_RESPONSE = JSON.stringify({
  id: 'msg_01A1B2C3D4E5F6',
  type: 'message',
  role: 'assistant',
  model: 'claude-opus-4-7',
  content: [
    {
      type: 'text',
      text:
        'Baik, sebelum merangkum saya verifikasi edisi bukunya lebih dulu lewat pustaka Anda.',
    },
    {
      type: 'tool_use',
      id: 'toolu_01X2Y3Z4A5B6',
      name: 'search_library',
      input: {
        query: 'Thinking Fast and Slow Daniel Kahneman',
        limit: 1,
      },
    },
  ],
  stop_reason: 'tool_use',
  stop_sequence: null,
  usage: {
    input_tokens: 412,
    output_tokens: 86,
    cache_creation_input_tokens: 128,
    cache_read_input_tokens: 0,
  },
});

// Prebaked Gemini mock response body. Matches the envelope produced by
// GeminiAdapterMock.produceMockResponseFor so the mock marker and honest
// claim string are structurally identical to what a live mock emits.
export const PREBAKED_GEMINI_MOCK_RAW_RESPONSE = JSON.stringify({
  candidates: [
    {
      content: {
        role: 'model',
        parts: [
          {
            text:
              '[Gemini mock response, no real API call] Saya akan cari edisi buku tersebut lewat pustaka Anda dulu.',
          },
          {
            function_call: {
              name: 'search_library',
              args: {
                query: 'Thinking Fast and Slow Daniel Kahneman',
                limit: 1,
              },
            },
          },
        ],
      },
      finish_reason: 'TOOL_USE',
      index: 0,
      safety_ratings: [],
    },
  ],
  usage_metadata: {
    prompt_token_count: 389,
    candidates_token_count: 73,
    total_token_count: 462,
  },
  _mock_marker: MOCK_MARKER_TAG,
  _honest_claim: 'mock, no real Gemini API call in hackathon scope',
});

// Panel capability chip descriptor. The panel header surfaces one chip per
// supported feature so the viewer sees at a glance which vendor supports
// XML tagging, caching, tool use, multimodal, and streaming.
export interface CapabilityChip {
  key: string;
  label: string;
  supported: boolean;
}

export interface FidelityNoteRender {
  text: string;
  severity: 'info' | 'warning';
}

export function classifyFidelityNote(note: string): FidelityNoteRender {
  const lower = note.toLowerCase();
  if (lower.includes('dropped') || lower.includes('downgraded')) {
    return { text: note, severity: 'warning' };
  }
  return { text: note, severity: 'info' };
}
