//
// src/game/ui/CommandParser.ts
//
// Boreas NP W3. Slash-prefixed command registry for the Minecraft chat
// UIScene. Session 1 ships the local-only commands (clear, help, debug,
// model preference). Session 2 extends with SSE-bound commands (save,
// cancel, tools, budget) that touch Kratos + Plutus + Eunomia.
//
// Contract: docs/contracts/chat_ui.contract.md Section 3.3 + 4.5.
//
// Dispatch model:
//   1. Parse the raw `/command [args]` string into a Command discriminated
//      union.
//   2. dispatchCommand() returns Promise<void> so async flows (save,
//      cancel) are first-class.
//   3. Unknown commands surface a system message and forward the raw
//      content to MA session via the consumer-supplied forwarder. Caller
//      decides whether to fall through to MA dispatch.
//
// No em dash, no emoji per CLAUDE.md anti-patterns.
//

import { newChatMessageId, useChatStore } from '../../stores/chatStore';

export type ModelPreference = 'opus-4.7' | 'sonnet-4.6' | 'haiku-4.5';

export type Command =
  | { cmd: 'clear' }
  | { cmd: 'help' }
  | { cmd: 'save' }
  | { cmd: 'model'; value: ModelPreference }
  | { cmd: 'debug' }
  | { cmd: 'tools'; action: 'list' | 'enable' | 'disable'; value?: string }
  | { cmd: 'budget'; action: 'show' | 'set'; value?: number }
  | { cmd: 'cancel' }
  | { cmd: 'builder'; prompt?: string }
  | { cmd: 'unknown'; raw: string };

const HELP_TEXT = [
  'Available commands:',
  '  /help                  show this list',
  '  /clear                 clear chat messages',
  '  /builder [prompt]      start a Builder MA session (streamed)',
  '  /save                  save current MA session',
  '  /model <id>            set MA session model (opus-4.7 | sonnet-4.6 | haiku-4.5)',
  '  /debug                 toggle verbose mode',
  '  /tools list            show available MCP tools',
  '  /budget show           show remaining daily spend',
  '  /cancel                cancel active streaming session',
  '',
  'Tips: ArrowUp/Down recalls history. Ctrl+L clears. // sends a literal slash.',
].join('\n');

const KNOWN_MODELS: ReadonlySet<ModelPreference> = new Set<ModelPreference>([
  'opus-4.7',
  'sonnet-4.6',
  'haiku-4.5',
]);

export interface CommandParserCallbacks {
  /**
   * Called when an unknown command was dispatched. Caller may forward to MA
   * session as plain text (the contract default) or surface as system
   * error. Session 1 default echoes "Unknown command" only.
   */
  onUnknown?(raw: string): void;
  /**
   * Called when a recognised command needs Session 2 behaviour. Session 1
   * surfaces a "deferred to Session 2" system message; Session 2 wires
   * concrete API calls.
   */
  onDeferred?(cmd: Command): void;
  /**
   * Called when the user changes model preference. Session 2 wires to the
   * Kratos model switch endpoint. Session 1 just records to chatStore.
   */
  onModelChange?(model: ModelPreference): void;
  /**
   * Called when the user toggles debug mode. Session 1 flips the global
   * `window.__NERIUM_DEBUG__` flag.
   */
  onDebugToggle?(next: boolean): void;
  /**
   * Session 2: spawn a Builder MA session via Kratos REST + open SSE
   * stream. Caller supplies an async function that creates the session
   * and returns the session id; the parser surfaces the streaming
   * lifecycle as system messages.
   */
  onBuilder?(prompt: string | undefined): Promise<void> | void;
  /**
   * Session 2: cancel the active MA session. Caller supplies the cancel
   * fetch + chatStore active_session_id read.
   */
  onCancel?(): Promise<void> | void;
  /**
   * Session 2: persist the current MA session via Kratos save endpoint
   * (R2 bucket per chat_ui.contract.md Section 4.5).
   */
  onSave?(): Promise<void> | void;
  /**
   * Session 2: list MCP tools.
   */
  onToolsList?(): Promise<void> | void;
  /**
   * Session 2: show remaining daily spend (Moros budget daemon).
   */
  onBudgetShow?(): Promise<void> | void;
}

