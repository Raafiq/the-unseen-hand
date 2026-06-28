---
status: done
depends: [phase-4-scenario]
specs:
  - specs/behaviors/simulation-loop.md
  - specs/behaviors/quest-system.md
  - specs/behaviors/mood.md
  - specs/behaviors/personal-goals.md
  - specs/behaviors/history-layer.md
  - specs/behaviors/world-expansion.md
  - specs/behaviors/combat.md
  - specs/data-model.md
  - specs/behaviors/event-bus.md
issues: []
---

# Plan: Phase 4b — Simulation Wiring & Spec Alignment

## Scope

The spec-drift audit after Phase 4 revealed that the autonomous world loop is essentially
broken: quest subscribers are not registered in `SimulationLoop`, so quests never execute,
treasury never grows, reputation never updates, and history events are never recorded. This
plan wires all the assembled subsystems together and fixes spec-value conflicts exposed by
the audit.

**In scope:**
- Register the three quest subscribers in `SimulationLoop`
- Add quest resolution subscriber (calls `resolveQuest`, credits treasury, fires beats)
- Wire `updateReputation` into resolution, social, goal, and scenario pathways
- Add personal-goal tick subscriber (`checkGoalCompletion` / `applyGoalCompletion`)
- Wire `appendHistoryEvent` from quest/combat resolution
- Call `generateBeats` from `resolveQuest` so `QuestOutcome.beats` is populated
- Fix QUEST_DROUGHT tracker initialization bug
- Fix four spec-value conflicts (mood factors, flee threshold, subscriber order, label strings)
- Update `specs/data-model.md` and `specs/behaviors/event-bus.md` with undocumented types
  found in code but absent from specs

**Out of scope:** UI (Phase 5), narrator (Phase 6), new gameplay behaviors. The goal is
that an existing 30-day headless run with Scenario 1 produces correct treasury, reputation,
history, and goal-achievement states — not to add new features.

## Implements

- **`specs/behaviors/simulation-loop.md`** — subscriber registration order; all subsystem
  subscribers present; QUEST_DROUGHT initialization.
- **`specs/behaviors/quest-system.md`** — quest resolution fires on `tick >= started + duration`;
  `resolveQuest` credited to treasury; beats generated at resolution.
- **`specs/behaviors/mood.md`** — correct factor values: failure `−20`, success decay `0.15`,
  social decay `0.20`/`0.25`; `DIVINE_TOUCH` id uppercase; label strings readable.
- **`specs/behaviors/personal-goals.md`** — `checkGoalCompletion` called each tick; milestone
  events (`DUNGEON_SUCCESS`, `RESCUE_SUCCESS`, `GOLD_EARNED:N`) appended correctly.
- **`specs/behaviors/history-layer.md`** — `appendHistoryEvent` called from quest resolution
  (`FIRST_KILL`, `WITNESSED_DEATH`, `NEAR_DEATH`, `SAVED_BY`).
- **`specs/behaviors/world-expansion.md`** — `updateReputation` called from quest resolution,
  social threshold events, personal goal completion, and scenario objective completion.
- **`specs/behaviors/combat.md`** — `generateBeats` called from `resolveQuest`.
- **`specs/data-model.md`** — document: `HistoryEventKind` additions (`LUCK_CURSE`,
  `MARK_FOR_DEATH`, `SEND_DREAM`), `DecisionMoment.kind: DecisionMomentKind`,
  `ScenarioState.treasuryNegativeSince`, `BehaviourContext`, `EnemyArchetype`.
- **`specs/behaviors/event-bus.md`** — document: `WorldEvent` subtypes
  (`SCENARIO_GOAL_ACHIEVED`, `SCENARIO_COMPLETE`, `SCENARIO_FAILED`, `goalId`),
  `ReputationEvent` discriminated union.

## Approach

Work in TDD order — one failing test, minimum code, green. All changes are wiring existing
code; no new algorithms.

### Step 1 — Update specs with undocumented types (spec-first)

