---
status: planned
depends: [phase-4b-simulation-wiring]
specs:
  - specs/behaviors/divine-influence.md
  - specs/behaviors/divine-tools.md
  - specs/behaviors/quest-system.md
  - specs/behaviors/personal-goals.md
  - specs/behaviors/decision-moments.md
  - specs/behaviors/combat-resolution.md
  - specs/behaviors/departure-system.md
  - specs/data-model.md
issues: []
---

# Plan: Phase 4c — Mechanics Completion

## Scope

Fix the critical behavioral gaps found by the P4b spec-drift audit. The audit
identified three categories of broken mechanics:

1. **DI intervention is inert** — `CHOOSE_OPTION` deducts DI but applies no
   probability shift; `diModifier` is hardcoded to 0 in `questResolutionSubscriber`.
2. **Personal goals cannot complete** — milestone strings are never written, so
   HEROISM/WEALTH/PEACE goals are permanently stuck; only BELONGING can complete.
3. **DI burst sources are missing** — quest success, relationship milestones, and
   unannounced deaths should grant DI; two code sites mutate `divineInfluence` directly
   instead of via `grantDI`, silently dropping the event.

Also in scope: four small correctness fixes uncovered by the audit (QUEST_DROUGHT
logic, `questPressure` type gap, `personalityNote` threshold conflict,
`despairingDayCount` spec rename).

**Out of scope (deferred to later plans):**

- Full decision-moment detection suite (DEATH_IMMINENT, DEPARTURE, SCENARIO_CRITICAL,
  PARTY_SELECTION, SCENARIO_GOAL) — architectural; track as Issue
- Relationship deltas for co-quest failure, DEFEND_ALLY, HESITATE beats — Phase 4d or
  P5 polish
- Social event 7-day idle proximity — Phase 4d or P5 polish
- Divine tool effect application (COURAGE_BLESS, SEND_DREAM, REVEAL_SECRET,
  LUCK_CURSE, MARK_FOR_DEATH) — Phase 4d
- Mood factors for IDLE_TOO_LONG, RESTING, NEAR_DEATH_SURVIVED, ALLY_DEATH — Phase 4d
- World event expiry and quest modifiers — Phase 4d
- Phase 5 UI — `plans/phase-5-ui.md`

## Implements

**specs/behaviors/divine-influence.md**
- DI burst: +5 on quest success, +8 on FRIENDSHIP_FORMED / TRUSTED_COMPANION_BOND_FORMED,
  +5 on unannounced death
- All DI mutations route through `grantDI` (fixes `applyGoalCompletion` and
  `scenarioEvaluatorSubscriber` direct mutations)

**specs/behaviors/divine-tools.md**
- `chooseOption` wires `option.probabilityShift` into a per-adventurer shift map on
  `SimulationContext`; `questResolutionSubscriber` reads and applies it

**specs/behaviors/quest-system.md**
- `questResolutionSubscriber` reads pending DI shifts from `ctx.pendingShifts` and
  passes the sum as `diModifier` to `resolveQuest`
- QUEST_DROUGHT condition fixed: drought fires when `available` board is empty for 72
  ticks regardless of active quests
- `questPressure` added to `Scenario` type so the seeding formula is complete

**specs/behaviors/personal-goals.md**
- Milestone writing in `questResolutionSubscriber`: on quest success, append
  `DUNGEON_SUCCESS` (HEROISM), `GOLD_EARNED:N` (WEALTH), `RESCUE_SUCCESS` (HEROISM
  where quest tag is `rescue`) per surviving party member based on their active goal
- `GOAL_MILESTONE` lifecycle events emitted for each new milestone
- Daily tick appends `PEACE_STREAK_30` once an adventurer's `consecutivePeacefulDays`
  reaches 30

**specs/behaviors/decision-moments.md**
- `chooseOption` shift map write (the architectural piece that enables future moment
  types)

**specs/behaviors/combat-resolution.md**
- `personalityNote` threshold values corrected to match `combat-resolution.md`
  (FLEE: courage < 30, DEFEND_ALLY: loyalty > 70, no-DEFEND_ALLY: empathy < 20);
  HESITATE note added for courage < 30

**specs/behaviors/departure-system.md**
- Spec updated: rename `despairingDayCount` → `despairStreak` to match
  `types.ts` and `data-model.md`

**specs/data-model.md**
- `questPressure?: number` added to `Scenario` type definition

## Approach

### Step 1 — DI shift map on SimulationContext

Add `pendingShifts: Map<AdventurerId, number>` to `SimulationContext` in `types.ts`
(default: empty Map). This is the channel between `CHOOSE_OPTION` and the quest
resolver.

In `chooseOption` (`DivineTools.ts`), after deducting DI, write
`ctx.pendingShifts.set(moment.subjectId, option.probabilityShift)`.

In `questResolutionSubscriber` (`questSystem.ts`), before calling `resolveQuest`,
sum the shifts for all party members:
```ts
const diModifier = party.reduce((acc, id) => acc + (ctx.pendingShifts.get(id) ?? 0), 0);
```
Then clear used shifts: `party.forEach(id => updatedCtx.pendingShifts.delete(id))`.