/**
 * Parse a raw slash-prefixed string into a Command. Whitespace around args
 * tolerated. Unknown command preserves the original raw (without the
 * leading slash) so callers can echo back to the user.
 */
export function parseCommand(raw: string): Command {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('/')) return { cmd: 'unknown', raw: trimmed };
  const body = trimmed.slice(1);
  const parts = body.split(/\s+/);
  const head = (parts[0] ?? '').toLowerCase();
  const rest = parts.slice(1);

  switch (head) {
    case 'clear':
      return { cmd: 'clear' };
    case 'help':
    case '?':
      return { cmd: 'help' };
    case 'save':
      return { cmd: 'save' };
    case 'debug':
      return { cmd: 'debug' };
    case 'cancel':
      return { cmd: 'cancel' };
    case 'builder': {
      const prompt = rest.join(' ').trim();
      return { cmd: 'builder', prompt: prompt.length > 0 ? prompt : undefined };
    }
    case 'model': {
      const value = (rest[0] ?? '').toLowerCase();
      if (!KNOWN_MODELS.has(value as ModelPreference)) {
        return { cmd: 'unknown', raw: trimmed };
      }
      return { cmd: 'model', value: value as ModelPreference };
    }
    case 'tools': {
      const action = (rest[0] ?? 'list').toLowerCase();
      if (action !== 'list' && action !== 'enable' && action !== 'disable') {
        return { cmd: 'unknown', raw: trimmed };
      }
      return { cmd: 'tools', action: action as 'list' | 'enable' | 'disable', value: rest[1] };
    }
    case 'budget': {
      const action = (rest[0] ?? 'show').toLowerCase();
      if (action === 'show') return { cmd: 'budget', action: 'show' };
      if (action === 'set') {
        const n = Number(rest[1]);
        if (!Number.isFinite(n)) return { cmd: 'unknown', raw: trimmed };
        return { cmd: 'budget', action: 'set', value: n };
      }
      return { cmd: 'unknown', raw: trimmed };
    }
    default:
      return { cmd: 'unknown', raw: trimmed };
  }
}

/**
 * Dispatch a parsed command. Session 1 implementation handles local-only
 * effects (clearMessages, append help message, set debug flag). Session 2
 * extends with SSE/Kratos-bound flows.
 */
