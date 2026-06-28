# Handoff — The Unseen Hand (guild-sim)

_Last updated: 2026-06-28. Resume from this file at the start of the next session._

---

## Current status

**Phase 4 complete. Phase 4b (simulation wiring) is next — must land before P5 UI.**

| Phase | Plan file | Status |
|---|---|---|
| P1 — Foundation | `plans/phase-1-foundation.md` | done |
| P2 — Autonomous World | `plans/phase-2-autonomous-world.md` | done |
| P3 — Divine Intervention | `plans/phase-3-divine.md` | done |
| P4 — Scenario Engine | `plans/phase-4-scenario.md` | done |
| **P4b — Simulation Wiring** | **`plans/phase-4b-simulation-wiring.md`** | **planned (ready)** |
| P5 — UI | `plans/phase-5-ui.md` | planned (blocked on P4b) |
| P6 — Narrator | `plans/phase-6-narrator.md` | planned (blocked on P5) |

**Test baseline:** 349 tests, 23 test files, `tsc --noEmit` clean.

Last commit: `bc55961 feat(core): P4 scenario engine — scenario eval, Failing Guild, personal goals, history layer, world expansion`

---

## What happened this session

The `/audit-spec-drift` run revealed the autonomous world loop is **essentially broken** — quests never execute because the quest subscribers were never registered in `SimulationLoop`. This cascades into treasury never growing, reputation never updating, and history events never recording.

A new plan `plans/phase-4b-simulation-wiring.md` was authored to fix all audit findings before P5 UI starts. `phase-5-ui` now `depends: [phase-4-scenario, phase-4b-simulation-wiring]`.

---

## Urgent: simulation is non-functional

### Critical fixes needed (in dependency order)

1. **Register quest subscribers in `SimulationLoop`** — `questBoardSeedingSubscriber`, `questExpirySubscriber`, `partySelectionSubscriber` exist in `src/quests/questSystem.ts` but are not in the loop's constructor.

2. **Add quest resolution subscriber** — no subscriber calls `resolveQuest` when `tick >= quest.startedAt + quest.duration`. Adventurers on quests are stuck there forever. Needs to: call `resolveQuest`, apply `QuestOutcomeResult.loot` to `ctx.treasury`, fire `CombatEvent('BEAT_LOG')` with beats from `generateBeats`.

3. **Wire `updateReputation`** — called from nowhere. Hook into: quest outcome resolution (success by difficulty, failure, adventurer death), social threshold events (BOND_FORMED → +5), personal goals (GOAL_ACHIEVED → +10), scenario evaluator (SCENARIO_OBJECTIVE → +50).

4. **Add personal goal subscriber** — `checkGoalCompletion`/`applyGoalCompletion` never called from any tick subscriber.

5. **Wire goal milestone recording** — `DUNGEON_SUCCESS`, `RESCUE_SUCCESS`, `GOLD_EARNED:N` etc. are never appended to `personalGoalProgress.milestones`. Only BELONGING works (reads relationships directly).

### High priority (broken but not blocking the loop)

6. **Wire `appendHistoryEvent`** — history events (`WITNESSED_DEATH`, `FIRST_KILL`, `NEAR_DEATH`, `SAVED_BY`) never recorded; `contextualModifier` always sees empty history.

7. **Call `generateBeats` from `resolveQuest`** — spec requires `QuestOutcome.beats`; currently beats are never generated during resolution.

8. **Fix QUEST_DROUGHT tracker** — first-empty-tick is set to current tick, so drought never fires.

### Spec-value conflicts to fix

9. Mood factor wrong values: quest failure `−10` should be `−20`; decay rates off for quest success (`0.1` → `0.15`) and social events (`0.1` → `0.20`/`0.25`).
10. `fleeThreshold(courage=0)` returns `0.65` — spec requires `≥ 0.8`.
11. Subscriber order wrong — social fires before departure; spec: social (slot 8) → departure (slot 10).
12. Social mood factor labels are constant names (`SOCIAL_POSITIVE`) not readable strings.
13. `DIVINE_TOUCH` mood factor id is lowercase (`divine_touch`) — should be `'DIVINE_TOUCH'`.

