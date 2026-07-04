# Behavior: Social Event Engine

## Rule

Idle and resting adventurers may interact each day tick. Social interactions produce typed outcomes that adjust relationship strength and mood, and fire `SocialEvent` entries. The system runs without player input.

## Applies To

- `packages/core/src/events/SocialResolver.ts`

## Details

### Interaction eligibility

Each day tick, for each pair of adventurers where:
- Both are in `IDLE` or `RESTING` state.
- They have a `RelationshipEdge` (have shared a quest before), OR have been `IDLE` in the same guild for ≥ 7 days (they have been around each other).

An interaction roll is made with base probability `0.15`. Adjusted by:
- `(adventurer1.personality.empathy + adventurer2.personality.empathy) / 200 * 0.20` (sociability bonus)
- `+0.05` if either adventurer's mood is above 70
- `−0.10` if either adventurer's mood is below 25

Each pair is rolled at most once per day tick.

### Outcome selection

If the interaction roll succeeds, the outcome is selected from:

| Outcome | Base weight | Mood condition |
|---|---|---|
| `POSITIVE_CHAT` | 45 | — |
| `ARGUMENT` | 25 | Weight +20 if either adventurer is `UNSATISFIED` |
| `BREAKTHROUGH` | 10 | Weight +15 if relationship is `FRIEND` or higher |
| `SILENT_DISTANCE` | 20 | Weight +15 if relationship is `RIVAL` or `ENEMY` |

Weights are normalised to select one outcome.

### Outcome effects

**`POSITIVE_CHAT`**
- Relationship delta: +5 to both sides.
- Mood factor: `SOCIAL_POSITIVE` (+8) added to both adventurers.
- `renderedText`: `"{A} and {B} share a quiet evening together."` (3+ variants)

**`ARGUMENT`**
- Relationship delta: −8 to both sides.
- Mood factor: `SOCIAL_ARGUMENT` (−10) added to both.
- If the relationship crosses from `FRIEND` to `ACQUAINTANCE`, fires a `BOND_BROKEN` lifecycle event.
- `renderedText`: `"{A} and {B} have a heated disagreement."` (3+ variants)

**`BREAKTHROUGH`**
- Relationship delta: +15 to both sides.
- Mood factor: `SOCIAL_POSITIVE` (+20) added to both.
- Always fires a threshold event if strength crosses a type boundary.
- `renderedText`: `"{A} and {B} have an unexpected moment of understanding."` (3+ variants)

**`SILENT_DISTANCE`**
- Relationship delta: −3 to both sides.
- No mood factor.
- `renderedText`: `"{A} and {B} avoid each other's company."` (3+ variants)

### Template coverage

- Each outcome has at least 3 narrative template variants.
- Templates use `{A}` and `{B}` as adventurer name slots.
- Optional: `{backstoryFragment}` slot populated from the lower-loyalty adventurer's backstory (first 20 words) for `BREAKTHROUGH` templates.

## Validation

- `SILENT_DISTANCE` is more likely when either adventurer is `RIVAL` or `ENEMY` (assert weighted probability, not outcome).
- Two adventurers who have never met (no edge) can still interact after 7 days of shared idle time.
- Relationship delta from `BREAKTHROUGH` crosses thresholds and fires the appropriate lifecycle event.
- Each outcome type has ≥ 3 renderedText templates with no unfilled `{slots}`.
- `ARGUMENT` between two `UNSATISFIED` adventurers occurs more frequently than between two content adventurers (statistical over many seeds).

## Principles

**Inherited:**
- [Every outcome has a narrative cause](../principles.md#every-outcome-has-a-narrative-cause) — `renderedText` on every social event must be a readable sentence, not a debug label.
- [Autonomy of outcomes](../principles.md#autonomy-of-outcomes-player-controlled-tempo) — social events emerge without player involvement. The player may observe, but does not trigger or block them.
