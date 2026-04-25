//
// src/game/scenes/UIScene.ts
//
// Boreas NP W3 Session 1. Persistent overlay scene that hosts the Minecraft
// chat-style chrome (DOMElement input + scrollable history) on top of every
// world scene. Launched once via `scene.launch('UIScene')` from BootScene
// + brought to top via `scene.bringToTop('UIScene')`. Survives every
// `scene.start()` between world scenes (ApolloVillage -> CaravanRoad ->
// CyberpunkShanghai).
//
// Depth contract per chat_ui.contract.md Section 8: the chat root DOMElement
// container sits at z-index 10000 to clear Helios-v2 Layer 4 (foreground
// foliage at depth 9000 in canvas space). Phaser DOMElement containers
// render in HTML overlay above the canvas regardless of canvas depth so
// the z-index gate is the relevant axis.
//
// Focus arbitration FSM (movement | chat | dialogue):
//   - T key in movement -> open chat (set mode='chat', show overlay,
//     focus input).
//   - Esc in chat -> close (set mode='movement', hide overlay, blur
//     input).
//   - dialogue mode is owned by Linus (NPC dialogue tree); UIScene
//     observes it and ensures the chat overlay is hidden + DOMElement
//     not focused while a dialogue plays.
//
// Game event emissions (per game_event_bus.contract.md v0.2.0):
//   - game.chat.opened
//   - game.chat.closed
//   - game.chat.mode_changed
//   - game.chat.message_submitted
//   - game.chat.command_executed
//
// No em dash, no emoji per CLAUDE.md anti-patterns.
//

import * as Phaser from 'phaser';
import {
  newChatMessageId,
  useChatStore,
  type ChatMode,
} from '../../stores/chatStore';
import { createChatHistory, type ChatHistoryHandle } from '../ui/ChatHistory';
import { createChatInput, type ChatInputHandle } from '../ui/ChatInput';
import { parseAndDispatch, type CommandParserCallbacks } from '../ui/CommandParser';
import { attachTypewriter, type TypewriterHandle } from '../ui/TypewriterEffect';
import {
  createBuilderSession,
  openBuilderStream,
  type BuilderStreamHandle,
} from '../ui/BuilderStreamConsumer';

const SCENE_KEY = 'UIScene';
const CHAT_ROOT_ID = 'nerium-chat';

export class UIScene extends Phaser.Scene {
  private chatRoot?: HTMLElement;
  private historyHandle?: ChatHistoryHandle;
  private inputHandle?: ChatInputHandle;
  private domElement?: Phaser.GameObjects.DOMElement;
  private tKey?: Phaser.Input.Keyboard.Key;
  private modeUnsub?: () => void;
  private resizeListener?: () => void;
  private typewriter?: TypewriterHandle;
  private activeBuilderStream?: BuilderStreamHandle;

  constructor() {
    super({ key: SCENE_KEY } satisfies Phaser.Types.Scenes.SettingsConfig);
  }

