//
// playwright.config.ts
//
// Minimal Playwright configuration for the Thalia-v2 Session A smoke test
// (tests/phaser-smoke.spec.ts). Nemea-RV-A and Nemea-RV-B may extend this
// config with project matrices, visual regression snapshots, and a11y
// probes; for the scene-core smoke we only need a Chromium run and the
// Next dev server launching on demand.
//
// Scope note: this file is authored by Thalia-v2 as a harness for the
// phaser-smoke test. Ownership of comprehensive test configuration remains
// with Nemea-RV-* per M2 Section 4.15 and 4.16.
//

import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list']],
  timeout: 60_000,
  use: {
    baseURL: BASE_URL,
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `npx next dev --turbopack --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
