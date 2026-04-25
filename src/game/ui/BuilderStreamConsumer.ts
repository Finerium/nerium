//
// src/game/ui/BuilderStreamConsumer.ts
//
// Boreas NP W3 Session 2. SSE consumer that subscribes to Nike-relayed
// Kratos Builder session streams. Opens an EventSource against
// `/v1/ma/sessions/{id}/stream` per realtime_bus.contract.md Section 4.2,
// resumes via `Last-Event-ID` after disconnect, and pipes typed events
// (`nerium.ma.delta`, `nerium.ma.tool_call`, `nerium.ma.usage`,
// `nerium.ma.done`, `nerium.ma.errored`) into the chatStore typewriter
// buffer + system messages.
//
// JWT ticket flow per realtime_bus.contract.md Section 4.5:
//   1. POST /v1/realtime/ticket -> 60s JWT.
//   2. Open SSE with `?ticket=<jwt>` query param OR
//      `Authorization: Bearer <jwt>` header (browser EventSource cannot
//      set headers, so query param is the supported variant).
//
// Reconnect with exponential backoff (1, 2, 4, ..., 30s, +/-25% jitter)
// per Section 4.3. Re-mints ticket on each reconnect because the original
// 60s token may have expired.
//
// Cross-ref: docs/contracts/chat_ui.contract.md Section 4.4.
//
// No em dash, no emoji per CLAUDE.md anti-patterns.
//

import { newChatMessageId, useChatStore } from '../../stores/chatStore';

const TICKET_ENDPOINT = '/v1/realtime/ticket';
const STREAM_ENDPOINT_BASE = '/v1/ma/sessions';
const LAST_EVENT_ID_STORAGE_KEY_PREFIX = 'nerium.chat.lastEventId.';
const MAX_RETRIES = 8;
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;

export interface BuilderStreamHandle {
  session_id: string;
  close(): void;
  /** Returns the most recently observed `id:` from the SSE stream. */
  getLastEventId(): string | null;
}

export interface BuilderStreamCallbacks {
  onSessionStarted?(): void;
  onSessionEnded?(stop_reason?: string): void;
  onError?(err: Error): void;
}

interface TicketResponse {
  ticket: string;
  expires_in: number;
}

async function mintTicket(): Promise<string> {
  const res = await fetch(TICKET_ENDPOINT, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error(`ticket mint failed: HTTP ${res.status}`);
  }
  const body = (await res.json()) as TicketResponse;
  if (!body.ticket || typeof body.ticket !== 'string') {
    throw new Error('ticket mint returned no ticket field');
  }
  return body.ticket;
}

function loadLastEventId(session_id: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(LAST_EVENT_ID_STORAGE_KEY_PREFIX + session_id);
  } catch {
    return null;
  }
}

function saveLastEventId(session_id: string, id: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LAST_EVENT_ID_STORAGE_KEY_PREFIX + session_id, id);
  } catch {
    // ignore quota errors
  }
}

function clearLastEventId(session_id: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(LAST_EVENT_ID_STORAGE_KEY_PREFIX + session_id);
  } catch {
    // ignore
  }
}

function backoff(retry: number): number {
  const base = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * Math.pow(2, retry));
  const jitter = (Math.random() - 0.5) * 0.5; // +/-25 percent
  return Math.max(0, Math.round(base * (1 + jitter)));
}

/**
 * Open the SSE stream for `session_id`. Auto-reconnects with exponential
 * backoff up to MAX_RETRIES. Emits delta + system messages into chatStore.
 */
