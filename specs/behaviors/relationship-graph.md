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

`RelationshipGraph` is a `Map<ActorId, Map<ActorId, RelationshipEdge>>`, where
`ActorId = AdventurerId | NpcId`. Adventurers and **Tier A notable NPCs** share one node space
(see `behaviors/npc-system.md`); an edge may connect two adventurers or an adventurer and a
notable NPC. Tier B nameless roles are never graph nodes.

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

`type` is stored on the edge and re-derived on every write via `strengthToType(strength)`. This keeps it immediately readable without a separate lookup. `strengthToType` is idempotent — re-deriving from the same strength always yields the same type.

### Strength shifts

Applied at the end of each tick where a relevant event fires:

| Event | Strength delta |
|---|---|
| Co-quest success | +8 |
| Co-quest failure (survived together) | +4 |
| Co-quest death of ally (survivor perspective) | −5 (grief) |
| Social outcome: BANTER | +3 |
| Social outcome: SOLIDARITY | +10 |
| Social outcome: BREAKTHROUGH | +18 |
| Social outcome: SILENT_DISTANCE | −1 |
| Social outcome: ARGUMENT | −10 |
| Social outcome: ESTRANGEMENT | −22 (+ 5-day approach cooldown) |
| Time apart (> 14 days, no shared activity) | −1 per day |
| DEFEND_ALLY action (defender → defended) | +12; (defended → defender) +8 |
| HESITATE when ally needed help (in RIVAL relationship) | −5 |
| Driver: SHARED_DANGER bond (peril-response +) | +12 (additive to the co-quest +8) |
| Driver: BETRAYAL (peril-response −) | −18 |
| Driver: KINDNESS (town-life +) | +7 |
| Driver: RIVALRY_SPARK (town-life −) | −10; −14 when it crosses into ENEMY |

Strength is clamped to [−100, +100] after each shift.

The **driver** rows above are discrete, personality-triggered relationship events defined in
`behaviors/relationship-events.md` (their triggers, feed surfacing, and NPC participation).
SHARED_DANGER and BETRAYAL are the two branches of one **peril-response** moment (an ally at
`NEAR_DEATH`); KINDNESS and RIVALRY_SPARK are town-life drivers. The delta magnitudes are canonical
**here**; that spec references these rows. Driver deltas are applied through the same
`applyStrengthShift` path and recorded in edge `history` like every other shift. (SHARED_DANGER is
**additive** to the routine co-quest `+8`, not a replacement — it fires only on a genuine peril
moment.)

**Edges are symmetric, so each driver moves the bond by one delta** (`graph[A][B].strength ===
graph[B][A].strength` is a hard invariant). The "who feels it more" asymmetry these drivers carry
does not live in a directional edge strength — it lives in **per-actor surfaces**: the saved side
gets a `SAVED_BY` history token (→ `OWES` belief, `thoughts/beliefs.md`); the betrayed side gets a
`BETRAYED_BY` token (→ `DISTRUSTS`) while the betrayer gets none; and a KINDNESS gives the
**recipient** a larger mood lift than the giver. The single symmetric edge delta is the shared bond
change; the tokens/beliefs/mood carry the felt asymmetry.

### Edge history and drift indicator

Every strength shift is recorded on the edge as a `history` entry `{tick, kind, delta}` (written by
`applyStrengthShift`). This log is the source for the **drift indicator** shown on the
character-detail relationship row (`screens/character-detail.md`), the quiet channel for ambient
shifts that never reach the feed (`behaviors/relationship-events.md#surfacing`):

- **Trend** — net sum of `delta` over the last 7 in-game days (168 ticks): `> +TREND_EPS` →
  warming, `< −TREND_EPS` → cooling, otherwise steady. `TREND_EPS` is a small constant that keeps a
  single stray `±1` from reading as a trend.
- **Most-recent cause** — the `kind` of the latest history entry, mapped to a short human label
  (e.g. `SEPARATION_DECAY` → "drifted apart", a kindness → "an act of kindness"). Never a raw token.

The indicator is **derived on read** from `history`; no separate trend state is stored. This keeps
sub-threshold drift legible without emitting a feed line per shift.

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

The simulation context carries `lastSharedActivity: LastSharedActivity` (keyed by sorted pair id `"A-B"`), updated by the quest and social event systems when two adventurers share an activity.

Applies at each day tick to edges where neither adventurer has been on a shared quest, social event, or interaction in the past 14 days:
- Decay: −1 per day until strength reaches 0 (no decay below 0 from separation alone — enemies do not become friends through distance).
- Edges at `STRANGER` strength (−10 to +10) are not decayed further.

### NPC actors (Tier A)

Notable NPC ids are first-class graph nodes. Adventurer↔NPC edges use the **same** strength
range, type thresholds, threshold events, and long-separation decay as adventurer↔adventurer
edges — a notable NPC can become an ACQUAINTANCE, FRIEND, RIVAL, or TRUSTED_COMPANION. Two
differences only, both because NPCs are not full adventurers (see `behaviors/npc-system.md`):

- **Co-quest deltas never apply** to an edge whose endpoint is an NPC (NPCs do not quest). Only
  social-outcome deltas, DEFEND/HESITATE-style deltas (if an NPC is ever in a scene), and decay
  apply.
- NPCs do not die or depart by default, so their edges are not frozen by death/retirement unless
  a scenario scripts the NPC's removal — in which case they freeze exactly like a dead
  adventurer's edge (below).

Edges between two NPCs are not maintained (no NPC↔NPC relationships in scope).

### Dead and retired adventurers

Edges involving dead or retired adventurers are preserved on surviving adventurers. They do not decay (the relationship is frozen in memory). They are displayed in the character detail panel with a `[deceased]` or `[departed]` annotation.

## Validation

- `graph[A][B].strength === graph[B][A].strength` after any update.
- Strength 71 → type `TRUSTED_COMPANION`. Strength −51 → type `ENEMY`.
- Crossing from `ACQUAINTANCE` to `FRIEND` fires exactly one `FRIENDSHIP_FORMED` event.
- 14 days of no shared activity on a `FRIEND`-strength edge reduces strength by 14 points.
- Dead adventurer's edge on a surviving adventurer does not change after death.
- An adventurer↔notable-NPC edge crosses to FRIEND at strength ≥ 40 and fires one `FRIENDSHIP_FORMED` event, identical to an adventurer↔adventurer edge.
- A co-quest success delta is never applied to an edge whose endpoint is an NPC id.

## Principles

**Inherited:**
- [Every outcome has a narrative cause](../principles.md#every-outcome-has-a-narrative-cause) — threshold events are the mechanism by which relationship changes enter the narrative. Every meaningful relationship shift fires a typed event with a rendered string.
- [Emergence over control](../principles.md#emergence-over-control) — the player cannot directly set relationship strength. They can nudge it via divine touch (`REVEAL_SECRET`) and world seeding, but the graph evolves from adventurer actions.
