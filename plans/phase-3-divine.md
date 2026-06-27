---
status: planned
depends: [phase-2-autonomous-world]
specs:
  - specs/behaviors/divine-influence.md
  - specs/behaviors/decision-moments.md
  - specs/behaviors/divine-tools.md
issues: []
---

# Plan: Phase 3 — Divine Intervention

## Scope

Add the player-facing intervention layer: DI resource (trickle + bursts), `narrativeDistance`,
`applyDivineShift` (clamped float, roll still taken), `DecisionMomentDetector` (≤3 active,
priority, expiry → fate), and `Simulation.dispatch` for the four DI commands with pre-spend
validation returning `{ok: false, error}`.

**Out of scope:** scenario engine, scenario-gated unlock of regions, UI.

## Implements

- **`specs/behaviors/divine-influence.md`** — DI resource, passive trickle, burst events,
  `applyDivineShift`.
- **`specs/behaviors/decision-moments.md`** — `DecisionMomentDetector`, ≤3 active moments,
  priority, expiry-to-fate.
- **`specs/behaviors/divine-tools.md`** — `DIVINE_TOUCH`, `SEED_EVENT`, `SHIFT_DIFFICULTY`,
  `CHOOSE_OPTION` dispatch, pre-spend validation.

## Approach

Build in TDD order:

1. **DI resource + trickle/bursts** — `divineInfluence` on `SimulationContext`, passive trickle
   per spec rate, burst events from scenario milestones.
2. **`narrativeDistance` + `applyDivineShift`** — clamped float; roll still taken afterward.
3. **`DecisionMomentDetector`** — ≤3 active, priority ordering, expiry auto-resolves to option
   0 (fate), fires DI reward per spec.
4. **`Simulation.dispatch`** — handles `CHOOSE_OPTION` / `DIVINE_TOUCH` / `SEED_EVENT` /
   `SHIFT_DIFFICULTY`; validates DI balance before spend; returns `{ok, error}`.

## Validation

- [ ] `applyDivineShift` returns a clamped float; the simulation still rolls against it (never returns a guaranteed outcome).
- [ ] Tests assert the shifted probability value, not the rolled result.
- [ ] At most 3 `DecisionMoment` entries active in `pendingDecisions` at any time.
- [ ] An expired decision moment auto-resolves to option 0 and grants the specified DI reward.
- [ ] `Simulation.dispatch('CHOOSE_OPTION', ...)` with insufficient DI returns `{ok: false, error}`.
- [ ] `Simulation.dispatch('DIVINE_TOUCH', ...)` deducts DI before applying effect.
- [ ] Passive DI trickle increments `divineInfluence` each tick per spec rate.
- [ ] DI cannot exceed 100 (clamped on trickle and burst).
- [ ] All DI changes recorded as `DivineInterventionEvent` on the event log.
- [ ] Letting a decision moment expire grants the correct DI reward per spec.
- [ ] `/audit-spec-drift` shows no Phase-3 spec gap.

## Risks / unknowns

- **"Still rolls"** — `applyDivineShift` must not short-circuit the RNG roll; tests that mock
  the roll to verify the shift value without consuming the RNG must be careful not to break
  downstream determinism.
- **Decision moment priority** — spec mandates priority ordering; clarify tie-breaking rule
  (arrival order) before coding `DecisionMomentDetector`.

## Notes

(Populated at closeout.)

## Follow-ups

(Populated at closeout.)