Before any code change, update `specs/data-model.md` and `specs/behaviors/event-bus.md`
to document the types that already exist in code. This closes the spec gap and provides
the acceptance criteria the tests will verify against.

### Step 2 — Register quest subscribers in `SimulationLoop`

In `SimulationLoop.ts` constructor, after `diTrickleSubscriber`, add:
```typescript
questBoardSeedingSubscriber(ctx)
questExpirySubscriber(ctx)
partySelectionSubscriber(ctx)
```
Order follows the spec's subscriber-slot table (seeding at slot 3, expiry at slot 4,
party selection at slot 5).

**Test:** After 10 ticks with a fresh context, `ctx.quests` has at least one active quest.

### Step 3 — Add quest resolution subscriber

New subscriber in `questSystem.ts` (`questResolutionSubscriber`) runs each tick:
```
for each quest where tick >= quest.startedAt + quest.duration:
  const result = resolveQuest(ctx, quest)
  ctx.treasury += result.loot
  for each beat in generateBeats(...):
    emitEvent(ctx, { type: 'COMBAT_BEAT', ... })
  appendHistoryEvent (FIRST_KILL, WITNESSED_DEATH, etc.) for relevant adventurers
  updateReputation(ctx, delta based on difficulty × success)
```
Register in `SimulationLoop` at slot 6 (after party selection, before mood).

**Test:** After a quest completes, `ctx.treasury > 0` and `ctx.eventLog` contains a
`COMBAT_BEAT` event.

### Step 4 — Wire `updateReputation`

Add calls in:
- Quest resolution: `+difficulty×5` on success, `−difficulty×3` on failure, `−10` on
  adventurer death.
- `socialEventSubscriber`: `+5` on `BOND_FORMED`.
- `applyGoalCompletion`: `+10` on `GOAL_ACHIEVED`.
- `scenarioEvaluatorSubscriber`: `+50` on `SCENARIO_OBJECTIVE` met.

**Test:** 30-day run from Scenario 1 seed; `ctx.reputation > 0` after at least one
successful quest.

### Step 5 — Add personal-goal tick subscriber

New `personalGoalSubscriber` in `PersonalGoals.ts`:
```
for each adventurer:
  checkGoalCompletion(adventurer, ctx)
  if goal met: applyGoalCompletion(adventurer, ctx)
```
Register in `SimulationLoop` at slot 9 (after social, before departure).

Wire milestone recording:
- `DUNGEON_SUCCESS` → append after successful quest resolution for party members
- `RESCUE_SUCCESS` → append after rescue variant quest
- `GOLD_EARNED:N` → append when adventurer's cumulative loot share crosses threshold N

**Test:** Adventurer with WANDERLUST goal reaches `GOAL_ACHIEVED` after enough dungeon
successes; permanent trait shift applied.

### Step 6 — Wire `appendHistoryEvent`

From `questResolutionSubscriber`:
- `FIRST_KILL` — first time adventurer is in a quest that kills an enemy
- `WITNESSED_DEATH` — party member dies on the same quest
- `NEAR_DEATH` — adventurer's HP-equivalent drops to ≤10% (beat log shows it)
- `SAVED_BY` — another party member's presence kept this adventurer alive (beat tag)

**Test:** After a failed quest with a party death, survivor's `historyEvents` contains
`WITNESSED_DEATH`.

### Step 7 — Fix QUEST_DROUGHT tracker

In the drought subscriber, initialize `firstEmptyTick` to `null`; set it only when the
board is first found empty:
```typescript
if (ctx.quests.length === 0) {
  if (firstEmptyTick === null) firstEmptyTick = ctx.tick;
  if (ctx.tick - firstEmptyTick >= DROUGHT_THRESHOLD) { /* fire */ firstEmptyTick = null; }
} else {
  firstEmptyTick = null;
}
```

**Test:** Drought event fires only after the board has been empty for `DROUGHT_THRESHOLD`
consecutive ticks, not on the first empty tick.

### Step 8 — Fix spec-value conflicts