  create(): void {
    // Hydrate persisted history + messages from sessionStorage on first
    // create. Idempotent on re-create (Phaser may re-create UIScene on
    // dev-server hot reload).
    useChatStore.getState().hydrateFromSession();

    // Build the chat root DOM tree. The root holds two children: the
    // history container and the input bar. Hidden by default (mode starts
    // at 'movement'); T key reveals.
    const chatRoot = document.createElement('div');
    chatRoot.id = CHAT_ROOT_ID;
    chatRoot.className = 'nerium-chat nerium-chat--hidden';
    chatRoot.setAttribute('data-nerium-capture', 'true');
    // z-index above Phaser canvas + Helios-v2 Layer 4 foliage.
    chatRoot.style.zIndex = '10000';
    this.chatRoot = chatRoot;

    this.historyHandle = createChatHistory();
    chatRoot.appendChild(this.historyHandle.root);

    const callbacks: CommandParserCallbacks = {
      onModelChange: async (model) => {
        // Persist model preference in a window-level slot. Session 2 also
        // POSTs to Kratos `/v1/ma/sessions/{id}/model` if a session is
        // active; otherwise just records the preference for the next
        // /builder spawn.
        if (typeof window !== 'undefined') {
          (window as unknown as Record<string, unknown>).__NERIUM_MODEL_PREF__ = model;
        }
        const active = useChatStore.getState().active_session_id;
        if (!active) return;
        try {
          await fetch(`/v1/ma/sessions/${encodeURIComponent(active)}/model`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model }),
          });
        } catch (err) {
          console.warn('[UIScene] model switch fetch failed', err);
        }
      },
      onBuilder: async (prompt) => {
        const initial = (prompt && prompt.trim().length > 0)
          ? prompt
          : 'Help me start a Builder session.';
        // Surface a system message so users see Builder spawning before
        // SSE traffic arrives.
        useChatStore.getState().appendMessage({
          id: newChatMessageId(),
          role: 'system',
          content: 'Spawning Builder session...',
          timestamp: new Date().toISOString(),
        });
        const model =
          ((typeof window !== 'undefined'
            ? (window as unknown as Record<string, unknown>).__NERIUM_MODEL_PREF__
            : undefined) as string | undefined) ?? 'opus-4.7';
        const result = await createBuilderSession({ initial_prompt: initial, model });
        this.activeBuilderStream?.close();
        this.activeBuilderStream = openBuilderStream(result.session_id, {
          onSessionStarted: () => {
            this.game.events.emit('game.chat.stream_chunk', {
              session_id: result.session_id,
              delta: '',
            });
          },
          onSessionEnded: (stop) => {
            this.game.events.emit('game.chat.stream_complete', { session_id: result.session_id });
            useChatStore.getState().appendMessage({
              id: newChatMessageId(),
              role: 'system',
              content: stop ? `Session ended (${stop}).` : 'Session ended.',
              timestamp: new Date().toISOString(),
              session_id: result.session_id,
            });
          },
          onError: (err) => {
            useChatStore.getState().appendMessage({
              id: newChatMessageId(),
              role: 'system',
              content: `Session error: ${err.message}`,
              timestamp: new Date().toISOString(),
              session_id: result.session_id,
            });
          },
        });
        useChatStore.getState().setActiveSession(result.session_id);
      },
      onCancel: async () => {
        const active = useChatStore.getState().active_session_id;
        if (!active) {
          useChatStore.getState().appendMessage({
            id: newChatMessageId(),
            role: 'system',
            content: 'No active session to cancel.',
            timestamp: new Date().toISOString(),
          });
          return;
        }
        try {
          await fetch(`/v1/ma/sessions/${encodeURIComponent(active)}/cancel`, {
            method: 'POST',
            credentials: 'include',
          });
        } catch (err) {
          console.warn('[UIScene] cancel fetch failed', err);
        }
        this.activeBuilderStream?.close();
        this.activeBuilderStream = undefined;
        useChatStore.getState().finishStream(active);
        useChatStore.getState().setActiveSession(null);
        useChatStore.getState().appendMessage({
          id: newChatMessageId(),
          role: 'system',
          content: 'Session cancelled.',
          timestamp: new Date().toISOString(),
        });
      },
      onSave: async () => {
        const active = useChatStore.getState().active_session_id;
        if (!active) {
          useChatStore.getState().appendMessage({
            id: newChatMessageId(),
            role: 'system',
            content: 'No active session to save.',
            timestamp: new Date().toISOString(),
          });
          return;
        }
        const res = await fetch(`/v1/ma/sessions/${encodeURIComponent(active)}/save`, {
          method: 'POST',
          credentials: 'include',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        useChatStore.getState().appendMessage({
          id: newChatMessageId(),
          role: 'system',
          content: 'Session saved.',
          timestamp: new Date().toISOString(),
          session_id: active,
        });
      },
      onToolsList: async () => {
        const res = await fetch('/v1/ma/tools', { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.json();
        const tools = Array.isArray(body?.tools) ? body.tools : [];
        const names = tools
          .map((t: unknown) =>
            typeof t === 'object' && t !== null && 'name' in t
              ? String((t as Record<string, unknown>).name)
              : '',
          )
          .filter((n: string) => n.length > 0);
        useChatStore.getState().appendMessage({
          id: newChatMessageId(),
          role: 'system',
          content: names.length > 0 ? `Tools: ${names.join(', ')}` : 'No tools registered.',
          timestamp: new Date().toISOString(),
        });
      },
      onBudgetShow: async () => {
        const res = await fetch('/v1/billing/budget', { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.json();
        const spent = typeof body?.spent_usd_today === 'number' ? body.spent_usd_today : null;
        const cap = typeof body?.cap_usd_today === 'number' ? body.cap_usd_today : null;
        const summary =
          spent !== null && cap !== null
            ? `Daily spend: $${spent.toFixed(2)} of $${cap.toFixed(2)}`
            : 'Budget data unavailable.';
        useChatStore.getState().appendMessage({
          id: newChatMessageId(),
          role: 'system',
          content: summary,
          timestamp: new Date().toISOString(),
        });
      },
    };

    this.inputHandle = createChatInput({
      onSubmit: (content) => this.handleSubmit(content),
      onEscape: () => this.closeChat('esc'),
      onCommand: (raw) => this.handleCommand(raw, callbacks),
    });
    chatRoot.appendChild(this.inputHandle.root);

    // Mount as a Phaser DOMElement at viewport-bottom-center. The
    // GameObjects.DOMElement positions the wrapper relative to scene
    // origin; we set scrollFactor 0 + setOrigin(0.5, 1) so the chat sticks
    // to the camera regardless of world scroll.
    const cam = this.cameras.main;
    const x = cam.width / 2;
    const y = cam.height - 24;
    this.domElement = this.add.dom(x, y, chatRoot);
    this.domElement.setOrigin(0.5, 1);
    this.domElement.setScrollFactor(0);
    this.domElement.setDepth(10000);

    // T key toggles chat open. Phaser keyboard plugin is enabled on
    // UIScene at all times (focusArbitration exempts UIScene by key).
    this.tKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.T);
    this.input.keyboard?.on('keydown-T', this.onTKey, this);

    // Subscribe to mode changes so the overlay visibility + Phaser
    // keyboard arbitration both react when other systems set the mode
    // (e.g. dialogue open from NPC interaction).
    this.modeUnsub = useChatStore.subscribe(
      (s) => s.mode,
      (mode) => this.onModeChanged(mode),
      { fireImmediately: false },
    );

    // Keep DOMElement positioned on viewport resize (Next.js + Phaser
    // RESIZE scale mode can change cam.width/height between frames).
    this.resizeListener = () => {
      if (!this.domElement) return;
      const c = this.cameras.main;
      this.domElement.setPosition(c.width / 2, c.height - 24);
    };
    this.scale.on('resize', this.resizeListener);

    // Boreas Session 2: attach the typewriter drain so SSE deltas surface
    // at 60 cps default. The typewriter reads chatStore.streaming_buffer
    // and promotes drained chars onto the matching streaming assistant
    // message.
    this.typewriter = attachTypewriter(this);

    // Cleanup on shutdown.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.cleanup());

    // Expose a Playwright readiness signal so smoke tests can poll until
    // UIScene mounted. Mirror Helios-v2 + scene-art conventions
    // (window.__NERIUM_TEST__).
    if (typeof window !== 'undefined') {
      const w = window as unknown as Record<string, unknown>;
      const existing = (w.__NERIUM_TEST__ ?? {}) as Record<string, unknown>;
      w.__NERIUM_TEST__ = {
        ...existing,
        uiSceneReady: true,
      };
    }

    // Emit scene ready so wave-3 integrators (Helios-v2, Marshall, Nyx)
    // can subscribe.
    this.game.events.emit('game.scene.ready', { sceneKey: SCENE_KEY });
  }

  // ---- Mode FSM transitions ----

  private onTKey(): void {
    const mode = useChatStore.getState().mode;
    if (mode !== 'movement') return;
    this.openChat();
  }

  private openChat(): void {
    const prev = useChatStore.getState().mode;
    if (prev === 'chat') return;
    useChatStore.getState().setMode('chat');
    this.showOverlay();
    this.inputHandle?.focus();
    this.game.events.emit('game.chat.opened', {});
    this.game.events.emit('game.chat.mode_changed', { from: prev, to: 'chat' });
  }

  private closeChat(reason: 'esc' | 'submit' | 'command'): void {
    const prev = useChatStore.getState().mode;
    // Closing chat returns to movement, never to dialogue. Dialogue mode
    // is exited via dialogue-tree end (Linus).
    if (prev !== 'chat') return;
    useChatStore.getState().setMode('movement');
    this.hideOverlay();
    this.inputHandle?.blur();
    this.game.events.emit('game.chat.closed', { reason });
    this.game.events.emit('game.chat.mode_changed', { from: prev, to: 'movement' });
  }

  private onModeChanged(mode: ChatMode): void {
    // External mutators (e.g. dialogue NPC interact) drive the FSM; the
    // overlay should mirror the mode without re-firing chat.opened/closed
    // (those events are scoped to UIScene-initiated transitions only).
    if (mode === 'chat') {
      this.showOverlay();
      this.inputHandle?.focus();
    } else {
      this.hideOverlay();
      this.inputHandle?.blur();
    }
  }

  private showOverlay(): void {
    if (!this.chatRoot) return;
    this.chatRoot.classList.remove('nerium-chat--hidden');
    this.chatRoot.classList.add('nerium-chat--visible');
  }

  private hideOverlay(): void {
    if (!this.chatRoot) return;
    this.chatRoot.classList.remove('nerium-chat--visible');
    this.chatRoot.classList.add('nerium-chat--hidden');
  }

  // ---- Submit + command paths ----

  private handleSubmit(content: string): void {
    // Append user message immediately (optimistic). Session 2 forwards to
    // Nike SSE for MA session streaming; Session 1 just echoes locally.
    useChatStore.getState().appendMessage({
      id: newChatMessageId(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    });
    this.game.events.emit('game.chat.message_submitted', { content });
    // Stay in chat mode after submit (parity with Minecraft + Discord
    // chat). Esc returns to movement.
  }

  private async handleCommand(raw: string, callbacks: CommandParserCallbacks): Promise<void> {
    // Echo the command itself so users see what they typed.
    useChatStore.getState().appendMessage({
      id: newChatMessageId(),
      role: 'command',
      content: raw,
      timestamp: new Date().toISOString(),
    });
    try {
      const cmd = await parseAndDispatch(raw, callbacks);
      this.game.events.emit('game.chat.command_executed', {
        command: cmd.cmd,
        result: 'ok',
      });
      if (cmd.cmd === 'clear') {
        // Clear path may have wiped the user's command echo; do not need
        // additional action here.
      }
    } catch (err) {
      console.error('[UIScene] command dispatch threw', err);
      useChatStore.getState().appendMessage({
        id: newChatMessageId(),
        role: 'system',
        content: `Command failed: ${(err as Error).message ?? 'unknown error'}`,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // ---- Cleanup ----

  private cleanup(): void {
    try {
      this.modeUnsub?.();
    } catch (err) {
      console.warn('[UIScene] modeUnsub threw', err);
    }
    this.modeUnsub = undefined;

    if (this.resizeListener) {
      try {
        this.scale.off('resize', this.resizeListener);
      } catch {
        // ignore
      }
      this.resizeListener = undefined;
    }

    try {
      this.input.keyboard?.off('keydown-T', this.onTKey, this);
    } catch {
      // ignore
    }

    try {
      this.historyHandle?.destroy();
    } catch (err) {
      console.warn('[UIScene] history destroy threw', err);
    }
    this.historyHandle = undefined;

    try {
      this.inputHandle?.destroy();
    } catch (err) {
      console.warn('[UIScene] input destroy threw', err);
    }
    this.inputHandle = undefined;

    try {
      this.domElement?.destroy();
    } catch (err) {
      console.warn('[UIScene] domElement destroy threw', err);
    }
    this.domElement = undefined;

    try {
      this.typewriter?.destroy();
    } catch (err) {
      console.warn('[UIScene] typewriter destroy threw', err);
    }
    this.typewriter = undefined;

    try {
      this.activeBuilderStream?.close();
    } catch (err) {
      console.warn('[UIScene] builder stream close threw', err);
    }
    this.activeBuilderStream = undefined;

    if (this.chatRoot && this.chatRoot.parentNode) {
      this.chatRoot.parentNode.removeChild(this.chatRoot);
    }
    this.chatRoot = undefined;

    if (typeof window !== 'undefined') {
      const w = window as unknown as Record<string, unknown>;
      const existing = (w.__NERIUM_TEST__ ?? {}) as Record<string, unknown>;
      w.__NERIUM_TEST__ = {
        ...existing,
        uiSceneReady: false,
      };
    }
  }
}

export const UI_SCENE_KEY = SCENE_KEY;
