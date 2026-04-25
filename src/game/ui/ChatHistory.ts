//
// src/game/ui/ChatHistory.ts
//
// Boreas NP W3 Session 1. Scrollable DOM `<div>` that renders the chatStore
// `messages` array as styled bubbles (Minecraft chat aesthetic, CRT
// phosphor + VT323 pixel headline + Space Grotesk body per Marshall +
// Helios-v2 palette authority).
//
// Subscribes to `useChatStore.subscribe(s => s.messages, render)` with
// fireImmediately:false. UIScene cleans the subscription up on
// Phaser.Scenes.Events.SHUTDOWN.
//
// Auto-scrolls to bottom on new message via `scrollTop = scrollHeight`.
//
// No em dash, no emoji per CLAUDE.md anti-patterns.
//

import { useChatStore, type ChatMessage } from '../../stores/chatStore';

const HISTORY_DOM_ID = 'nerium-chat-history';

export interface ChatHistoryHandle {
  root: HTMLElement;
  destroy(): void;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderMessage(msg: ChatMessage): string {
  const role = msg.role;
  const content = escapeHtml(msg.content ?? '');
  const streaming = msg.streaming ? ' nerium-chat__msg--streaming' : '';
  // Role-specific class lets chat.css scope colors per role.
  return `
    <div class="nerium-chat__msg nerium-chat__msg--${role}${streaming}" data-msg-id="${escapeHtml(msg.id)}">
      <span class="nerium-chat__msg-role">${role}</span>
      <span class="nerium-chat__msg-content">${content}</span>
    </div>`;
}

/**
 * Build the chat history container, attach the chatStore subscription, and
 * return a handle the UIScene can detach on shutdown.
 *
 * The container is created without a parent. The caller (ChatInput +
 * UIScene) is responsible for inserting it into the chat root element.
 */
export function createChatHistory(): ChatHistoryHandle {
  const root = document.createElement('div');
  root.id = HISTORY_DOM_ID;
  root.className = 'nerium-chat__history';
  root.setAttribute('role', 'log');
  root.setAttribute('aria-live', 'polite');
  // Mark as data-nerium-capture so tab order tooling and focusArbitration
  // recognise this region as part of the chat surface.
  root.setAttribute('data-nerium-capture', 'true');

  function render(messages: ChatMessage[]): void {
    if (messages.length === 0) {
      root.innerHTML = `
        <div class="nerium-chat__msg nerium-chat__msg--system">
          <span class="nerium-chat__msg-role">system</span>
          <span class="nerium-chat__msg-content">Press T to chat. Type / for commands.</span>
        </div>`;
      return;
    }
    root.innerHTML = messages.map(renderMessage).join('');
    // Auto-scroll to newest message.
    root.scrollTop = root.scrollHeight;
  }

  // Initial paint.
  render(useChatStore.getState().messages);

  // Subscribe to messages slice. subscribeWithSelector ensures we only
  // re-render when the array reference changes (i.e. appendMessage,
  // clearMessages, finishStream).
  const unsubMessages = useChatStore.subscribe(
    (s) => s.messages,
    (next) => render(next),
    { fireImmediately: false },
  );

  // Stream buffer drain (Session 2 typewriter will tick this; for Session 1
  // we render the buffer as a transient appendage on the streaming message
  // so users see partial deltas even before the typewriter scheduler ships).
  const unsubBuffer = useChatStore.subscribe(
    (s) => s.streaming_buffer,
    () => {
      // Re-render messages when buffer changes so the in-flight assistant
      // bubble shows the latest partial content. Cheap because messages
      // array reference is stable; only inner HTML rewrites.
      render(useChatStore.getState().messages);
    },
    { fireImmediately: false },
  );

  return {
    root,
    destroy() {
      try {
        unsubMessages();
        unsubBuffer();
      } catch (err) {
        console.warn('[ChatHistory] destroy threw on unsubscribe', err);
      }
      if (root.parentNode) root.parentNode.removeChild(root);
    },
  };
}
