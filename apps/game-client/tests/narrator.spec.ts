import { test, expect } from '@playwright/test';

/**
 * Verifies the LLM cycle set-piece end-to-end (specs/behaviors/cycle-narrative.md §"LLM tier",
 * specs/behaviors/llm-narrator.md — retargeted from the former per-day summary in p15c):
 * - page.addInitScript injects a fake key into window.__e2eNarratorKey so the narrator's apiKey
 *   guard passes (import.meta.env.VITE_CLAUDE_API_KEY is undefined in the built output; the
 *   window fallback survives Vite compilation).
 * - page.route intercepts the Anthropic API fetch and returns mocked prose, distinguishing the
 *   cycle-overview prompt from a per-character chapter prompt by the prompt body.
 * - A single Proceed composes the cycle; the deterministic *template* overview + chapter render
 *   immediately, then the mocked LLM passages replace them in place (replace-on-arrival) at the
 *   same `.cycle-overview` / `.chapter-prose` surfaces — keys stable, no reflow.
 */

const OVERVIEW_PROSE = 'Fate\'s ledger marks a hollow reckoning over Thornvale.';
const CHAPTER_PROSE = 'She carries the weight of the hour like a stone she cannot set down.';

test('the LLM cycle overview and chapter replace the template passages after a Proceed', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__e2eNarratorKey = 'e2e-test-key';
  });

  // Return the overview prose for the overview prompt (asks to "establish" the guild's cycle) and
  // the chapter prose for a per-character prompt (asks to tell "this one character's story").
  await page.route('https://api.anthropic.com/**', async route => {
    const body = route.request().postDataJSON() as { system?: string };
    const isChapter = /story of the cycle/i.test(body?.system ?? '');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ content: [{ type: 'text', text: isChapter ? CHAPTER_PROSE : OVERVIEW_PROSE }] }),
    });
  });

  await page.goto('/');

  // Advance one cycle (Day 0 · Afternoon) — Reiko gets a chapter, so overview + chapter both fire.
  await page.locator('.proceed-btn').click();

  const spread = page.locator('.cycle-spread').last();
  // The LLM overview replaces the template overview in place.
  await expect(spread.locator('.cycle-overview')).toContainText('reckoning', { timeout: 12_000 });
  // The LLM chapter replaces the template chapter prose in place.
  await expect(spread.locator('.chapter-card .chapter-prose')).toContainText('stone she cannot set down', { timeout: 12_000 });
});
