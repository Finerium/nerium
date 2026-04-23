'use client';

//
// src/components/hud/InventoryToast.tsx
//
// Framer Motion slide-in toast. Subscribes to
// `useInventoryStore.lastAwarded` via a narrow selector; when a new item
// lands the toast animates in, holds for `durationMs`, then dismisses via
// `clearLastAwarded()`.
//
// Reduced-motion: opacity swap only, no translate.
// Accessibility: `role="status"` with `aria-live="polite"`.
//

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

import { useT } from '../../lib/i18n';
import { useInventoryStore } from '../../stores/inventoryStore';
import { emitBusEvent } from '../../lib/hudBus';

const DEFAULT_DURATION_MS = 3200;

export interface InventoryToastProps {
  durationMs?: number;
}

export function InventoryToast({ durationMs = DEFAULT_DURATION_MS }: InventoryToastProps) {
  const lastAwarded = useInventoryStore((s) => s.lastAwarded);
  const clearLastAwarded = useInventoryStore((s) => s.clearLastAwarded);
  const reducedMotion = useReducedMotion();
  const t = useT();
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!lastAwarded) {
      setVisible(false);
      return;
    }
    setVisible(true);
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      setVisible(false);
      const clearId = window.setTimeout(() => {
        clearLastAwarded();
      }, 240);
      return () => window.clearTimeout(clearId);
    }, durationMs);
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [lastAwarded, durationMs, clearLastAwarded]);

  const handleDismiss = () => {
    setVisible(false);
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    clearLastAwarded();
  };

  const handleOpenInventory = () => {
    emitBusEvent('game.inventory.opened', { source: 'hotkey' });
  };

  return (
    <AnimatePresence>
      {visible && lastAwarded ? (
        <motion.div
          key={lastAwarded}
          className="pointer-events-auto fixed right-6 top-20 z-40 flex min-w-[14rem] items-center gap-3 rounded-md border border-success/60 bg-background/95 px-3 py-2 shadow-lg"
          role="status"
          aria-live="polite"
          data-hud-role="inventory-toast"
          initial={reducedMotion ? { opacity: 0 } : { opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: 24 }}
          transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <div
            className="flex h-8 w-8 items-center justify-center rounded-md border border-success/40 bg-success/10 font-mono text-xs text-success"
            aria-hidden="true"
          >
            +1
          </div>
          <div className="flex flex-1 flex-col font-mono text-xs">
            <span className="text-foreground/60 uppercase tracking-wider text-[10px]">
              {t('inventory.toast_label', { item: '' }).trim().replace(/\s*$/, '')}
            </span>
            <span className="text-sm font-semibold text-foreground">
              {lastAwarded}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="rounded-md border border-border bg-background/70 px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-foreground/70 hover:text-foreground hover:border-ring focus:outline-none focus:ring-2 focus:ring-ring"
              onClick={handleOpenInventory}
              aria-label={t('inventory.toast_opened')}
            >
              {t('inventory.toast_opened')}
            </button>
            <button
              type="button"
              className="rounded-md px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-foreground/50 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              onClick={handleDismiss}
              aria-label={t('inventory.toast_dismiss')}
            >
              {t('inventory.toast_dismiss')}
            </button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export default InventoryToast;
