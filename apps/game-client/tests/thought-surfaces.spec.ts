import { test, expect } from '@playwright/test';
import { FEATURES } from '../src/lib/featureFlags';

/**
 * P12d — thought surfaces (specs/behaviors/thought-system.md).
 *
 * 1. Character detail shows a non-empty "Inner voice" for a roster member.
 * 2. Townsfolk detail (via the ?e2e=npc seeded relationship row) shows the NPC's
 *    want and current thought.
 * 3. The ?e2e=decision choice card lists the subject's name and thought.
 * 4. Purity smoke at the UI layer: while paused, two immediate reads of the
 *    inner voice are identical (derived (worldSeed, actorId, tick) stream).
 */

test('character detail shows a non-empty Inner voice', async ({ page }) => {
  await page.goto('/');

  const card = page.locator('.roster-dock .card').first();
  await expect(card).toBeVisible({ timeout: 12_000 });
  await card.click();

  const drawer = page.locator('.detail-drawer');
  await expect(drawer).toBeVisible();

  const voice = drawer.locator('.inner-voice');
  await expect(voice).toBeVisible();
  const text = (await voice.textContent())?.trim() ?? '';
  expect(text.length).toBeGreaterThan(0);
  expect(text).not.toMatch(/\{[a-z]+\}/i); // no unfilled slot tokens
});

test('townsfolk detail shows want and current thought', async ({ page }) => {
  await page.goto('/?e2e=npc');

  const reikoCard = page.locator('.roster-dock .card', { hasText: 'Reiko' });
  await expect(reikoCard).toBeVisible({ timeout: 12_000 });
  await reikoCard.click();

  const drawer = page.locator('.detail-drawer');
  await expect(drawer).toBeVisible();
  await drawer.locator('.rel-row', { hasText: 'Captain Halden' }).click();

  await expect(drawer.locator('.townsfolk-tag')).toHaveText('Townsfolk');
  await expect(drawer.locator('.want')).toContainText('walls');
  const voice = drawer.locator('.inner-voice');
  await expect(voice).toBeVisible();
  expect(((await voice.textContent()) ?? '').trim().length).toBeGreaterThan(0);
});

test('choice card lists the subject name and thought', async ({ page }) => {
  test.skip(!FEATURES.divineIntervention, 'Decision moments hidden with Divine Intervention');
  await page.goto('/?e2e=decision');

  const card = page.locator('.primary-card');
  await expect(card).toBeVisible({ timeout: 12_000 });

  const subjectThought = card.locator('.subject-thought');
  await expect(subjectThought).toBeVisible();
  await expect(subjectThought.locator('.subject-name')).toContainText('Reiko');
  const thoughtText = (await subjectThought.locator('.subject-text').textContent())?.trim() ?? '';
  expect(thoughtText.length).toBeGreaterThan(0);
  expect(thoughtText).not.toMatch(/\{[a-z]+\}/i);
});

test('inner voice is stable across two immediate reads while paused', async ({ page }) => {
  await page.goto('/');

  // Pause the loop so the tick — and therefore the derived stream — is frozen.
  await page.locator('.speed-btn', { hasText: '⏸' }).click();

  const card = page.locator('.roster-dock .card').first();
  await expect(card).toBeVisible({ timeout: 12_000 });
  await card.click();

  const voice = page.locator('.detail-drawer .inner-voice');
  await expect(voice).toBeVisible();
  const first = (await voice.textContent())?.trim();
  const second = (await voice.textContent())?.trim();
  expect(second).toBe(first);
  expect((first ?? '').length).toBeGreaterThan(0);
});
