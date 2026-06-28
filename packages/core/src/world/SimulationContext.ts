/**
 * SimulationContext — the root object threaded through every tick subscriber.
 *
 * Spec: specs/data-model.md#simulationcontext
 * Principle: specs/principles.md#seeded-determinism
 *
 * Every tick subscriber receives a SimulationContext and returns a NEW one
 * (immutable update pattern). The RNG is mutable (it advances state on each
 * call) but is never replaced or re-seeded mid-simulation.
 */
import { SeededRNG } from './SeededRNG.js';
import type { SimulationContext } from './types.js';

export type { SimulationContext } from './types.js';

/**
 * Factory — builds a fresh SimulationContext from a seed string.
 *
 * Defaults per spec:
 *   divineInfluence: 50
 *   worldTime: { tick: 0, day: 0, hour: 0 }
 *   All collections empty.
 *   scenario: null  (sandbox mode)
 */
export function createSimulationContext(seed: string): SimulationContext {
  return {
    worldTime: { tick: 0, day: 0, hour: 0 },
    rng: new SeededRNG(seed),
    adventurers: new Map(),
    relationships: new Map(),
    lastSharedActivity: {},
    questBoard: { available: [], active: [] },
    eventLog: [],
    pendingDecisions: [],
    divineInfluence: 50,
    activeRegions: new Map(),
    scenario: null,
    treasury: 0,
    reputation: 0,
  };
}
