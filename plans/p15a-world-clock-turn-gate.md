---
status: done
depends: []
specs:
  - specs/behaviors/world-clock.md
  - specs/principles.md
issues: []
---

# Plan: P15a — World clock turn-gate (cycles + PROCEED)

> The engine foundation of the cycle redesign. Adds the three-cycle day and the `PROCEED`
> command that computes exactly one cycle (8 ticks) synchronously, halts at the boundary, and
> returns a cycle digest. Retires the real-time interval / speed model. Pure `@ugs/core` change;
> the client keeps compiling because the old speed API is left in place (deprecated) until P15e
> removes it alongside the UI — this plan leaves the tree green.

## Scope

**In scope:**
- **`WorldTime.cycle`**: add `cycle: Cycle` (`'MORNING' | 'AFTERNOON' | 'NIGHT'`) and the pure
  `cycleOf(hour)` derivation (`hour < 8 ? MORNING : hour < 16 ? AFTERNOON : NIGHT`) in
  `packages/core/src/world/WorldTime.ts`.
- **`PROCEED` command** on `Simulation.dispatch`: computes 8 ticks by calling `step()` eight
  times, runs synchronously to completion (all subscriber side effects written), leaves the clock
  halted, and returns a **cycle digest** `{ fromTick, toTick, day, cycle }`.
- **Command-driven clock**: `WorldClock` no longer schedules an interval. `step()` stays as the
  single-tick primitive that `PROCEED` composes.
- **Deprecate (do not delete yet)** `setSpeed` / `pause` / `resume` / `currentSpeed`: keep them as
  no-op/legacy shims so the current client still builds; removal lands in **P15e** with the top-bar
  rewrite. Mark with a deprecation comment pointing at P15e.

**Out of scope:**
- Narrative composition, LLM, and any UI (P15b–P15e).
- Final deletion of the speed API and the auto-pause store logic (P15e).

## Implements

- `specs/behaviors/world-clock.md` in full — `Cycle`, `cycleOf`, the `PROCEED` command semantics
  (synchronous 8-tick compute, halt, digest), cycle/day boundaries, `step()` retention, and the
  retirement of `setSpeed/pause/resume/currentSpeed` (end state; final removal in P15e).
- `specs/principles.md#autonomy-of-outcomes-player-controlled-tempo` — the engine half: the clock
  advances only on `PROCEED`, and every tick within a `PROCEED` resolves autonomously.

## Approach

`PROCEED` is a thin deterministic loop over the existing `step()` primitive, so it inherits
replayability for free and the tick-subscriber ordering is unchanged — subscribers cannot tell
whether a tick came from an interval or a `PROCEED`. The digest is just the `[fromTick, toTick]`
window plus the resulting `{ day, cycle }`, handed back through the `dispatch` return so the
narrative and UI layers (later plans) can slice the event log for exactly that cycle without
re-deriving boundaries. Leaving the speed methods as deprecated shims keeps the monorepo green
between this plan and P15e rather than forcing a big-bang cross-package change.

## Validation

- [x] `cycleOf` maps hour 0→MORNING, 7→MORNING, 8→AFTERNOON, 15→AFTERNOON, 16→NIGHT, 23→NIGHT (unit).
      (`tests/cycle.test.ts`)
- [x] One `PROCEED` from tick 0 yields `{ tick: 8, day: 0, hour: 8, cycle: 'AFTERNOON' }` and fires
      exactly 8 tick emissions. (`tests/proceed.test.ts`)
- [x] Three `PROCEED`s from tick 0 yield `{ tick: 24, day: 1, hour: 0, cycle: 'MORNING' }`.
- [x] `PROCEED` returns a digest whose `fromTick`/`toTick` cover exactly the 8 computed ticks.
- [x] No ticks fire between `PROCEED` commands (listener-count assertion across an idle span, fake timers).
- [x] Same seed + same command sequence reproduces the identical `WorldTime` sequence and events
      (driven through the real scenario-1 roster so the event log is non-empty).
