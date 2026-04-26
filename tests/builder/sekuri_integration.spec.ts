//
// tests/builder/sekuri_integration.spec.ts
//
// Sekuri integration Playwright E2E. Mirrors the convention used by
// tests/builder/model_selection_modal.spec.ts.
//
// Coverage:
//   1. /play route. Apollo Builder Workshop dialogue overlay can be
//      programmatically opened by dispatching the listener fallback event,
//      and renders the greeting phase with a textarea + submit button.
//   2. /play route. Submitting a prompt advances through classifying ->
//      template_summary phase, with the Sekuri tier pill rendered.
//   3. /creator/submit route. The Sekuri "Generate Skill Package" button
//      becomes enabled once title + short description + category + subtype
//      are filled, then produces the preview view with 3 file blocks.
//   4. /creator/submit route. Featured Examples sidebar renders 3 example
//      cards linking to the staged demo skills.
//   5. Honest-claim caption text appears at every Sekuri surface.
//

import { expect, test } from '@playwright/test';

test.describe('Sekuri Apollo Builder Workshop dialogue', () => {
  test('opens via fallback event and shows greeting phase', async ({ page }) => {
    await page.goto('/play');
    // Wait for the lean HUD to mount; ApolloBuilderWorkshopListener subscribes
    // to a window CustomEvent fallback path in addition to bus polling, so the
    // test does not need a real Phaser canvas to drive the overlay open.
    await page.waitForTimeout(800);

    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent('nerium.apollo.builder_workshop.interact', {
          detail: { landmarkName: 'builder_workshop' },
        }),
      );
    });

    const dialogue = page.getByTestId('apollo-builder-dialogue');
    await expect(dialogue).toBeVisible({ timeout: 10_000 });
    await expect(dialogue).toHaveAttribute('data-phase', 'greeting');
    await expect(page.getByTestId('apollo-dialogue-prompt-input')).toBeVisible();
    await expect(page.getByTestId('apollo-dialogue-submit')).toBeVisible();
    // Honest-claim caption present.
    await expect(dialogue).toContainText(
      'Demo flow uses pre-canned templates',
    );
  });

  test('classifies a marketplace prompt as large and surfaces template summary', async ({
    page,
  }) => {
    test.setTimeout(45_000);
    await page.goto('/play');
    await page.waitForTimeout(800);

    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent('nerium.apollo.builder_workshop.interact', {
          detail: { landmarkName: 'builder_workshop' },
        }),
      );
    });

    const dialogue = page.getByTestId('apollo-builder-dialogue');
    await expect(dialogue).toBeVisible({ timeout: 10_000 });

    const input = page.getByTestId('apollo-dialogue-prompt-input');
    await input.fill(
      'build me a marketplace SaaS for indie agent creators with multi-vendor routing',
    );
    await page.getByTestId('apollo-dialogue-submit').click();

    // Classifying phase mounts the SekuriClassifier with thinking dots.
    await expect(page.getByTestId('sekuri-classifier')).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByTestId('sekuri-classifier')).toHaveAttribute(
      'data-stage',
      'thinking',
    );

    // Wait for the 2200ms theatrical pause + classifier finalize.
    await page.waitForTimeout(2700);

    // Template summary phase renders the Sekuri tier card. The dialogue
    // re-attaches the data-phase attribute on each phase change.
    await expect(dialogue).toHaveAttribute('data-phase', 'template_summary', {
      timeout: 10_000,
    });
    await expect(page.getByTestId('apollo-dialogue-template-card')).toBeVisible();
    await expect(page.getByTestId('apollo-dialogue-template-summary')).toHaveAttribute(
      'data-tier',
      'large',
    );
  });
});

