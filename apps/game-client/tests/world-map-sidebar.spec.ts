import { test, expect } from '@playwright/test';
import { FEATURES } from '../src/lib/featureFlags';

/**
 * Verifies that clicking a region row opens the region-detail sidebar panel
 * and that the close button dismisses it.
 *
 * THORNVALE is the starter region (unlock threshold = 0, always unlocked),
 * so its sidebar shows difficulty controls.
 */
test('region sidebar opens when a region header is clicked', async ({ page }) => {
  test.skip(!FEATURES.world, 'World tab hidden');
  await page.goto('/');

  // Navigate to the World tab
  await page.locator('button', { hasText: 'World' }).click();

  // Sidebar should not be visible yet
  await expect(page.locator('.region-sidebar')).not.toBeVisible();

  // Click the THORNVALE region header (the first region-header inside region-section)
  await page.locator('.region-section').first().locator('.region-header').click();

  // Sidebar panel must now be visible
  await expect(page.locator('.region-sidebar')).toBeVisible();

  // Sidebar must show a non-empty region name
  const regionName = page.locator('.sidebar-region-name');
  await expect(regionName).not.toBeEmpty();

  // Unlocked region: difficulty controls must be visible
  await expect(page.locator('.region-sidebar .diff-controls')).toBeVisible();
});

test('region sidebar closes when the × button is clicked', async ({ page }) => {
  test.skip(!FEATURES.world, 'World tab hidden');
  await page.goto('/');

  await page.locator('button', { hasText: 'World' }).click();
  await page.locator('.region-section').first().locator('.region-header').click();

  await expect(page.locator('.region-sidebar')).toBeVisible();

  await page.locator('.sidebar-close').click();

  await expect(page.locator('.region-sidebar')).not.toBeVisible();
});
