# Behavior: Mood System

## Rule

Each adventurer has a mood score (0–100) composed of named, decaying factors. Mood is recalculated each day tick. Sustained low mood triggers departure risk. Mood influences quest volunteer probability and social interaction outcomes.

## Applies To

- `packages/core/src/adventurers/mood.ts`
- Departure system (see `behaviors/departure-system.md`)
- Social interaction resolver (see `behaviors/social-events.md`)
- Quest volunteer weight (see `behaviors/personality-system.md`)

## Details

### Mood score

```
mood = clamp(sum(activeMoodFactors.map(f => f.value)), 0, 100)
```

Recalculated at the start of each day tick (tick where `worldTime.hour === 0`).

### MoodFactor

Each factor has:
- `id`: unique within an adventurer's factor list.
- `label`: player-readable name (e.g. "Quest success", "Lost a companion", "Well-rested").
- `value`: positive or negative contribution.
- `decayRate`: fraction of `|value|` removed per day. A factor with `decayRate: 0.1` loses 10% of its magnitude each day.
- `expiresAt?`: optional tick at which the factor is removed entirely, regardless of decay.

When `|value|` decays below 1, the factor is removed from the list.

### Factor sources

| Event | Factor id | Value | Decay rate |
|---|---|---|---|
| Quest success | `QUEST_SUCCESS` | +15 | 0.15 |
| Quest failure | `QUEST_FAILURE` | −20 | 0.10 |
| Ally death (trusted companion) | `ALLY_DEATH_CLOSE` | −35 | 0.05 |
| Ally death (acquaintance) | `ALLY_DEATH_ACQUAINT` | −15 | 0.10 |
| Personal goal milestone | `GOAL_MILESTONE` | +20 | 0.08 |
| Personal goal achieved | `GOAL_ACHIEVED` | +40 | 0.03 |
| Positive social event | `SOCIAL_POSITIVE` | +8 | 0.20 |
| Argument | `SOCIAL_ARGUMENT` | −10 | 0.25 |
| Long idle (> 7 days no quest) | `IDLE_TOO_LONG` | −5 per day active | 0.0 (active while condition holds) |
| Resting | `RESTING` | +5 | 0.0 (active while resting) |
| Near-death survival | `NEAR_DEATH_SURVIVED` | +12 | 0.12 |

Multiple instances of the same `id` do not stack — new events overwrite the factor value and reset its decay.

### Mood thresholds

| Threshold | Mood range | Effect |
|---|---|---|
| `CONTENT` | 50–100 | No modifier |
| `NEUTRAL` | 25–49 | Quest volunteer weight reduced by 20% |
| `UNSATISFIED` | 10–24 | Quest volunteer weight reduced by 50%; social events more likely to be arguments |
| `DESPAIRING` | 0–9 | Departure roll fires each day; cannot volunteer for quests |

### UNSATISFIED and DESPAIRING display labels

The mood score itself (0–100 number) is shown in the UI. The label (`CONTENT` / `NEUTRAL` / `UNSATISFIED` / `DESPAIRING`) is shown alongside it as a status badge.

### Top mood factors

The UI displays the top 3 active mood factors by absolute `|value|`. These must always be the factors with the largest magnitude, regardless of sign.

## Validation

- Mood recalculation only runs on day ticks (hour === 0), not every tick.
- A factor with `decayRate: 0.10` and initial `value: 20` has `value ≈ 18` after one day.
- A factor with `|value| < 1` after decay is removed from the list.
- Two `QUEST_SUCCESS` factors: second overwrites first (same id, no stack).
- `mood < 10` for exactly 3 days does not trigger departure — the departure roll fires on day 3 (the day the streak *reaches* 3).

## Principles

**Inherited:**
- [Every outcome has a narrative cause](../principles.md#every-outcome-has-a-narrative-cause) — every mood shift has a named factor with a player-readable label. Unexplained mood drops are not permitted.
- [Autonomy is the default](../principles.md#autonomy-is-the-default-intervention-is-the-exception) — mood evolves without player input. The player may intervene via `MOOD_LIFT` divine touch, but the system runs without it.
