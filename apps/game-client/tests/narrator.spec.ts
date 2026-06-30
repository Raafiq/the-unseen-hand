import { test, expect } from '@playwright/test';

/**
 * Verifies the narrator path end-to-end:
 * - page.addInitScript injects a fake key into window.__e2eNarratorKey so the
 *   narrator's apiKey guard passes (import.meta.env.VITE_CLAUDE_API_KEY is
 *   undefined in the built output; the fallback survives Vite compilation).
 * - page.route intercepts the Anthropic API fetch and returns mocked prose.
 * - DaySummaryBlock (.day-summary) appears in the Events feed once a full day
 *   has passed and the narrator resolves.
 *
 * Narrator fires at hour === 0 && day > 0. At 20× speed day 1 arrives in ~2-3s.
 */
test('DaySummaryBlock renders after narrator mock response', async ({ page }) => {
  // Inject fake key before any app scripts run
  await page.addInitScript(() => {
    (window as any).__e2eNarratorKey = 'e2e-test-key';
  });

  // Intercept the Anthropic API call and return mock prose
  await page.route('https://api.anthropic.com/**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        content: [{ type: 'text', text: 'The guild stirred as dawn broke over Thornvale.' }],
      }),
    });
  });

  await page.goto('/');

  // Speed up so day 1 arrives quickly
  await page.locator('.speed-btn', { hasText: '20×' }).click();

  // Switch to Events tab where day summaries appear
  await page.locator('button', { hasText: 'Events' }).click();

  // DaySummaryBlock must appear once the narrator resolves
  await expect(page.locator('.day-summary')).toBeVisible({ timeout: 12_000 });

  // Prose must contain the mocked text
  await expect(page.locator('.summary-prose')).toContainText('guild');
});
