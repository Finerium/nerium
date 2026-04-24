# Chat UI (Minecraft-Style UIScene)

**Contract Version:** 0.1.0
**Owner Agent(s):** Boreas (UIScene authority, DOMElement IME guard, command parser, typewriter streaming, focus arbitration state machine)
**Consumer Agent(s):** Nike (SSE stream source for typewriter), Kratos (MA session event source), Helios-v2 (scene coordination, UIScene overlay depth), Marshall (treasurer NPC dialogue flows via chat), Frontend `/play` route (chat is sole input surface post-RV pivot), Nemea-RV-v2 (IME + focus arbitration + typewriter E2E regression)
**Stability:** draft
**Last Updated:** 2026-04-24 (NP Wave 1, Pythia-v3 round 3)

## 1. Purpose

Defines the Minecraft chat-style UIScene that replaces the deprecated React HUD on `/play` per Gate 5 pivot. `Phaser.GameObjects.DOMElement` HTML input preserves IME composition (critical for Indonesian + Chinese + Japanese users). Focus arbitration FSM (movement / chat / dialogue) with `focusin`/`focusout` DOM event bubbling. Typewriter streaming from Nike SSE. Slash-command parser. Chat history sessionStorage recall (last 100). Persists across world scene transitions via `scene.launch('UIScene')` from BootScene.

Scope distinct from `dialogue_schema.contract.md` (that governs in-world NPC dialogue trees). This governs the chat surface for AI agent conversations (Apollo / MA session token streaming) and slash commands.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor, Section 13 Builder UX brevity)
- `CLAUDE.md` (root)
- `docs/phase_np/RV_NP_RESEARCH.md` (Sections G.43 Minecraft chat, G.44 focus arbitration)
- `docs/phase_np/RV_NP_AGENT_STRUCTURE.md` (Section 4.20 Boreas)
- `docs/contracts/realtime_bus.contract.md` (SSE consumption + event types)
- `docs/contracts/ma_session_lifecycle.contract.md` (session streams arrive here)
- `docs/contracts/game_state.contract.md` (useGameStore.chatMode)
- `docs/contracts/game_event_bus.contract.md` (game events bridging)
- `docs/contracts/visual_manifest.contract.md` (scene coordination)

## 3. Schema Definition

### 3.1 Focus arbitration state machine

```
               T (no IME composing)
      movement ─────────────────────────► chat
         ▲                                 │
         │ Esc                         Enter│
         │ (or /close)           (with text)│
         │                                  ▼
         └───── send to Nike / MA dispatch ─┘

      movement ──── NPC interact (E) ───► dialogue
         ▲                                 │
         │ tree end / Esc                  │ 1/2/3/4 choice keys
         │                                 ▼
         └──── return to movement ─────────┘
```

Per-mode input policy:

| Mode | WASD | DOMElement focus | 1-4 keys | Esc | T key |
|---|---|---|---|---|---|
| `movement` | active | blurred, pointer-events: none | ignored | n/a | opens chat |
| `chat` | disabled | focused | accepted as text | closes chat | accepted as text |
| `dialogue` | disabled | hidden (dialogue overlay host is separate) | choice select | closes dialogue | ignored |

Mode stored in `useGameStore.chatMode` per `game_state.contract.md` amended v0.2.0.

### 3.2 Chat message shape

```typescript
// src/stores/chatStore.ts

export type ChatRole = 'user' | 'assistant' | 'system' | 'command';

export interface ChatMessage {
  id: string;                                            // uuid v7
  role: ChatRole;
  content: string;
  timestamp: string;                                     // ISO-8601
  session_id?: string;                                   // MA session id if assistant
  streaming?: boolean;                                   // true while typewriter draining
  command_result?: string;                               // role=command
  tool_calls?: Array<{name: string; input_partial: string}>;
  cost_usd?: number;                                     // for assistant on completion
}

export interface ChatStore {
  mode: 'movement' | 'chat' | 'dialogue';
  messages: ChatMessage[];
  input: string;
  history: string[];                                     // last 100 submitted inputs
  history_index: number;                                 // for ArrowUp/Down recall
  streaming_buffer: Record<string, string>;              // session_id → accumulated delta
  setMode(next: ChatMode): void;
  appendMessage(msg: ChatMessage): void;
  appendDelta(session_id: string, delta: string): void;
  finishStream(session_id: string): void;
  setInput(s: string): void;
  pushHistory(s: string): void;
  recallHistory(direction: -1 | 1): string;
  clearMessages(): void;
}
```

