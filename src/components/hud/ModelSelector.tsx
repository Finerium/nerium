'use client';

//
// src/components/hud/ModelSelector.tsx
//
// SideBar + TopBar HUD widget. Dropdown limited to Opus 4.7 plus Sonnet 4.6
// per CLAUDE.md anti-pattern 7 amended. Adding a third option (Gemini,
// Higgsfield, Auto, Multi-vendor) is a STRATEGIC DECISION HARD STOP per
// Erato-v2 spec; multi-vendor is surfaced as a disabled stub with the
// locked honest-claim annotation from
// `app/protocol/vendor/annotation_text.constant.ts` (translator_notes
// gotcha 11: immutable, extend not rewrite).
//
// Store coupling: reads + writes `useUIPreferencesStore.modelChoice`.
// Emits a `model_changed` bridge event via the shared game bus so Phaser
// scenes can react if needed (e.g., caravan NPC dialogue shifting).
//

import { useCallback } from 'react';

import { useT } from '../../lib/i18n';
import {
  useUIPreferencesStore,
  type ModelChoice,
} from '../../stores/uiStore';
import { emitBusEvent } from '../../lib/hudBus';
import { HONEST_CLAIM_LOCKED_TEXT } from '../../../app/protocol/vendor/annotation_text.constant';

interface ModelSelectorProps {
  layout?: 'compact' | 'stacked';
}

const MODEL_OPTIONS: ReadonlyArray<{
  readonly value: ModelChoice;
  readonly labelKey: 'model.option_opus' | 'model.option_sonnet';
}> = [
  { value: 'opus-4-7', labelKey: 'model.option_opus' },
  { value: 'sonnet-4-6', labelKey: 'model.option_sonnet' },
];

export function ModelSelector({ layout = 'stacked' }: ModelSelectorProps) {
  const modelChoice = useUIPreferencesStore((s) => s.modelChoice);
  const setModelChoice = useUIPreferencesStore((s) => s.setModelChoice);
  const t = useT();

  const handleChange = useCallback(
    (evt: React.ChangeEvent<HTMLSelectElement>) => {
      const next = evt.target.value as ModelChoice;
      if (next !== 'opus-4-7' && next !== 'sonnet-4-6') return;
      setModelChoice(next);
      emitBusEvent('nerium.ui.model_changed', { modelChoice: next });
    },
    [setModelChoice],
  );

  const wrapperClass =
    layout === 'compact'
      ? 'flex items-center gap-2 font-mono text-xs'
      : 'flex flex-col gap-1.5 font-mono text-xs';

  return (
    <div
      className={wrapperClass}
      data-hud-role="model-selector"
      aria-label={t('model.label')}
    >
      <label
        className="uppercase tracking-wider text-foreground/50"
        htmlFor="nerium-model-selector"
      >
        {t('model.label')}
      </label>
      <select
        id="nerium-model-selector"
        className="rounded-md border border-border bg-background/80 px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        value={modelChoice}
        onChange={handleChange}
      >
        {MODEL_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {t(opt.labelKey)}
          </option>
        ))}
      </select>
      <p
        className="text-[10px] leading-snug text-foreground/60"
        data-hud-role="honest-claim"
      >
        {t('model.honest_claim_title')}
        <br />
        {HONEST_CLAIM_LOCKED_TEXT}
      </p>
    </div>
  );
}

export default ModelSelector;
