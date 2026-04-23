'use client';

//
// src/components/hud/CurrencyDisplay.tsx
//
// TopBar HUD widget. Shows in-game balance in the active currency (USD/IDR)
// with a compact toggle. Renders via narrow selectors over
// `useInventoryStore.currency` and `useUIPreferencesStore.language`.
//
// Formatter inheritance (translator_notes gotcha 10): all currency strings
// come from `formatCurrency` in `app/banking/meter/cost_ticker.ts`. This
// module does NOT re-implement `Intl.NumberFormat`; drift between
// LiveCostMeter and CurrencyDisplay would break Nemea-v1 integration path 2.
//
// i18n: locale label pulled via `useT` from `src/lib/i18n.ts`. Balance
// numerals stay in the currency formatter's locale; only the surrounding
// chrome (label, aria) follows UI preferences.
//
// Framer Motion animation respects `prefers-reduced-motion` (translator_notes
// gotcha 15 inheritance: minimum 7 sites across the HUD).
//

import { useMemo } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

import { formatCurrency } from '../../../app/banking/meter/cost_ticker';
import { useInventoryStore } from '../../stores/inventoryStore';
import { useUIPreferencesStore } from '../../stores/uiStore';
import { useT } from '../../lib/i18n';
import type { CurrencyCode } from '../../state/types';

interface CurrencyDisplayProps {
  compact?: boolean;
}

export function CurrencyDisplay({ compact = false }: CurrencyDisplayProps) {
  const usd = useInventoryStore((s) => s.currency.USD);
  const idr = useInventoryStore((s) => s.currency.IDR);
  const language = useUIPreferencesStore((s) => s.language);
  const reducedMotion = useReducedMotion();
  const t = useT();

  // Active currency follows language: id-ID -> IDR surface primary.
  // USD/IDR toggle is explicit via the button below; this default mapping is
  // what the RV demo opens with.
  const activeCurrency: CurrencyCode = language === 'id-ID' ? 'IDR' : 'USD';

  const displayed = useMemo(() => {
    // Source of truth: USD balance. `formatCurrency` handles USD->IDR static
    // conversion per cost_ticker ADR 004 when the caller asks for IDR.
    if (activeCurrency === 'USD') {
      return formatCurrency(usd, 'USD').formatted;
    }
    // If the IDR slot carries a nonzero override, prefer it. Otherwise convert
    // from USD via the cost_ticker helper so the two slots never drift.
    if (idr > 0) {
      return formatCurrency(idr / 1, 'IDR').formatted.replace(/Rp\s?/, 'Rp ');
    }
    return formatCurrency(usd, 'IDR').formatted;
  }, [usd, idr, activeCurrency]);

  return (
    <div
      className="flex items-center gap-2 font-mono text-xs text-foreground/90"
      aria-label={t('currency.label')}
      data-hud-role="currency-display"
    >
      <span className="uppercase tracking-wider text-foreground/50">
        {t('currency.label')}
      </span>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={`${activeCurrency}:${displayed}`}
          className="rounded-md border border-border bg-background/80 px-2 py-1 text-sm font-semibold tabular-nums text-primary"
          initial={reducedMotion ? false : { opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
          transition={{ duration: 0.15, ease: [0.2, 0.8, 0.2, 1] }}
        >
          {displayed}
        </motion.span>
      </AnimatePresence>
      {!compact ? (
        <span
          className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] uppercase tracking-wider text-foreground/60"
          aria-hidden="true"
        >
          {activeCurrency === 'USD'
            ? t('currency.symbol_usd')
            : t('currency.symbol_idr')}
        </span>
      ) : null}
    </div>
  );
}

export default CurrencyDisplay;