### 3.3 Slash commands

```python
# src/game/ui/CommandParser.ts

type Command =
  | { cmd: 'clear' }
  | { cmd: 'help' }
  | { cmd: 'save' }
  | { cmd: 'model', value: 'opus-4.7' | 'sonnet-4.6' | 'haiku-4.5' }
  | { cmd: 'debug' }
  | { cmd: 'tools', action: 'list' | 'enable' | 'disable', value?: string }
  | { cmd: 'budget', action: 'show' | 'set', value?: number }
  | { cmd: 'cancel' }                                    // cancel active MA session
  | { cmd: 'unknown', raw: string };
```

Dispatch: `/clear` clears messages; `/help` prints command list; `/save` exports session to R2; `/model opus-4.7` sets next MA session model preference via uiStore; `/debug` toggles `window.__NERIUM_DEBUG__`; `/tools list` prints available MCP tool names; `/budget show` prints remaining daily spend; `/cancel` cancels active streaming session.

Unknown command echoes as user message to MA session (forward to Kratos). Escape hatch: `//` prefix sends as plain text starting with slash (literal slash).

### 3.4 Typewriter cadence

Default 60 chars per second. Configurable via Hemera `chat.typewriter_cps` (number, default 60). Buffer fills from SSE `nerium.ma.delta` events; `Phaser.Time.TimerEvent` drains `Math.ceil(cps / 60)` chars per tick at 60 fps. Scroll-to-bottom on each drain (`scrollTop = scrollHeight`).

## 4. Interface / API Contract

### 4.1 UIScene launch

```typescript
// src/game/scenes/BootScene.ts (extension)

this.scene.launch('UIScene');
this.scene.bringToTop('UIScene');
```

UIScene is launched once at BootScene `create`. Runs in parallel with world scenes. Persists across `scene.transition(...)` calls between world scenes.

### 4.2 DOMElement host

```typescript
// src/game/scenes/UIScene.ts

create() {
  const chatRoot = document.createElement('div');
  chatRoot.id = 'nerium-chat';
  chatRoot.className = 'nerium-chat nerium-chat--hidden';
  chatRoot.innerHTML = `
    <div id="nerium-chat-history" class="nerium-chat__history" role="log" aria-live="polite"></div>
    <div class="nerium-chat__bar">
      <span class="nerium-chat__prompt">&gt;</span>
      <input id="nerium-chat-input" type="text" maxlength="2000"
             autocomplete="off" autocorrect="off" autocapitalize="off"
             spellcheck="false" lang="auto"
             aria-label="Chat input" />
    </div>
  `;
  this.add.dom(window.innerWidth / 2, window.innerHeight - 100, chatRoot);

  // IME guard
  const input = chatRoot.querySelector<HTMLInputElement>('#nerium-chat-input');
  input.addEventListener('compositionstart', () => input.dataset.composing = '1');
  input.addEventListener('compositionend', () => input.dataset.composing = '0');
  input.addEventListener('keydown', (e) => this.onInputKeyDown(e, input));
  // ...
}

onInputKeyDown(e: KeyboardEvent, input: HTMLInputElement) {
  if (e.key === 'Enter' && input.dataset.composing === '0') {
    e.preventDefault();
    this.submitChatInput(input.value);
    input.value = '';
  } else if (e.key === 'Escape') {
    this.closeChat();
  } else if (e.key === 'ArrowUp') {
    input.value = chatStore.getState().recallHistory(-1);
  } else if (e.key === 'ArrowDown') {
    input.value = chatStore.getState().recallHistory(1);
  }
  // Ctrl+L clears messages
  if (e.ctrlKey && e.key === 'l') {
    e.preventDefault();
    chatStore.getState().clearMessages();
  }
}
```

Game config MUST include `dom: { createContainer: true }` per `visual_manifest.contract.md`.

### 4.3 Focus arbitration

