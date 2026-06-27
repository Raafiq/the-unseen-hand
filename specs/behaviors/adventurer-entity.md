# Behavior: Adventurer Entity & State Machine

## Rule

Each adventurer is a persistent entity with identity, personality, mood, and a state machine governing what they can do at any tick. State transitions are typed, guarded, and explicit.

## Applies To

- `packages/core/src/adventurers/`

## Details

### Identity

An adventurer's identity is fixed at creation and never mutates:
- `name`, `age`, `backstory`: narrative descriptors.
- `personalGoal`: one of `HEROISM | WEALTH | BELONGING | REVENGE | WANDERLUST | PEACE`. Drives autonomous behavior preferences and goal progress tracking.

### State machine

Valid states and legal transitions:

```
IDLE ──────────────────────────────────────────── ON_QUEST
  │                                                   │
  ├── RESTING                                         ├── IN_DUNGEON
  │     └── IDLE                                      │     └── ON_QUEST (dungeon phase complete)
  │                                                   │
  ├── SOCIALIZING                                     └── DEAD (quest death)
  │     └── IDLE                                          └── (terminal)
  │
  ├── IN_DISPUTE
  │     ├── IDLE (resolved)
  │     └── RETIRED (unresolved, mood threshold)
  │
  └── RETIRED (departure via mood)
        └── (terminal)
```

- `DEAD` and `RETIRED` are terminal states. No transition out.
- `IN_DUNGEON` is a sub-state of an active quest (`ON_QUEST` must be the prior state).
- Attempting an illegal transition in development throws `IllegalStateTransitionError`.
- In production, the transition is silently rejected and the prior state retained.

### State constraints

| State | Constraint |
|---|---|
| `ON_QUEST` | `currentQuestId` must be non-null |
| `IN_DUNGEON` | `currentQuestId` must be non-null; prior state must be `ON_QUEST` |
| `IDLE` | `currentQuestId` must be null |
| `RESTING` | `currentQuestId` must be null |
| `SOCIALIZING` | `currentQuestId` must be null |
| `DEAD` | cannot be volunteered for quests; removed from relationship active pool |
| `RETIRED` | persists in adventurer map; relationships on surviving adventurers are preserved |

### Derived behaviour functions

These are **pure functions** — not stored on the entity, computed on demand:

- `fleeThreshold(axes: PersonalityAxes): number` — probability to attempt flee when losing. Driven primarily by `courage`.
- `shareLootChance(axes: PersonalityAxes): number` — probability to voluntarily share quest reward. Driven by `greed` (inverse) and `empathy`.
- `defendAllyChance(axes: PersonalityAxes, edge: RelationshipEdge): number` — probability to use `DEFEND_ALLY` action when an ally is near death. Driven by `loyalty` and `empathy`, amplified by `TRUSTED_COMPANION` relationship type.
- `questVolunteerWeight(adventurer: Adventurer, quest: Quest): number` — composite weight for autonomous party selection. Incorporates personality-goal alignment, current mood, and current state.

### Personality axis ranges

All axes are integers in [0, 100]. They are set at adventurer creation and mutate only via:
- Phase 4 `PersonalGoalAchieved` events (permanent trait shift, bounded).
- Phase 4 `contextualModifier` (read-only computed adjustment; never stored).

## Validation

- Transitioning `IDLE → ON_QUEST` with a null `currentQuestId` throws in development.
- `DEAD → IDLE` is rejected in both development and production.
- `fleeThreshold({ courage: 100, ... })` returns a value ≤ 0.1.
- `fleeThreshold({ courage: 0, ... })` returns a value ≥ 0.8.
- `defendAllyChance` with a `TRUSTED_COMPANION` edge is always higher than with a `STRANGER` edge, all other axes equal.

## Principles

**Inherited:**
- [Every outcome has a narrative cause](../principles.md#every-outcome-has-a-narrative-cause) — personality axes must measurably influence behaviour probabilities; they are not cosmetic.
- [Autonomy is the default](../principles.md#autonomy-is-the-default-intervention-is-the-exception) — the state machine transitions without player input in the normal flow. Player commands are interruptions.
