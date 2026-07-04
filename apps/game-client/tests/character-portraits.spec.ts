import { test, expect } from '@playwright/test';

/**
 * Verifies character portrait resolution end-to-end (behaviors/character-portraits.md).
 *
 * Art exists for Reiko (adventurer), Brenna and Father Oswin (notable NPCs); no art exists for
 * Marsa or Captain Halden, which must fall back to the colored-initial circle. Driven on a plain
 * `/` load so the real base-path asset URLs (Vite module-graph manifest) are exercised — no seam.
 */
test('portraits render as images where art exists, circle fallback where it does not', async ({ page }) => {
  await page.goto('/');

  // Roster dock: Reiko has art → an <img> portrait pointing at her asset, not the circle div.
  const reikoCard = page.locator('.roster-dock .card', { hasText: 'Reiko' });
  await expect(reikoCard).toBeVisible({ timeout: 12_000 });
  const reikoDockImg = reikoCard.locator('img.portrait');
  await expect(reikoDockImg).toBeVisible();
  await expect(reikoDockImg).toHaveAttribute('src', /s1-reiko/);

  // Character detail: the large portrait is also an <img> for Reiko.
  await reikoCard.click();
  const drawer = page.locator('.detail-drawer');
  await expect(drawer).toBeVisible();
  await expect(drawer.locator('img.portrait-lg')).toBeVisible();

  // Notable NPC WITH art (Brenna) → image portrait in the townsfolk detail.
  const brennaRow = drawer.locator('.rel-row', { hasText: 'Brenna' });
  await expect(brennaRow).toBeVisible();
  await brennaRow.click();
  await expect(drawer.locator('.townsfolk-tag')).toHaveText('Townsfolk');
  const brennaImg = drawer.locator('img.portrait-lg');
  await expect(brennaImg).toBeVisible();
  await expect(brennaImg).toHaveAttribute('src', /brenna-smith/);

  // Hop back to Reiko (Brenna's detail only carries her edge back to the adventurer, since
  // NPC↔NPC edges aren't modelled) so the other townsfolk rows are reachable again.
  await drawer.locator('.rel-row', { hasText: 'Reiko' }).click();
  await expect(drawer.locator('.goal-name')).toBeVisible();

  // Notable NPC WITHOUT art (Marsa) → colored-circle fallback: a div.portrait-lg with her
  // initial, and no <img> portrait present.
  const marsaRow = drawer.locator('.rel-row', { hasText: 'Marsa' });
  await expect(marsaRow).toBeVisible();
  await marsaRow.click();
  await expect(drawer.locator('.role-badge')).toHaveText('Innkeeper');
  await expect(drawer.locator('img.portrait-lg')).toHaveCount(0);
  await expect(drawer.locator('div.portrait-lg')).toHaveText('M');
});