export function openBuilderStream(
  session_id: string,
  callbacks: BuilderStreamCallbacks = {},
): BuilderStreamHandle {
  let es: EventSource | null = null;
  let retryCount = 0;
  let lastEventId: string | null = loadLastEventId(session_id);
  let closed = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  // Pre-seed an assistant message that the typewriter drains into. This
  // way deltas have a target even before the first SSE chunk arrives.
  function seedStreamingMessage(): void {
    const messages = useChatStore.getState().messages;
    const exists = messages.some(
      (m) => m.session_id === session_id && m.streaming === true,
    );
    if (exists) return;
    useChatStore.getState().appendMessage({
      id: newChatMessageId(),
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      session_id,
      streaming: true,
    });
  }

  async function connect(): Promise<void> {
    if (closed) return;
    let ticket: string;
    try {
      ticket = await mintTicket();
    } catch (err) {
      // Mint failure: surface error and either retry or give up.
      if (retryCount >= MAX_RETRIES) {
        callbacks.onError?.(err as Error);
        return;
      }
      reconnectTimer = setTimeout(() => {
        retryCount += 1;
        void connect();
      }, backoff(retryCount));
      return;
    }

    const params = new URLSearchParams();
    params.set('ticket', ticket);
    if (lastEventId) params.set('last_event_id', lastEventId);
    const url = `${STREAM_ENDPOINT_BASE}/${encodeURIComponent(session_id)}/stream?${params.toString()}`;

    es = new EventSource(url, { withCredentials: true });

    es.addEventListener('open', () => {
      retryCount = 0; // reset on successful open
    });

    function trackId(rawId: string | null): void {
      if (!rawId) return;
      lastEventId = rawId;
      saveLastEventId(session_id, rawId);
    }

    es.addEventListener('nerium.ma.queued', (e) => {
      trackId((e as MessageEvent).lastEventId);
    });

    es.addEventListener('nerium.ma.started', (e) => {
      trackId((e as MessageEvent).lastEventId);
      callbacks.onSessionStarted?.();
      seedStreamingMessage();
    });

    es.addEventListener('nerium.ma.delta', (e) => {
      const ev = e as MessageEvent;
      trackId(ev.lastEventId);
      try {
        const data = JSON.parse(ev.data);
        const delta = typeof data?.delta === 'string' ? data.delta : '';
        if (delta.length === 0) return;
        seedStreamingMessage();
        useChatStore.getState().appendDelta(session_id, delta);
      } catch (err) {
        console.warn('[BuilderStream] delta parse failed', err);
      }
    });

    es.addEventListener('nerium.ma.tool_call', (e) => {
      const ev = e as MessageEvent;
      trackId(ev.lastEventId);
      try {
        const data = JSON.parse(ev.data);
        const tool = typeof data?.tool_name === 'string' ? data.tool_name : 'unknown';
        useChatStore.getState().appendMessage({
          id: newChatMessageId(),
          role: 'system',
          content: `tool_use: ${tool}`,
          timestamp: new Date().toISOString(),
          session_id,
        });
      } catch (err) {
        console.warn('[BuilderStream] tool_call parse failed', err);
      }
    });

    es.addEventListener('nerium.ma.usage', (e) => {
      const ev = e as MessageEvent;
      trackId(ev.lastEventId);
      try {
        const data = JSON.parse(ev.data);
        const cost = typeof data?.cost_usd === 'number' ? data.cost_usd : null;
        if (cost !== null) {
          // Stamp the streaming assistant message with the running cost.
          useChatStore.setState((s) => {
            let idx = -1;
            for (let i = s.messages.length - 1; i >= 0; i--) {
              if (s.messages[i].session_id === session_id && s.messages[i].streaming) {
                idx = i;
                break;
              }
            }
            if (idx === -1) return s;
            const next = s.messages.slice();
            next[idx] = { ...next[idx], cost_usd: cost };
            return { ...s, messages: next };
          });
        }
      } catch (err) {
        console.warn('[BuilderStream] usage parse failed', err);
      }
    });

    es.addEventListener('nerium.ma.done', (e) => {
      const ev = e as MessageEvent;
      trackId(ev.lastEventId);
      let stopReason: string | undefined;
      try {
        const data = JSON.parse(ev.data);
        if (typeof data?.stop_reason === 'string') stopReason = data.stop_reason;
      } catch {
        // ignore parse error
      }
      useChatStore.getState().finishStream(session_id);
      clearLastEventId(session_id);
      callbacks.onSessionEnded?.(stopReason);
      handleClose(false);
    });

    es.addEventListener('nerium.ma.errored', (e) => {
      const ev = e as MessageEvent;
      trackId(ev.lastEventId);
      let message = 'session error';
      try {
        const data = JSON.parse(ev.data);
        if (typeof data?.message === 'string') message = data.message;
      } catch {
        // ignore parse error
      }
      useChatStore.getState().appendMessage({
        id: newChatMessageId(),
        role: 'system',
        content: `session error: ${message}`,
        timestamp: new Date().toISOString(),
        session_id,
      });
      callbacks.onError?.(new Error(message));
      handleClose(true);
    });

    es.addEventListener('nerium.system.stream_truncated', (e) => {
      const ev = e as MessageEvent;
      trackId(ev.lastEventId);
      // Stream trim window exceeded; cannot resume. Surface system message
      // and stop reconnect attempts.
      useChatStore.getState().appendMessage({
        id: newChatMessageId(),
        role: 'system',
        content: 'session stream truncated. Refresh to refetch state.',
        timestamp: new Date().toISOString(),
        session_id,
      });
      clearLastEventId(session_id);
      handleClose(false);
    });

    es.onerror = () => {
      // Browser EventSource auto-reconnects, but our protocol layer needs
      // to mint a fresh ticket on each connect (60s expiry). Force-close
      // and schedule a manual reconnect with backoff.
      handleClose(true);
    };
  }

  function handleClose(scheduleReconnect: boolean): void {
    try {
      es?.close();
    } catch {
      // ignore
    }
    es = null;
    if (closed) return;
    if (!scheduleReconnect) {
      closed = true;
      return;
    }
    if (retryCount >= MAX_RETRIES) {
      useChatStore.getState().appendMessage({
        id: newChatMessageId(),
        role: 'system',
        content: 'Connection lost. Please retry or refresh.',
        timestamp: new Date().toISOString(),
        session_id,
      });
      closed = true;
      return;
    }
    reconnectTimer = setTimeout(() => {
      retryCount += 1;
      void connect();
    }, backoff(retryCount));
  }

  // Kick off initial connect.
  useChatStore.getState().setActiveSession(session_id);
  void connect();

  return {
    session_id,
    getLastEventId(): string | null {
      return lastEventId;
    },
    close(): void {
      closed = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      try {
        es?.close();
      } catch {
        // ignore
      }
      es = null;
      const active = useChatStore.getState().active_session_id;
      if (active === session_id) {
        useChatStore.getState().setActiveSession(null);
      }
    },
  };
}

/**
 * Create a new MA session via Kratos REST + open its SSE stream.
 *
 * Endpoint per agent_orchestration_runtime.contract.md (Kratos authority).
 * Body shape: `{ initial_prompt: string, model?: ModelPreference }`.
 */
export interface CreateSessionInput {
  initial_prompt: string;
  model?: string;
}

export interface CreateSessionResult {
  session_id: string;
  stream_url?: string;
}

export async function createBuilderSession(input: CreateSessionInput): Promise<CreateSessionResult> {
  const res = await fetch('/v1/ma/sessions', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(`createBuilderSession failed: HTTP ${res.status}`);
  }
  const body = (await res.json()) as CreateSessionResult;
  if (!body.session_id || typeof body.session_id !== 'string') {
    throw new Error('createBuilderSession returned no session_id');
  }
  return body;
}
