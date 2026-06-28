# Handoff — The Unseen Hand (guild-sim)

_Last updated: 2026-06-28. Resume from this file at the start of the next session._

---

## Current status

**Phase 4b complete. P5 UI is next.**

| Phase | Plan file | Status |
|---|---|---|
| P1 — Foundation | `plans/phase-1-foundation.md` | done |
| P2 — Autonomous World | `plans/phase-2-autonomous-world.md` | done |
| P3 — Divine Intervention | `plans/phase-3-divine.md` | done |
| P4 — Scenario Engine | `plans/phase-4-scenario.md` | done |
| P4b — Simulation Wiring | `plans/phase-4b-simulation-wiring.md` | **done** |
| **P5 — UI** | **`plans/phase-5-ui.md`** | **planned (ready)** |
| P6 — Narrator | `plans/phase-6-narrator.md` | planned (blocked on P5) |

**Test baseline:** 367 tests, 24 test files, `tsc --noEmit` clean.

**⚠️ P4b changes are NOT yet committed.** Commit them before starting P5.

---

## What happened last session

Phase 4b (simulation wiring) completed in full. All of the following was implemented and tested:

- Quest subscribers registered in `SimulationLoop` in spec-mandated order (mood → relationships → quest seeding → quest expiry → party selection → quest resolution → social → personal goals → decision moments → departure → DI trickle → scenario → world expansion)
- `questResolutionSubscriber` added: resolves active quests when `tick >= startedAt + duration`; credits treasury; emits `BEAT_LOG`; records `FIRST_KILL` / `WITNESSED_DEATH` / `NEAR_DEATH` / `SAVED_BY` history events; updates reputation
- `personalGoalSubscriber` added; `applyGoalCompletion` now also calls `updateReputation`
- `updateReputation` wired from 4 call sites: quest resolution, TRUSTED_COMPANION bond formed, goal achieved, scenario objective
- QUEST_DROUGHT tracker fixed (closure-based `firstEmptyTick`, factory pattern via `createQuestExpirySubscriber`)
- Spec-value fixes: quest failure mood `−20`, success decay `0.15`, social decay `0.20`/`0.25`, `fleeThreshold(0) = 0.80`, `DIVINE_TOUCH` id uppercase, social label strings readable
- Subscriber order fixed: social slot 8, departure slot 10
- `specs/data-model.md` and `specs/behaviors/event-bus.md` updated with all previously undocumented types
- 18 new tests in `tests/p4b-wiring.test.ts`

---

## Known gaps (not yet blocking P5)

1. **Goal milestone recording incomplete** — `DUNGEON_SUCCESS`, `RESCUE_SUCCESS`, `GOLD_EARNED:N` milestones are never appended to `personalGoalProgress.milestones`. HEROISM/WEALTH goals need these. Wire milestone appends into `questResolutionSubscriber`.

2. **Adventurer baseline mood** — freshly created adventurers have empty `moodFactors`, so after the first day-tick `recalculateMood([])` → mood = 0 (DESPAIRING). Scenario seeds should include a non-decaying baseline mood factor.

These are deferred and do not block P5.

---

## Codebase map (`packages/core/src/`)

```
world/
  SeededRNG.ts               - mulberry32 PRNG; all randomness via ctx.rng
  SimulationContext.ts       - createSimulationContext; defaults: DI=50, treasury=0, reputation=0
  WorldClock.ts              - real-time interval; onTick, currentSpeed
  SimulationLoop.ts          - subscriber registry (fully wired as of P4b)
  WorldExpansion.ts          - createStartingRegions, worldExpansionSubscriber, updateReputation
  types.ts                   - ALL canonical types

adventurers/
  personality.ts             - fleeThreshold, questVolunteerWeight
  stateMachine.ts            - transitionState
  mood.ts                    - upsertMoodFactor, applyDayTickMood, moodSubscriber
  departureSystem.ts         - departureSubscriber
  PersonalGoals.ts           - checkGoalCompletion, applyGoalCompletion, personalGoalSubscriber
  HistoryLayer.ts            - contextualModifier (pure), appendHistoryEvent

relationships/
  graph.ts                   - applyStrengthShift, detectThresholdEvents

events/
  eventBus.ts                - emitEvent (typed union, template engine)
  socialResolver.ts          - socialEventSubscriber
  DecisionMomentDetector.ts  - decisionMomentSubscriber

quests/
  questSystem.ts             - questBoardSeedingSubscriber, createQuestExpirySubscriber,
                               partySelectionSubscriber, resolveQuest, questResolutionSubscriber

combat/
  beatGenerator.ts           - generateBeats (called from questResolutionSubscriber)

divine/
  DivineInfluence.ts         - diTrickleSubscriber, grantDI
  ProbabilityShifter.ts      - narrativeDistance, applyDivineShift
  DivineTools.ts             - dispatch

scenarios/
  ScenarioEngine.ts          - registerScenario, scenarioEvaluatorSubscriber
  scenario1.ts               - createScenario1Context, SCENARIO_1_ID, S1_IDS
```

## SimulationLoop subscriber order (as of P4b)

```
1.  advanceTime (implicit pre-step)
2.  moodSubscriber
3.  relationshipDecaySubscriber
4.  questBoardSeedingSubscriber       (weekly)
5.  createQuestExpirySubscriber()     (daily + drought tracking)
6.  partySelectionSubscriber          (daily)
7.  questResolutionSubscriber         (every tick)
8.  socialEventSubscriber             (daily)
9.  personalGoalSubscriber            (every tick)
10. decisionMomentSubscriber          (every tick)
11. departureSubscriber               (daily)
12. diTrickleSubscriber               (every tick)
13. scenarioEvaluatorSubscriber       (every tick)
14. worldExpansionSubscriber          (every tick)
```

---

## Key invariants (do not break)

- **No `Math.random()` in `packages/core/`** — all randomness via `ctx.rng`
- **Probability shifts, not outcomes** — tests assert shifted probability values, never rolled outcomes
- **`transitionState` opts** require `{ questId: QuestId | null; isDev: boolean }`
- **`tsc --noEmit` + `svelte-check` must both pass** before any Svelte edit is considered done
- **`contextualModifier` is pure** — never stored on adventurer; always called on-demand
- **`ScenarioState.treasuryNegativeSince`** — must initialize to `null`
- **`questExpirySubscriber` singleton** is module-level; tests needing independent drought state must use `createQuestExpirySubscriber()` directly

---

## Suggested skills for next session

1. **`/specops`** — read `plans/phase-5-ui.md`, mark it in-progress, begin P5 Svelte implementation
2. **`/audit-spec-drift`** — optional re-run to confirm zero remaining wiring gaps before touching UI
3. **`/tdd`** — for any new P5 Svelte component behavior that needs headless test coverage first
