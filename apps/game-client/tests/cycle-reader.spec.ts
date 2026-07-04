import { test, expect, type Page } from '@playwright/test';

/**
 * P15d — Cycle Reader UI (specs/screens/event-feed.md).
 *
 * The primary surface is now a per-character reading experience: each PROCEED composes the
 * just-completed cycle into a spread (overview + chapter cards), with the terse chronological
 * feed preserved as a per-cycle "Raw log" drill-down. Driven by the interim top-bar Proceed
 * button (the world is turn-paced and halts between cycles).
 *
 * The default scenario-1 seed is deterministic: the first Proceed (Day 0 · Afternoon) already
 * gives the lone adventurer, Reiko, a chapter (a relationship beat + a surfaced thought); the
 * following cycle (Day 0 · Night) has no meaningful event for her, so it renders an overview but
 * no chapter card — the "no placeholder" guarantee, live.
 */

async function proceed(page: Page, times = 1): Promise<void> {
  for (let i = 0; i < times; i++) await page.locator('.proceed-btn').click();
}

test('a Proceed renders the cycle spread: header, overview, and a chapter per eventful character', async ({ page }) => {
  await page.goto('/');

  // Resting empty state before any cycle is computed — no placeholder spread.
  await expect(page.locator('.reader-empty')).toBeVisible();
  await expect(page.locator('.cycle-spread')).toHaveCount(0);

  await proceed(page);

  const spread = page.locator('.cycle-spread').last();
  await expect(spread.locator('.spread-header')).toHaveText('Day 0 · Afternoon');
  await expect(spread.locator('.cycle-overview')).not.toBeEmpty();

  // Reiko had a meaningful cycle → exactly one chapter card, with clean prose.
  const cards = spread.locator('.chapter-card');
  await expect(cards).toHaveCount(1); // single-adventurer scenario
  const prose = (await cards.first().locator('.chapter-prose').textContent())?.trim() ?? '';
  expect(prose.length).toBeGreaterThan(0);
  expect(prose).not.toMatch(/\{[a-z]+\}/i);                 // no unfilled slot tokens
  expect(prose).not.toMatch(/\b[A-Z]{2,}(_[A-Z]+)+\b/);     // no raw outcome labels (ARGUMENT, BEAT_LOG…)
});

test('a cycle with no meaningful events for a character shows no chapter card (no placeholder)', async ({ page }) => {
  await page.goto('/');
  await proceed(page, 2); // cycle 2 = Day 0 · Night: nothing meaningful for Reiko

  const night = page.locator('.cycle-spread').last();
  await expect(night.locator('.spread-header')).toHaveText('Day 0 · Night');
  // Overview still frames the cycle, but there is no chapter card — a quiet marker, not a filler chapter.
  await expect(night.locator('.cycle-overview')).toBeVisible();
  await expect(night.locator('.chapter-card')).toHaveCount(0);
  await expect(night.locator('.spread-quiet')).toBeVisible();
});

test('Raw log toggle reveals chronological rows; kind filters narrow them; All resets', async ({ page }) => {
  await page.goto('/');
  await proceed(page);

  const spread = page.locator('.cycle-spread').last();
  await spread.locator('.raw-log-toggle').click();

  const rawLog = spread.locator('.raw-log');
  const rows = rawLog.locator('.event-row');
  const total = await rows.count();
  expect(total).toBeGreaterThan(0);

  // Each row is a terse ledger line: time label, kind tag, and deterministic text.
  const firstRow = rows.first();
  await expect(firstRow.locator('.time-label')).toContainText('Day 0, hour');
  await expect(firstRow.locator('.type-tag')).toBeVisible();
  await expect(firstRow.locator('.event-text')).not.toBeEmpty();

  // Filter to the first kind present: only rows with that tag remain.
  const label = (await rawLog.locator('.event-row .type-tag').first().textContent())?.trim() ?? '';
  await rawLog.locator('.filter-bar .filter-btn', { hasText: new RegExp(`^${label}$`) }).click();
  const tags = rawLog.locator('.event-row .type-tag');
  const filteredCount = await tags.count();
  expect(filteredCount).toBeGreaterThan(0);
  for (let i = 0; i < filteredCount; i++) {
    await expect(tags.nth(i)).toHaveText(label);
  }

  // "All" restores the full set.
  await rawLog.locator('.filter-bar .filter-btn', { hasText: /^All$/ }).click();
  await expect(rawLog.locator('.event-row')).toHaveCount(total);
});

test('selecting a roster card focuses (highlights) that character\'s chapter', async ({ page }) => {
  await page.goto('/');
  await proceed(page);

  // No chapter is highlighted until a character is selected to read.
  await expect(page.locator('.chapter-card.focused')).toHaveCount(0);

  await page.locator('.roster-dock .card', { hasText: 'Reiko' }).click();

  // The dock click focuses Reiko's chapter card (scroll + highlight) alongside opening her drawer.
  const focused = page.locator('.chapter-card.focused');
  await expect(focused).toBeVisible();
  await expect(focused).toHaveAttribute('data-chapter-actor', 's1-reiko');
});

test('a notable-NPC co-participant initial opens their townsfolk detail (not a dead click)', async ({ page }) => {
  await page.goto('/');
  await proceed(page); // Day 0 · Afternoon: Reiko's chapter shares a beat with the smith, Brenna (an NPC)

  const coParticipant = page.locator('.chapter-card .co-participants .portrait-init').first();
  await expect(coParticipant).toBeVisible();
  await coParticipant.click();

  // Brenna has no chapter to focus, so the click routes to her townsfolk detail drawer instead.
  const drawer = page.locator('.detail-drawer');
  await expect(drawer).toBeVisible();
  await expect(drawer.locator('.townsfolk-tag')).toHaveText('Townsfolk');
});

test('prior cycles stack as re-readable spreads (history / scrollback)', async ({ page }) => {
  await page.goto('/');
  await proceed(page, 3);

  const spreads = page.locator('.cycle-spread');
  await expect(spreads).toHaveCount(3);

  // Oldest → newest, in cycle order (newest is the resting spread at the bottom).
  await expect(spreads.nth(0).locator('.spread-header')).toHaveText('Day 0 · Afternoon');
  await expect(spreads.nth(1).locator('.spread-header')).toHaveText('Day 0 · Night');
  await expect(spreads.nth(2).locator('.spread-header')).toHaveText('Day 1 · Morning');
});
