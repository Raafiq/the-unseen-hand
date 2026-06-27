# Behavior: Combat Resolution

## Rule

Quest resolution produces a sequence of `CombatBeat` records — a beat-by-beat narrative log of the fight. Beats are driven by personality axes, relationship edges, and seeded rolls. The beat log is produced during `resolveQuest` and stored in `QuestOutcome.beats`.

## Applies To

- `packages/core/src/combat/`
- `resolveQuest` in `packages/core/src/quests/`

## Details

### Beat generation

`generateBeats(quest, party, rng, outcome): CombatBeat[]`

- Called after the success/failure roll in `resolveQuest`.
- Number of beats: `quest.difficulty * 3 + party.length * 2`, randomised ±20% via seeded RNG.
- Beats represent a narrative reconstruction of what happened — they are generated to be consistent with the already-determined outcome, not to re-determine it.

### Beat action selection

Each beat's action is drawn from a weighted probability table for the acting adventurer:

```
ATTACK:       base 0.45
HESITATE:     base 0.10
DEFEND_ALLY:  base 0.05
FLEE:         base 0.05
USE_ITEM:     base 0.05
CRITICAL:     base 0.15
NEAR_DEATH:   base 0.15
```

Personality modifiers applied before rolling:

| Condition | Action affected | Adjustment |
|---|---|---|
| `courage < 30` AND losing fight | `FLEE` | +0.35 |
| `courage < 30` AND losing fight | `ATTACK` | −0.20 |
| `courage < 30` AND losing fight | `HESITATE` | +0.15 |
| `loyalty > 70` AND ally below 20% health | `DEFEND_ALLY` | +0.40 |
| `empathy > 60` AND ally below 20% health | `DEFEND_ALLY` | +0.20 |
| Active `TRUSTED_COMPANION` relationship with ally in danger | `DEFEND_ALLY` | +0.30 |
| Active `RIVAL` relationship with adventurer in need | `HESITATE` | +0.25; `DEFEND_ALLY` −0.25 |
| Quest success outcome | `CRITICAL` | +0.15; `FLEE` −0.10 |
| Quest failure outcome | `FLEE` | +0.15; `CRITICAL` −0.10 |

All probabilities are normalised to sum to 1.0 after adjustment.

### Losing fight condition

A "losing fight" is defined as: the quest is on the failure trajectory (determined by the pre-rolled outcome) AND more than 40% of beats have elapsed. This is a narratively constructed concept — there is no HP tracking.

### NEAR_DEATH beats

- A `NEAR_DEATH` beat on a party member who dies in the outcome fires a `DecisionMomentEvent` (if `DecisionMomentDetector` approves; see `behaviors/decision-moments.md`).
- `NEAR_DEATH` on a party member who survives is a pure narrative beat — no decision moment.

### personalityNote

Attached to a beat when a personality axis was the dominant cause and the axis value is < 35 or > 65:

- `courage: 14 → FLEE`: `"courage 14 — breaks before the odds"`.
- `loyalty: 82 → DEFEND_ALLY` for a near-stranger: `"loyalty 82 — stands by a near-stranger without hesitation"`.
- `empathy: 9 → no DEFEND_ALLY` for a `TRUSTED_COMPANION`: `"empathy 9 — cannot bring themselves to intervene"`.
- `courage: 78 → ATTACK` when the fight is clearly lost: `"courage 78 — refuses to yield"`.

Note format: `"{axis} {value} — {short clause}"`. Maximum 10 words after the dash.

### Beat template engine

`renderBeat(beat: CombatBeat, adventurerMap: Map<AdventurerId, Adventurer>): string`

- Maps each `BeatAction` to a template from a bank.
- Each `BeatAction` has **at least 3 template variants**. Variant is selected by `rng`.
- Slots: `{actor}`, `{ally}` (if DEFEND_ALLY), `{personalityNote}` (appended if present).
- No slot goes unfilled. If `ally` is not determinable, the template uses a generic "a companion".

**Example templates for `DEFEND_ALLY`:**
1. `"{actor} throws themselves in front of {ally}, taking the blow meant for them."`
2. `"{actor} shouts a warning and drags {ally} clear just in time."`
3. `"{actor} steps between {ally} and the attacker without a word."`

## Validation

- Every `BeatAction` has at least 3 template variants; running `renderBeat` for all actions with any valid adventurer produces no unfilled `{slot}` markers.
- `courage: 10` adventurer on a failing quest has `FLEE` selected in > 50% of beats (statistical over many seeds).
- `TRUSTED_COMPANION` pair: `DEFEND_ALLY` fires at least once in any quest with an ally `NEAR_DEATH` beat (probability high enough to be nearly certain).
- `RIVAL` pair: `HESITATE` probability is measurably higher than for a `STRANGER` pair (assert shifted probability, not outcome).
- Beat count is within ±20% of `quest.difficulty * 3 + party.length * 2`.

## Principles

**Inherited:**
- [Every outcome has a narrative cause](../principles.md#every-outcome-has-a-narrative-cause) — `personalityNote` is the primary mechanism for surfacing this causation in beat text.
- [The event feed is the game](../principles.md#the-event-feed-is-the-game) — rendered beat text must be readable and engaging, not a debug log. Three template variants per action are a minimum, not a target.
- [Probability shift, not outcome override](../principles.md#probability-shift-not-outcome-override) — beats are generated to be consistent with the pre-rolled outcome, not to re-roll it. The outcome is fixed; the beats dramatise it.
