import { describe, it, expect } from 'vitest';
import { createSimulationContext } from '../src/world/SimulationContext.js';

describe('SimulationContext', () => {
  it('fresh context has divineInfluence === 50', () => {
    const ctx = createSimulationContext('seed-1');
    expect(ctx.divineInfluence).toBe(50);
  });

  it('fresh context has worldTime.tick === 0', () => {
    const ctx = createSimulationContext('seed-1');
    expect(ctx.worldTime.tick).toBe(0);
    expect(ctx.worldTime.day).toBe(0);
    expect(ctx.worldTime.hour).toBe(0);
  });

  it('fresh context has empty adventurers map', () => {
    const ctx = createSimulationContext('seed-1');
    expect(ctx.adventurers.size).toBe(0);
  });

  it('fresh context has empty eventLog', () => {
    const ctx = createSimulationContext('seed-1');
    expect(ctx.eventLog).toHaveLength(0);
  });

  it('fresh context has empty pendingDecisions', () => {
    const ctx = createSimulationContext('seed-1');
    expect(ctx.pendingDecisions).toHaveLength(0);
  });

  it('fresh context has null scenario', () => {
    const ctx = createSimulationContext('seed-1');
    expect(ctx.scenario).toBeNull();
  });

  it('two contexts from the same seed yield RNGs that produce the same next value', () => {
    const ctx1 = createSimulationContext('determinism-check');
    const ctx2 = createSimulationContext('determinism-check');

    const val1 = ctx1.rng.next();
    const val2 = ctx2.rng.next();

    expect(val1).toBe(val2);
  });

  it('two contexts from different seeds yield RNGs that produce different next values', () => {
    const ctx1 = createSimulationContext('seed-x');
    const ctx2 = createSimulationContext('seed-y');

    // Statistically certain to differ
    const seq1 = Array.from({ length: 5 }, () => ctx1.rng.next());
    const seq2 = Array.from({ length: 5 }, () => ctx2.rng.next());
    expect(seq1).not.toEqual(seq2);
  });

  it('RNG is carried by the context, not global state — two separate contexts do not share state', () => {
    const ctx1 = createSimulationContext('isolated');
    const ctx2 = createSimulationContext('isolated');

    // Advance ctx1's RNG three steps
    ctx1.rng.next();
    ctx1.rng.next();
    ctx1.rng.next();

    // ctx2 should still produce the same first value as a fresh instance
    const ctx3 = createSimulationContext('isolated');
    expect(ctx2.rng.next()).toBe(ctx3.rng.next());
  });
});
