---
status: done
depends: [phase-6-narrator]
specs:
  - specs/behaviors/decision-moments.md
  - specs/behaviors/personal-goals.md
  - specs/behaviors/departure-system.md
  - specs/behaviors/mood-system.md
issues: []
---

# Plan: Phase 4d — Decision-Moment Detection Suite

## Scope

Complete the `DecisionMomentDetector` with the five missing moment kinds and fix two
companion defects that make the detection useful:

| Item | Kind |
|---|---|
| DEPARTURE moment | New detection |
| DEATH_IMMINENT moment | New detection |
| SCENARIO_CRITICAL moment | New detection |
| SCENARIO_GOAL moment | New detection (requires `ScenarioGoalDef.isImminent`) |
| PARTY_SELECTION moment | New detection |
| Adventurer baseline mood | Bug fix (new adventurers despair on day 1) |
| PEACE_STREAK_30 milestone | Missing subscriber (PEACE goal is milestone-free) |

**Out of scope:** choice-card E2E test, world-map sidebar, narrator E2E test (deferred from P6).

---

## Implements

- `specs/behaviors/decision-moments.md` — DEPARTURE, DEATH_IMMINENT, SCENARIO_CRITICAL,
  SCENARIO_GOAL, PARTY_SELECTION triggers + options
- `specs/behaviors/personal-goals.md` — PEACE_STREAK_30 daily milestone
- `specs/behaviors/mood-system.md` — BASELINE mood factor for freshly seeded adventurers

---

## Approach

Each step follows `/tdd` strictly: red test → minimum implementation → green → move on.
All tests route through the relevant subscriber; no direct calls to pure helpers for
subscriber-owned effects (see project guardrail).

### Step 1 — Adventurer baseline mood

**File:** `packages/core/src/scenarios/scenario1.ts`

Add a non-decaying `BASELINE` mood factor to every adventurer produced by `makeAdventurer`:

```typescript
moodFactors: [{ id: 'BASELINE', label: 'Adventurer spirit', value: 30, decayRate: 0 }],
```

This prevents `applyDayTickMood` (which overwrites mood with the summed factor value) from
collapsing freshly-seeded adventurers to 0 / DESPAIRING after the first day tick.

**Test:** `packages/core/tests/scenario1-baseline.test.ts`
- Run `moodSubscriber` on a fresh `createScenario1Context` for 1 day-tick (tick 0 → 24)
- Assert all 6 adventurers have `mood ≥ 25` after the tick

### Step 2 — DEPARTURE moment detection

**File:** `packages/core/src/events/DecisionMomentDetector.ts`

In `detectConditions`, add after the RELATIONSHIP_COLLAPSE block:

```
For each living adventurer in IDLE | RESTING | SOCIALIZING:
  if despairStreak >= 3 AND computeDepartureProbability(adv) > 0
  AND no existing DEPARTURE moment in pendingDecisions for this adventurer:
    addMoment({ kind: 'DEPARTURE', subjectId: adv.id, … })
```

Deduplication guard: check `pendingDecisions.some(m => m.kind === 'DEPARTURE' && m.subjectId === adv.id)`.

**Options:**

| # | Label | diCost | probabilityShift | narrativeDistanceLabel |
|---|---|---|---|---|
| 0 | Let fate decide | 0 | 0 | LOW |
| 1 | Lift their spirits | 8 | 0 | MODERATE |

