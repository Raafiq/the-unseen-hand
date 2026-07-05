import { test, expect } from '@playwright/test';
import { FEATURES } from '../src/lib/featureFlags';

/**
 * Verifies the ChoiceCard renders in the right panel when a decision moment is pending.
 *
 * The single-adventurer scenario-1 produces no decision moments organically (Reiko alone can't
 * field the size-2/3 quests, so PARTY_SELECTION never fires), so this drives the app through its
 * `?e2e=decision` seam, which injects one deterministic PARTY_SELECTION moment at load. The test
 * still exercises the real store → App → ChoiceCard render path — it just doesn't wait on
 * emergent board luck (see simulationStore.svelte.ts).
 */
test('ChoiceCard renders when a decision moment is pending', async ({ page }) => {
  test.skip(!FEATURES.divineIntervention, 'Decision moments hidden with Divine Intervention');
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

test('ChoiceCard shows the expiry countdown in ticks and cycles (never wall-clock)', async ({ page }) => {
  test.skip(!FEATURES.divineIntervention, 'Decision moments hidden with Divine Intervention');
  await page.goto('/?e2e=decision');

  await expect(page.locator('.primary-card')).toBeVisible({ timeout: 12_000 });

  // Turn-paced world → the countdown reads in ticks / cycles remaining, not minutes (decision-moments.md).
  const expiry = page.locator('.primary-card .expiry');
  await expect(expiry).toContainText('ticks');
  await expect(expiry).toContainText('cycle');
});

test('a boundary decision does not gate Proceed — the world advances and the moment rides on', async ({ page }) => {
  test.skip(!FEATURES.divineIntervention, 'Decision moments hidden with Divine Intervention');
  await page.goto('/?e2e=decision');

  // The moment is surfaced at the boundary alongside the reads.
  await expect(page.locator('.primary-card')).toBeVisible({ timeout: 12_000 });
  const dateBefore = await page.locator('.world-time').textContent();

  // Proceed is not gated by the pending decision (autonomy-of-outcomes): the world advances a cycle.
  await page.locator('.proceed-btn').click();
  await expect(page.locator('.world-time')).not.toHaveText(dateBefore ?? '');
  await expect(page.locator('.cycle-spread').last()).toBeVisible();

  // The unresolved moment rides on toward its expiry rather than blocking advancement.
  await expect(page.locator('.primary-card')).toBeVisible();
});
