import { test, expect } from '@playwright/test';

/**
 * P13b — townsfolk familiarity (specs/behaviors/npc-system.md#townsfolk-familiarity).
 *
 * No e2e seam: the point of familiarity is that adventurer↔notable-NPC edges are seeded at
 * world generation (not only after emergent encounters). So a fresh load already shows Reiko
 * opening warmer to an embedded service NPC than to the guard captain. At speed 1 (1 tick/s) a
 * social encounter needs ~15+ ticks of pressure buildup, so the seeded openings are stable across
 * the assertion window.
 */

test('a newcomer opens in the ACQUAINTANCE band with a high-familiarity service NPC, and only STRANGER with the guard captain', async ({ page }) => {
  await page.goto('/');

  const reikoCard = page.locator('.roster-dock .card', { hasText: 'Reiko' });
  await expect(reikoCard).toBeVisible({ timeout: 12_000 });
  await reikoCard.click();

  const drawer = page.locator('.detail-drawer');
  await expect(drawer).toBeVisible();

  // The innkeeper (Marsa, high familiarity) opens in the ACQUAINTANCE band — a warm townsfolk edge,
  // not a cold stranger. This is the fix for "service NPCs read as too unfriendly".
  const innRow = drawer.locator('.rel-row', { hasText: 'Marsa' });
  await expect(innRow).toBeVisible();
  await expect(innRow.locator('.rel-name')).toContainText('townsfolk');
  await expect(innRow.locator('.rel-type')).toHaveText('Acquaintance');

  // The guard captain (Halden, moderate familiarity) opens only as a (warm) Stranger — differentiated
  // by role, proving the opening came from familiarity rather than a flat default.
  const guardRow = drawer.locator('.rel-row', { hasText: 'Captain Halden' });
  await expect(guardRow.locator('.rel-type')).toHaveText('Stranger');
});
