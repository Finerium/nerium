//
// src/game/ui/ChatInput.ts
//
// Boreas NP W3 Session 1. Native HTML input wrapper used by UIScene as the
// primary text entry surface for the Minecraft chat. Mounted via
// Phaser.GameObjects.DOMElement (`scene.add.dom`) so the canvas-based
// game has a real <input type="text"> beneath the chat history bubbles.
//
// IME composition guard (CRITICAL for Indonesian + Chinese + Japanese
// users per NarasiGhaisan Section 5 Indonesian audience priority):
//   - compositionstart sets `data-composing="1"`.
//   - compositionend sets `data-composing="0"` BEFORE the Enter listener
//     has a chance to read the flag. Browsers fire compositionend slightly
//     before the keydown that committed the composition, but Chromium
//     ordering can be inverted. We additionally guard with
//     `event.isComposing` (DOM Level 3) which is true for the keydown
//     that commits the IME composition.
//   - Enter is only treated as submit when both `data-composing === '0'`
//     AND `event.isComposing === false`.
//
// Slash command escape: `//foo` strips the leading slash and submits
// `/foo` as plain content (per chat_ui.contract.md Section 7).
//
// Ctrl+L clears messages without clobbering browser URL focus
// (preventDefault scoped to chat input; cooperates with focusArbitration
// to ensure the global Ctrl+L browser behaviour does not fire).
//
// No em dash, no emoji per CLAUDE.md anti-patterns.
//

import { newChatMessageId, useChatStore } from '../../stores/chatStore';

const INPUT_DOM_ID = 'nerium-chat-input';

export interface ChatInputCallbacks {
  /**
   * Fired when the user submits a non-command message (Enter key with text,
   * IME not composing). The UIScene wires this to either dispatch a
   * `game.chat.message_submitted` event (for MA session) or echo as a user
   * message in chat history.
   */
  onSubmit(content: string): void;

  /**
   * Fired when the user presses Esc inside the input. UIScene closes the
   * chat surface (sets mode to 'movement', blurs input).
   */
  onEscape(): void;

  /**
   * Fired when the user types a slash-prefixed command (after the
   * double-slash escape check). UIScene dispatches via CommandParser.
   */
  onCommand(raw: string): void;
}

export interface ChatInputHandle {
  root: HTMLElement;
  inputEl: HTMLInputElement;
  focus(): void;
  blur(): void;
  isComposing(): boolean;
  /**
   * Helios-v2 W3 S8: swap the chat avatar portrait. Used by NPC dialogue
   * triggers to display the active speaker's portrait (Treasurer prompt
   * 64, Apollo priest prompt 65, Caravan/Synth vendor prompts 66) while
   * the NPC is talking, then restored to the default player portrait
   * (prompt 59) when the dialogue ends.
   *
   * Pass null or empty string to hide the portrait entirely (legacy
   * pre-S8 behaviour). Pass a public asset URL like
   * `/assets/ai/characters/treasurer_portrait.png` to swap.
   *
   * The implementation is a no-op-friendly DOM <img> that lives in the
   * chat bar. It does NOT couple to the dialogue runtime; downstream
   * consumers ferry the appropriate portrait path as part of their
   * dialogue lifecycle.
   */
  setAvatarPng(path: string | null): void;
  destroy(): void;
}

/**
 * Build the chat input row (prompt sigil + native HTML input). The caller
 * inserts the returned root element into the chat surface DOM tree. The
 * returned handle exposes `focus()` + `blur()` for UIScene mode
 * transitions.
 */
