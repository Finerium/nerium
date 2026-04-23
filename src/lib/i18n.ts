//
// src/lib/i18n.ts
//
// Lightweight custom i18n helper for NERIUM RV HUD strings. `next-intl` was
// evaluated and dropped per docs/erato-v2.decisions.md ADR-0003: the
// dependency is not installed in package.json, and installing it at W3 risks
// SSR + App Router friction on a short timeline. Instead we hand-roll a tiny
// dot-path + `{placeholder}` interpolation helper that reads two JSON
// dictionaries statically imported at build time.
//
// Usage:
//
//   import { useT } from '@/lib/i18n';
//   const t = useT();
//   <span>{t('currency.label')}</span>
//   <span>{t('inventory.toast_label', { item: 'Lumio.app' })}</span>
//
// Locale source: `useUIPreferencesStore` narrow selector. Changing
// language triggers a React re-render of every consumer via Zustand's
// `subscribeWithSelector` middleware.
//
// Cost formatting is NOT handled here. CurrencyDisplay imports
// `formatCurrency` directly from `app/banking/meter/cost_ticker.ts`
// (translator_notes gotcha 10: single source of truth).
//

'use client';

import { useCallback } from 'react';

import en from '../i18n/en.json';
import id from '../i18n/id.json';
import { useUIPreferencesStore, type Locale } from '../stores/uiStore';

type Dict = Record<string, unknown>;

const DICTIONARIES: Record<Locale, Dict> = {
  'en-US': en as Dict,
  'id-ID': id as Dict,
};

export type InterpolationVars = Record<string, string | number>;

function lookup(dict: Dict, path: string): string | undefined {
  const parts = path.split('.');
  let cursor: unknown = dict;
  for (const key of parts) {
    if (
      typeof cursor !== 'object' ||
      cursor === null ||
      !(key in (cursor as Record<string, unknown>))
    ) {
      return undefined;
    }
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return typeof cursor === 'string' ? cursor : undefined;
}

function interpolate(template: string, vars: InterpolationVars | undefined): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    if (Object.prototype.hasOwnProperty.call(vars, name)) {
      return String(vars[name]);
    }
    return match;
  });
}

export function translate(locale: Locale, path: string, vars?: InterpolationVars): string {
  const dict = DICTIONARIES[locale] ?? DICTIONARIES['en-US'];
  const raw = lookup(dict, path);
  if (raw === undefined) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[i18n] missing key ${path} for locale ${locale}`);
    }
    return path;
  }
  return interpolate(raw, vars);
}

export function useT(): (path: string, vars?: InterpolationVars) => string {
  const locale = useUIPreferencesStore((s) => s.language);
  return useCallback(
    (path: string, vars?: InterpolationVars) => translate(locale, path, vars),
    [locale],
  );
}