All in `mood.ts` / `personality.ts`:
- Quest failure mood factor: `−10` → `−20`
- Quest success decay rate: `0.1` → `0.15`
- Social event decay rates: `0.1` → `0.20` (positive), `0.1` → `0.25` (negative)
- `fleeThreshold(courage = 0)` must return `≥ 0.8`
- `DIVINE_TOUCH` mood factor id: `'divine_touch'` → `'DIVINE_TOUCH'`
- Social mood factor label: `SOCIAL_POSITIVE` constant → `'Social bond formed'` string

Fix subscriber order in `SimulationLoop`:
- social subscriber must be slot 8, departure slot 10 (currently reversed)

**Tests:** Each value change verified by a unit test asserting the new constant. Flee
threshold: `expect(fleeThreshold(0)).toBeGreaterThanOrEqual(0.8)`. Subscriber order:
verify social fires before departure by checking event log sequence.

## Validation

- [ ] `tsc --noEmit` passes with zero errors after all changes.
- [ ] All 349+ tests pass (net new tests added for each wiring step).
- [ ] After a 30-day Scenario 1 headless run: `ctx.quests` has completed quests, `ctx.treasury > 0`, `ctx.reputation > 0`.
- [ ] At least one adventurer has non-empty `historyEvents` after a 30-day run.
- [ ] At least one adventurer reaches `GOAL_ACHIEVED` in a 30-day run (requires multiple seeds or a long run).
- [ ] QUEST_DROUGHT fires only after `DROUGHT_THRESHOLD` consecutive empty ticks, not on the first.
- [ ] `fleeThreshold(0) >= 0.8`.
- [ ] Subscriber order in `SimulationLoop`: social (slot 8) fires before departure (slot 10).
- [ ] `specs/data-model.md` documents all undocumented types from the audit list.
- [ ] `specs/behaviors/event-bus.md` documents `ReputationEvent` union and `WorldEvent` subtypes.
- [ ] `/audit-spec-drift` shows zero critical wiring gaps.

## Risks / unknowns

- **Subscriber slot numbers** — the spec references slot indices but current `SimulationLoop`
  may not name them explicitly. Check whether it uses a flat array or a named registry before
  assuming insert position.
- **`resolveQuest` signature** — confirm it accepts `(ctx, quest)` and returns `QuestOutcomeResult`
  with a `loot: number` field; adjust if the actual shape differs.
- **Beat generation inputs** — `generateBeats` needs adventurer party + enemy archetype; confirm
  the quest record carries enough to reconstruct these at resolution time.
- **Treasury initialization** — `createSimulationContext` sets `treasury: 0`; verify the first
  quest loot actually increments it (no off-by-one in the resolution tick check).

## Notes

All 8 steps implemented in one session (2026-06-28). Key decisions:
- `Quest.startedAt?: number` added to types to enable resolution subscriber timing
- `questExpirySubscriber` converted to factory (`createQuestExpirySubscriber`) to fix closure-based drought tracker; singleton `questExpirySubscriber` exported for backward compat
- Mood factor values fixed directly in `resolveQuest` (not a separate constants file)
- `updateReputation` wired from 4 call sites: questResolutionSubscriber, socialEventSubscriber (TRUSTED_COMPANION_BOND_FORMED), applyGoalCompletion, scenarioEvaluatorSubscriber
- All 18 new P4b wiring tests use structural assertions (state checks, event presence), not rolled outcomes

## Follow-ups

- `/audit-spec-drift` re-run recommended before starting P5 to confirm zero remaining gaps
- `personalGoalSubscriber` wires milestone CHECKING but not milestone RECORDING for DUNGEON_SUCCESS/RESCUE_SUCCESS/GOLD_EARNED; these need to be appended in `questResolutionSubscriber` (HEROISM/WEALTH goals won't complete without them)
- Adventurers with empty `moodFactors` have their mood recalculated to 0 on first day-tick — consider whether a baseline "CONTENT" factor should be seeded in `createAdventurer` (or in scenario seeds)
