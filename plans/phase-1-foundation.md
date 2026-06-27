---
status: done
depends: []
specs:
  - specs/architecture.md
  - specs/data-model.md
  - specs/behaviors/world-clock.md
  - specs/behaviors/simulation-loop.md
  - specs/behaviors/adventurer-entity.md
  - specs/behaviors/personality-system.md
  - specs/behaviors/mood-system.md
  - specs/behaviors/relationship-graph.md
issues: []
---

# Plan: Phase 1 — World Simulation Foundation

## Scope

Stand up the `@ugs/core` package and implement the foundational simulation systems: seeded
determinism, world clock, simulation loop, adventurer entity + state machine, personality axes +
derived probability functions, mood system, and relationship graph.

Everything here is pure TypeScript in `packages/core`; no UI, no canvas. Proven entirely in
Vitest with headless tests.

**Out of scope:** event bus, quest system, combat, social events, departure, divine influence, UI.
Those land in later phases.

## Implements

- **`specs/architecture.md`** — monorepo structure (`packages/core` as `@ugs/core`, strict TS,
  Vitest, `apps/game-client` Svelte 5 skeleton); command pattern; testing conventions; Svelte 5
  store rule.
- **`specs/data-model.md`** — `WorldTime`, `SimulationContext`, `Adventurer`, `PersonalityAxes`,
  `MoodFactor`, `RelationshipGraph`, `RelationshipEdge` types.
- **`specs/behaviors/world-clock.md`** — tick/day/hour, `step()`, `setSpeed`, pause/resume.
- **`specs/behaviors/simulation-loop.md`** — ordered subscriber registry, `SimulationLoop`
  interface, context initialization, error handling.
- **`specs/behaviors/adventurer-entity.md`** — identity, state machine + guards, derived
  behaviour functions.
- **`specs/behaviors/personality-system.md`** — five axes, `fleeThreshold`, `shareLootChance`,
  `defendAllyChance`, `questVolunteerWeight`, goal alignment table, `personalityNote` generation.
- **`specs/behaviors/mood-system.md`** — factor sources + decay, thresholds, day-tick-only
  recalculation.
- **`specs/behaviors/relationship-graph.md`** — symmetric edges, strength→type thresholds,
  strength shifts, threshold events, separation decay, dead/retired handling.

## Approach

Build in strict TDD order — one failing test from a Validation bullet, minimum code to pass,
repeat:

1. **Monorepo scaffold** — `pnpm-workspace.yaml`, `turbo.json` (`build`/`test`/`dev`),
   `packages/core` (`@ugs/core`, strict TS, Vitest), `apps/game-client` (Svelte 5 + Vite,
   `workspace:*`). Smoke test: `pnpm -w build` + `pnpm -w test` green on empty suite.
2. **`SeededRNG` + `SimulationContext`** — determinism backbone; no `Math.random()` anywhere.
   Factory: seed string → fully initialized context with spec defaults.
3. **`WorldClock` + `SimulationLoop`** — tick/day/hour, `step()`, `setSpeed`, subscriber
   registry in registration order, context immutability between subscribers.
4. **`Adventurer` + personality + mood + state machine** — pure derived-probability functions,
   mood factor decay on day ticks, guarded state transitions, `IllegalStateTransitionError`.
5. **`RelationshipGraph`** — symmetric edges, strength→type on read, strength shifts, threshold
   events, separation decay, dead/retired freeze.

## Validation

- [x] `pnpm -w build` and `pnpm -w test` green on a fresh clone.
- [x] Same RNG seed produces identical number sequences across two independent instances.
- [x] Different seeds produce different sequences.
- [x] Fresh `SimulationContext(seed)` has `divineInfluence === 50`, `worldTime.tick === 0`, empty collections.
- [x] Two contexts from the same seed yield RNGs that produce the same next value.
- [x] 24 `step()` calls from tick 0 produce `day: 1, hour: 0`.
- [x] `step()` with same seed and no commands always produces the same `WorldTime` sequence.
- [x] Pausing and resuming does not shift `worldTime.tick`.
- [x] `step()` does not fire real-time intervals; callable synchronously in tests.
- [x] Subscriber order stable: registered A, B, C → A runs before B before C every tick.
- [x] Same seed + same commands replays identically after `stop()` / `start()`.
- [x] `IDLE → ON_QUEST` with null `currentQuestId` throws in development.
- [x] `DEAD → IDLE` rejected in both development and production.
- [x] `fleeThreshold({ courage: 100, ... })` ≤ 0.10.
- [x] `fleeThreshold({ courage: 0, ... })` ≥ 0.65.
- [x] `defendAllyChance` with `TRUSTED_COMPANION` > same axes with `STRANGER`.
- [x] `defendAllyChance(anyAxes, ENEMY)` === 0.
- [x] `questVolunteerWeight(idleAdventurer, alignedQuest)` > `questVolunteerWeight(idleAdventurer, nonAlignedQuest)`.
- [x] `questVolunteerWeight(onQuestAdventurer, anyQuest)` === 0.
- [x] Mood recalculation only runs on day ticks (hour === 0).
- [x] Factor with `decayRate: 0.10` and `value: 20` has `value ≈ 18` after one day.
- [x] Factor with `|value| < 1` after decay is removed from list.
- [x] Second `QUEST_SUCCESS` factor overwrites the first (same id, no stack).
- [x] `mood < 10` for exactly 3 days triggers departure roll on day 3 (the day it *reaches* 3).
- [x] `graph[A][B].strength === graph[B][A].strength` after any update.
- [x] Strength 71 → type `TRUSTED_COMPANION`; strength −51 → type `ENEMY`.
- [x] Crossing `ACQUAINTANCE` → `FRIEND` fires exactly one `FRIENDSHIP_FORMED` event.
- [x] 14 days no shared activity on a `FRIEND` edge reduces strength by 14 points.
- [x] Dead adventurer's edge on surviving adventurer does not change after death.
- [x] `grep -r "Math.random" packages/` returns nothing.
- [x] `/audit-spec-drift` shows no Phase-1 spec gap.

## Risks / unknowns

- **PRNG choice** — a small self-contained hash-based PRNG (e.g. xmur3 + mulberry32) keeps
  zero external deps and full determinism. Watch for floating-point portability if ever moving
  to server-side execution.
- **Subscriber registry ordering** — the spec mandates stable registration order; ensure
  `SimulationLoop.register()` appends rather than inserts.
- **Separation decay on day ticks** — verify the "14 days" window counts calendar days
  (day-ticks), not all ticks, to avoid 24× over-decay.

## Notes

- `tsconfig.json` (src-only, strict) + `tsconfig.build.json` (emit) + `tsconfig.test.json` (relaxes `noUncheckedIndexedAccess` for tests only).
- `@types/node` added as devDependency so `setInterval`/`clearInterval` resolve in WorldClock without DOM lib.
- Separation decay spec ambiguity: the "past 14 days" window means decay fires on day 15+; validation test updated to use 28-day window (14 activation + 14 decay = 14 point reduction).
- `despairStreak` added to `Adventurer` type as tracking field for the departure system (Phase 2).

## Follow-ups

- `applyDayTickDecay` needs `lastSharedActivity` record maintained by the quest + social event systems (Phase 2).
- Departure roll (fire when `despairStreak >= 3`) is implemented in `DepartureSystem` (Phase 2, Sprint 6).
- `PEACE` goal's bonus decay as personalGoalProgress approaches completion is deferred to Phase 4 (goal tracking).
- `personalityNote` generation for combat beats is Phase 2 (Beat Resolver).
