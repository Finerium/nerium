'use client';

//
// src/components/hud/BottomBar.tsx
//
// Bottom strip of the HUD. Hosts two slots:
//   left:  DialogueOverlay slot (Linus authored, composed via slot prop)
//   right: PromptInputChallenge slot (Erato-v2 authored)
//
// The two slots share vertical space. When a dialogue is active the left
// slot expands; otherwise a helper prompt is shown to nudge the player.
// Cross-pillar composition via slot prop per translator_notes gotcha 16.
//
// An interact prompt banner ("Press E to talk to Apollo") surfaces above
// both slots when `useUIStore.interactPromptVisible` is true. Contract
// source: game_state.contract.md v0.1.0 Section 3.4.
//

import type { ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

import { useT } from '../../lib/i18n';
import { useUIStore } from '../../stores/uiStore';

export interface BottomBarProps {
  dialogueSlot?: ReactNode;
  promptInputSlot?: ReactNode;
}

export function BottomBar({ dialogueSlot, promptInputSlot }: BottomBarProps) {
  const interactPromptVisible = useUIStore((s) => s.interactPromptVisible);
  const interactPromptLabel = useUIStore((s) => s.interactPromptLabel);
  const overlay = useUIStore((s) => s.overlay);
  const t = useT();
  const reducedMotion = useReducedMotion();

  const dialogueActive = overlay === 'dialogue';

  return (
    <motion.footer
      className="pointer-events-auto flex flex-col gap-2 border-t border-border bg-background/85 p-3 backdrop-blur-sm"
      data-hud-role="bottom-bar"
      data-dialogue-active={dialogueActive ? 'true' : undefined}
      initial={reducedMotion ? false : { y: 16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <AnimatePresence>
        {interactPromptVisible ? (
          <motion.div
            key="interact-prompt"
            className="pointer-events-none self-center rounded-full border border-primary/60 bg-primary/10 px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-primary"
            role="status"
            aria-live="polite"
            initial={reducedMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
          >
            {interactPromptLabel}
          </motion.div>
        ) : null}
      </AnimatePresence>
      <div
        className="grid gap-3 md:grid-cols-[1.4fr_1fr]"
        data-hud-role="bottom-bar-grid"
      >
        <section
          className="min-h-[6rem] rounded-md border border-border bg-background/70 p-3"
          data-hud-role="dialogue-slot"
          aria-label="Dialogue overlay slot"
        >
          {dialogueSlot ?? (
            <p className="font-mono text-xs text-foreground/60">
              {t('bottombar.dialogue_placeholder')}
            </p>
          )}
        </section>
        <section
          data-hud-role="prompt-input-slot"
          aria-label="Prompt input slot"
        >
          {promptInputSlot}
        </section>
      </div>
    </motion.footer>
  );
}

export default BottomBar;
