---
status: done
depends: [p8a-world-map-sidebar]
specs:
  - specs/behaviors/llm-narrator.md
---

# P8b — Narrator E2E Test

## Scope

Add a Playwright E2E test that verifies the narrator path end-to-end: the API call is made, a mock response is returned, and `DaySummaryBlock` (`.day-summary`) renders in the Events feed.

## Implements

- `specs/behaviors/llm-narrator.md` — narrator fires at day rollover, summary appears in EventFeed

## Approach

`fetchDaySummary` checks `import.meta.env.VITE_CLAUDE_API_KEY` first and returns `null` if unset. Vite replaces this at build time, so no amount of runtime injection can set `import.meta.env`. However, if `narrator.ts` is changed to also check `window.__e2eNarratorKey` as a fallback, Playwright's `page.addInitScript` can inject a fake key before the page loads (the `||` fallback survives Vite compilation). Then `page.route` intercepts the actual `https://api.anthropic.com/v1/messages` fetch and returns mock JSON.

Steps:
1. Update `narrator.ts`: add `|| (typeof window !== 'undefined' ? (window as any).__e2eNarratorKey : undefined)` fallback after the `VITE_CLAUDE_API_KEY` read.
2. Write `tests/narrator.spec.ts`:
   - `page.addInitScript(() => { (window as any).__e2eNarratorKey = 'e2e-test-key'; })`
   - `page.route('https://api.anthropic.com/**', ...)` → returns `{ content: [{ type: 'text', text: '...' }] }`
   - Navigate, speed to 20×, click Events tab, wait for `.day-summary` visible

## Validation

- [x] `page.route` intercepts the Anthropic API call (no real network request in CI)
- [x] `.day-summary` becomes visible in the Events feed within timeout
- [x] `.summary-prose` contains the mocked text
- [x] All 10 existing Playwright tests still pass (no regression)
- [x] `tsc --noEmit` and `svelte-check` both pass

## Risks / unknowns

- Vite may tree-shake or constant-fold `undefined || window.__e2eNarratorKey` — verify compiled output passes the guard.
- Narrator fires at `hour === 0 && day > 0`. At 20× speed, day 1 arrives in ~2–3s; timeout set to 12s.

## Notes

`narrator.ts`: added `|| (typeof window !== 'undefined' ? (window as any).__e2eNarratorKey : undefined)` fallback. Vite replaces `import.meta.env.VITE_CLAUDE_API_KEY` with `undefined` at build time; the `||` fallback survives, so `page.addInitScript` can inject a fake key at runtime. `page.route('https://api.anthropic.com/**', ...)` intercepts the fetch and returns `{ content: [{ type: 'text', text: '...' }] }`. Narrator fires at `hour === 0 && day > 0` — at 20× speed day 1 arrives in ~2–3s; test completed in 5.6s. 11/11 Playwright tests pass.

## Follow-ups

None.