export function createChatInput(callbacks: ChatInputCallbacks): ChatInputHandle {
  const root = document.createElement('div');
  root.className = 'nerium-chat__bar';
  root.setAttribute('data-nerium-capture', 'true');

  // Helios-v2 W3 S8: avatar portrait img. Hidden by default; setAvatarPng
  // toggles visibility + src. Sits to the LEFT of the > prompt sigil so
  // when an NPC is the active speaker the user sees the NPC face beside
  // their dialogue line.
  const avatar = document.createElement('img');
  avatar.className = 'nerium-chat__avatar';
  avatar.alt = '';
  avatar.style.display = 'none';
  avatar.style.width = '32px';
  avatar.style.height = '32px';
  avatar.style.borderRadius = '4px';
  avatar.style.marginRight = '6px';
  avatar.style.imageRendering = 'pixelated';
  avatar.setAttribute('aria-hidden', 'true');
  root.appendChild(avatar);

  const prompt = document.createElement('span');
  prompt.className = 'nerium-chat__prompt';
  prompt.textContent = '>';
  root.appendChild(prompt);

  const inputEl = document.createElement('input');
  inputEl.id = INPUT_DOM_ID;
  inputEl.type = 'text';
  inputEl.maxLength = 2000;
  inputEl.autocomplete = 'off';
  inputEl.setAttribute('autocorrect', 'off');
  inputEl.setAttribute('autocapitalize', 'off');
  inputEl.spellcheck = false;
  inputEl.lang = 'auto';
  inputEl.setAttribute('aria-label', 'Chat input');
  inputEl.className = 'nerium-chat__input';
  inputEl.dataset.composing = '0';
  // Initial placeholder reads as a hint without crowding the chat history.
  inputEl.placeholder = 'Press T to chat. Type / for commands. Esc to close.';
  root.appendChild(inputEl);

  // ---- IME composition guard ----
  function onCompositionStart(): void {
    inputEl.dataset.composing = '1';
  }
  function onCompositionEnd(): void {
    inputEl.dataset.composing = '0';
  }
  inputEl.addEventListener('compositionstart', onCompositionStart);
  inputEl.addEventListener('compositionend', onCompositionEnd);

  // ---- Live input mirror to chatStore ----
  function onInputChange(): void {
    useChatStore.getState().setInput(inputEl.value);
  }
  inputEl.addEventListener('input', onInputChange);

  // ---- Keydown handler (Enter / Esc / ArrowUp / ArrowDown / Ctrl+L) ----
  function onKeyDown(e: KeyboardEvent): void {
    const key = e.key;
    const composing =
      inputEl.dataset.composing === '1' || (e as KeyboardEvent).isComposing === true;

    if (key === 'Enter') {
      // CRITICAL IME GUARD: ignore Enter while composing.
      if (composing) return;
      e.preventDefault();
      const raw = inputEl.value;
      const trimmed = raw.trim();
      if (trimmed.length === 0) return;

      // Push to history before clearing (history-recall behaviour matches
      // bash: every non-empty submission is recallable).
      useChatStore.getState().pushHistory(trimmed);
      inputEl.value = '';
      useChatStore.getState().setInput('');

      if (trimmed.startsWith('//')) {
        // Escape hatch: literal slash. Send rest as plain content.
        callbacks.onSubmit(trimmed.slice(1));
      } else if (trimmed.startsWith('/')) {
        callbacks.onCommand(trimmed);
      } else {
        callbacks.onSubmit(trimmed);
      }
      return;
    }

    if (key === 'Escape') {
      e.preventDefault();
      callbacks.onEscape();
      return;
    }

    if (key === 'ArrowUp') {
      // History recall toward older entries. Skip when IME is composing
      // (some IMEs use ArrowUp for candidate navigation).
      if (composing) return;
      e.preventDefault();
      const recalled = useChatStore.getState().recallHistory(-1);
      inputEl.value = recalled;
      // Move cursor to end after recall.
      requestAnimationFrame(() => {
        inputEl.setSelectionRange(recalled.length, recalled.length);
      });
      return;
    }

    if (key === 'ArrowDown') {
      if (composing) return;
      e.preventDefault();
      const recalled = useChatStore.getState().recallHistory(1);
      inputEl.value = recalled;
      requestAnimationFrame(() => {
        inputEl.setSelectionRange(recalled.length, recalled.length);
      });
      return;
    }

    if (e.ctrlKey && (key === 'l' || key === 'L')) {
      // Ctrl+L: clear chat messages. preventDefault here because the chat
      // input has focus, so the browser's Ctrl+L (URL bar) would not have
      // fired anyway; we still preventDefault for safety + to keep the
      // input value intact.
      e.preventDefault();
      useChatStore.getState().clearMessages();
      // Append a system confirmation so the user sees feedback.
      useChatStore.getState().appendMessage({
        id: newChatMessageId(),
        role: 'system',
        content: 'Chat cleared.',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Any other key (printable text, Backspace, Tab, etc.) bubbles up to
    // the input element's default behaviour. We do not stopPropagation to
    // let the browser handle it.
  }
  inputEl.addEventListener('keydown', onKeyDown);

  return {
    root,
    inputEl,
    focus(): void {
      // Focus must happen on a microtask so the parent DOMElement is fully
      // attached before the browser tries to focus.
      queueMicrotask(() => {
        try {
          inputEl.focus({ preventScroll: true });
        } catch {
          inputEl.focus();
        }
      });
    },
    blur(): void {
      try {
        inputEl.blur();
      } catch {
        // ignore blur exceptions (some headless browsers)
      }
    },
    isComposing(): boolean {
      return inputEl.dataset.composing === '1';
    },
    setAvatarPng(path: string | null): void {
      // Helios-v2 W3 S8: swap the chat avatar portrait. Empty / null hides
      // the avatar (legacy pre-S8 behaviour). Path shows the avatar with
      // the given URL.
      if (!path) {
        avatar.style.display = 'none';
        avatar.removeAttribute('src');
        avatar.alt = '';
        return;
      }
      avatar.src = path;
      avatar.alt = 'Speaker portrait';
      avatar.style.display = 'inline-block';
    },
    destroy(): void {
      try {
        inputEl.removeEventListener('compositionstart', onCompositionStart);
        inputEl.removeEventListener('compositionend', onCompositionEnd);
        inputEl.removeEventListener('input', onInputChange);
        inputEl.removeEventListener('keydown', onKeyDown);
      } catch (err) {
        console.warn('[ChatInput] destroy threw', err);
      }
      if (root.parentNode) root.parentNode.removeChild(root);
    },
  };
}
