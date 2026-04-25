//
// src/stores/chatStore.ts
//
// Boreas authority chatStore (NP W3 Session 1). Powers the Minecraft chat-style
// UIScene that replaces the deprecated React HUD on `/play` per Gate 5
// Revised Option C. Three-mode focus arbitration FSM (movement | chat |
// dialogue) lives here so the focusArbitration hook + UIScene + Playwright
// tests share a single source of truth.
//
// Contract: docs/contracts/chat_ui.contract.md v0.1.0 (Boreas authority).
// Cross-ref: docs/contracts/game_state.contract.md v0.2.0 Section 3.6
// (chatStore) plus Section 3.5 (chatMode lives at the chat surface, not at
// useGameStore which Helios-v2 owns; chatMode is mirrored only when a
// future cross-system reader needs it).
//
// Strict scope:
//   - chat history (last 100 user inputs, sessionStorage persisted, ArrowUp/
//     ArrowDown recall like bash).
//   - messages (assistant + user + system + command roles).
//   - streaming buffer keyed by session_id (typewriter drains in Session 2).
//   - mode FSM (movement | chat | dialogue) with mutually exclusive
//     transitions.
//   - active session id (so SSE reconnect knows which buffer to append to).
//
// No em dash, no emoji per CLAUDE.md anti-patterns.
// IME composition guard lives in ChatInput.ts; this store does not encode
// composing state.
//

'use client';

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

export type ChatMode = 'movement' | 'chat' | 'dialogue';

export type ChatRole = 'user' | 'assistant' | 'system' | 'command';

export interface ChatToolCall {
  name: string;
  input_partial: string;
}

export interface ChatMessage {
  id: string; // uuid v7 or fallback timestamp+random
  role: ChatRole;
  content: string;
  timestamp: string; // ISO-8601
  session_id?: string;
  streaming?: boolean;
  command_result?: string;
  tool_calls?: ChatToolCall[];
  cost_usd?: number;
}

export interface ChatStoreState {
  mode: ChatMode;
  messages: ChatMessage[];
  input: string;
  history: string[]; // last 100 submitted user inputs
  history_index: number; // -1 = no recall active; >=0 = pointer into history
  streaming_buffer: Record<string, string>; // session_id -> accumulated delta
  active_session_id: string | null;
}

export interface ChatStoreActions {
  setMode: (next: ChatMode) => void;
  appendMessage: (msg: ChatMessage) => void;
  appendDelta: (session_id: string, delta: string) => void;
  finishStream: (session_id: string) => void;
  setInput: (s: string) => void;
  pushHistory: (s: string) => void;
  recallHistory: (direction: -1 | 1) => string;
  resetRecall: () => void;
  clearMessages: () => void;
  setActiveSession: (session_id: string | null) => void;
  /**
   * Hydrate state from sessionStorage. Called once on UIScene create. No-op
   * outside browser context.
   */
  hydrateFromSession: () => void;
}

export type ChatStore = ChatStoreState & ChatStoreActions;

const HISTORY_CAP = 100;
const SESSION_STORAGE_KEY = 'nerium.chat.history.v1';
const MESSAGES_STORAGE_KEY = 'nerium.chat.messages.v1';
const MESSAGES_CAP = 200;

function loadHistoryFromSession(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s): s is string => typeof s === 'string').slice(-HISTORY_CAP);
  } catch (err) {
    console.warn('[chatStore] history hydrate failed', err);
    return [];
  }
}

function persistHistoryToSession(history: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(history.slice(-HISTORY_CAP)));
  } catch (err) {
    console.warn('[chatStore] history persist failed', err);
  }
}

function loadMessagesFromSession(): ChatMessage[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem(MESSAGES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    // Cheap shape check: each entry needs id + role + content + timestamp.
    return parsed
      .filter(
        (m): m is ChatMessage =>
          typeof m === 'object' &&
          m !== null &&
          typeof (m as ChatMessage).id === 'string' &&
          typeof (m as ChatMessage).role === 'string' &&
          typeof (m as ChatMessage).content === 'string' &&
          typeof (m as ChatMessage).timestamp === 'string',
      )
      .slice(-MESSAGES_CAP);
  } catch (err) {
    console.warn('[chatStore] messages hydrate failed', err);
    return [];
  }
}

function persistMessagesToSession(messages: ChatMessage[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      MESSAGES_STORAGE_KEY,
      JSON.stringify(messages.slice(-MESSAGES_CAP)),
    );
  } catch (err) {
    console.warn('[chatStore] messages persist failed', err);
  }
}

