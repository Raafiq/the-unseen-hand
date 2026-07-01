import { test, expect } from '@playwright/test';
import { FEATURES } from '../src/lib/featureFlags';

test.describe('App shell', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('topbar mounts', async ({ page }) => {
    await expect(page.locator('.topbar')).toBeVisible();
    await expect(page.locator('.world-name')).toBeVisible();
  });

  test('roster dock and event feed are both always visible', async ({ page }) => {
    // No tab navigation: the feed fills the main area and the roster docks below it.
    await expect(page.locator('.roster-dock')).toBeVisible();
    await expect(page.locator('.roster-dock .card').first()).toBeVisible();
    await expect(page.locator('.main-panel')).toBeVisible();
  });

  test('clicking a roster card opens the detail drawer; close dismisses it', async ({ page }) => {
    // The drawer must rise from the dock (bottom region), not appear in the right panel.
    await expect(page.locator('.detail-drawer')).toHaveCount(0);

    await page.locator('.roster-dock .card').first().click();
    const drawer = page.locator('.detail-drawer');
    await expect(drawer).toBeVisible();
    await expect(drawer.locator('.detail.drawer')).toBeVisible();

    // Close via the × control — selection clears and the drawer collapses.
    await drawer.locator('.drawer-close').click();
    await expect(page.locator('.detail-drawer')).toHaveCount(0);
  });
});

test('simulation produces events within 5s', async ({ page }) => {
  await page.goto('/');
  // Run at 20× so events accumulate quickly. The feed is always in view — no tab to open.
  await page.locator('.speed-btn', { hasText: '20×' }).click();
  // Wait for at least 3 event rows to appear
  await page.waitForFunction(
    () => document.querySelectorAll('.event-row').length >= 3,
    { timeout: 8_000 },
  );
  const count = await page.locator('.event-row').count();
  expect(count).toBeGreaterThanOrEqual(3);
});

test('hidden-feature event kinds never appear in the feed', async ({ page }) => {
  // Regression: quest/world/divine events were still surfacing in the feed even
  // though their features are hidden. The feed (chips + rows) must drop any
  // kind whose owning feature is off. Labels come from EventFeed's KIND_LABELS.
  const hiddenLabels = [
    ...(FEATURES.quests ? [] : ['Quest', 'Combat']),
    ...(FEATURES.world ? [] : ['World']),
    ...(FEATURES.divineIntervention ? [] : ['Divine', 'Decision']),
  ];
  test.skip(hiddenLabels.length === 0, 'No features hidden');

  await page.goto('/');
  await page.locator('.speed-btn', { hasText: '20×' }).click();

  // Accumulate a healthy sample of events across many kinds.
  await page.waitForFunction(
    () => document.querySelectorAll('.event-row').length >= 5,
    { timeout: 8_000 },
  );

  for (const label of hiddenLabels) {
    // No filter chip for a hidden kind.
    await expect(
      page.locator('.filter-bar .filter-btn', { hasText: new RegExp(`^${label}$`) }),
    ).toHaveCount(0);
    // No event-row type tag for a hidden kind.
    await expect(
      page.locator('.event-row .type-tag', { hasText: new RegExp(`^${label}$`) }),
    ).toHaveCount(0);
  }
});

test('speed control active class changes on click', async ({ page }) => {
  await page.goto('/');
  const btn5x = page.locator('.speed-btn', { hasText: '5×' });
  await btn5x.click();
  await expect(btn5x).toHaveClass(/active/);
  // Previous button (1×) should no longer be active
  await expect(page.locator('.speed-btn', { hasText: '1×' })).not.toHaveClass(/active/);
});

test('DI meter bar has non-zero width', async ({ page }) => {
  test.skip(!FEATURES.divineIntervention, 'Divine Intervention hidden — DI meter not rendered');
  await page.goto('/');
  const bar = page.locator('.di-bar-fill');
  await expect(bar).toBeVisible();
  const width = await bar.evaluate((el) => (el as HTMLElement).style.width);
  const pct = parseFloat(width);
  expect(pct).toBeGreaterThan(0);
});