export async function dispatchCommand(
  cmd: Command,
  callbacks: CommandParserCallbacks = {},
): Promise<void> {
  const store = useChatStore.getState();

  switch (cmd.cmd) {
    case 'clear': {
      store.clearMessages();
      store.appendMessage({
        id: newChatMessageId(),
        role: 'system',
        content: 'Chat cleared.',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    case 'help': {
      store.appendMessage({
        id: newChatMessageId(),
        role: 'system',
        content: HELP_TEXT,
        timestamp: new Date().toISOString(),
      });
      return;
    }
    case 'debug': {
      const w = (typeof window !== 'undefined' ? window : undefined) as
        | (Window & { __NERIUM_DEBUG__?: boolean })
        | undefined;
      const next = !(w?.__NERIUM_DEBUG__ ?? false);
      if (w) w.__NERIUM_DEBUG__ = next;
      callbacks.onDebugToggle?.(next);
      store.appendMessage({
        id: newChatMessageId(),
        role: 'system',
        content: `Debug mode ${next ? 'enabled' : 'disabled'}.`,
        timestamp: new Date().toISOString(),
      });
      return;
    }
    case 'model': {
      callbacks.onModelChange?.(cmd.value);
      store.appendMessage({
        id: newChatMessageId(),
        role: 'system',
        content: `Model preference set to ${cmd.value}.`,
        timestamp: new Date().toISOString(),
      });
      return;
    }
    case 'save': {
      callbacks.onDeferred?.(cmd);
      if (callbacks.onSave) {
        try {
          await callbacks.onSave();
        } catch (err) {
          store.appendMessage({
            id: newChatMessageId(),
            role: 'system',
            content: `Save failed: ${(err as Error).message ?? 'unknown'}`,
            timestamp: new Date().toISOString(),
          });
        }
      } else {
        store.appendMessage({
          id: newChatMessageId(),
          role: 'system',
          content: 'Save handler not registered.',
          timestamp: new Date().toISOString(),
        });
      }
      return;
    }
    case 'cancel': {
      callbacks.onDeferred?.(cmd);
      if (callbacks.onCancel) {
        try {
          await callbacks.onCancel();
        } catch (err) {
          store.appendMessage({
            id: newChatMessageId(),
            role: 'system',
            content: `Cancel failed: ${(err as Error).message ?? 'unknown'}`,
            timestamp: new Date().toISOString(),
          });
        }
      } else {
        store.appendMessage({
          id: newChatMessageId(),
          role: 'system',
          content: 'No active session to cancel.',
          timestamp: new Date().toISOString(),
        });
      }
      return;
    }
    case 'tools': {
      callbacks.onDeferred?.(cmd);
      if (cmd.action === 'list' && callbacks.onToolsList) {
        try {
          await callbacks.onToolsList();
        } catch (err) {
          store.appendMessage({
            id: newChatMessageId(),
            role: 'system',
            content: `Tools list failed: ${(err as Error).message ?? 'unknown'}`,
            timestamp: new Date().toISOString(),
          });
        }
      } else {
        store.appendMessage({
          id: newChatMessageId(),
          role: 'system',
          content: `Command /tools ${cmd.action} accepted.`,
          timestamp: new Date().toISOString(),
        });
      }
      return;
    }
    case 'budget': {
      callbacks.onDeferred?.(cmd);
      if (cmd.action === 'show' && callbacks.onBudgetShow) {
        try {
          await callbacks.onBudgetShow();
        } catch (err) {
          store.appendMessage({
            id: newChatMessageId(),
            role: 'system',
            content: `Budget show failed: ${(err as Error).message ?? 'unknown'}`,
            timestamp: new Date().toISOString(),
          });
        }
      } else {
        store.appendMessage({
          id: newChatMessageId(),
          role: 'system',
          content: `Command /budget ${cmd.action} accepted.`,
          timestamp: new Date().toISOString(),
        });
      }
      return;
    }
    case 'builder': {
      callbacks.onDeferred?.(cmd);
      if (callbacks.onBuilder) {
        try {
          await callbacks.onBuilder(cmd.prompt);
        } catch (err) {
          store.appendMessage({
            id: newChatMessageId(),
            role: 'system',
            content: `Builder spawn failed: ${(err as Error).message ?? 'unknown'}`,
            timestamp: new Date().toISOString(),
          });
        }
      } else {
        store.appendMessage({
          id: newChatMessageId(),
          role: 'system',
          content: 'Builder handler not registered. Start a builder session via /builder <prompt>.',
          timestamp: new Date().toISOString(),
        });
      }
      return;
    }
    case 'unknown': {
      callbacks.onUnknown?.(cmd.raw);
      store.appendMessage({
        id: newChatMessageId(),
        role: 'system',
        content: `Unknown command: ${cmd.raw}. Type /help for the list.`,
        timestamp: new Date().toISOString(),
      });
      return;
    }
  }
}

/**
 * Convenience wrapper for UIScene: parse + dispatch in one call.
 */
export async function parseAndDispatch(
  raw: string,
  callbacks: CommandParserCallbacks = {},
): Promise<Command> {
  const cmd = parseCommand(raw);
  await dispatchCommand(cmd, callbacks);
  return cmd;
}
