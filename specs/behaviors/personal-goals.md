# Behavior: Personal Goal Arcs

## Rule

Each adventurer pursues their `PersonalGoal` by accumulating milestone events. Goal completion fires a `GoalAchieved` lifecycle event that grants a large mood spike, a permanent (but bounded) trait shift, and optionally triggers a retirement decision. The player earns DI from completions.

## Applies To

- `packages/core/src/adventurers/PersonalGoals.ts`

## Details

### Goal milestone tracking

`GoalProgress` is stored on each adventurer. Milestones accumulate via `GoalMilestone` records. Goals are evaluated after each relevant event fires.

### Goal completion conditions

| PersonalGoal | Completion condition |
|---|---|
| `HEROISM` | 3 `DUNGEON` or `RESCUE` quests completed successfully AND at least 1 `NEAR_DEATH` survival beat in history |
| `WEALTH` | Total gold earned (across all quest rewards) ≥ 500 gold |
| `BELONGING` | 2 or more `TRUSTED_COMPANION` relationships active simultaneously |
| `REVENGE` | The designated antagonist (seeded at world generation for adventurers with `REVENGE` goal) is defeated in a quest (quest with matching tag completes successfully) |
| `WANDERLUST` | Quests completed across ≥ 3 distinct regions |
| `PEACE` | 30 consecutive in-game days without entering combat (no `ON_QUEST` state that leads to a quest with `QuestRisk.deathChance > 0.05`) |

### Milestone events

Milestones fire as sub-events that contribute to goal progress. Examples:

| PersonalGoal | Milestone event | Trigger |
|---|---|---|
| `HEROISM` | "First dungeon cleared" | First `DUNGEON` quest success |
| `HEROISM` | "Survived certain death" | `NEAR_DEATH` beat in a quest the adventurer survives |
| `WEALTH` | "First 100 gold" | Cumulative gold crosses 100 |
| `BELONGING` | "First true companion" | First `TRUSTED_COMPANION` bond formed |

Milestones are narrative markers — they fire `GoalMilestone` lifecycle events with `renderedText` and contribute to goal display in the UI (see `screens/character-detail.md`).

### On goal completion

1. Fire `PersonalGoalAchieved` lifecycle event.
2. Add `GOAL_ACHIEVED` mood factor (+40, decay 0.03).
3. Permanent trait shift: a bounded adjustment to one or two personality axes, specific to the goal:
   - `HEROISM`: `courage +10` (capped at 100), `ambition +5` (capped at 100).
   - `WEALTH`: `greed −10` (minimum 0) — wealth satisfied paradoxically reduces raw greed.
   - `BELONGING`: `empathy +10`, `loyalty +5`.
   - `REVENGE`: `courage +5`, `empathy −10` (revenge takes a toll).
   - `WANDERLUST`: `ambition +5`, `courage +5`.
   - `PEACE`: `empathy +15`, `courage −5`.
4. Trigger retirement decision moment (see below).
5. Grant +12 DI to player.

### Retirement decision moment

On goal completion, surface a `DecisionMoment`:
- `situationText`: `"{name} has achieved their deepest goal. They may choose to retire in peace."`
- Option 0: "Let them choose" — adventurer rolls 30% chance of retirement (higher loyalty → lower chance).
- Option 1: `SEND_DREAM` (cost 8 DI) — "Inspire them to stay" — suppresses retirement for 30 days; goal progress resets partially (they seek a new horizon but keep trait shifts).
- Option 2: "Grant them peace" (cost 0 DI) — adventurer retires immediately, fires `AdventurerDeparted` with `reason: GOAL_ACHIEVED`.

The moment expires after 48 ticks. If expired: option 0 auto-resolves.

### Goal completion uniqueness

An adventurer's goal can only be achieved once. After `GoalProgress.completed = true`, the milestone system stops tracking for that adventurer's original goal. If they stay (no retirement), they live without a formal goal — their `PersonalGoal` persists as identity but no longer drives autonomous quest preferences.

## Validation

- `HEROISM` goal does not complete after 3 dungeon successes with no `NEAR_DEATH` in history.
- `BELONGING` requires 2 simultaneous `TRUSTED_COMPANION` edges — one at strength 85 and one at strength 72 counts.
- Goal completion fires exactly one `PersonalGoalAchieved` event per adventurer lifetime.
- Permanent trait shift from `HEROISM` does not push courage above 100.
- Retirement decision moment appears within 1 tick of `PersonalGoalAchieved`.

## Principles

**Inherited:**
- [Every outcome has a narrative cause](../principles.md#every-outcome-has-a-narrative-cause) — goal milestones are the narrative thread connecting random events to meaningful character arcs.
- [Permadeath is the weight; DI is the cost](../principles.md#permadeath-is-the-weight-di-is-the-cost) — retirement on goal completion is permanent and honoured. The player's DI cost to keep the adventurer active is the designed tension.
