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

// The world is turn-paced: it halts between cycles and advances one cycle per Proceed
// (world-clock.md). Click Proceed n times to compute n cycles.
async function proceed(page: import('@playwright/test').Page, times = 1): Promise<void> {
  for (let i = 0; i < times; i++) await page.locator('.proceed-btn').click();
}

// Open every cycle spread's "Raw log" drill-down so the chronological rows are in the DOM.
async function openAllRawLogs(page: import('@playwright/test').Page): Promise<void> {
  const toggles = await page.locator('.raw-log-toggle').all();
  for (const t of toggles) await t.click();
}

test('Proceed computes a cycle and renders its spread', async ({ page }) => {
  await page.goto('/');
  // Before the first Proceed the reader rests on an empty state — no cycle computed yet.
  await expect(page.locator('.reader-empty')).toBeVisible();
  await expect(page.locator('.cycle-spread')).toHaveCount(0);

  await proceed(page);

  // The just-computed cycle appears as a spread: header + establishing overview.
  const spread = page.locator('.cycle-spread').last();
  await expect(spread).toBeVisible();
  await expect(spread.locator('.spread-header')).toHaveText('Day 0 · Afternoon');
  await expect(spread.locator('.cycle-overview')).not.toBeEmpty();
});

test('hidden-feature event kinds never appear in the raw log', async ({ page }) => {
  // Regression: quest/world/divine events were still surfacing even though their
  // features are hidden. The raw log (chips + rows) must drop any kind whose owning
  // feature is off. Labels come from EventFeed's KIND_LABELS.
  const hiddenLabels = [
    ...(FEATURES.quests ? [] : ['Quest', 'Combat']),
    ...(FEATURES.world ? [] : ['World']),
    ...(FEATURES.divineIntervention ? [] : ['Divine', 'Decision']),
  ];
  test.skip(hiddenLabels.length === 0, 'No features hidden');

  await page.goto('/');
  // A few cycles accumulate a healthy sample across many kinds (world+divine fire early).
  await proceed(page, 4);
  await openAllRawLogs(page);

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

test('enabled-feature event kinds do surface in the raw log', async ({ page }) => {
  // Positive counterpart: an enabled autonomous feature must actually render its events.
  // Regression guard for the QUEST_SUCCESS-buff-with-no-visible-quest leak — the sim runs
  // quests autonomously, so with the flag on a Quest event must appear rather than only its
  // buff. Quests resolve within the first few cycles for the default seed.
  test.skip(!FEATURES.quests, 'Quests hidden');

  await page.goto('/');
  await proceed(page, 4);
  await openAllRawLogs(page);

  await expect(
    page.locator('.event-row .type-tag', { hasText: /^Quest$/ }).first(),
  ).toBeVisible();
});

test('Proceed advances the in-game date across cycles', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.world-time')).toHaveText('Day 0 · Afternoon');
  await proceed(page); // Afternoon → Night
  await expect(page.locator('.world-time')).toHaveText('Day 0 · Night');
  await proceed(page); // Night → next day Morning
  await expect(page.locator('.world-time')).toHaveText('Day 1 · Morning');
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