```typescript
// src/lib/focusArbitration.ts

export function useFocusArbitration(getGame: () => Phaser.Game | null) {
  useEffect(() => {
    const evaluate = () => {
      const game = getGame(); if (!game) return;
      const reactOwns = isTextEntry(document.activeElement);
      const mode = useGameStore.getState().chatMode;
      game.scene.scenes.forEach((s) => {
        if (!s.input?.keyboard || s.scene.key === 'UIScene') return;
        s.input.keyboard.enabled = !reactOwns && mode === 'movement';
      });
    };
    document.addEventListener('focusin', evaluate);
    document.addEventListener('focusout', () => queueMicrotask(evaluate));
    document.addEventListener('visibilitychange', evaluate);
    evaluate();
    return () => { /* cleanup */ };
  }, [getGame]);
}

function isTextEntry(el: Element | null): boolean {
  if (!el) return false;
  if (el.tagName === 'INPUT') {
    const t = (el as HTMLInputElement).type;
    return ['text', 'search', 'email', 'url', 'tel', 'password', 'number'].includes(t);
  }
  if (el.tagName === 'TEXTAREA') return true;
  if (el.getAttribute('contenteditable') === 'true') return true;
  if (el.closest('[data-nerium-capture="true"]')) return true;
  return false;
}
```

`UIScene` exempt from disabling (its own DOMElement needs keyboard events).

### 4.4 SSE consumption

On MA session create from command or user text:

1. `POST /v1/ma/sessions` via fetch, receive `session_id` + `stream_url`.
2. Append user message + placeholder assistant message with `streaming: true`.
3. Open SSE via `fetch-event-source` (browser) or `reqwest` streaming (Tauri) to `stream_url`.
4. For each `nerium.ma.delta` event, call `chatStore.appendDelta(session_id, delta.data.delta)`.
5. Typewriter timer drains buffer → DOM text node.
6. On `nerium.ma.done`, call `chatStore.finishStream(session_id)` + emit `game.chat.message_complete` event.
7. On reconnect (network drop): resume with `Last-Event-ID` per `realtime_bus.contract.md`.

### 4.5 Command surface

Commands executed locally via CommandParser + dispatch to appropriate store / API.

```typescript
// src/game/ui/CommandParser.ts

export async function dispatchCommand(cmd: Command) {
  switch (cmd.cmd) {
    case 'clear': chatStore.getState().clearMessages(); break;
    case 'help': chatStore.getState().appendMessage({ role: 'system', content: HELP_TEXT, ... }); break;
    case 'save': await saveSessionToR2(); break;
    case 'model': uiStore.getState().setModel(cmd.value); break;
    case 'debug': window.__NERIUM_DEBUG__ = !window.__NERIUM_DEBUG__; break;
    case 'tools': await dispatchToolsCommand(cmd.action, cmd.value); break;
    case 'budget': await dispatchBudgetCommand(cmd.action, cmd.value); break;
    case 'cancel': await cancelActiveSession(); break;
    case 'unknown': chatStore.getState().appendMessage({ role: 'system', content: `Unknown command: ${cmd.raw}`, ... }); break;
  }
}
```

## 5. Event Signatures

Game event topics per `game_event_bus.contract.md` v0.2.0 amendment:

| Topic | Payload | Emitter | Consumer |
|---|---|---|---|
| `game.chat.opened` | `{}` | UIScene | Nyx (pause quest timers) |
| `game.chat.closed` | `{reason: 'esc' | 'submit' | 'command'}` | UIScene | Nyx |
| `game.chat.message_submitted` | `{content, command_name?: string}` | UIScene | Nike (if MA session) |
| `game.chat.message_received` | `{session_id, content, cost_usd?: number}` | UIScene | Nyx (optional quest trigger) |
| `game.chat.stream_chunk` | `{session_id, delta}` | UIScene (from Nike relay) | (internal) |
| `game.chat.stream_complete` | `{session_id}` | UIScene | (internal) |
| `game.chat.command_executed` | `{command, result}` | CommandParser | (internal) |
| `game.chat.mode_changed` | `{from, to}` | UIScene | Helios-v2 (visual feedback) |

Log:

| Event | Fields |
|---|---|
| `chat.message.submitted` | `length`, `is_command`, `command_name` |
| `chat.command.dispatched` | `command`, `args`, `duration_ms` |
| `chat.ime.composition` | `duration_ms` (audit for Asian-language usability) |
| `chat.focus.arbitrated` | `react_owns`, `mode`, `phaser_keyboard_enabled` |
| `chat.typewriter.drained` | `session_id`, `chars_drained`, `buffer_remaining` |

## 6. File Path Convention

- UIScene: `src/game/scenes/UIScene.ts`
- Chat input wrapper: `src/game/ui/ChatInput.ts`
- Chat history renderer: `src/game/ui/ChatHistory.ts`
- Command parser: `src/game/ui/CommandParser.ts`
- Typewriter effect: `src/game/ui/TypewriterEffect.ts`
- Focus arbitration hook: `src/lib/focusArbitration.ts`
- Chat store: `src/stores/chatStore.ts`
- Chat CSS (CRT + phosphor aesthetic): `src/frontend/styles/chat.css`
- Tests: `tests/chat/test_ime_guard.spec.ts`, `test_focus_arbitration.spec.ts`, `test_command_parser.spec.ts`, `test_typewriter.spec.ts`, `test_history_recall.spec.ts`, `test_sse_resume.spec.ts`

