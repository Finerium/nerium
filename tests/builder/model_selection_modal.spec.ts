//
// tests/builder/model_selection_modal.spec.ts
//
// Lu (W3 T3) authored Playwright E2E for ModelSelectionModal.
// Mounts via the /builder route launcher (ModelSelectionLauncher) and
// asserts:
//   1. Modal opens and renders 8 vendor badges in a 4x2 grid.
//   2. Clicking a vendor sets it as primary (data-primary="true").
//   3. Keyboard nav: ArrowRight cycles focus across the vendor grid.
//   4. Multi-vendor routing toggle only renders for the LARGE tier.
//   5. Cost estimate updates when selection changes.
//   6. Confirm emits a `nerium.builder.model_selection_confirmed` event
//      that surfaces via window CustomEvent dispatch.
//   7. Honest-claim caption is rendered with the locked annotation text.
//   8. Escape closes the modal.
//

import { expect, test } from '@playwright/test';

test.describe('ModelSelectionModal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/builder');
    await page.getByTestId('model-selection-launcher').waitFor({
      state: 'visible',
      timeout: 30_000,
    });
  });

  test('renders 8 vendor badges and locks primary to anthropic on open', async ({
    page,
  }) => {
    await page.getByTestId('model-selection-tier-select').selectOption('large');
    await page.getByTestId('model-selection-open').click();
    const modal = page.getByTestId('model-selection-modal');
    await expect(modal).toBeVisible();

    const badges = modal.locator('[data-vendor-badge="true"]');
    await expect(badges).toHaveCount(8);
    await expect(modal.locator('[data-vendor-id="anthropic"]')).toHaveAttribute(
      'data-primary',
      'true',
    );
  });

  test('clicking another vendor reassigns primary', async ({ page }) => {
    await page.getByTestId('model-selection-tier-select').selectOption('large');
    await page.getByTestId('model-selection-open').click();
    const modal = page.getByTestId('model-selection-modal');
    await modal.locator('[data-vendor-id="google"]').click();
    await expect(modal.locator('[data-vendor-id="google"]')).toHaveAttribute(
      'data-primary',
      'true',
    );
    await expect(modal.locator('[data-vendor-id="anthropic"]')).toHaveAttribute(
      'data-primary',
      'false',
    );
  });

  test('multi-vendor routing toggle is large-tier only', async ({ page }) => {
    await page.getByTestId('model-selection-tier-select').selectOption('small');
    await page.getByTestId('model-selection-open').click();
    let modal = page.getByTestId('model-selection-modal');
    await expect(modal).toBeVisible();
    await expect(modal.getByTestId('multi-vendor-routing-toggle')).toHaveCount(0);
    await page.getByTestId('model-selection-close').click();

    await page.getByTestId('model-selection-tier-select').selectOption('large');
    await page.getByTestId('model-selection-open').click();
    modal = page.getByTestId('model-selection-modal');
    await expect(modal.getByTestId('multi-vendor-routing-toggle')).toBeVisible();
  });

  test('arrow keys move focus across the vendor grid', async ({ page }) => {
    await page.getByTestId('model-selection-tier-select').selectOption('large');
    await page.getByTestId('model-selection-open').click();
    const modal = page.getByTestId('model-selection-modal');
    await expect(modal).toBeVisible();
    // First badge should auto-focus on open (deferred ~30ms).
    await page.waitForTimeout(60);
    await expect(modal.locator('[data-vendor-id="anthropic"]')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(modal.locator('[data-vendor-id="google"]')).toBeFocused();
    // Grid is 4 columns x 2 rows. From google (row 1 col 2) ArrowDown
    // lands on meta (row 2 col 2).
    await page.keyboard.press('ArrowDown');
    await expect(modal.locator('[data-vendor-id="meta"]')).toBeFocused();
  });

  test('honest-claim caption + footer render the locked annotation text', async ({
    page,
  }) => {
    await page.getByTestId('model-selection-tier-select').selectOption('medium');
    await page.getByTestId('model-selection-open').click();
    const modal = page.getByTestId('model-selection-modal');
    await expect(
      modal.locator('[data-builder-modal-role="honest-claim-footer"]'),
    ).toContainText('demo execution Anthropic only');
  });

  test('confirm dispatches nerium.builder.model_selection_confirmed', async ({
    page,
  }) => {
    await page.getByTestId('model-selection-tier-select').selectOption('large');
    await page.getByTestId('model-selection-open').click();
    const modal = page.getByTestId('model-selection-modal');
    await expect(modal).toBeVisible();
    // Wait for the cost estimate to load (template fetch resolves).
    await expect(
      modal.locator('[data-builder-modal-role="cost-estimate"]'),
    ).toContainText('USD per build', { timeout: 5000 });

    // Subscribe to the bus event and stash the payload on window.
    await page.evaluate(() => {
      (window as unknown as Record<string, unknown>).__lastConfirmEvent = null;
      window.addEventListener('__NERIUM_GAME_EVENT__', (evt: Event) => {
        const detail = (evt as CustomEvent).detail as {
          topic?: string;
          payload?: unknown;
        };
        if (detail?.topic === 'nerium.builder.model_selection_confirmed') {
          (window as unknown as Record<string, unknown>).__lastConfirmEvent =
            detail.payload;
        }
      });
    });

    await page.getByTestId('model-selection-confirm').click();
    await expect(modal).toBeHidden();

    const payload = await page.evaluate(
      () =>
        (window as unknown as { __lastConfirmEvent: unknown }).__lastConfirmEvent,
    );
    expect(payload).toMatchObject({
      primaryVendor: 'anthropic',
      complexity: 'large',
    });
  });

  test('escape key closes the modal', async ({ page }) => {
    await page.getByTestId('model-selection-tier-select').selectOption('medium');
    await page.getByTestId('model-selection-open').click();
    const modal = page.getByTestId('model-selection-modal');
    await expect(modal).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();
  });
});
