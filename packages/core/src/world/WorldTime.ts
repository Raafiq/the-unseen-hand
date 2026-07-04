/**
 * WorldTime derivations.
 *
 * Spec: specs/behaviors/world-clock.md#cycles
 * A day (24 ticks) is partitioned into three cycles of 8 ticks each. `cycle` is a
 * pure function of `hour` — the single source for that derivation, used at every
 * WorldTime write site so the field can never drift from `hour`.
 */
import type { Cycle } from './types.js';

/** Derive the cycle from an in-game hour (0–23). Pure; no clock state. */
export function cycleOf(hour: number): Cycle {
  return hour < 8 ? 'MORNING' : hour < 16 ? 'AFTERNOON' : 'NIGHT';
}
