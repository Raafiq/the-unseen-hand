# Behavior: Divine Influence

## Rule

Divine Influence (DI) is the player's primary resource. It trickles passively, bursts from meaningful world events, and is spent on interventions. All costs are calculated before the roll — DI is deducted at the moment of intervention, not at outcome resolution. Running out is a valid (intended) player state.

## Applies To

- `packages/core/src/divine/DivineInfluence.ts`
- `packages/core/src/divine/NarrativeDistance.ts`
- `packages/core/src/divine/ProbabilityShifter.ts`
- `Simulation.dispatch` for all DI-spending commands

## Details

### DI range and storage

- Range: 0–100. Stored as `divineInfluence: number` in `SimulationContext`.
- Clamped to [0, 100] after each change.
- Changes are recorded as `DivineInterventionEvent` entries (`subtype: 'DI_GAINED'` or `'DI_SPENT'`).

### Passive trickle

- `+1 DI` per in-game day (every 24 ticks).
- Applied at the day tick, after all other day-tick processing.
- This is a **floor guarantee** — the player can never be fully locked out of DI indefinitely.

### DI burst sources

| Event | DI granted |
|---|---|
| Quest completion (any success) | +5 |
| Relationship milestone (`FRIENDSHIP_FORMED`, `TRUSTED_COMPANION_BOND_FORMED`) | +8 |
| Personal goal achievement | +12 |
| Death not prevented (player had an active `NEAR_DEATH` decision moment and let it expire) | +10 |
| Scenario objective completed | +25 |

Bursts are granted at the tick the event fires. Stacking is allowed — two quests completing in the same tick grant +10.

### Narrative distance

`narrativeDistance(naturalProbability: number, targetProbability: number): number`

Measures how far the player is pushing against fate:
- `distance = |targetProbability - naturalProbability| / naturalProbability`
- Clamped to [0, 10].
- At `naturalProbability = 0.05` (5% chance of survival), pushing to `targetProbability = 0.50` has a very high distance.
- At `naturalProbability = 0.50`, pushing to `0.60` has a low distance.

This function is the input to DI cost calculations for all interventions.

### DI cost formula

`diCost = baseCost × narrativeDistance`

Base costs by intervention type:

| Intervention | Base cost |
|---|---|
| `DIVINE_TOUCH` (minor, e.g. `MOOD_LIFT`) | 5 |
| `DIVINE_TOUCH` (major, e.g. `MARK_FOR_DEATH`) | 15 |
| `SEED_EVENT` (mild, e.g. `TRAVELLING_MERCHANT`) | 8 |
| `SEED_EVENT` (severe, e.g. `PLAGUE`) | 20 |
| `SHIFT_DIFFICULTY` (per 1 unit) | 3 |
| Choosing a decision moment option | per option's `diCost` field (pre-calculated) |

`CHOOSE_OPTION` with option 0 ("Let fate decide") always costs 0.

### Probability shifter

`applyDivineShift(baseProbability: number, diSpent: number, ctx: SimulationContext): number`

- Shift magnitude: `diSpent / 100 * MAX_SHIFT` where `MAX_SHIFT = 0.40`.
- Shift direction: always toward the "more favourable" outcome (success for quests, survival for death rolls).
- Returns clamped float in [0, 1].
- Example: `baseProbability: 0.30`, `diSpent: 25` → `shiftedProbability ≈ 0.40`.
- The simulation rolls against this shifted probability. The player does not choose the outcome.

### Insufficient DI

- `dispatch` returns `{ ok: false, error: 'INSUFFICIENT_DI' }` if current DI < command's diCost.
- No DI is deducted; no effect is applied.
- The UI greys out interventions that would exceed current DI (see `screens/character-detail.md`, `screens/choice-card.md`).

### Death prevention

When an adventurer dies (quest outcome), the system checks:
- Is there a `NEAR_DEATH` decision moment that the player was shown and let expire? → grant +10 DI.
- Was the player shown a death-imminent decision moment and chose "Let fate decide"? → grant +10 DI.
- Was the death entirely unannounced (no decision moment was surfaced)? → grant +5 DI.

This ensures letting the world breathe always generates DI, whether or not a moment was surfaced.

## Validation

- Passive trickle fires once per day tick, not per hour tick.
- `applyDivineShift(0.30, 25, ctx)` returns a value > 0.30 and ≤ 0.70.
- `applyDivineShift(0.30, 100, ctx)` returns a value ≤ 1.0 (clamped).
- `dispatch({ type: 'DIVINE_TOUCH', ... diCost: 30 })` on a context with `divineInfluence: 20` returns `{ ok: false, error: 'INSUFFICIENT_DI' }`.
- DI does not go below 0 or above 100.
- A quest death where a `NEAR_DEATH` decision moment expired grants +10 DI.

## Principles

**Inherited:**
- [DI bankruptcy is a valid (intended) player state](../principles.md#di-bankruptcy-is-a-valid-intended-player-state) — the system must not protect the player from running out. The passive trickle guarantees recovery, not solvency.
- [Probability shift, not outcome override](../principles.md#probability-shift-not-outcome-override) — `applyDivineShift` returns a shifted probability; the roll is always taken after.
- [Emergence over control](../principles.md#emergence-over-control) — DI is the mechanism by which emergence is preserved under player pressure. Spending it to control one thing means less to spend elsewhere.
