# Behavior: Scenario Engine

## Rule

A scenario is a structured entry point with named goals and fail conditions. The simulation evaluates them each tick. Completing all goals fires `ScenarioComplete` and unlocks sandbox mode. Triggering a fail condition fires `ScenarioFailed`. In sandbox mode, `ctx.scenario` is null and the simulation runs indefinitely.

## Applies To

- `packages/core/src/scenarios/`

## Details

### Scenario schema

```typescript
type Scenario = {
  id: string;
  title: string;
  premise: string;          // narrative framing for the player
  goals: ScenarioGoal[];
  failConditions: FailCondition[];
  timeLimit?: number;       // optional tick limit; expiry fires a fail condition
  startingRoster: AdventurerSeed[];  // pre-seeded adventurers with defined identities + axes
  startingDI: number;       // initial divineInfluence for this scenario
};

type ScenarioGoal = {
  id: string;
  description: string;
  condition: (ctx: SimulationContext) => boolean;  // evaluated each tick
  diReward: number;
  optional?: boolean;        // optional goals grant DI bonus but don't block ScenarioComplete
};

type FailCondition = {
  id: string;
  description: string;
  condition: (ctx: SimulationContext) => boolean;
};
```

### Evaluation

Each tick, the scenario evaluator runs after all other subscribers:
1. For each incomplete, non-optional goal: evaluate `condition(ctx)`. If true, mark completed, grant `diReward`, fire `GoalAchieved` event.
2. For each untriggered fail condition: evaluate `condition(ctx)`. If true, mark triggered, fire `ScenarioFailed`.
3. If all non-optional goals are completed and no fail condition is triggered: fire `ScenarioComplete`.
4. On `ScenarioComplete`: transition to sandbox (`ctx.scenario.status = 'COMPLETE'`); unlock new regions per `behaviors/world-expansion.md`.

### Scenario 1: "The Failing Guild"

**Premise:** A once-proud guild is down to 6 adventurers and a near-empty treasury. A harsh winter is coming.

**Starting conditions:**
- 6 pre-seeded adventurers with diverse personalities and pre-existing relationship edges.
- Treasury: 50 gold (near-empty).
- Starting DI: 40.
- Time limit: 30 in-game days (720 ticks).

**Goals:**

| id | Description | Condition | DI reward | Optional? |
|---|---|---|---|---|
| `SURVIVAL` | Maintain ≥ 4 living (non-retired) adventurers through day 30 | At tick 720: count adventurers with state not `DEAD` or `RETIRED` ≥ 4 | 25 | No |
| `SOLVENT` | Treasury above 0 at day 30 | At tick 720: `ctx.treasury > 0` | 20 | No |
| `BOND` | Two adventurers form a `TRUSTED_COMPANION` bond | `TRUSTED_COMPANION_BOND_FORMED` event fires at any point during the scenario | 30 | Yes |

**Fail conditions:**

| id | Description | Condition |
|---|---|---|
| `ROSTER_COLLAPSE` | Roster drops below 2 living adventurers | `count(state not DEAD or RETIRED) < 2` at any tick |
| `BANKRUPTCY` | Treasury below 0 for 7 consecutive days | `treasury < 0` for 168+ consecutive ticks |

**Pre-seeded adventurers** (identities defined in the scenario seed, axes seeded deterministically):
- Kara (courage: 70, loyalty: 80, backstory: veteran who lost her previous guild in a fire; personal goal: BELONGING)
- Doran (greed: 75, ambition: 65, backstory: merchant's son seeking fortune; personal goal: WEALTH)
- Selin (empathy: 85, courage: 30, backstory: former healer turned adventurer after village raid; personal goal: PEACE)
- Mira (courage: 55, ambition: 80, backstory: youngest sibling proving herself; personal goal: HEROISM)
- Garrett (loyalty: 90, greed: 20, backstory: sworn to protect Kara after she saved his life; personal goal: BELONGING)
  - Pre-existing edge: Garrett → Kara: `TRUSTED_COMPANION` (strength 75)
- Voss (courage: 85, empathy: 15, backstory: exile seeking redemption through violence; personal goal: REVENGE)
  - Pre-existing edge: Voss → Mira: `RIVAL` (strength −30)

### Treasury

`ctx.treasury: number` is not defined in Phase 1 data model — it is added in Phase 4 as part of scenario support. Quest rewards flow to treasury. Quest costs (upkeep per adventurer per week: 5 gold) are deducted each week.

## Validation

- `ScenarioFailed` fires when roster drops to 1 (< 2), not at 2.
- `BANKRUPTCY` fail condition does not fire after 6 days of negative treasury — exactly 7 days (168 ticks).
- `ScenarioComplete` fires only when all non-optional goals are complete and no fail condition is triggered.
- Optional `BOND` goal grants DI on completion but its incompletion does not prevent `ScenarioComplete`.
- Pre-seeded Garrett and Kara start with `TRUSTED_COMPANION` edge at strength 75.
- Entering sandbox mode: `ctx.scenario.status === 'COMPLETE'`, `ctx.scenario` is not null (preserved as record).

## Principles

**Inherited:**
- [Permadeath is the weight; DI is the cost](../principles.md#permadeath-is-the-weight-di-is-the-cost) — the `SURVIVAL` goal's stakes are real because death is permanent. Saving everyone is mechanically costly.
- [Autonomy is the default](../principles.md#autonomy-is-the-default-intervention-is-the-exception) — goal conditions are evaluated passively each tick; no player action is required to check progress.
