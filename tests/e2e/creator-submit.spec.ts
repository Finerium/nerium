//
// tests/e2e/creator-submit.spec.ts
//
// Playwright E2E smoke for the creator submission wizard. Walks the
// happy path for a Core Agent listing through all 7 steps: category,
// basics, metadata, pricing, assets, preview, submit. Stubs the
// marketplace + storage endpoints so the test runs without a live
// backend or an R2 bucket.
//
// Owner: Phanes (W2 NP P1 Session 2). Scope: render-layer + state
// transitions + form validation + publish redirect. Backend integration
// tests live under tests/backend/marketplace/.
//

import { expect, test } from '@playwright/test';

const PUBLISHED_LISTING_ID = '01926f00-aaaa-7aaa-8aaa-000000000001';

test.describe('Creator submission wizard', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept marketplace + storage routes so the wizard never talks
    // to a real backend. Each handler mirrors the contract shape so
    // shape-level regressions still fail loud.
    let listing_id: string | null = null;
    await page.route('**/v1/marketplace/listings', async (route) => {
      if (route.request().method() === 'POST') {
        listing_id = PUBLISHED_LISTING_ID;
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            id: listing_id,
            tenant_id: 'tenant-1',
            creator_user_id: 'user-1',
            category: 'core_agent',
            subtype: 'agent',
            slug: 'smoke-agent',
            title: 'Smoke Agent',
            short_description: 'Smoke summary',
            long_description: 'Smoke long description body.',
            capability_tags: ['smoke'],
            license: 'MIT',
            pricing_model: 'free',
            pricing_details: {},
            category_metadata: {},
            asset_refs: [],
            thumbnail_r2_key: null,
            status: 'draft',
            version: '0.1.0',
            version_history: [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            published_at: null,
            archived_at: null,
          }),
        });
        return;
      }
      await route.fallback();
    });

    await page.route(
      `**/v1/marketplace/listings/${PUBLISHED_LISTING_ID}`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: PUBLISHED_LISTING_ID,
            status: 'draft',
          }),
        });
      },
    );

    await page.route(
      `**/v1/marketplace/listings/${PUBLISHED_LISTING_ID}/publish`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: PUBLISHED_LISTING_ID,
            status: 'published',
          }),
        });
      },
    );

    await page.route('**/v1/storage/uploads', async (route) => {
      // Upload stub: return 404 so the wizard flips to stub_mode and
      // skips R2 entirely. The creator can still advance.
      await route.fulfill({
        status: 404,
        contentType: 'application/problem+json',
        body: JSON.stringify({
          type: 'https://nerium.com/problems/not_found',
          status: 404,
          title: 'not_found',
          detail: 'storage endpoint absent in the smoke harness',
        }),
      });
    });
  });

  test('happy path through 7 steps lands on the detail page', async ({ page }) => {
    await page.goto('/creator/submit');
    await expect(
      page.getByTestId('creator-wizard-body'),
    ).toBeVisible({ timeout: 20_000 });

    // Step 1: category + subtype.
    await page.getByTestId('category-option-core_agent').click();
    await page.getByTestId('subtype-option-agent').click();
    await page.getByTestId('wizard-next').click();

    // Step 2: basics.
    await page.getByTestId('basics-title').fill('Smoke Agent');
    await page
      .getByTestId('basics-short-description')
      .fill('Smoke summary');
    await page
      .getByTestId('basics-long-description')
      .fill('Smoke long description body.');
    await page.getByTestId('wizard-next').click();

    // Step 3: metadata. Core Agent requires prompt_artifact_id + runtime.
    await page
      .getByTestId('metadata-prompt_artifact_id')
      .fill('01926f00-5001-7a50-8501-000000000001');
    await page
      .getByTestId('metadata-runtime_requirements')
      .fill('{"model":"claude-opus-4-7"}');
    await page.getByTestId('wizard-next').click();

    // Step 4: pricing + license (free default is fine; confirm MIT).
    await page.getByTestId('pricing-model-free').click();
    await page.getByTestId('license-MIT').click();
    await page.getByTestId('wizard-next').click();

    // Step 5: assets. Skip uploads via Next (stub path).
    await page.getByTestId('wizard-next').click();

    // Step 6: preview.
    await expect(page.getByTestId('preview-card')).toBeVisible();
    await expect(page.getByTestId('preview-readiness-ok')).toBeVisible();
    await page.getByTestId('wizard-next').click();

    // Step 7: submit.
    await page.getByTestId('wizard-submit').click();

    // Redirect lands on the detail page stub with published=1.
    await expect(page).toHaveURL(
      new RegExp(`/marketplace/listings/${PUBLISHED_LISTING_ID}\\?published=1`),
    );
    await expect(page.getByTestId('publish-toast')).toBeVisible();
    await expect(page.getByTestId('listing-detail-stub')).toBeVisible();
  });

  test('subtype grid reflects the picked category', async ({ page }) => {
    await page.goto('/creator/submit');
    await expect(page.getByTestId('creator-wizard-body')).toBeVisible();

    // Picking Content must surface prompt / skill / quest_template / etc.
    await page.getByTestId('category-option-content').click();
    await expect(page.getByTestId('subtype-option-prompt')).toBeVisible();
    await expect(page.getByTestId('subtype-option-skill')).toBeVisible();
    await expect(page.getByTestId('subtype-option-agent')).toHaveCount(0);

    // Switching to Assets replaces the subtype grid.
    await page.getByTestId('category-option-assets').click();
    await expect(page.getByTestId('subtype-option-sprite_pack')).toBeVisible();
    await expect(page.getByTestId('subtype-option-prompt')).toHaveCount(0);
  });
});
