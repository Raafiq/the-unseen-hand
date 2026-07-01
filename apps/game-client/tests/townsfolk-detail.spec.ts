import { test, expect } from '@playwright/test';

/**
 * Verifies the townsfolk (Tier A notable NPC) detail view.
 *
 * Townsfolk↔adventurer edges form only after emergent town encounters, so this drives the app
 * through its `?e2e=npc` seam, which seeds one deterministic FRIEND edge between Reiko and the
 * guard captain (Halden) at load (see simulationStore.svelte.ts). The test exercises the real
 * relationship-row → NpcDetail path and the re-target back to the adventurer.
 *
 * Spec: specs/behaviors/npc-system.md#ui--townsfolk-detail
 */
test('townsfolk detail opens from a relationship row and re-targets back', async ({ page }) => {
  await page.goto('/?e2e=npc');

  // Select Reiko in the roster dock to open her character detail drawer.
  const reikoCard = page.locator('.roster-dock .card', { hasText: 'Reiko' });
  await expect(reikoCard).toBeVisible({ timeout: 12_000 });
  await reikoCard.click();

  const drawer = page.locator('.detail-drawer');
  await expect(drawer).toBeVisible();

  // The seeded townsfolk relationship row is present, tagged, and clickable.
  const haldenRow = drawer.locator('.rel-row', { hasText: 'Captain Halden' });
  await expect(haldenRow).toBeVisible();
  await expect(haldenRow.locator('.rel-name em')).toHaveText('[townsfolk]');
  await haldenRow.click();

  // The drawer now shows the townsfolk detail: tag, role label, bio, trait bars.
  await expect(drawer.locator('.townsfolk-tag')).toHaveText('Townsfolk');
  await expect(drawer.locator('.role-badge')).toHaveText('Guard Captain');
  await expect(drawer.locator('.bio')).toContainText('town watch');
  expect(await drawer.locator('.axis-row').count()).toBeGreaterThan(0);

  // Adventurer-only sections are absent for a townsfolk (no goal / history timeline).
  await expect(drawer.locator('.goal-name')).toHaveCount(0);

  // Re-target back to Reiko via the townsfolk's own relationship row.
  const reikoRow = drawer.locator('.rel-row', { hasText: 'Reiko' });
  await expect(reikoRow).toBeVisible();
  await reikoRow.click();

  // Back on the character detail — the adventurer-only goal section returns, townsfolk tag gone.
  await expect(drawer.locator('.goal-name')).toBeVisible();
  await expect(drawer.locator('.townsfolk-tag')).toHaveCount(0);
});
