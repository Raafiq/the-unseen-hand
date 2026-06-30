import { test, expect } from '@playwright/test';

test.describe('App shell', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('topbar mounts', async ({ page }) => {
    await expect(page.locator('.topbar')).toBeVisible();
    await expect(page.locator('.world-name')).toBeVisible();
  });

  test('nav has 4 tabs', async ({ page }) => {
    const tabs = page.locator('.nav-btn');
    await expect(tabs).toHaveCount(4);
  });
});

test('simulation produces events within 5s', async ({ page }) => {
  await page.goto('/');
  // Run at 20× so events accumulate quickly
  await page.locator('.speed-btn', { hasText: '20×' }).click();
  // Switch to Events tab so we can see the feed
  await page.locator('.nav-btn', { hasText: 'Events' }).click();
  // Wait for at least 3 event rows to appear
  await page.waitForFunction(
    () => document.querySelectorAll('.event-row').length >= 3,
    { timeout: 8_000 },
  );
  const count = await page.locator('.event-row').count();
  expect(count).toBeGreaterThanOrEqual(3);
});

test('speed control active class changes on click', async ({ page }) => {
  await page.goto('/');
  const btn5x = page.locator('.speed-btn', { hasText: '5×' });
  await btn5x.click();
  await expect(btn5x).toHaveClass(/active/);
  // Previous button (1×) should no longer be active
  await expect(page.locator('.speed-btn', { hasText: '1×' })).not.toHaveClass(/active/);
});

test('Events tab click clears unread badge', async ({ page }) => {
  await page.goto('/');
  // Run at 20× so events accumulate quickly while we stay on Roster tab
  await page.locator('.speed-btn', { hasText: '20×' }).click();
  const eventsTab = page.locator('.nav-btn', { hasText: 'Events' });
  await expect(eventsTab.locator('.badge')).toBeVisible({ timeout: 10_000 });
  // Now click the Events tab — badge should disappear
  await eventsTab.click();
  await expect(eventsTab.locator('.badge')).not.toBeVisible();
});

test('DI meter bar has non-zero width', async ({ page }) => {
  await page.goto('/');
  const bar = page.locator('.di-bar-fill');
  await expect(bar).toBeVisible();
  const width = await bar.evaluate((el) => (el as HTMLElement).style.width);
  const pct = parseFloat(width);
  expect(pct).toBeGreaterThan(0);
});
