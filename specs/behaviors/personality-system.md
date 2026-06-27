# Behavior: Personality System

## Rule

Five personality axes (courage, greed, empathy, loyalty, ambition) are the root of all adventurer behaviour differences. Every non-random behavioural divergence between adventurers must trace back to axis values or relationship edges — never to hidden per-entity dice modifiers.

## Applies To

- `packages/core/src/adventurers/personality.ts`
- All combat, social, and quest resolver functions

## Details

### The five axes

| Axis | Range | Influences |
|---|---|---|
| `courage` | 0–100 | Flee threshold; hesitation probability; `NEAR_DEATH` survival rolls |
| `greed` | 0–100 | Loot sharing; quest selection weight for `WEALTH` goal alignment; bribery event outcomes |
| `empathy` | 0–100 | `DEFEND_ALLY` probability; social interaction positive outcome weight; grief duration |
| `loyalty` | 0–100 | `DEFEND_ALLY` probability (especially for `TRUSTED_COMPANION`); betrayal resistance; departure threshold modifier |
| `ambition` | 0–100 | Quest selection bias toward harder quests; `POLITICAL` quest affinity; personal goal pursuit rate |

### Derived probability functions

All derived functions are **pure** — they take axes (and optionally context) and return a probability float in [0, 1]:

**`fleeThreshold(axes)`**
- High courage (≥ 70): ≤ 0.10 flee probability.
- Low courage (≤ 30): ≥ 0.65 flee probability.
- Linear interpolation between.

**`shareLootChance(axes)`**
- `(empathy * 0.6 + (100 - greed) * 0.4) / 100`, clamped to [0, 1].

**`defendAllyChance(axes, edge)`**
- Base: `(loyalty * 0.5 + empathy * 0.5) / 100`.
- Multiplied by: `TRUSTED_COMPANION → 1.8`, `FRIEND → 1.3`, `ACQUAINTANCE → 1.0`, `RIVAL → 0.3`, `ENEMY → 0.0`.
- `STRANGER` uses `ACQUAINTANCE` multiplier (they are still teammates).
- Clamped to [0, 1].

**`questVolunteerWeight(adventurer, quest)`**
- Base: `adventurer.mood / 100`.
- Goal alignment bonus: `+0.3` if quest type strongly aligns with `personalGoal` (see table below).
- Ambition bonus: `difficulty >= 7 ? ambition / 100 * 0.2 : 0`.
- State penalty: not `IDLE` → weight = 0.

**Goal alignment table**

| PersonalGoal | Strongly aligned QuestTypes |
|---|---|
| `HEROISM` | `DUNGEON`, `RESCUE` |
| `WEALTH` | `FETCH`, `BOUNTY` |
| `BELONGING` | `ESCORT`, `RESCUE` |
| `REVENGE` | `BOUNTY`, `DUNGEON` |
| `WANDERLUST` | any (all types get `+0.1`); `INVESTIGATION` gets full `+0.3` |
| `PEACE` | `ESCORT`, `INVESTIGATION`; bonus decays as `personalGoalProgress` approaches completion |

### Personality note generation

A `personalityNote` is attached to a `CombatBeat` when the beat's action was determined primarily by a single axis and the probability was non-obvious (i.e. the dominant axis is < 35 or > 65):

- `courage < 30` causing `HESITATE` or `FLEE`: "courage {value} — {short phrase}".
- `loyalty > 70` causing `DEFEND_ALLY` for a non-companion: "loyalty {value} — stands by a near-stranger".
- `empathy < 20` causing no `DEFEND_ALLY` for a `TRUSTED_COMPANION`: "empathy {value} — cannot bring themselves to intervene".

The note is a short, readable phrase — not a debug string. It must make sense to a player.

## Validation

- `fleeThreshold({ courage: 100, greed: 0, empathy: 100, loyalty: 100, ambition: 0 })` ≤ 0.10.
- `fleeThreshold({ courage: 0, greed: 0, empathy: 0, loyalty: 0, ambition: 0 })` ≥ 0.65.
- `defendAllyChance(highLoyaltyAxes, TRUSTED_COMPANION edge)` > `defendAllyChance(highLoyaltyAxes, ENEMY edge)`.
- `defendAllyChance(anyAxes, ENEMY edge)` === 0.
- `questVolunteerWeight(idleAdventurer, alignedQuest)` > `questVolunteerWeight(idleAdventurer, nonAlignedQuest)`.
- `questVolunteerWeight(onQuestAdventurer, anyQuest)` === 0.

## Principles

**Inherited:**
- [Every outcome has a narrative cause](../principles.md#every-outcome-has-a-narrative-cause) — `personalityNote` on combat beats exists specifically to surface this causation to the player.
- [Emergence over control](../principles.md#emergence-over-control) — axes shift probabilities, never guarantee outcomes. A `courage: 5` adventurer can still survive; they just probably won't.
