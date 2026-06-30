import { test, expect } from '@playwright/test';

/**
 * Verifies that ChoiceCard renders in the right panel when pendingDecisions
 * are populated. PARTY_SELECTION fires at tick 1 for any difficulty 7+ quest
 * (scenario-1 fixed seed; computeQuestProbability with mood=30 → -0.04 modifier
 * → difficulty 7 yields 0.26 < PARTY_SELECTION_THRESHOLD 0.30).
 */
test('ChoiceCard renders when a decision moment is pending', async ({ page }) => {
  await page.goto('/');

  // Speed up to ensure a moment fires well within the timeout
  await page.locator('.speed-btn', { hasText: '20×' }).click();

  // Wait for the primary card to appear in the right panel
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
  await page.goto('/');
  await page.locator('.speed-btn', { hasText: '20×' }).click();

  await expect(page.locator('.primary-card')).toBeVisible({ timeout: 12_000 });

  const expiry = page.locator('.primary-card .expiry');
  await expect(expiry).toContainText('ticks');
});