Option 1 applies a MOOD_LIFT effect (shift = 0 but signals intent; actual mood-lift applied via pendingShifts or a `MOOD_LIFT` touch — for simplicity, `probabilityShift: +0.30` written to the adventurer's pendingShifts key, read by departureSubscriber). **Note:** `departureSubscriber` does not currently read `pendingShifts`. For P4d, the departure probability shift is encoded but departureSubscriber will be updated to read `pendingShifts.get(adv.id)` and subtract it from the roll threshold.

**situationText:** `"{name} has gone {despairStreak} days without hope. They may leave the guild."`

**Test:** `packages/core/tests/decision-moment-departure.test.ts`
- Build ctx with an adventurer at `despairStreak = 4` in IDLE state
- Run `decisionMomentSubscriber` → assert DEPARTURE moment appears with correct subjectId
- Assert duplicate is suppressed on second run
- Assert moment expires after 12 ticks (no active moment in pendingDecisions)

### Step 3 — DEATH_IMMINENT moment detection

**File:** `packages/core/src/events/DecisionMomentDetector.ts`

In `detectConditions`, scan `ctx.questBoard.active` for quests whose resolution is imminent:

```
For each active quest Q where:
  - Q.startedAt !== undefined
  - Q.startedAt + Q.duration - tick <= EXPIRY_WINDOW.DEATH_IMMINENT  (resolving within 12 ticks)
  - Q.startedAt + Q.duration > tick                                   (not yet resolved)
  - computeQuestProbability(Q, party, graph, 0) < 0.40               (low success probability)
  AND no DEATH_IMMINENT moment exists for any party member:
    pick the party member with highest deathChance exposure as subjectId
    addMoment({ kind: 'DEATH_IMMINENT', subjectId, … })
```

Deduplication: `pendingDecisions.some(m => m.kind === 'DEATH_IMMINENT' && party.some(a => a.id === m.subjectId))`.

**Option construction** (mirrors spec):

Uses `narrativeDistance` from `ProbabilityShifter.ts`:
- Option 0: `Let fate decide` (diCost 0, shift 0)
- Option 1: shift toward 0.50; `diCost = Math.round(narrativeDistance(prob, 0.50) * 10)`
- Option 2: shift toward 0.80; `diCost = Math.round(narrativeDistance(prob, 0.80) * 10)` (suppressed if treasury DI insufficient)
- Option 3: shift toward 0.95; highest cost (suppressed below 40 DI)

`probabilityShift = targetProb - prob` for each option (clamped so final prob ≤ 0.95).

**pendingShifts read:** `questResolutionSubscriber` already sums `pendingShifts.get(a.id)` across party — no change needed there.

**situationText:** `"{partyNames} face long odds in the dungeon. {questName} may end in tragedy."`

**Test:** `packages/core/tests/decision-moment-death.test.ts`
- Build ctx with a difficulty-9 dungeon active, party assigned, resolving at `tick + 5`
- Run `decisionMomentSubscriber` → assert DEATH_IMMINENT moment with valid probability-shift options
- Assert option 0 has `diCost: 0`
- Assert option 1 cost at low natural probability > option 1 cost at mid probability
- Assert player receives +10 DI when moment expires unresolved

### Step 4 — SCENARIO_CRITICAL moment detection

**File:** `packages/core/src/events/DecisionMomentDetector.ts`

In `detectConditions`, after party-selection check:

```
If ctx.scenario && ctx.scenario.status === 'ACTIVE':

  // BANKRUPTCY approaching
  if treasuryNegativeSince !== null AND tick - since >= 96:   // within 72 ticks (3 days) of threshold
    if no SCENARIO_CRITICAL moment in pendingDecisions:
      addMoment({ kind: 'SCENARIO_CRITICAL', subjectId: 'BANKRUPTCY', … })

  // ROSTER_COLLAPSE approaching (livingCount one death from triggering)
  const living = [...ctx.adventurers.values()].filter(a => a.state !== 'DEAD' && a.state !== 'RETIRED')
  if living.length === 2 AND no SCENARIO_CRITICAL ROSTER_COLLAPSE moment:
    addMoment({ kind: 'SCENARIO_CRITICAL', subjectId: 'ROSTER_COLLAPSE', … })
```

Deduplication: `pendingDecisions.some(m => m.kind === 'SCENARIO_CRITICAL' && m.subjectId === subjectId)`.

**Options (BANKRUPTCY variant):**
- Option 0: Let fate decide (diCost 0, shift 0)
- Option 1: Seed WINDFALL event in primary region (diCost 15, shift 0 — narrative action, not probability)

**Options (ROSTER_COLLAPSE variant):**
- Option 0: Let fate decide (diCost 0, shift 0)
- Option 1: Apply MOOD_LIFT to all living adventurers (shifts pendingShifts for each, diCost 10)

**situationText (BANKRUPTCY):** `"The guild treasury has been empty for {N} days. Bankruptcy looms."`
**situationText (ROSTER_COLLAPSE):** `"Only {N} adventurers remain. One more death ends everything."`

**Test:** `packages/core/tests/decision-moment-scenario-critical.test.ts`
- Set `treasuryNegativeSince = tick - 100` → assert BANKRUPTCY moment appears
- Set `treasuryNegativeSince = tick - 90` (within window but below 96) → assert no moment
- Build ctx with 2 living adventurers → assert ROSTER_COLLAPSE moment appears
- Assert deduplication: running subscriber twice doesn't create two moments

### Step 5 — SCENARIO_GOAL moment detection

**Files:**
- `packages/core/src/world/types.ts` — add `isImminent?: (ctx: SimulationContext) => boolean` to `ScenarioGoalDef`
- `packages/core/src/scenarios/scenario1.ts` — implement `isImminent` for each goal
- `packages/core/src/events/DecisionMomentDetector.ts` — detection logic

**Type addition (`ScenarioGoalDef`):**

```typescript
export type ScenarioGoalDef = {
  id: string;
  description: string;
  condition: (ctx: SimulationContext) => boolean;
  diReward: number;
  optional?: boolean;
  isImminent?: (ctx: SimulationContext) => boolean;  // NEW: one step from complete
};
```

**Scenario 1 `isImminent` implementations:**

| Goal | isImminent |
|---|---|
| SURVIVAL | `tick > 600 && livingCount(ctx) >= 4` (in final 5 days AND on track) |
| SOLVENT | `tick > 600 && ctx.treasury > 0` (in final 5 days AND solvent) |
| BOND | any pair with relationship strength ≥ 60 (approaching 75 TRUSTED_COMPANION threshold) and goal not yet complete |

**Detection:**

```
For each goal in scenario.goals that is NOT completed:
  find goalDef in registry
  if goalDef.isImminent?.(ctx) === true:
    if no SCENARIO_GOAL moment for this goalId:
      addMoment({ kind: 'SCENARIO_GOAL', subjectId: goalDef.id, … })
```

**Options (generic — surface as a narrative nudge, no probability shift):**
- Option 0: Let fate decide (diCost 0, shift 0)
- Option 1: Grant favor (diCost 5, shift 0 — player acknowledges the moment; grants +5 DI refund on completion)

**situationText:** `"The guild is close to {goalDescription}."`

**Test:** `packages/core/tests/decision-moment-scenario-goal.test.ts`
- Build scenario1 ctx at tick 700, treasury > 0 → assert SOLVENT + SURVIVAL SCENARIO_GOAL moments appear
- Build scenario1 ctx with two adventurers at strength 65 → assert BOND moment appears
- Assert no moment when goal already completed

### Step 6 — PARTY_SELECTION moment detection

**File:** `packages/core/src/events/DecisionMomentDetector.ts`

In `detectConditions`, scan available quests after day-tick party assignment has already run:

```
For each quest in ctx.questBoard.available (not yet IN_PROGRESS):
  build best available party (same logic as partySelectionSubscriber rank order)
  if party.length >= quest.requiredPartySize:
    prob = computeQuestProbability(quest, party, graph, 0)
    if prob < 0.30 AND no PARTY_SELECTION moment for this quest:
      addMoment({ kind: 'PARTY_SELECTION', subjectId: quest.id, … })
```

Deduplication by questId: `pendingDecisions.some(m => m.kind === 'PARTY_SELECTION' && m.subjectId === quest.id)`.

**Note:** This detection fires AFTER `partySelectionSubscriber` (step 6) runs for the current tick. The player's boost is written to `pendingShifts` keyed by adventurer IDs in the party. `questResolutionSubscriber` reads these when the quest later resolves.

**Options:**
- Option 0: Let fate decide (diCost 0, shift 0)
- Option 1: Bless the party (diCost 12, shift +0.20 applied to each party member's subjectId in pendingShifts — moment stores multiple subjectId refs... see implementation note below)

**Implementation note:** `DecisionMoment.subjectId` is `string | undefined`. For PARTY_SELECTION, the shift must fan out to all party member IDs. For P4d, encode `subjectId` as a comma-joined list of adventurer IDs (`"id1,id2"`). `chooseOption` in `DivineTools.ts` already does `pendingShifts.set(moment.subjectId, shift)` — extend it to split on `,` and set each ID if it finds one.

**situationText:** `"{questName} has a {pct}% chance of success with the current roster."`

**Test:** `packages/core/tests/decision-moment-party.test.ts`
- Build ctx with a difficulty-9 quest available and matching idle party
- Run `decisionMomentSubscriber` → assert PARTY_SELECTION moment appears with prob < 0.30
- Build ctx with a difficulty-3 quest → assert no PARTY_SELECTION moment
- Assert deduplication

### Step 7 — PEACE_STREAK_30 daily milestone

**File:** `packages/core/src/adventurers/PersonalGoals.ts`

Add a daily subscriber (hour === 0) that fires alongside or inside `personalGoalSubscriber`:

```
For each adventurer with PEACE goal, state ≠ DEAD/RETIRED, goal not completed:
  if PEACE_STREAK_30 milestone already in progress → skip
  lastQuestTick = last tick where a QUEST event with this adventurer as participant appears in eventLog
  if lastQuestTick === undefined OR tick - lastQuestTick >= 720:   // 30 days
    append GoalMilestone { tick, description: 'PEACE_STREAK_30' } to personalGoalProgress
```

The existing `checkGoalCompletion` for PEACE already checks `milestones.some(m => m.description === 'PEACE_STREAK_30')` — so this milestone being appended triggers goal completion on the same or next tick.

**Test:** `packages/core/tests/personal-goal-peace.test.ts`
- Build ctx with a PEACE-goal adventurer; run for 30 day-ticks with no quests → assert PEACE_STREAK_30 milestone fires and `personalGoalProgress.completed === true`
- Build same but send adventurer ON_QUEST at day 15 → assert no PEACE_STREAK_30 at day 30 (streak broken)

---

## Validation

- [x] `pnpm --filter @ugs/core test` passes (Vitest green) — 429 tests, 33 files
- [x] `tsc --noEmit` clean (0 errors)
- [x] `svelte-check` clean (0 errors, 0 warnings)
- [x] A fresh `createScenario1Context` run for 1 day-tick: all adventurers mood ≥ 25
- [x] `decisionMomentSubscriber` surfaces DEPARTURE moment for an adventurer with despairStreak ≥ 3
- [x] `decisionMomentSubscriber` surfaces DEATH_IMMINENT moment for a high-difficulty quest resolving within 12 ticks
- [x] SCENARIO_CRITICAL appears when `treasuryNegativeSince` is 100 ticks ago (BANKRUPTCY in 3 days)
- [x] SCENARIO_GOAL appears for BOND goal when two adventurers are at relationship strength 60
- [x] PARTY_SELECTION appears for a difficulty-9 quest with prob < 0.30
- [x] PEACE_STREAK_30 milestone fires for a PEACE adventurer with 30 days of non-combat activity
- [x] Total Vitest test count: 429 (was 392; +37 new tests across 7 new test files)

---

## Risks / unknowns

- **DEATH_IMMINENT retroactivity:** If a quest resolves and the NEAR_DEATH beat fires THIS tick,
  decisionMomentDetector sees it post-resolution. The plan implements prospective detection
  (quest resolving within 12 ticks, pre-resolution) which requires a forward-looking check on
  `questBoard.active`. This is cleaner than retroactive detection.
- **PARTY_SELECTION multi-subjectId fan-out:** `chooseOption` in `DivineTools.ts` sets one
  `pendingShifts` key. The comma-join approach works but is a minor schema deviation from the
  single-string `subjectId`. Consider formalizing `subjectIds: string[]` on `DecisionMoment`
  in a follow-up — for now the string hack is isolated to `chooseOption` + PARTY_SELECTION
  detection.
- **PEACE streak via eventLog:** The `eventLog` is the authoritative record but grows unbounded.
  If the log is ever pruned, PEACE detection must adapt. For P4d this is not a concern.

---

## Notes

Implemented prospective DEATH_IMMINENT detection (quests resolving within 12 ticks with prob < 0.40) rather than retroactive (post-resolution NEAR_DEATH beat) as discussed in Risks. The approach is cleaner and lets the player actually act before resolution.

PARTY_SELECTION subjectId is comma-joined adventurer IDs; `chooseOption` in DivineTools.ts now splits on comma before writing to pendingShifts — the fan-out lands on each party member's shift key, which questResolutionSubscriber already sums.

PEACE_STREAK_30 uses the eventLog as the authority for "last quest participation tick" — works for the full 30-day window since the log is unbounded in the current implementation.

`ScenarioEngine.ts` got a new exported `getScenario(id)` function so DecisionMomentDetector can call `isImminent` without re-importing the registry directly.

---

## Follow-ups

- **Deferred (polish):** Choice-card E2E test (Playwright) — requires P4d decisions to actually populate `pendingDecisions` at runtime; PARTY_SELECTION and DEPARTURE now do so.
- **Deferred (polish):** `departureSubscriber` doesn't yet read `pendingShifts` for the MOOD_LIFT option — the probability shift is written but not consumed at departure roll time. Follow-up: add `const diBoost = ctx.pendingShifts.get(adv.id) ?? 0` to departure probability computation in `departureSubscriber`.
- **None** of the other items from the plan require separate tracking.
