import { test, expect } from '@playwright/test';

/**
 * P13a — relationship driver events + drift indicator
 * (specs/behaviors/relationship-events.md, specs/screens/character-detail.md).
 *
 * Both surfaces are seeded deterministically via the `?e2e=drivers` store seam:
 *  1. A RELATIONSHIP:KINDNESS feed line renders in the always-visible event feed, tagged "Bonds".
 *  2. The character-detail relationship row shows a warming drift glyph (▲) + most-recent-cause label.
 */

test('a RELATIONSHIP driver line renders in the feed', async ({ page }) => {
  await page.goto('/?e2e=drivers');

  const row = page.locator('.event-row', { hasText: 'a kindness' });
  await expect(row.first()).toBeVisible({ timeout: 12_000 });
  // Tagged as the RELATIONSHIP ("Bonds") kind.
  await expect(row.first().locator('.type-tag', { hasText: 'Bonds' })).toBeVisible();
});

test('the character-detail relationship row shows a warming drift indicator with its cause', async ({ page }) => {
  await page.goto('/?e2e=drivers');

  const reikoCard = page.locator('.roster-dock .card', { hasText: 'Reiko' });
  await expect(reikoCard).toBeVisible({ timeout: 12_000 });
  await reikoCard.click();

  const drawer = page.locator('.detail-drawer');
  await expect(drawer).toBeVisible();

  const row = drawer.locator('.rel-row', { hasText: 'Captain Halden' });
  const drift = row.locator('[data-testid="rel-drift"]');
  await expect(drift).toBeVisible();
  await expect(drift).toHaveAttribute('data-direction', 'warming');
  await expect(drift.locator('.drift-glyph')).toHaveText('▲');
  await expect(drift.locator('.drift-cause')).toContainText('kindness');
});