function generateId(): string {
  if (typeof globalThis !== 'undefined' && 'crypto' in globalThis && typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Public helper for callers that need to mint a chat message id without
 * importing crypto. Used by CommandParser + UIScene + tests.
 */
export function newChatMessageId(): string {
  return generateId();
}

/**
 * Internal store instance + dev-only window hook for Playwright tests.
 *
 * The hook lives at `window.__nerium_chatStore__` and exposes a snapshot
 * of `useChatStore.getState()` on demand plus the action surface
 * (appendMessage, appendDelta, clearMessages, etc). We attach it once on
 * module load only in a browser context; production bundles can scrub
 * via tree-shake by removing the probe block in a post-hackathon
 * refactor.
 */
function attachDevProbe(store: { getState: () => ChatStore }): void {
  if (typeof window === 'undefined') return;
  try {
    const w = window as unknown as Record<string, unknown>;
    Object.defineProperty(w, '__nerium_chatStore__', {
      configurable: true,
      get() {
        // Return the live store state. Because actions are part of state
        // (Zustand convention), tests can call appendMessage etc directly
        // off the returned object: w.__nerium_chatStore__.appendMessage(...).
        return store.getState();
      },
    });
  } catch {
    // ignore: non-configurable property already set, do not throw on
    // module re-init (Next.js HMR scenario).
  }
}

export const useChatStore = create<ChatStore>()(
  subscribeWithSelector((set, get) => ({
    mode: 'movement',
    messages: [],
    input: '',
    history: [],
    history_index: -1,
    streaming_buffer: {},
    active_session_id: null,

    setMode: (next) => {
      const prev = get().mode;
      if (prev === next) return;
      set({ mode: next });
    },

    appendMessage: (msg) => {
      set((s) => {
        const messages = [...s.messages, msg].slice(-MESSAGES_CAP);
        persistMessagesToSession(messages);
        return { ...s, messages };
      });
    },

    appendDelta: (session_id, delta) => {
      if (typeof delta !== 'string' || delta.length === 0) return;
      set((s) => ({
        ...s,
        streaming_buffer: {
          ...s.streaming_buffer,
          [session_id]: (s.streaming_buffer[session_id] ?? '') + delta,
        },
      }));
    },

    finishStream: (session_id) => {
      set((s) => {
        // Promote streaming_buffer content into the matching assistant
        // message (last message with this session_id and streaming=true), or
        // append a fresh message if none exists.
        const buffered = s.streaming_buffer[session_id] ?? '';
        const idx = [...s.messages]
          .map((m, i) => ({ m, i }))
          .reverse()
          .find(({ m }) => m.session_id === session_id && m.streaming === true)?.i;
        let messages: ChatMessage[];
        if (idx !== undefined) {
          messages = s.messages.map((m, i) =>
            i === idx ? { ...m, content: m.content + buffered, streaming: false } : m,
          );
        } else if (buffered.length > 0) {
          messages = [
            ...s.messages,
            {
              id: generateId(),
              role: 'assistant',
              content: buffered,
              timestamp: new Date().toISOString(),
              session_id,
              streaming: false,
            },
          ];
        } else {
          messages = s.messages;
        }
        // Drop the per-session buffer
        const next_buffer = { ...s.streaming_buffer };
        delete next_buffer[session_id];
        persistMessagesToSession(messages.slice(-MESSAGES_CAP));
        return {
          ...s,
          messages: messages.slice(-MESSAGES_CAP),
          streaming_buffer: next_buffer,
        };
      });
    },

    setInput: (str) => set({ input: str }),

    pushHistory: (str) => {
      const trimmed = str?.trim() ?? '';
      if (trimmed.length === 0) return;
      set((s) => {
        // De-dup against immediate previous entry (bash-style).
        const last = s.history[s.history.length - 1];
        if (last === trimmed) {
          return { ...s, history_index: -1 };
        }
        const next_history = [...s.history, trimmed].slice(-HISTORY_CAP);
        persistHistoryToSession(next_history);
        return { ...s, history: next_history, history_index: -1 };
      });
    },

    recallHistory: (direction) => {
      const s = get();
      if (s.history.length === 0) return s.input;
      let next_index: number;
      if (direction === -1) {
        // ArrowUp: move toward older entries.
        if (s.history_index === -1) {
          next_index = s.history.length - 1;
        } else {
          next_index = Math.max(0, s.history_index - 1);
        }
      } else {
        // ArrowDown: move toward newer entries; past the newest entry returns
        // empty input (matching bash behavior).
        if (s.history_index === -1) {
          return s.input;
        }
        next_index = s.history_index + 1;
        if (next_index >= s.history.length) {
          set({ history_index: -1, input: '' });
          return '';
        }
      }
      const recalled = s.history[next_index] ?? '';
      set({ history_index: next_index, input: recalled });
      return recalled;
    },

    resetRecall: () => set({ history_index: -1 }),

    clearMessages: () => {
      set({ messages: [], streaming_buffer: {} });
      persistMessagesToSession([]);
    },

    setActiveSession: (session_id) => set({ active_session_id: session_id }),

    hydrateFromSession: () => {
      const history = loadHistoryFromSession();
      const messages = loadMessagesFromSession();
      set((s) => ({ ...s, history, messages }));
    },
  })),
);

// Attach the Playwright dev probe once on module load.
attachDevProbe(useChatStore);
