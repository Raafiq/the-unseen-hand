---
status: done
depends: [phase-3-divine]
specs:
  - specs/behaviors/scenario-engine.md
  - specs/behaviors/personal-goals.md
  - specs/behaviors/history-layer.md
  - specs/behaviors/world-expansion.md
issues: []
---

# Plan: Phase 4 — Scenario Engine & Progression

## Scope

Add the scenario layer that makes the first real game loop: `treasury` + `reputation` in context,
Scenario schema + per-tick goal/fail evaluation + sandbox transition, Scenario 1 "The Failing
Guild" (6 pre-seeded adventurers, pre-existing edges, win/lose conditions), personal-goal
milestone tracking + retirement decision, history-layer `contextualModifier`, and
reputation/scenario-gated region unlocks.

After this phase a full 30-day "Failing Guild" run is reproducible from seed and reaches a win
or lose state — the first end-to-end game, still headless.

**Out of scope:** UI, narrator, visual polish.

## Implements

- **`specs/behaviors/scenario-engine.md`** — `ScenarioState`, per-tick evaluation, win/lose
  detection, sandbox transition, Scenario 1.
- **`specs/behaviors/personal-goals.md`** — milestone tracking, `GOAL_ACHIEVED` event,
  permanent trait shift, retirement decision.
- **`specs/behaviors/history-layer.md`** — `HistoryEvent`, `contextualModifier` (pure,
  on-demand), never stored on the entity.
- **`specs/behaviors/world-expansion.md`** — reputation/scenario-gated region unlocks.

## Approach

Build in TDD order:

1. **`treasury` + `reputation`** added to `SimulationContext`.
2. **Scenario schema + per-tick evaluation** — `ScenarioGoalState`, `FailConditionState`,
   per-tick goal/fail check, win/lose status transition, sandbox transition.
3. **Scenario 1 "The Failing Guild"** — 6 pre-seeded adventurers with pre-existing relationship
   edges, 6 goals, fail conditions per spec.
4. **Personal-goal milestones** — `GoalProgress`, `GOAL_ACHIEVED` event, permanent (bounded)
   trait shift, retirement decision gate.
5. **History layer** — `HistoryEvent` recording, `contextualModifier` as a pure function (not
   stored); verify it's only called on-demand.
6. **Region unlocks** — `reputation` and `scenario` gates on `Region.unlocked`.

## Validation

- [x] A full 30-day "Failing Guild" run from a fixed seed is reproducible (same seed → same outcome).
- [x] Scenario 1 can reach both win and lose states (test with seeds that drive each path).
- [x] Transitioning to sandbox: `ctx.scenario.status === 'COMPLETE'`; `ctx.scenario` is NOT null (preserved as record per spec validation note). Plan item was imprecise.
- [x] Personal-goal `GOAL_ACHIEVED` fires a permanent (bounded) trait shift on the adventurer.
- [x] `contextualModifier` is a pure function; calling it twice with the same inputs returns the same result without mutating the adventurer.
- [x] History events accumulate on the adventurer correctly (tick, kind, involvedIds, weight).
- [x] Region unlock gated by `reputation` threshold — below threshold, region stays locked.
- [ ] `/audit-spec-drift` shows no Phase-4 spec gap. (Run after merge.)

## Risks / unknowns

- **Scenario 1 balance** — "The Failing Guild" has tight win conditions; verify with multiple
  seeds that both win and lose paths are reachable before calling it done.
- **`contextualModifier` performance** — computed on-demand per spec; if called at every tick
  for every adventurer, benchmark to ensure it doesn't dominate tick time.

## Notes

Built in TDD order across 6 steps. All 349 tests pass, `tsc --noEmit` clean.

New modules: `ScenarioEngine.ts` (registry + evaluator), `scenario1.ts` (Failing Guild definition + context factory), `PersonalGoals.ts` (completion check + effects), `HistoryLayer.ts` (contextualModifier + appendHistoryEvent), `WorldExpansion.ts` (region seeds + subscriber + reputation helper).

Type additions to `types.ts`: `treasury`/`reputation` on `SimulationContext`, `treasuryNegativeSince` on `ScenarioState`, `Scenario`/`ScenarioGoalDef`/`FailConditionDef`/`AdventurerSeed` definition types, `BehaviourContext`, `EnemyArchetype`, `enemyArchetype` on `HistoryEvent`, `SEND_DREAM` in `HistoryEventKind`, `SCENARIO_GOAL_ACHIEVED`/`SCENARIO_COMPLETE`/`SCENARIO_FAILED`/`goalId` on `WorldEvent`.

`createScenario1Context()` includes `createStartingRegions()` in the initial activeRegions (required for THORNVALE unlock test to pass).

Decision moment surfaced by `applyGoalCompletion` uses `kind: 'OTHER'` — DecisionMomentDetector P3 stub conditions for scenario-critical/goal kinds still need wiring in Phase 5.

## Follow-ups

- Deferred: `/audit-spec-drift` to run after Phase 4 merge.
- Deferred: Wire `GOAL_ACHIEVED`/`NEAR_DEATH` history event recording into `questSystem.ts` beat resolution (history is stored but not yet auto-appended on relevant quest events).
- Deferred: WANDERLUST/REVENGE/PEACE personal goal milestone recording (spec exists; detection hooks needed in quest system and social events).
- Deferred: Scenario-critical and scenario-goal `DecisionMoment` detection in `DecisionMomentDetector.ts` (depends on scenario engine now available).
