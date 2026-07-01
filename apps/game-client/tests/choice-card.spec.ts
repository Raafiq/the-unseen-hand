import { test, expect } from '@playwright/test';

/**
 * Verifies the ChoiceCard renders in the right panel when a decision moment is pending.
 *
 * The single-adventurer scenario-1 produces no decision moments organically (Kara alone can't
 * field the size-2/3 quests, so PARTY_SELECTION never fires), so this drives the app through its
 * `?e2e=decision` seam, which injects one deterministic PARTY_SELECTION moment at load. The test
 * still exercises the real store → App → ChoiceCard render path — it just doesn't wait on
 * emergent board luck (see simulationStore.svelte.ts).
 */
test('ChoiceCard renders when a decision moment is pending', async ({ page }) => {
  await page.goto('/?e2e=decision');

  const primaryCard = page.locator('.primary-card');
  await expect(primaryCard).toBeVisible({ timeout: 12_000 });

  // Card must show situation text
  const situationText = primaryCard.locator('.situation-text');
  await expect(situationText).not.toBeEmpty();

  // At least one option button must be present
  const options = page.locator('.option-btn');
  expect(await options.count()).toBeGreaterThan(0);
});

test('ChoiceCard shows expiry countdown', async ({ page }) => {
  await page.goto('/?e2e=decision');

  await expect(page.locator('.primary-card')).toBeVisible({ timeout: 12_000 });

  const expiry = page.locator('.primary-card .expiry');
  await expect(expiry).toContainText('ticks');
});
