/**
 * Bot player — UI regression scanner.
 *
 * Runs the simulation at 20× for 8 seconds across the shell (event feed,
 * roster dock, character detail), then scans the rendered DOM for:
 *
 *   1. Float precision leaks in CSS `width` style attributes
 *      e.g. width:22.499999999999996% from an unrounded mood value
 *
 *   2. Bar widths outside [0, 100]%
 *      e.g. an unclamped percentage overflowing the container
 *
 *   3. Bad values in visible text (NaN, Infinity, undefined)
 *
 *   4. Floating-point numbers visible as text in numeric display elements
 *      e.g. DI showing "33.3333" instead of "33"
 *
 * Run with: pnpm --filter game-client test:e2e
 */
import { test, expect, type Page } from '@playwright/test';
import { FEATURES } from '../src/lib/featureFlags';

// ---------------------------------------------------------------------------
// DOM scanner — runs inside the browser via page.evaluate
// ---------------------------------------------------------------------------

type UiIssue = { tab: string; category: string; selector: string; value: string };

/** CSS classes whose text content is expected to show a plain integer/clean number. */
const NUMERIC_DISPLAY_CLASSES = [
  'di-value',
  'rep-value',
  'mood-score',
  'quest-reward',
  'treasury-rep',
];

async function scanPage(page: Page, tab: string): Promise<UiIssue[]> {
  return page.evaluate(
    ([tabName, numericClasses]: [string, string[]]) => {
      const issues: Array<{ tab: string; category: string; selector: string; value: string }> = [];

      // Regex literals can't cross the evaluate boundary — reconstruct them
      const FLOAT_IN_PCT = /(\d+\.\d{3,})%/;
      const FLOAT_IN_TEXT = /\b\d+\.\d{3,}\b/;
      const BAD_KEYWORD = /\b(NaN|Infinity|-Infinity|undefined)\b/;

      function label(el: Element): string {
        const cls = String(el.className).trim().split(/\s+/).slice(0, 3).join('.');
        return `<${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}>`;
      }

      // 1. Check all elements with inline styles for float-precision in % widths
      for (const el of Array.from(document.querySelectorAll('[style]'))) {
        const style = (el as HTMLElement).getAttribute('style') ?? '';
        const m = FLOAT_IN_PCT.exec(style);
        if (m) {
          issues.push({ tab: tabName, category: 'float-precision-css', selector: label(el), value: `"${m[0]}" in style="${style}"` });
        }
        const wm = /width:\s*([\d.]+)%/.exec(style);
        if (wm) {
          const pct = parseFloat(wm[1]);
          if (pct > 100.01)
            issues.push({ tab: tabName, category: 'bar-overflow', selector: label(el), value: `width=${pct}%` });
          if (pct < 0)
            issues.push({ tab: tabName, category: 'bar-negative', selector: label(el), value: `width=${pct}%` });
        }
      }

      // 2. Walk all text nodes for NaN/Infinity/undefined
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const text = node.textContent ?? '';
        const trimmed = text.trim();
        if (!trimmed) continue;
        const parent = (node as Text).parentElement;
        if (!parent || ['SCRIPT', 'STYLE', 'TEMPLATE'].includes(parent.tagName)) continue;

        if (BAD_KEYWORD.test(trimmed)) {
          issues.push({ tab: tabName, category: 'bad-value', selector: label(parent), value: trimmed });
        }
      }

      // 3. Check only numeric-display elements for float text precision
      for (const cls of numericClasses) {
        for (const el of Array.from(document.querySelectorAll(`.${cls}`))) {
          const text = (el.textContent ?? '').trim();
          if (FLOAT_IN_TEXT.test(text)) {
            issues.push({ tab: tabName, category: 'float-in-numeric-text', selector: label(el), value: text });
          }
        }
      }

      return issues;
    },
    [tab, NUMERIC_DISPLAY_CLASSES] as [string, string[]],
  );
}

// ---------------------------------------------------------------------------
// Bot player test
// ---------------------------------------------------------------------------

test('bot player: proceed through cycles, scan the shell for UI precision and bad values', async ({ page }) => {
  await page.goto('/');

  const allIssues: UiIssue[] = [];

  async function visit(label: string, navigate: () => Promise<void>): Promise<void> {
    await navigate();
    await page.waitForTimeout(150);
    const issues = await scanPage(page, label);
    allIssues.push(...issues);
  }

  // Turn-paced: advance several cycles to accumulate diverse state (mood, spreads, raw-log rows).
  const proceedBtn = page.locator('.proceed-btn');
  for (let i = 0; i < 6; i++) await proceedBtn.click();

  // The reader shows the spread stack — expand every raw log so ledger rows are scanned too.
  await visit('shell', async () => {
    await expect(page.locator('.cycle-spread').last()).toBeVisible();
    for (const t of await page.locator('.raw-log-toggle').all()) await t.click();
  });

  // Roster dock is persistent — open a character's detail drawer.
  await visit('character-detail', async () => {
    const card = page.locator('.roster-dock .card').first();
    if (await card.count() > 0) await card.click();
  });

  // World region sidebar (flag-gated)
  if (FEATURES.world) {
    await visit('world', async () => {
      const regionHeader = page.locator('.region-header').first();
      if (await regionHeader.count() > 0) await regionHeader.click();
    });
  }

  // Advance more cycles then re-scan (mood will have shifted).
  for (let i = 0; i < 4; i++) await proceedBtn.click();

  await visit('shell-late', async () => {
    const card = page.locator('.roster-dock .card').first();
    if (await card.count() > 0) await card.click();
  });

  if (allIssues.length > 0) {
    // Deduplicate by (category, selector) so a scrolling feed doesn't spam the report
    const seen = new Set<string>();
    const unique = allIssues.filter(i => {
      const key = `${i.category}|${i.selector}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const report = unique
      .map(i => `  [${i.tab}] ${i.category}\n    on: ${i.selector}\n    value: ${i.value}`)
      .join('\n');
    expect.fail(`${unique.length} UI issue(s) found (deduplicated by selector):\n${report}`);
  }
});
