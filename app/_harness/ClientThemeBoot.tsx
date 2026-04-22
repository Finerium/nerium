'use client';
//
// ClientThemeBoot.tsx
//
// Nemea Phase 5 QA emergency harness (2026-04-22). Client-side boot that
// hydrates the active world from localStorage via the Harmonia-owned
// theme_runtime. Mirrors the boot behaviour described in
// docs/contracts/design_tokens.contract.md v0.1.0 Section 4 and
// theme_runtime.ts hydrateActiveWorld. Runs once on mount and returns null so
// the server-rendered tree stays lean.
//

import { useEffect } from 'react';
import { hydrateActiveWorld } from '../shared/design/theme_runtime';

export function ClientThemeBoot(): null {
  useEffect(() => {
    hydrateActiveWorld();
  }, []);
  return null;
}
