//
// src/lib/builder/liveRuntime.ts
//
// Aether-Vercel T6 Phase 1.5: client-side EventSource wrapper that drives the
// real Anthropic Messages API through the stateless NERIUM backend forwarder
// at POST /v1/builder/sessions/live. The forwarder NEVER stores the user
// API key; it forwards to Anthropic with the user's key as the x-api-key
// header and proxies the SSE stream back to the browser.
//
// Hard contract
// -------------
// - Frontend hard timeout: 30 seconds via AbortController. The backend
//   timeout is 25 seconds so the frontend always observes a clean abort
//   rather than a hanging socket.
// - All errors are caught and surfaced as a typed result. Never raw
//   exception bubbles to the user.
// - On any error path (timeout, network, malformed SSE), the caller
//   falls back to the canned theatrical response.
// - The user API key is sent only in the request body, never logged on
//   the frontend, never persisted to localStorage.
//
// No em dash, no emoji.
//

export type BuilderRunStatus = 'ok' | 'timeout' | 'network_error' | 'rate_limited' | 'invalid_key';

export interface BuilderRunResult {
  status: BuilderRunStatus;
  // Concatenated streamed text from Anthropic (when status === 'ok'),
  // an empty string otherwise.
  text: string;
  // Coarse-grained vendor-side message id (when ok). Used purely for
  // display; no NERIUM persistence.
  anthropic_message_id: string | null;
  // Wallclock duration in ms.
  duration_ms: number;
}

export interface InvokeLiveBuilderInput {
  prompt: string;
  complexityTier: 'small' | 'medium' | 'large';
  userApiKey: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Drive the live Anthropic Messages forwarder. Returns a typed result
 * regardless of failure mode. Never throws to the caller.
 */
export async function invokeLiveBuilder(
  input: InvokeLiveBuilderInput,
  options?: { timeoutMs?: number; endpoint?: string },
): Promise<BuilderRunResult> {
  const start = Date.now();
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const endpoint = options?.endpoint ?? '/v1/builder/sessions/live';
  const ctrl = new AbortController();
  const timeoutHandle = setTimeout(() => ctrl.abort('timeout'), timeoutMs);

  let aggregatedText = '';
  let messageId: string | null = null;

  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      mode: 'same-origin',
      credentials: 'same-origin',
      headers: {
        'content-type': 'application/json',
        accept: 'text/event-stream',
      },
      body: JSON.stringify({
        prompt: input.prompt,
        complexity_tier: input.complexityTier,
        user_api_key: input.userApiKey,
      }),
      signal: ctrl.signal,
    });

    if (resp.status === 401 || resp.status === 403) {
      clearTimeout(timeoutHandle);
      return {
        status: 'invalid_key',
        text: '',
        anthropic_message_id: null,
        duration_ms: Date.now() - start,
      };
    }
    if (resp.status === 429) {
      clearTimeout(timeoutHandle);
      return {
        status: 'rate_limited',
        text: '',
        anthropic_message_id: null,
        duration_ms: Date.now() - start,
      };
    }
    if (!resp.ok || !resp.body) {
      clearTimeout(timeoutHandle);
      return {
        status: 'network_error',
        text: '',
        anthropic_message_id: null,
        duration_ms: Date.now() - start,
      };
    }

    // Parse SSE stream. Anthropic emits content_block_delta events with
    // `delta.type === 'text_delta'` carrying the streaming text.
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sepIdx = buffer.indexOf('\n\n');
      while (sepIdx >= 0) {
        const frame = buffer.slice(0, sepIdx);
        buffer = buffer.slice(sepIdx + 2);
        const parsed = parseSseFrame(frame);
        if (parsed) {
          if (parsed.type === 'content_block_delta' && parsed.delta_text) {
            aggregatedText += parsed.delta_text;
          } else if (parsed.type === 'message_start' && parsed.message_id) {
            messageId = parsed.message_id;
          } else if (parsed.type === 'message_stop') {
            // graceful end
          }
        }
        sepIdx = buffer.indexOf('\n\n');
      }
    }
    // Flush any trailing partial frame.
    if (buffer.trim().length > 0) {
      const parsed = parseSseFrame(buffer.trim());
      if (parsed && parsed.type === 'content_block_delta' && parsed.delta_text) {
        aggregatedText += parsed.delta_text;
      }
    }

    clearTimeout(timeoutHandle);
    return {
      status: 'ok',
      text: aggregatedText,
      anthropic_message_id: messageId,
      duration_ms: Date.now() - start,
    };
  } catch (err) {
    clearTimeout(timeoutHandle);
    const isAbort = (err as { name?: string })?.name === 'AbortError';
    return {
      status: isAbort ? 'timeout' : 'network_error',
      text: '',
      anthropic_message_id: null,
      duration_ms: Date.now() - start,
    };
  }
}

interface ParsedFrame {
  type: string;
  delta_text?: string;
  message_id?: string;
}

function parseSseFrame(frame: string): ParsedFrame | null {
  // Each frame is a sequence of `field: value` lines separated by single
  // newlines. Anthropic emits `event: <type>` + `data: <json>` pairs.
  const lines = frame.split('\n');
  let eventType = '';
  let dataLine = '';
  for (const line of lines) {
    if (line.startsWith('event:')) {
      eventType = line.slice('event:'.length).trim();
    } else if (line.startsWith('data:')) {
      dataLine += line.slice('data:'.length).trim();
    }
  }
  if (!eventType) return null;
  if (!dataLine || dataLine === '[DONE]') {
    return { type: eventType };
  }
  try {
    const obj = JSON.parse(dataLine) as Record<string, unknown>;
    const out: ParsedFrame = { type: eventType };
    // content_block_delta: `delta.text` carries streaming text fragment.
    if (eventType === 'content_block_delta') {
      const delta = obj.delta as Record<string, unknown> | undefined;
      if (delta && delta.type === 'text_delta' && typeof delta.text === 'string') {
        out.delta_text = delta.text;
      }
    }
    if (eventType === 'message_start') {
      const msg = obj.message as Record<string, unknown> | undefined;
      if (msg && typeof msg.id === 'string') {
        out.message_id = msg.id;
      }
    }
    return out;
  } catch {
    return { type: eventType };
  }
}
