# Behavior: History Layer (Personality Modifier)

## Rule

Each adventurer carries an ordered list of significant past events (`HistoryEvent[]`). These events produce contextual personality modifiers — read-only adjustments applied on top of base axes when computing behaviour probabilities in specific circumstances. Modifiers are never stored; they are computed on demand.

## Applies To

- `packages/core/src/adventurers/HistoryLayer.ts`
- All behaviour probability functions that accept contextual adjustment

## Details

### History events that create modifiers

| HistoryEventKind | Creates modifier |
|---|---|
| `WITNESSED_DEATH` | −20 effective `courage` vs. the same enemy archetype as the quest where the ally died |
| `BETRAYED_BY` | −30 effective `loyalty` specifically toward the betrayer's `personalGoal` group |
| `SAVED_BY` | +15 effective `loyalty` toward the saver (by adventurerId); +10 effective `empathy` in scenarios involving rescue |
| `FIRST_KILL` | +10 effective `courage` in all subsequent combat |
| `NEAR_DEATH` | +15 effective `courage` for 14 days (survival boosts confidence); −10 effective `courage` after 30 days (lingering trauma) |
| `SEND_DREAM` | minor undefined contextual modifier — used in Phase 5+ for divine touch effects |

### Contextual modifier function

`contextualModifier(axes: PersonalityAxes, history: HistoryEvent[], context: BehaviourContext): PersonalityAxes`

- `BehaviourContext`: `{ questType, enemyArchetype, involvedAdventurerIds, tick }`.
- Returns an adjusted `PersonalityAxes` — same shape as base axes but with deltas applied.
- Values clamped to [0, 100].
- The returned axes are **not** stored on the adventurer. They are computed fresh each time they are needed (per beat, per social event, per volunteer check).
- The function is pure: same `(axes, history, context)` → same output.

### Modifier stacking

Multiple history events of the same kind apply independently and their modifiers sum:
- Two `WITNESSED_DEATH` events: −20 each = −40 effective courage in the relevant context.
- Clamped after summing: cannot go below 0 or above 100.

### History event recording

A `HistoryEvent` is appended to the adventurer's history list when:
- An ally dies on a quest the adventurer is on (`WITNESSED_DEATH`).
- An adventurer acts against a `TRUSTED_COMPANION`'s interest in a quest (`BETRAYED_BY` — the betrayed adventurer's history gains the event).
- An adventurer uses `DEFEND_ALLY` that prevents a death (`SAVED_BY` on the saved adventurer).
- An adventurer's first `ATTACK` action in combat (`FIRST_KILL` — first `ATTACK` in history).
- An adventurer has a `NEAR_DEATH` beat and survives (`NEAR_DEATH`).
- A `SEND_DREAM` divine touch is applied (`SEND_DREAM`).

### History list bounds

- Maximum history list length: 50 events. If exceeded, the oldest events are pruned (FIFO). Pruned events no longer contribute modifiers.
- All history events are rendered in the character detail panel's history section.

### Reuse beyond adventurers

- `HistoryEvent` (same shape, same 50-cap `appendHistoryEvent`) is reused by notable Tier A
  NPCs — see `behaviors/npc-system.md` for their event-driven write sites. `contextualModifier`
  remains adventurer-only and is unchanged.
- The thought system (`behaviors/thought-system.md`) reads history entries (weight × recency
  salience) to select the subject of an actor's current thought.

### WITNESSED_DEATH — enemy archetype

`enemyArchetype` is a tag on the quest that produced the death: `UNDEAD | BEAST | HUMAN | ELEMENTAL | UNKNOWN`. Quest types map to archetypes probabilistically — `DUNGEON` quests can produce any archetype; `BOUNTY` quests are typically `HUMAN` or `BEAST`. Archetype is seeded at quest generation.

The `WITNESSED_DEATH` modifier applies only when `context.enemyArchetype` matches the archetype recorded in the history event. It does not apply in unrelated quest types.

## Validation

- `contextualModifier` is a pure function: called twice with same args → same result.
- `WITNESSED_DEATH` modifier does not affect `courage` in a quest with a different enemy archetype.
- Two `WITNESSED_DEATH` events: effective courage reduced by 40 in the relevant context, clamped at 0 if base courage < 40.
- `NEAR_DEATH` modifier: tick 5 after event → +15 effective courage. Tick 40 after event → −10 effective courage.
- History list does not exceed 50 events; 51st event causes oldest to be pruned.
- `FIRST_KILL` modifier applies in all subsequent combat contexts once recorded.

## Principles

**Inherited:**
- [Every outcome has a narrative cause](../principles.md#every-outcome-has-a-narrative-cause) — history modifiers are the mechanism by which past events affect future behaviour. Without this layer, personality axes are static and outcomes feel disconnected from story.
- [Headless correctness first](../principles.md#headless-correctness-first-visual-representation-second) — `contextualModifier` is a pure function in `packages/core`. It must be testable without the UI.