## 7. Naming Convention

- Phaser Scene key: `UIScene`.
- DOM element ids: `nerium-chat`, `nerium-chat-history`, `nerium-chat-input` (kebab, nerium- prefix).
- CSS class names: `.nerium-chat`, `.nerium-chat__bar`, `.nerium-chat__history`, `.nerium-chat--hidden` BEM-style.
- Chat mode enum: `movement`, `chat`, `dialogue` lowercase.
- Command prefix: `/` single slash.
- Escape hatch prefix: `//` double slash sends literal.
- Game event names: `game.chat.<action>`.

## 8. Error Handling

- IME composition mid-Enter: check `input.dataset.composing === '1'` before submit; ignore Enter during composition.
- SSE reconnect fails beyond 5 retries: append system message `"Connection lost. Please retry or refresh."`; mark streaming message status `failed`.
- Command dispatch throws: catch + append system message with error; do not crash UIScene.
- DOMElement z-index below world sprites: fix via `chatRoot.style.zIndex = '10000'`; test with depth layers.
- Input overflow (2000+ char): truncate at maxlength; no overflow.
- Slash command injection (user types `/cancel` as literal content): use `//cancel` escape.
- Focus arbitration fails to disable Phaser keyboard: test manually; if persistent, check `scene.input.keyboard.enabled = false` applied across all active scenes.
- Typewriter buffer drift (delta arrival faster than drain): cap buffer at 5000 chars; additional drain rate 2x until caught up.
- Tab switch during stream: `visibilitychange` pauses typewriter; on resume, flush remaining buffer immediately.
- Ctrl+L intercept conflicts with browser URL focus: preventDefault properly scoped to chat input only.

## 9. Testing Surface

- IME composition: simulate Pinyin composition, Enter during compose does NOT submit; Enter after `compositionend` submits.
- Focus arbitration: click input field, `reactOwns=true`, world scene keyboard disabled; blur → re-enabled if `mode=movement`.
- Command parse: `/clear` clears messages; `/help` appends help text; `/model sonnet-4.6` updates uiStore.
- Unknown command: appends system message, does not send to MA.
- Escape hatch: `//fooobar` sends as literal `"/fooobar"` text.
- History recall: submit 3 messages, ArrowUp cycles through prior 3 inputs.
- Typewriter draining: deltas arrive at 300 cps, drain limited to 60 cps (with visible buffer).
- SSE reconnect: disconnect mid-stream at char 50, reconnect with `Last-Event-ID`, chars 51+ render without duplication.
- Mode transition: Esc in chat → back to movement; E in movement → dialogue.
- DOMElement depth: chat always visible above world sprites.
- UIScene persists across world transition: scene.start('CyberpunkScene') does not destroy UIScene.
- Ctrl+L clears messages without clearing browser URL.
- Visibility change: tab background paused typewriter; foreground resumes.

## 10. Open Questions

- BitmapText fallback for IME-unfriendly browsers: Safari macOS sometimes glitches. Ship with announcement "IME best on Chrome/Firefox" if edge case found; keep BitmapText fallback code behind `chat.bitmap_fallback` Hemera flag.
- Chat history persistence across sessions: sessionStorage at submission (per-tab). Post-hackathon: migrate to localStorage or server-side if user requests.
- Multiple concurrent MA sessions in chat (branching conversations): deferred post-hackathon; single active session at a time.

## 11. Post-Hackathon Refactor Notes

- BitmapText fallback mode for IME-glitchy browsers (Safari macOS historical IME bugs).
- Voice input (Whisper-based) for accessibility.
- Multi-session tabs (switch between MA sessions via `/session list` + `/session switch <id>`).
- Inline tool_use visualization (show tool name + partial input as it streams).
- Markdown rendering in messages (current plain text with basic line breaks).
- Attachment upload via drag-drop (calls `file_storage.contract.md` presigned flow).
- Chat export as Markdown/JSON for sharing.
- @mentions for multi-agent conversations (address specific agent by handle).
- Theme variants (current CRT green phosphor only).
- Accessibility: keyboard shortcut cheat-sheet modal via `/help keys`.
- Undo last message / edit-and-resend pattern.