### Spec updates needed (undocumented implementations)

These are load-bearing types/fields in code not yet in specs — update `specs/data-model.md` and `specs/behaviors/event-bus.md`:
- `HistoryEventKind`: add `LUCK_CURSE`, `MARK_FOR_DEATH`, `SEND_DREAM`
- `DecisionMoment.kind: DecisionMomentKind`
- `ScenarioState.treasuryNegativeSince: number | null`
- `BehaviourContext`, `EnemyArchetype` types
- `WorldEvent` subtypes: `SCENARIO_GOAL_ACHIEVED`, `SCENARIO_COMPLETE`, `SCENARIO_FAILED`, `goalId`
- `ReputationEvent` discriminated union (in `world-expansion.md`)

---

## Codebase map (`packages/core/src/`)

```
world/
  SeededRNG.ts               - mulberry32 PRNG; all randomness via ctx.rng
  SimulationContext.ts       - createSimulationContext; defaults: DI=50, treasury=0, reputation=0
  WorldClock.ts              - real-time interval; onTick, currentSpeed
  SimulationLoop.ts          - ← BROKEN: quest subscribers not registered here
  WorldExpansion.ts          - createStartingRegions, worldExpansionSubscriber, updateReputation
  types.ts                   - ALL canonical types

adventurers/
  personality.ts             - fleeThreshold (conflict at courage=0), questVolunteerWeight, etc.
  stateMachine.ts            - transitionState
  mood.ts                    - upsertMoodFactor, applyDayTickMood, moodSubscriber
  departureSystem.ts         - departureSubscriber (needs decision moment before retiring)
  PersonalGoals.ts           - checkGoalCompletion, applyGoalCompletion (← never called from loop)
  HistoryLayer.ts            - contextualModifier (pure), appendHistoryEvent (← never called)

relationships/
  graph.ts                   - applyStrengthShift, detectThresholdEvents, etc.

events/
  eventBus.ts                - emitEvent (typed union, template engine)
  socialResolver.ts          - socialEventSubscriber (wrong subscriber order; label strings)
  DecisionMomentDetector.ts  - decisionMomentSubscriber

quests/
  questSystem.ts             - questBoardSeedingSubscriber, questExpirySubscriber,
                               partySelectionSubscriber, resolveQuest
                               (← none registered in SimulationLoop)

combat/
  beatGenerator.ts           - generateBeats (← never called from resolveQuest)

divine/
  DivineInfluence.ts         - diTrickleSubscriber, grantDI
  ProbabilityShifter.ts      - narrativeDistance, applyDivineShift
  DivineTools.ts             - dispatch

scenarios/
  ScenarioEngine.ts          - registerScenario, scenarioEvaluatorSubscriber
  scenario1.ts               - createScenario1Context, SCENARIO_1_ID, S1_IDS
```

---

## Key invariants (do not break)

- **No `Math.random()` in `packages/core/`** — all randomness via `ctx.rng`
- **Probability shifts, not outcomes** — tests assert shifted probability values, never rolled outcomes
- **`transitionState` opts** require `{ questId: QuestId | null; isDev: boolean }`
- **`tsc --noEmit` + `svelte-check` must both pass** before any Svelte edit is considered done
- **`contextualModifier` is pure** — never stored on adventurer; always called on-demand
- **`ScenarioState.treasuryNegativeSince`** — must initialize to `null`

---

## Suggested skills for next session

1. **`/specops`** — read `plans/phase-4b-simulation-wiring.md`, mark it in-progress, begin Step 1 (spec updates for undocumented types)
2. **`/tdd`** — for each of the 8 wiring steps; one failing test → minimum code → repeat
3. **`/audit-spec-drift`** — re-run after all fixes to confirm zero critical gaps before P5
