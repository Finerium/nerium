'use client';

//
// src/components/hud/TopBar.tsx
//
// Top strip of the HUD. Three cells:
//   left:   NERIUM logo + minimap label (Apollo Village)
//   center: QuestTracker slot (Nyx authored, composed via slot prop)
//   right:  CurrencyDisplay + language toggle
//
// Cross-pillar elements are injected via `ReactNode` slot props per
// translator_notes gotcha 16 (AdvisorChat `multiVendorPanelSlot` pattern).
// Erato-v2 never imports Nyx's QuestTracker directly here; GameHUD is the
// single mount point that composes the cross-pillar graph.
//
// Framer Motion transitions honor `prefers-reduced-motion` (translator_notes
// gotcha 15).
//

import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

import { useT } from '../../lib/i18n';
import { useUIPreferencesStore } from '../../stores/uiStore';
import CurrencyDisplay from './CurrencyDisplay';

export interface TopBarProps {
  questTrackerSlot?: ReactNode;
  minimapSlot?: ReactNode;
  tierBadgeSlot?: ReactNode;
}

export function TopBar({ questTrackerSlot, minimapSlot, tierBadgeSlot }: TopBarProps) {
  const language = useUIPreferencesStore((s) => s.language);
  const toggleLanguage = useUIPreferencesStore((s) => s.toggleLanguage);
  const t = useT();
  const reducedMotion = useReducedMotion();

  const shortEn = t('language.en_short');
  const shortId = t('language.id_short');

  return (
    <motion.header
      className="pointer-events-auto flex h-14 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur-sm"
      data-hud-role="top-bar"
      role="banner"
      initial={reducedMotion ? false : { y: -16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <div className="flex items-center gap-3">
        <span
          className="font-mono text-sm font-semibold uppercase tracking-[0.22em] text-primary"
          aria-label="NERIUM"
        >
          NERIUM
        </span>
        <span className="hidden h-4 w-px bg-border md:block" aria-hidden="true" />
        <div
          className="hidden items-center gap-2 font-mono text-[11px] text-foreground/60 md:flex"
          data-hud-role="minimap"
        >
          {minimapSlot ?? (
            <span className="rounded-full border border-border/60 px-2 py-0.5">
              {t('topbar.minimap_label')}
            </span>
          )}
        </div>
      </div>

      <div
        className="flex min-w-0 flex-1 justify-center px-3"
        data-hud-role="quest-tracker-slot"
      >
        {questTrackerSlot ?? (
          <span className="font-mono text-[11px] uppercase tracking-wider text-foreground/50">
            {t('topbar.quest_none')}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        {tierBadgeSlot ? (
          <div data-hud-role="tier-badge-slot">{tierBadgeSlot}</div>
        ) : null}
        <CurrencyDisplay compact={false} />
        <button
          type="button"
          onClick={toggleLanguage}
          className="rounded-md border border-border bg-background/70 px-2 py-1 font-mono text-[11px] uppercase tracking-wider text-foreground/80 transition-colors hover:border-ring hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label={t('language.toggle')}
          data-hud-role="language-toggle"
          data-active-locale={language}
        >
          <span
            className={
              language === 'en-US'
                ? 'text-primary'
                : 'text-foreground/50'
            }
          >
            {shortEn}
          </span>
          <span className="mx-1 text-foreground/30" aria-hidden="true">
            /
          </span>
          <span
            className={
              language === 'id-ID'
                ? 'text-primary'
                : 'text-foreground/50'
            }
          >
            {shortId}
          </span>
        </button>
      </div>
    </motion.header>
  );
}

export default TopBar;
