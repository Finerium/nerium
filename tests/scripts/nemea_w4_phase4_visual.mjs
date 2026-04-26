// Nemea-RV-v2 W4 Phase 4 visual capture harness.
//
// Captures full-page screenshots of the production routes for classify-only
// visual review. Output goes to docs/qa/screenshots/nemea_w4_phase4_*.png.
//
// Authored 2026-04-26 by Nemea-RV-v2 W4 T-NEMEA (Claude Opus 4.7).
//

import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..', '..');
const outDir = resolve(repoRoot, 'docs', 'qa', 'screenshots');
mkdirSync(outDir, { recursive: true });

const BASE = 'https://nerium-one.vercel.app';
const ROUTES = [
  { path: '/', label: 'root' },
  { path: '/play', label: 'play' },
  { path: '/marketplace', label: 'marketplace' },
  { path: '/builder', label: 'builder' },
  { path: '/pricing', label: 'pricing' },
];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await ctx.newPage();

for (const r of ROUTES) {
  const url = BASE + r.path;
  console.log('Visiting', url);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    if (r.path === '/play') {
      // Wait for Phaser scene ready hook
      await page
        .waitForFunction(() => (window).__NERIUM_TEST__?.ready === true, {
          timeout: 240_000,
        })
        .catch(() => console.log('  (timeout waiting for __NERIUM_TEST__.ready, capturing as-is)'));
    } else {
      await page
        .waitForLoadState('networkidle', { timeout: 30_000 })
        .catch(() => console.log('  (networkidle timeout, capturing as-is)'));
    }
    const file = resolve(outDir, `nemea_w4_phase4_${r.label}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log('  Saved', file);
  } catch (err) {
    console.error('  ERROR', r.path, err.message);
  }
}

await browser.close();
console.log('Done.');