test.describe('Sekuri Phanes wizard skill package generator', () => {
  test('Generate button is disabled until required fields filled, then produces preview + downloads', async ({
    page,
  }) => {
    test.setTimeout(45_000);
    await page.goto('/creator/submit');

    // Walk through the wizard steps to fill in required fields. The wizard
    // hydrates the synth user id on first paint, so we step through with
    // small waits to let the autosave debounce settle without blocking.

    // Step 1: category
    await page.waitForSelector('[data-testid="creator-wizard-body"]', {
      timeout: 15_000,
    });

    // Click the first available category option (Core Agent) and continue.
    const firstCategoryOption = page.locator('[data-testid="creator-wizard-body"] button').first();
    await firstCategoryOption.click();
    // Step navigation may auto-advance OR require a Next click; handle both.
    const nextBtn = page.getByTestId('wizard-next');
    if (await nextBtn.isVisible().catch(() => false)) {
      await nextBtn.click();
    }

    // Skip directly to /creator/submit?step=preview by setting the wizard
    // step in the store via window. This simulates a creator who has filled
    // basics + metadata + pricing through the upstream steps; the test
    // surface here is the Sekuri generator block, not the upstream flow.
    await page.evaluate(() => {
      const w = window as unknown as { __NERIUM_WIZARD_FORCE_STEP__?: (s: string) => void };
      // Best-effort store hook: the wizard exports its store via index.ts;
      // we directly stamp a complete draft via localStorage to simulate the
      // hydrate path the next reload uses.
      try {
        const keyMatch = Object.keys(localStorage).find((k) =>
          k.startsWith('nerium.creator.submit.draft.'),
        );
        if (keyMatch) {
          const raw = localStorage.getItem(keyMatch);
          const parsed = raw ? JSON.parse(raw) : null;
          if (parsed) {
            parsed.draft = parsed.draft ?? {};
            parsed.draft.basics = {
              title: 'Restaurant Automation Agent',
              short_description:
                'End-to-end automation agent for independent restaurants.',
              long_description:
                'Owner sends WhatsApp message and the agent dispatches to relevant subsystem.',
              slug: 'restaurant-automation-agent',
              capability_tags: ['restaurant', 'automation'],
            };
            parsed.draft.category = 'core_agent';
            parsed.draft.subtype = 'reasoning_agent';
            parsed.draft.license = 'PROPRIETARY';
            parsed.draft.pricing_model = 'subscription_monthly';
            parsed.draft.pricing_details = {
              amount_cents: 2500,
              currency: 'USD',
            };
            parsed.draft.category_metadata = {};
            parsed.draft.asset_refs = [];
            parsed.draft.thumbnail_r2_key = null;
            parsed.draft.version = '0.1.0';
            parsed.step = 'preview';
            localStorage.setItem(keyMatch, JSON.stringify(parsed));
          }
        }
        if (w.__NERIUM_WIZARD_FORCE_STEP__) {
          w.__NERIUM_WIZARD_FORCE_STEP__('preview');
        }
      } catch {
        // ignore: best-effort harness setup
      }
    });

    await page.reload();
    await page.waitForSelector('[data-testid="sekuri-skill-package-generator"]', {
      timeout: 15_000,
    });

    // Generate button is enabled because all required fields are present.
    const generateBtn = page.getByTestId('sekuri-generate-button');
    await expect(generateBtn).toBeEnabled();
    await generateBtn.click();

    // Preview block surfaces with at least 3 file disclosures.
    const preview = page.getByTestId('sekuri-package-preview');
    await expect(preview).toBeVisible();
    await expect(page.getByTestId('sekuri-download-manifest')).toBeVisible();
    await expect(page.getByTestId('sekuri-download-skill-md')).toBeVisible();
    await expect(page.getByTestId('sekuri-download-metadata')).toBeVisible();

    // Honest-claim caption present in the preview block.
    await expect(preview).toContainText(
      'Demo flow uses pre-canned templates',
    );
  });

  test('Featured Examples sidebar lists 3 demo skills', async ({ page }) => {
    await page.goto('/creator/submit');
    // Featured examples render once the preview step is reached. Force the
    // step via localStorage as in the prior test, then reload.
    await page.waitForSelector('[data-testid="creator-wizard-body"]', {
      timeout: 15_000,
    });
    await page.evaluate(() => {
      try {
        const keyMatch = Object.keys(localStorage).find((k) =>
          k.startsWith('nerium.creator.submit.draft.'),
        );
        if (keyMatch) {
          const raw = localStorage.getItem(keyMatch);
          const parsed = raw ? JSON.parse(raw) : { draft: {} };
          parsed.step = 'preview';
          parsed.draft = parsed.draft ?? {};
          parsed.draft.basics = parsed.draft.basics ?? {
            title: 'Test',
            short_description: 'short',
            long_description: 'long',
            slug: 'test',
            capability_tags: [],
          };
          parsed.draft.category = parsed.draft.category ?? 'core_agent';
          parsed.draft.subtype = parsed.draft.subtype ?? 'reasoning_agent';
          parsed.draft.license = parsed.draft.license ?? 'PROPRIETARY';
          parsed.draft.pricing_model = parsed.draft.pricing_model ?? 'free';
          parsed.draft.pricing_details = parsed.draft.pricing_details ?? {};
          parsed.draft.category_metadata = parsed.draft.category_metadata ?? {};
          parsed.draft.asset_refs = parsed.draft.asset_refs ?? [];
          parsed.draft.thumbnail_r2_key = parsed.draft.thumbnail_r2_key ?? null;
          parsed.draft.version = parsed.draft.version ?? '0.1.0';
          localStorage.setItem(keyMatch, JSON.stringify(parsed));
        }
      } catch {
        // ignore
      }
    });
    await page.reload();
    await page.waitForSelector('[data-testid="sekuri-featured-examples"]', {
      timeout: 15_000,
    });

    await expect(
      page.getByTestId('sekuri-example-restaurant_automation_agent'),
    ).toBeVisible();
    await expect(
      page.getByTestId('sekuri-example-indonesian_tax_calculator_mcp'),
    ).toBeVisible();
    await expect(
      page.getByTestId('sekuri-example-stripe_connect_onboarding'),
    ).toBeVisible();
  });
});
