---
status: done
depends: []
specs:
  - specs/behaviors/departure-system.md
---

# P7a — Departure shift wiring

## Scope

Wire `pendingShifts` consumption into `departureSubscriber` so the DEPARTURE MOOD_LIFT
decision moment has mechanical effect. Currently `departureSubscriber` ignores
`ctx.pendingShifts` entirely; the player's DI spend does nothing.

## Implements

- `specs/behaviors/departure-system.md` §"DI opportunity" — `pendingShifts` consumed before
  departure roll; `effectiveProb = max(0, prob − shift)`.

## Approach

1. In `departureSubscriber`, before the `rng.next()` roll:
   - Read `updatedCtx.pendingShifts.get(id) ?? 0` as `diBoost`
   - If non-zero: copy-on-write delete it from `pendingShifts`, update `updatedCtx`
   - Compute `effectiveProb = Math.max(0, prob - diBoost)`
2. Use `effectiveProb` in the roll instead of `prob`.
3. Tests in `packages/core/tests/social-departure.test.ts`:
   - Shift large enough to zero out probability → departure never fires
   - Shift is consumed from `ctx.pendingShifts` after subscriber runs
   - Shift of 0 (absent key) → unchanged behavior

## Validation

- [x] `pendingShifts` entry >= departure probability → departure does not fire
- [x] `pendingShifts` entry is removed from context after subscriber runs regardless of departure outcome
- [x] No shift present → departure behavior unchanged from pre-wiring
- [x] `pnpm --filter @ugs/core test` passes (431 tests green)
- [x] `tsc --noEmit` clean

## Risks / unknowns

None — pure ctx transform, no new subscribers or event types.

## Notes

`departureSubscriber` now reads `pendingShifts.get(id)`, computes `effectiveProb = max(0, prob - diBoost)`, deletes the key copy-on-write, then rolls against `effectiveProb`. Two new tests confirm: large shift blocks departure across 50 seeds, and shift is always consumed.

Spec updated to replace the old post-roll DI mechanism description with the actual pre-roll pendingShift behavior implemented in P4d.

## Follow-ups

- Choice-card E2E test (Playwright) — confirm `ChoiceCard` renders when `pendingDecisions` is populated (see HANDOFF §2).
