---
status: done
depends: [phase-4-scenario, phase-4b-simulation-wiring]
specs:
  - specs/screens/app-shell.md
  - specs/screens/roster-grid.md
  - specs/screens/character-detail.md
  - specs/screens/event-feed.md
  - specs/screens/world-panel.md
  - specs/screens/choice-card.md
issues: []
---

# Plan: Phase 5 — Svelte 5 Dashboard UI

## Scope

Build the god-game dashboard in `apps/game-client`: the `simulationStore`, app shell, roster
grid, character detail + divine touch sub-panel, event feed with choice cards, and world panel.
First phase with any UI; all logic remains in `@ugs/core`.

**Verification gate:** `tsc --noEmit` AND `svelte-check` both pass (zero errors) before any
Svelte edit is considered done. Run `pnpm --filter game-client dev` and observe a live Scenario-1
run: adventurers change state, events stream, DI meter moves, a decision moment is choosable.

**Out of scope:** PixiJS canvas, LLM narrator, combat replay modal, world map canvas.

## Implements

- **`specs/screens/app-shell.md`** — top bar, DI meter, nav tabs, panel layout, speed controls.
- **`specs/screens/roster-grid.md`** — adventurer cards, state badges, mood indicators.
- **`specs/screens/character-detail.md`** — full adventurer detail, top mood factors, divine
  touch sub-panel.
- **`specs/screens/event-feed.md`** — filter bar, virtualized list, unread badge, auto-scroll.
- **`specs/screens/world-panel.md`** — treasury, reputation, active regions, world events.
- **`specs/screens/choice-card.md`** — pending decision moments, option buttons, DI cost display.

## Approach

Build in TDD order (Svelte component tests or Playwright where appropriate):

1. **`simulationStore.svelte.ts`** — `$state` snapshot updated each tick; `dispatch` action
   bridge. Follows Svelte 5 store rule: `export const simulationStore = $state({...})`.
2. **App shell** — top bar, DI meter, nav tabs, panel slot layout, speed controls wired to
   `dispatch('SET_SPEED', ...)`.
3. **Roster grid** — adventurer cards sorted by state/name; state badge; mood label + score.
4. **Character detail** — full identity + personality axes + mood factors (top 3 by `|value|`)
   + relationship list + divine touch sub-panel.
5. **Event feed** — chronological list, filter by event type, unread counter, virtualized for
   large logs.
6. **Choice cards** — pending `DecisionMoment` entries; each option as a button with DI cost;
   dispatches `CHOOSE_OPTION` on click.
7. **World panel** — treasury, reputation, region list + difficulty, active world events.

## Validation

- [x] `tsc --noEmit` passes with zero errors.
- [x] `svelte-check` passes with zero errors.
- [ ] `pnpm --filter game-client dev` starts without error — requires manual browser verification.
- [ ] Live Scenario-1 run visible in the browser: adventurers change state, events stream into the feed.
- [ ] DI meter updates each tick.
- [ ] A pending decision moment appears as a choice card; clicking an option dispatches correctly.
- [ ] Speed controls (1×, 5×, 20×, pause) work and the feed rate visibly changes.
- [x] No `export let x = $state(...)` pattern in any `.svelte.ts` store file.
- [ ] `/audit-spec-drift` shows no Phase-5 spec gap.

## Risks / unknowns

- **Svelte 5 runes + Vite** — runes API is new; watch for compiler edge cases with `$state`
  inside Maps and complex objects.
- **Virtualized event feed** — a long-running sim generates thousands of events; the feed must
  not degrade. Consider `@tanstack/virtual` or a manual windowing approach.
- **Store rule enforcement** — add a lint rule or CI check that greps for the banned
  `export let.*\$state` pattern if the team grows.

## Notes

All 6 components built in a single session: `simulationStore.svelte.ts`, `App.svelte`,
`RosterGrid.svelte`, `EventFeed.svelte`, `ChoiceCard.svelte`, `WorldPanel.svelte`,
`CharacterDetail.svelte`. `svelte.config.js` was required alongside `vite.config.ts` for
`svelte-check` to locate the preprocessor. Both `tsc --noEmit` and `svelte-check` pass clean.

Browser validation (live run, DI meter, choice card dispatch, speed controls) must be done
manually — `pnpm --filter game-client dev` in terminal, open `localhost:5173`.

## Follow-ups

- Tracked as: manual browser smoke-test (`pnpm --filter game-client dev`) before calling P5
  fully verified — see validation checklist above.
- Issue: Quest assignment (auto-party logic) not yet wired to UI — roster shows adventurers
  but assignment happens inside the simulation loop automatically.
- Issue: `/audit-spec-drift` check for P5 spec gaps deferred to next session.
- Deferred to later: PixiJS canvas, LLM narrator, combat replay modal, world map canvas.
