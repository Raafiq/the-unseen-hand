# Behavior: Decision Moment System

## Rule

The simulation surfaces moments of player attention as `DecisionMoment` objects — structured choices with DI costs and probability shifts. Moments expire automatically; expired moments resolve as "let fate decide" (option 0). The player is never required to act.

## Applies To

- `packages/core/src/events/DecisionMomentDetector.ts`
- `packages/core/src/divine/ChoiceResolver.ts`
- `Simulation.dispatch({ type: 'CHOOSE_OPTION', ... })`

## Details

### Detector

`DecisionMomentDetector` runs as a tick subscriber (last in the ordered list). It scans the current `SimulationContext` for conditions that warrant player attention.

Moments become active *during* a `PROCEED` (the detector runs on each of the cycle's 8 ticks) but are **surfaced to the player at the cycle boundary**, when `PROCEED` returns and the reader renders — never mid-cycle (`behaviors/world-clock.md`, `screens/app-shell.md`). They do not gate `PROCEED`: the player may resolve a moment or proceed and let it ride toward expiry.

A moment is surfaced if **any** of the following are true:
- An adventurer has a `NEAR_DEATH` combat beat this tick and the quest outcome is death.
- A relationship edge is crossing from `FRIEND` to `RIVAL` or `ENEMY` this tick.
- A `QUEST_DROUGHT` world event fires this tick.
- The current scenario's fail condition is within 3 days of triggering.
- A `PersonalGoal` achievement is imminent (all milestones complete, one quest away).
- An adventurer's `despairingDayCount` triggers the departure roll this tick.
- A party selection decision moment is warranted (see `behaviors/quest-system.md`).

**Rate limiting:** At most 3 active `DecisionMoment` objects may exist in `ctx.pendingDecisions` at once. If the limit is reached, new triggers are suppressed (lowest-priority triggers dropped first). Priority order: death > relationship collapse > departure > scenario-critical > scenario-goal > party selection > other.

### Decision moment structure

```typescript
type DecisionMoment = {
  id: string;
  tick: number;
  situationText: string;
  options: DecisionOption[];  // option 0 is always "Let fate decide"
  expiresAt: number;
};
```

Option 0 is always:
```typescript
{
  label: "Let fate decide",
  description: "Take no action. DI refund may apply if outcome is unfavourable.",
  diCost: 0,
  probabilityShift: 0,
  narrativeDistanceLabel: 'LOW'
}
```

### Option construction

For a death-imminent moment:
- `situationText`: `"{name} is moments from death in the dungeon."` (templated)
- Option 1: shift survival probability toward 0.50. `diCost` = `narrativeDistance(deathProbability, 0.50) * BASE_COST`.
- Option 2: shift survival probability toward 0.80. Higher cost.
- Option 3 (if funds permit): shift to 0.95. Highest cost.
- `narrativeDistanceLabel` calculated from the `narrativeDistance` function output: < 1.5 = `LOW`, 1.5–4 = `MODERATE`, > 4 = `EXTREME`.

For a relationship-collapse moment:
- Option 1: `SEED_EVENT` a `RUMOUR` to distract both adventurers (DI cost: seeding cost).
- Option 2: `DIVINE_TOUCH` the lower-loyalty adventurer with `COURAGE_BLESS`.

For a departure moment (see `behaviors/departure-system.md`): options to `MOOD_LIFT` the despairing adventurer.

### Choice resolution

`dispatch({ type: 'CHOOSE_OPTION', decisionId, optionIndex })`:

1. Look up `decisionId` in `ctx.pendingDecisions`. Return `{ ok: false, error: 'DECISION_NOT_FOUND' }` if absent or expired.
2. Check DI ≥ option's `diCost`. Return `{ ok: false, error: 'INSUFFICIENT_DI' }` if not.
3. Deduct DI. Apply the option's `probabilityShift` to the relevant in-flight computation.
4. Remove the `DecisionMoment` from `ctx.pendingDecisions`.
5. Fire `DivineInterventionEvent` with `subtype: 'OPTION_CHOSEN'`.

### Expiry

Each tick, the detector removes moments where `tick >= expiresAt`. Expired moments:
- State is removed from `ctx.pendingDecisions`.
- A `DivineInterventionEvent` fires with `subtype: 'OPTION_CHOSEN'` and option index 0 (fate decides).
- If the underlying event was a death and the player hadn't acted: grant +10 DI (see `behaviors/divine-influence.md`).

### Expiry windows

Windows are in **ticks**; one cycle is 8 ticks (`behaviors/world-clock.md`). A window spans a
number of cycles' worth of `PROCEED`s — the moment surfaces at the boundary where it arose and
expires once that many ticks have advanced.

| Trigger type | Expiry window | ≈ cycles |
|---|---|---|
| Death imminent | 12 ticks | ~1.5 cycles |
| Relationship collapse | 24 ticks | 3 cycles (1 day) |
| Departure roll | 12 ticks | ~1.5 cycles |
| Scenario-critical | 48 ticks | 6 cycles (2 days) |
| Party selection | 6 ticks | within the current cycle |
| Other | 24 ticks | 3 cycles (1 day) |

There are no real-time equivalents — the world is turn-paced, so a window's clock advances only
when the player issues a `PROCEED`. The UI displays the countdown in **ticks / cycles
remaining**, not wall-clock time.

## Validation

- At most 3 active decision moments at any tick.
- Expired moments auto-resolve to option 0 at expiry tick.
- `CHOOSE_OPTION` with an expired decision id returns `{ ok: false, error: 'DECISION_NOT_FOUND' }`.
- A death-imminent moment has option 0 with `diCost: 0` and `probabilityShift: 0`.
- Option 1 cost in a death moment at `naturalProbability: 0.05` is higher than at `naturalProbability: 0.50`.
- Player receives +10 DI when a death-imminent moment expires unresolved.

## Principles

**Inherited:**
- [Autonomy of outcomes](../principles.md#autonomy-of-outcomes-player-controlled-tempo) — the simulation does not wait for a `CHOOSE_OPTION` command. Expiry is the default. The player is a god who may or may not notice.
- [Emergence over control](../principles.md#emergence-over-control) — decision moments are invitations, not requirements. A player who ignores all moments still has a valid (and DI-rich) playthrough.
- [DI bankruptcy is a valid player state](../principles.md#di-bankruptcy-is-a-valid-intended-player-state) — the DI check at choice resolution must be real. An empty DI bar means all non-free options are unavailable.
