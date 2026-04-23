'use client';

//
// src/components/hud/SideBar.tsx
//
// Collapsible right-hand sidebar. Hosts three cells stacked vertically:
//   top:    agent structure editor mini-viewer (Helios port slot)
//   middle: ModelSelector (Erato-v2 authored, Opus 4.7 plus Sonnet 4.6)
//   bottom: VolumeSlider slot (Euterpe authored, injected via slot prop)
//
// Collapse state is persisted in `useUIPreferencesStore.sidebarCollapsed`
// (see uiStore.ts). Per translator_notes gotcha 16, Helios viz is injected
// via slot prop, not imported here.
//
// Framer Motion transitions honor `prefers-reduced-motion`.
//

import type { ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

import { useT } from '../../lib/i18n';
import { useUIPreferencesStore } from '../../stores/uiStore';
import ModelSelector from './ModelSelector';

export interface SideBarProps {
  pipelineVizSlot?: ReactNode;
  volumeSliderSlot?: ReactNode;
  extraSlot?: ReactNode;
}

export function SideBar({
  pipelineVizSlot,
  volumeSliderSlot,
  extraSlot,
}: SideBarProps) {
  const collapsed = useUIPreferencesStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIPreferencesStore((s) => s.toggleSidebar);
  const t = useT();
  const reducedMotion = useReducedMotion();

  return (
    <motion.aside
      className="pointer-events-auto flex h-full flex-col border-l border-border bg-background/85 backdrop-blur-sm"
      data-hud-role="side-bar"
      data-collapsed={collapsed ? 'true' : undefined}
      initial={false}
      animate={{ width: collapsed ? 48 : 288 }}
      transition={{ duration: reducedMotion ? 0 : 0.22, ease: [0.2, 0.8, 0.2, 1] }}
      aria-label={t('sidebar.title')}
    >
      <div className="flex items-center justify-between border-b border-border/70 px-2 py-2">
        {!collapsed ? (
          <div className="flex flex-col">
            <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-foreground/80">
              {t('sidebar.title')}
            </span>
            <span className="font-mono text-[10px] text-foreground/50">
              {t('sidebar.subtitle')}
            </span>
          </div>
        ) : (
          <span className="sr-only">{t('sidebar.title')}</span>
        )}
        <button
          type="button"
          className="rounded-md border border-border/70 bg-background/70 px-2 py-1 font-mono text-[11px] text-foreground/80 transition-colors hover:border-ring hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          onClick={toggleSidebar}
          aria-label={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
          aria-expanded={!collapsed}
          data-hud-role="sidebar-toggle"
        >
          {collapsed ? '>' : '<'}
        </button>
      </div>
      <AnimatePresence initial={false}>
        {!collapsed ? (
          <motion.div
            key="sidebar-body"
            className="flex flex-1 min-h-0 flex-col gap-3 overflow-y-auto p-3"
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <section
              data-hud-role="pipeline-viz-slot"
              aria-label="Agent structure editor"
              className="rounded-md border border-border/70 bg-background/70 p-2"
            >
              {pipelineVizSlot ?? (
                <p className="font-mono text-[11px] text-foreground/60">
                  Pipeline viz loading...
                </p>
              )}
            </section>
            <section
              className="rounded-md border border-border/70 bg-background/70 p-3"
              data-hud-role="model-selector-slot"
            >
              <ModelSelector layout="stacked" />
            </section>
            <section
              className="rounded-md border border-border/70 bg-background/70 p-3"
              data-hud-role="volume-slider-slot"
              aria-label="Audio controls"
            >
              {volumeSliderSlot ?? (
                <p className="font-mono text-[11px] text-foreground/60">
                  Audio controls loading...
                </p>
              )}
            </section>
            {extraSlot}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.aside>
  );
}

export default SideBar;
