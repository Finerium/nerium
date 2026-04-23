'use client';
//
// src/components/ui/VolumeSlider.tsx
//
// HUD control consumed by Erato-v2 SideBar. Single slider binds to the
// master volume by default; pass `category="music"`, `category="sfx"`, or
// `category="ambient"` to bind to a sub-bus. Narrow Zustand selector per
// zustand_bridge.contract.md so unrelated store churn does not re-render.
//
// Owner: Euterpe.
// Contract: docs/contracts/game_state.contract.md Section 3.5.
//

import { useCallback, useId } from 'react';
import { useAudioStore } from '../../stores/audioStore';

type Category = 'master' | 'music' | 'sfx' | 'ambient';

interface VolumeSliderProps {
  category?: Category;
  label?: string;
  compact?: boolean;
  className?: string;
}

const FIELD_BY_CATEGORY: Record<Category, keyof ReturnType<typeof useAudioStore.getState>> = {
  master: 'masterVolume',
  music: 'musicVolume',
  sfx: 'sfxVolume',
  ambient: 'ambientVolume',
};

const SETTER_BY_CATEGORY: Record<
  Category,
  keyof Pick<
    ReturnType<typeof useAudioStore.getState>,
    'setMasterVolume' | 'setMusicVolume' | 'setSfxVolume' | 'setAmbientVolume'
  >
> = {
  master: 'setMasterVolume',
  music: 'setMusicVolume',
  sfx: 'setSfxVolume',
  ambient: 'setAmbientVolume',
};

const DEFAULT_LABEL: Record<Category, string> = {
  master: 'Master',
  music: 'Music',
  sfx: 'SFX',
  ambient: 'Ambient',
};

export default function VolumeSlider({
  category = 'master',
  label,
  compact = false,
  className,
}: VolumeSliderProps) {
  const field = FIELD_BY_CATEGORY[category];
  const setterKey = SETTER_BY_CATEGORY[category];
  const value = useAudioStore((s) => s[field] as number);
  const setter = useAudioStore((s) => s[setterKey]) as (v: number) => void;
  const muted = useAudioStore((s) => s.muted);
  const toggleMute = useAudioStore((s) => s.toggleMute);
  const id = useId();

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = Number.parseFloat(e.target.value);
      setter(Number.isFinite(v) ? v : 0);
    },
    [setter],
  );

  const displayLabel = label ?? DEFAULT_LABEL[category];
  const percent = Math.round(value * 100);

  return (
    <div
      className={
        'volume-slider ' +
        (compact ? 'volume-slider--compact ' : '') +
        (className ?? '')
      }
      data-category={category}
    >
      <label htmlFor={id} className="volume-slider__label">
        <span>{displayLabel}</span>
        <span className="volume-slider__value" aria-live="polite">
          {muted ? 'muted' : `${percent}%`}
        </span>
      </label>
      <div className="volume-slider__row">
        <button
          type="button"
          className="volume-slider__mute"
          onClick={toggleMute}
          aria-pressed={muted}
          aria-label={muted ? 'Unmute audio' : 'Mute audio'}
        >
          {muted ? 'OFF' : 'ON'}
        </button>
        <input
          id={id}
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={value}
          onChange={onChange}
          className="volume-slider__input"
          disabled={muted && category !== 'master'}
          aria-label={`${displayLabel} volume`}
        />
      </div>
    </div>
  );
}