- [x] `pnpm --filter @ugs/core exec tsc --noEmit` clean and `pnpm --filter @ugs/core test` green
      (628 tests, +7); game-client builds, `svelte-check` clean (0/0), and e2e green (17 passed, 6
      feature-skipped) — the deprecated speed shims kept the interval-driven client working.

## Risks / unknowns

- Callers of `setSpeed/pause/resume` in the client and stores: kept working via shims this plan;
  ensure the deprecation is visible so P15e cleanly removes them. Verify no subscriber implicitly
  relied on interval timing (should be none — all logic is tick-driven).

## Notes

- **`PROCEED` shipped as `SimulationLoop.proceed(): CycleDigest`, not `dispatch({type:'PROCEED'})`.**
  The existing `dispatch` (`divine/DivineTools.ts`) is a pure `ctx → ctx` transformer with no
  subscriber registry, so it cannot drive the tick loop. The loop owns the ordered subscribers and
  the authoritative context `worldTime`, so `proceed()` lives there, composing 8× the private
  `_tick()` (advanceTime → subscribers in registration order, unchanged). The spec's
  `dispatch({type:'PROCEED'})` prose is conceptual; the method is the real surface.
- **Two WorldTime write sites, both updated.** `SimulationLoop.advanceTime()` (the authoritative
  context clock the sim/digest read) and `WorldClock.step()` (the legacy interval counter) each set
  `cycle` via the single `cycleOf(hour)` derivation. `proceed()` reads `fromTick`/`toTick` off the
  **context** worldTime, never `WorldClock._worldTime`.
- **`Cycle` type + `cycle` field + `CycleDigest`** live in `world/types.ts` (the canonical type home,
  auto-exported via `export type *`); the pure `cycleOf` runtime derivation lives in the new
  `world/WorldTime.ts` and is exported from the barrel.
- **Digest `day`/`cycle` label the cycle just computed** (the pre-advance boundary the window opened
  on), captured before the 8 ticks: e.g. the 3rd PROCEED returns `{fromTick:16,toTick:24,day:0,
  cycle:'NIGHT'}` — "night of day 0" — while `worldTime` has advanced to day-1 morning. This is the
  useful label for p15b's per-cycle narrative header.
- **Deprecate-don't-delete kept the interval *functional*, not no-op.** The client's e2e (smoke +
  bot-player) drives the sim through the real-time interval via the speed buttons, so no-op'ing the
  speed methods now would have broken e2e for the whole p15a→p15e span. Instead the speed API is left
  fully working with `@deprecated ... removed in p15e` JSDoc on every method. The spec's "no interval"
  end-state lands in p15e alongside the top-bar Proceed rewrite — deliberate sequencing.
- The ~30 `worldTime: {tick,day,hour}` literals in `packages/core/tests/*` omit `cycle`. They still
  typecheck (core `tsconfig` includes only `src/**/*`) and run fine because no subscriber reads
  `cycle` yet. See follow-up for when that changes.

## Follow-ups

- **Scenario-1 starts mid-cycle (`START_TICK = 9`, hour 9 → AFTERNOON), not on a cycle boundary.**
  The first client `PROCEED` would therefore compute a *partial* cycle (tick 9→17, crossing
  AFTERNOON→NIGHT) rather than a clean 8-tick cycle from a boundary. `proceed()` handles it
  gracefully (labels the digest with the start boundary's cycle), but p15d/p15e should decide whether
  the scenario should start boundary-aligned (e.g. `START_TICK = 8`) so PROCEED reads a whole cycle
  from turn one. Not blocking; flagged for the UI plans.
- **p15e** (as planned): delete the speed API on `WorldClock`/`SimulationLoop`, remove the auto-pause
  store logic in `simulationStore.svelte.ts`, and rebuild the top bar around a Proceed button. The
  `@deprecated ... removed in p15e` markers pin every removal site.
- **When a subscriber first reads `worldTime.cycle`** (p15b onward), the test-helper `worldTime`
  literals that omit `cycle` will feed `undefined`. Either add `cycle: cycleOf(hour)` to the shared
  test `makeCtx`/advance helpers at that point, or derive it in the reading subscriber. Cheap to fix
  when it becomes load-bearing; called out so it isn't a silent surprise.
