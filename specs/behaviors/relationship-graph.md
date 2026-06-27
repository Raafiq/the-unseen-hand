# Behavior: Relationship Graph

## Rule

Relationships between adventurers are bidirectional weighted edges with a strength value (−100 to +100). Strength determines the relationship type, which determines both continuous behavioural modifiers and discrete threshold events.

## Applies To

- `packages/core/src/relationships/`
- Combat resolver (DEFEND_ALLY, HESITATE)
- Social event resolver
- Quest autonomous party selection
- Departure system

## Details

### Graph structure

`RelationshipGraph` is a `Map<AdventurerId, Map<AdventurerId, RelationshipEdge>>`.

The graph is symmetric: `graph[A][B].strength === graph[B][A].strength` at all times. Any update to one side must update the other.

An edge is created with `strength: 0, type: STRANGER` the first time two adventurers are assigned to the same quest. Adventurers who have never shared a quest have no edge (not the same as `STRANGER` — the absence of an edge means truly no history).

### Relationship type thresholds

| Type | Strength range |
|---|---|
| `ENEMY` | −100 to −51 |
| `RIVAL` | −50 to −11 |
| `STRANGER` | −10 to +10 |
| `ACQUAINTANCE` | +11 to +39 |
| `FRIEND` | +40 to +69 |
| `TRUSTED_COMPANION` | +70 to +100 |

Type is derived from strength on read — it is not stored independently. Computing type from strength is idempotent.

### Strength shifts

Applied at the end of each tick where a relevant event fires:

| Event | Strength delta |
|---|---|
| Co-quest success | +8 |
| Co-quest failure (survived together) | +4 |
| Co-quest death of ally (survivor perspective) | −5 (grief) |
| Positive social interaction | +5 |
| Argument | −8 |
| Breakthrough social event | +15 |
| SILENT_DISTANCE social outcome | −3 |
| Time apart (> 14 days, no shared activity) | −1 per day |
| DEFEND_ALLY action (defender → defended) | +12; (defended → defender) +8 |
| HESITATE when ally needed help (in RIVAL relationship) | −5 |

Strength is clamped to [−100, +100] after each shift.

### Threshold events

A threshold event fires when `strength` crosses a type boundary:

| Transition | Event type |
|---|---|
| Any → `FRIEND` | `FRIENDSHIP_FORMED` |
| Any → `TRUSTED_COMPANION` | `TRUSTED_COMPANION_BOND_FORMED` |
| `FRIEND` or above → `RIVAL` or below | `BOND_BROKEN` |
| `RIVAL` → `ENEMY` | `RIVALRY_DEEPENED` |
| `ENEMY` or `RIVAL` → `STRANGER` or above | `RECONCILIATION` |

Threshold events carry: `{ adventurerId1, adventurerId2, newType, priorType, strength }`.

They are consumed by the event bus (see `behaviors/event-bus.md`) and rendered to the event feed.

### Long-separation decay

Applies at each day tick to edges where neither adventurer has been on a shared quest, social event, or interaction in the past 14 days:
- Decay: −1 per day until strength reaches 0 (no decay below 0 from separation alone — enemies do not become friends through distance).
- Edges at `STRANGER` strength (−10 to +10) are not decayed further.

### Dead and retired adventurers

Edges involving dead or retired adventurers are preserved on surviving adventurers. They do not decay (the relationship is frozen in memory). They are displayed in the character detail panel with a `[deceased]` or `[departed]` annotation.

## Validation

- `graph[A][B].strength === graph[B][A].strength` after any update.
- Strength 71 → type `TRUSTED_COMPANION`. Strength −51 → type `ENEMY`.
- Crossing from `ACQUAINTANCE` to `FRIEND` fires exactly one `FRIENDSHIP_FORMED` event.
- 14 days of no shared activity on a `FRIEND`-strength edge reduces strength by 14 points.
- Dead adventurer's edge on a surviving adventurer does not change after death.

## Principles

**Inherited:**
- [Every outcome has a narrative cause](../principles.md#every-outcome-has-a-narrative-cause) — threshold events are the mechanism by which relationship changes enter the narrative. Every meaningful relationship shift fires a typed event with a rendered string.
- [Emergence over control](../principles.md#emergence-over-control) — the player cannot directly set relationship strength. They can nudge it via divine touch (`REVEAL_SECRET`) and world seeding, but the graph evolves from adventurer actions.
