# Behavior: Departure System

## Rule

An adventurer who sustains `mood < 10` for 3 consecutive days enters a departure roll each day. If the roll succeeds, they retire permanently. Departed adventurers persist in history; their relationships remain on survivors.

## Applies To

- `packages/core/src/adventurers/DepartureSystem.ts`

## Details

### Departure trigger

Evaluated at each day tick for every `IDLE`, `RESTING`, or `SOCIALIZING` adventurer:
1. If `adventurer.mood < 10`: increment the adventurer's `despairStreak`.
2. If `adventurer.mood >= 10`: reset `despairStreak` to 0.
3. If `despairStreak >= 3`: roll departure.

`despairStreak` is stored on the adventurer object. It is reset only when mood rises above 10 — not when the adventurer goes on a quest or changes state.

**Adventurers on quests (`ON_QUEST`, `IN_DUNGEON`) do not roll departure,** regardless of mood. Their `despairStreak` does not increment. Low-mood adventurers may still be autonomous-assigned to quests while despairing if mood is not below 10 at assignment time; if mood drops below 10 mid-quest, the count is frozen until they return.

### Departure roll

Probability: `0.10 + (despairStreak - 3) * 0.05`, capped at 0.40.

| Days despairing | Departure probability |
|---|---|
| 3 | 10% |
| 4 | 15% |
| 5 | 20% |
| 6 | 25% |
| 10+ | 40% (cap) |

**`loyalty > 60` modifier:** `−0.10` to departure probability (loyal adventurers stay longer).

### On departure

1. Transition state to `RETIRED`.
2. Set `currentQuestId: null` (if somehow assigned, they withdraw; the quest continues short-handed or is cancelled — see quest system edge case handling).
3. Derive departure reason from the top 2 negative mood factors by magnitude. Stored as `departureReason: string` on the lifecycle event.
4. Fire `AdventurerDeparted` lifecycle event: `{ adventurerId, departureReason, topMoodFactors }`.
5. Render `renderedText`: `"{name} has left the guild. {departureReason}"` with narrative templates per top factor combination.

### Post-departure persistence

- The adventurer remains in `ctx.adventurers` with `state: RETIRED`.
- Their `RelationshipEdge` entries on surviving adventurers are preserved and annotated `[departed]`.
- Departed adventurers do not participate in quests, social events, or mood calculations.
- They appear in character history panels and in the event log.

### DI opportunity

When `despairStreak >= 3`, `decisionMomentSubscriber` fires a `DEPARTURE` decision moment (expiry: 12 ticks). The player may choose **MOOD_LIFT** (cost: 8 DI), which writes a `+0.30` shift to `ctx.pendingShifts[adventurerId]`.

`departureSubscriber` reads and **consumes** any `pendingShifts` entry for the adventurer before rolling departure. The effective departure probability is:

```
effectiveProb = max(0, computeDepartureProbability(adv) − pendingShift)
```

If `effectiveProb <= 0` the departure roll cannot succeed. The shift is removed from `pendingShifts` regardless of whether departure fires, so it applies exactly once per day tick.

## Validation

- An adventurer with `mood: 8` for exactly 2 days does not roll departure on day 2.
- An adventurer with `mood: 8` for 3 days rolls departure at 10% probability.
- An adventurer on a quest does not roll departure regardless of mood.
- `loyalty: 80` reduces departure probability by 0.10 compared to `loyalty: 30` at the same despairing day count.
- Retired adventurer's edges are preserved on surviving adventurers after retirement.
- `AdventurerDeparted` event has a non-empty `renderedText` with a contextual departure reason.
- A `pendingShift >= computeDepartureProbability(adv)` in `ctx.pendingShifts` prevents departure from firing entirely.
- After `departureSubscriber` runs, the consumed `pendingShift` is removed from `ctx.pendingShifts`.

## Principles

**Inherited:**
- [Permadeath is the weight; DI is the cost](../principles.md#permadeath-is-the-weight-di-is-the-cost) — retirement is near-permanent; DI intervention to prevent it is the designed escape valve. No automatic recovery.
- [Every outcome has a narrative cause](../principles.md#every-outcome-has-a-narrative-cause) — departure reason is derived from mood factors, not generic. "Left because of an argument" and "Left because of a dead companion's grief" are different rendered strings.
