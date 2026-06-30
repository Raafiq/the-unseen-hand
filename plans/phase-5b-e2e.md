---
status: done
depends: [phase-5-ui]
specs:
  - specs/architecture.md
issues: []
pr: ~
---

# Plan: Phase 5b — Playwright E2E Smoke Tests

## Scope

Add Playwright to `apps/game-client` and write `tests/smoke.spec.ts` covering the six
required smoke scenarios. Replace the open manual browser validation items in the P5 plan
with automated Playwright assertions. After this plan is done, P5 is fully verified and P6
is unblocked.

**Out of scope:** component-level Vitest tests, visual regression, full interaction coverage.
This is a smoke gate — proves the app boots and the simulation runs.

## Implements

- **`specs/architecture.md` — E2E tests (Playwright)** — the required coverage list and
  the "no manual browser validation" rule.

## Approach

1. **Install Playwright** — `pnpm --filter game-client add -D @playwright/test` + `pnpm exec playwright install chromium` (Chromium only — no need for Firefox/WebKit here).

2. **`apps/game-client/playwright.config.ts`** — `webServer` points at `vite preview`
   (i.e. `pnpm --filter game-client preview`); `baseURL: 'http://localhost:4173'`; single
   `chromium` project; `testDir: './tests'`.

3. **`apps/game-client/tests/smoke.spec.ts`** — six assertions:
   - **App mounts** — `.topbar` element present (DOM presence check).
   - **Nav tabs present** — exactly 4 nav tab elements visible.
   - **Simulation running** — run at 20×; poll the event feed via `waitForFunction`;
     within 8 s there are ≥ 3 event rows. (Used `waitForFunction + count()` rather than
     `toHaveCount(3)` since event count exceeds 3 by the time the assertion fires.)
   - **Speed control active class** — click the 5× speed button; assert it gains `.active`
     class; assert 1× button loses `.active` class.
   - **Events tab clears badge** — run at 20×; wait for Events nav badge to appear; click
     Events tab; assert badge disappears.
   - **DI meter non-zero** — `.di-bar-fill` has `style.width` > 0 % (starts at 50).

4. **`apps/game-client/package.json`** — `"test:e2e": "vite build && playwright test"` —
   build always runs before Playwright so `vite preview` serves fresh output.

5. **Run and verify** — `pnpm --filter game-client test:e2e` — all 6 tests green.

6. **Update P5 plan** — manual browser checklist items noted as resolved in P5 Notes.

## Validation

- [x] `@playwright/test` installed in `apps/game-client` devDependencies.
- [x] `playwright.config.ts` exists in `apps/game-client/`; `webServer` targets `vite preview`.
- [x] `apps/game-client/tests/smoke.spec.ts` exists with ≥ 6 test assertions.
- [x] `"test:e2e"` script present in `apps/game-client/package.json`.
- [x] `pnpm --filter game-client build` exits 0.
- [x] `pnpm --filter game-client test:e2e` — all 6 smoke tests pass (green).
- [x] `tsc --noEmit` still passes (no regressions from new devDeps).
- [x] `svelte-check` still passes.
- [x] P5 manual browser checklist items noted as resolved in P5 Notes.

## Risks / unknowns

- **Selector stability** — smoke selectors depend on DOM structure from P5. If the component
  uses BEM-style class names consistently, selectors should be stable; otherwise use
  `data-testid` attributes added in this plan.
- **`vite preview` port** — defaults to 4173; confirm no conflict with dev server (5173).
- **Playwright Chromium download** — first run downloads ~150 MB; subsequent runs use cache.
  Not a problem locally but worth noting for any future CI setup.

## Notes

All 6 tests implemented and green in a single session. Key learnings:
- `packages/core` dist must be built before `vite build` can succeed (`createScenario1Context`
  is exported from core but not in stale dist — fixed by running `pnpm --filter @ugs/core build`
  first; the `test:e2e` script encodes this as a pre-step).
- `toHaveCount(N)` is exact — fast sims exceed the target before the assertion resolves; use
  `waitForFunction` + `count()` instead for "at least N" semantics.
- Simulation must run at 20× for timing-sensitive tests (events within 5 s, badge appearance);
  1× is too slow for smoke-test timeouts.

## Follow-ups

- None. P5 is now fully verified. P6 is unblocked.