### Step 2 — Milestone writing

In `questResolutionSubscriber`, on the success path, after processing each surviving
party member, call a new helper `writeQuestMilestones(adventurer, quest, ctx)` that:
- Appends `DUNGEON_SUCCESS` if adventurer's goal is HEROISM
- Appends `RESCUE_SUCCESS` if goal is HEROISM and quest has a `rescue` tag
- Appends `GOLD_EARNED:${quest.reward}` if goal is WEALTH

Emit a `GOAL_MILESTONE` lifecycle event for each newly-appended milestone (check
before appending to avoid duplicates — `milestones` is an array of strings, so
check `.includes(milestone)` first where the milestone is not quantity-keyed, or
check prefix for `GOLD_EARNED`).

Add a `peacefulDaysSubscriber` (daily tick) that increments
`personalGoalProgress.consecutivePeacefulDays` for PEACE-goal adventurers not on
a quest; resets to 0 on quest assignment. Appends `PEACE_STREAK_30` at count === 30.

### Step 3 — DI burst sources

In `questResolutionSubscriber`, success path: `updatedCtx = grantDI(updatedCtx, 5)`.

In `socialEventSubscriber` (`socialResolver.ts`), after emitting a threshold event:
```ts
if (event.subtype === 'FRIENDSHIP_FORMED' || event.subtype === 'TRUSTED_COMPANION_BOND_FORMED') {
  updatedCtx = grantDI(updatedCtx, 8);
}
```

In `questResolutionSubscriber`, death path: for each adventurer who dies, check
`ctx.pendingDecisions` for a `DEATH_IMMINENT` moment with that adventurer as subject;
if none, `updatedCtx = grantDI(updatedCtx, 5)`.

Replace direct mutations in `applyGoalCompletion` and `scenarioEvaluatorSubscriber`:
```ts
// before
next.divineInfluence = Math.min(100, next.divineInfluence + 12)
// after
updatedCtx = grantDI(updatedCtx, 12)
```

### Step 4 — Small correctness fixes

**QUEST_DROUGHT**: remove `&& next.questBoard.active.length === 0` from the
`activelyEmpty` check in `createQuestExpirySubscriber`.

**questPressure**: add `questPressure?: number` to the `Scenario` interface in
`types.ts` and `specs/data-model.md`; read it in `questBoardSeedingSubscriber`
(replace the hardcoded `0` comment).

**personalityNote thresholds**: update `generatePersonalityNote` in
`beatGenerator.ts` to use thresholds from `combat-resolution.md` (FLEE/HESITATE:
courage < 30, DEFEND_ALLY: loyalty > 70, no-DEFEND_ALLY: empathy < 20). Add
HESITATE case.

**Spec rename**: update `specs/behaviors/departure-system.md` — replace all
occurrences of `despairingDayCount` with `despairStreak`.

## Validation

- [ ] `chooseOption` writes to `ctx.pendingShifts`; `questResolutionSubscriber` reads and clears it; test asserts that choosing a +0.20 shift option raises `resolveQuest`'s effective success probability by ~0.20
- [ ] HEROISM adventurer completing a dungeon quest has `DUNGEON_SUCCESS` in their `personalGoalProgress.milestones`; a `GOAL_MILESTONE` lifecycle event appears in the event log
- [ ] WEALTH adventurer receives `GOLD_EARNED:N` milestone on quest success
- [ ] BELONGING adventurer can still complete goal (regression: graph-based check still fires)
- [ ] `grantDI` is called on quest success (+5); `ctx.divineInfluence` increases and a `DI_GAINED` event is emitted
- [ ] `grantDI` is called when a relationship reaches FRIENDSHIP_FORMED threshold (+8)
- [ ] `applyGoalCompletion` and `scenarioEvaluatorSubscriber` no longer directly mutate `divineInfluence`; DI changes appear as `DI_GAINED` events
- [ ] QUEST_DROUGHT fires when `available` board is empty for 72 ticks even if adventurers are on active quests
- [ ] `tsc --noEmit` passes with zero errors
- [ ] All existing 367 tests continue to pass; new tests added for each bullet above

## Risks / unknowns

- **pendingShifts Map mutability** — `SimulationContext` is treated as structurally
  immutable (subscribers return updated copies). The Map should be copied on
  update rather than mutated in place; confirm that `grantDI`-style patterns do
  this before writing `chooseOption`.
- **Milestone deduplication semantics** — `GOLD_EARNED:N` uses the reward amount as
  part of the key. If an adventurer completes multiple quests they could accumulate
  `GOLD_EARNED:50`, `GOLD_EARNED:75` etc. Confirm with the spec whether total
  accumulated gold or per-quest reward is the intended meaning; adjust if needed.
- **PEACE_STREAK_30 and daily tick timing** — the peaceful-days increment must run
  before `questBoardSeedingSubscriber` assigns new quests, else the streak resets
  the same tick it should have completed. Ensure the peaceful-days subscriber is
  registered before slot 4.

## Notes

(Populated at closeout.)

## Follow-ups

(Populated at closeout.)
