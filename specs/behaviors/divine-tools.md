# Behavior: Divine Tools (Freeform Interventions)

## Rule

Beyond decision moments, the player may initiate freeform divine interventions at any time via the character detail panel or world panel. These spend DI and produce immediate, bounded effects on individual adventurers or regions. All costs are validated before dispatch.

## Applies To

- `packages/core/src/divine/DivineTools.ts`
- `Simulation.dispatch({ type: 'DIVINE_TOUCH', ... })`
- `Simulation.dispatch({ type: 'SEED_EVENT', ... })`
- `Simulation.dispatch({ type: 'SHIFT_DIFFICULTY', ... })`

## Details

### Divine Touch — individual adventurer effects

`dispatch({ type: 'DIVINE_TOUCH', adventurerId, effect: DivineEffect, diCost })`:

| DivineEffect | Description | Base DI cost | Narrative distance multiplier |
|---|---|---|---|
| `COURAGE_BLESS` | +20 effective courage for next quest only (contextual modifier, not permanent) | 5 | Low — blessing |
| `LUCK_CURSE` | −30% to the adventurer's next quest success probability | 8 | Moderate — curse |
| `MOOD_LIFT` | Add `DIVINE_TOUCH` mood factor (+25, decay 0.20) immediately | 5 | Low if mood > 50; higher if mood < 25 |
| `SEND_DREAM` | Add a vague `HistoryEvent` of kind `SEND_DREAM` — may shift behaviour probabilities in Phase 4 | 10 | Moderate |
| `REVEAL_SECRET` | Add a `BREAKTHROUGH` social outcome between this adventurer and a randomly selected `ACQUAINTANCE` | 12 | Moderate |
| `MARK_FOR_DEATH` | −40% to adventurer's next death roll resistance (makes death more likely) | 15 | High — intervention against nature |

**Narrative distance multiplier:** Applied when the effect pushes strongly against the adventurer's current state. `MOOD_LIFT` on an adventurer with `mood: 5` costs more than `MOOD_LIFT` on an adventurer with `mood: 60`.

**Effects are not guaranteed outcomes.** `COURAGE_BLESS` adds a contextual modifier; the roll still happens. `LUCK_CURSE` shifts probability; the adventurer can still succeed.

### Targeting restrictions

- Cannot target `DEAD` or `RETIRED` adventurers.
- `LUCK_CURSE` and `MARK_FOR_DEATH` cannot target the same adventurer twice within 7 in-game days.
- `REVEAL_SECRET` requires the adventurer to have at least one `ACQUAINTANCE` edge. Returns `{ ok: false, error: 'NO_VALID_TARGET' }` if not.

### World seeding

`dispatch({ type: 'SEED_EVENT', regionId, eventType: WorldEventType, diCost })`:

| WorldEventType | Description | Base DI cost | Duration (ticks) |
|---|---|---|---|
| `STORM` | Reduces region quest board seeding by 50% for duration | 10 | 72 (3 days) |
| `PLAGUE` | All quests from region have +15% injury chance; mood factor `−15` to guild members with quests there | 20 | 168 (7 days) |
| `WINDFALL` | Quest rewards in region increased by 50%; mood factor `+15` to adventurers returning from region | 8 | 72 |
| `MONSTER_SURGE` | Region difficulty +2 for duration; harder quests seeded | 12 | 168 |
| `TRAVELLING_MERCHANT` | Seeds one special `FETCH` quest with double reward; fires `TRAVELLING_MERCHANT` world event | 8 | 24 (one-time) |
| `RUMOUR` | Increases social interaction probability by +0.15 for all guild members for 3 days | 6 | 72 |

An active world event of the same type cannot be seeded in the same region until the prior one expires.

### Difficulty shift

`dispatch({ type: 'SHIFT_DIFFICULTY', regionId, delta, diCost })`:

- `delta`: integer in [−3, +3] per dispatch.
- `diCost`: `|delta| * 3`.
- Region difficulty clamped to [1, 10] after shift.
- No cooldown. Can be called repeatedly to stack shifts up to the region difficulty cap.

## Validation

- `DIVINE_TOUCH` on a `DEAD` adventurer returns `{ ok: false, error: 'INVALID_TARGET' }`.
- `LUCK_CURSE` twice within 7 days on the same adventurer: second dispatch returns `{ ok: false, error: 'COOLDOWN_ACTIVE' }`.
- `SEED_EVENT` with an active event of same type in same region returns `{ ok: false, error: 'EVENT_ALREADY_ACTIVE' }`.
- `SHIFT_DIFFICULTY` with `delta: 2` costs 6 DI.
- All effects produce a `DivineInterventionEvent` in the event log.

## Principles

**Inherited:**
- [Emergence over control](../principles.md#emergence-over-control) — divine tools shift context, not outcomes. `COURAGE_BLESS` makes bravery more likely; it does not make the adventurer brave.
- [Probability shift, not outcome override](../principles.md#probability-shift-not-outcome-override) — every effect is a modifier on a future roll, never a guarantee.
- [DI bankruptcy is a valid player state](../principles.md#di-bankruptcy-is-a-valid-intended-player-state) — freeform tools must deduct DI before application and reject on insufficient DI. No partial effects.
