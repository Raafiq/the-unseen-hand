import { describe, it, expect } from 'vitest';
import { diTrickleSubscriber, grantDI } from '../src/divine/DivineInfluence.js';
import { narrativeDistance, applyDivineShift } from '../src/divine/ProbabilityShifter.js';
import { createSimulationContext } from '../src/world/SimulationContext.js';
import type { SimulationContext } from '../src/world/types.js';

function makeCtx(overrides: Partial<SimulationContext> = {}): SimulationContext {
  return {
    ...createSimulationContext({ seed: 42 }),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// narrativeDistance + applyDivineShift
// ---------------------------------------------------------------------------

describe('narrativeDistance', () => {
  it('computes |target - natural| / natural', () => {
    // |0.50 - 0.05| / 0.05 = 9.0
    expect(narrativeDistance(0.05, 0.50)).toBeCloseTo(9.0);
  });

  it('clamps to maximum of 10', () => {
    expect(narrativeDistance(0.01, 1.0)).toBe(10);
  });

  it('low push from 0.50 to 0.60 has low distance', () => {
    const d = narrativeDistance(0.50, 0.60);
    expect(d).toBeCloseTo(0.20);
  });
});

describe('applyDivineShift', () => {
  it('shifts base probability upward when DI is spent', () => {
    expect(applyDivineShift(0.30, 25)).toBeGreaterThan(0.30);
  });

  it('matches spec example: base 0.30, di 25 → ~0.40', () => {
    // shift = 25/100 * 0.40 = 0.10 → 0.30 + 0.10 = 0.40
    expect(applyDivineShift(0.30, 25)).toBeCloseTo(0.40);
  });

  it('clamps result at 1.0 when shift would exceed it', () => {
    expect(applyDivineShift(0.90, 100)).toBeLessThanOrEqual(1.0);
  });

  it('returns base unchanged when 0 DI spent', () => {
    expect(applyDivineShift(0.50, 0)).toBeCloseTo(0.50);
  });
});

// ---------------------------------------------------------------------------
// grantDI
// ---------------------------------------------------------------------------

describe('grantDI', () => {
  it('adds DI and emits DI_GAINED event', () => {
    const ctx = makeCtx({ divineInfluence: 50 });
    const next = grantDI(ctx, 5);
    expect(next.divineInfluence).toBe(55);
    const divineEvents = next.eventLog.filter(e => e.kind === 'DIVINE' && e.subtype === 'DI_GAINED');
    expect(divineEvents).toHaveLength(1);
    expect((divineEvents[0] as { diDelta: number }).diDelta).toBe(5);
  });

  it('clamps at 100 and records the actual diDelta', () => {
    const ctx = makeCtx({ divineInfluence: 98 });
    const next = grantDI(ctx, 5);
    expect(next.divineInfluence).toBe(100);
    expect((next.eventLog[0] as { diDelta: number }).diDelta).toBe(2);
  });

  it('does nothing when already at 100', () => {
    const ctx = makeCtx({ divineInfluence: 100 });
    const next = grantDI(ctx, 5);
    expect(next.divineInfluence).toBe(100);
    expect(next.eventLog).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// diTrickleSubscriber
// ---------------------------------------------------------------------------

describe('diTrickleSubscriber', () => {
  it('adds +1 DI on a day tick (hour === 0)', () => {
    const ctx = makeCtx({ divineInfluence: 50, worldTime: { tick: 24, day: 1, hour: 0 } });
    const next = diTrickleSubscriber(ctx, 1);
    expect(next.divineInfluence).toBe(51);
  });

  it('does not fire on non-day ticks', () => {
    const ctx = makeCtx({ divineInfluence: 50, worldTime: { tick: 7, day: 0, hour: 7 } });
    const next = diTrickleSubscriber(ctx, 1);
    expect(next.divineInfluence).toBe(50);
  });

  it('clamps DI at 100 when already at cap', () => {
    const ctx = makeCtx({ divineInfluence: 100, worldTime: { tick: 24, day: 1, hour: 0 } });
    const next = diTrickleSubscriber(ctx, 1);
    expect(next.divineInfluence).toBe(100);
  });

  it('emits DI_GAINED event on day tick', () => {
    const ctx = makeCtx({ divineInfluence: 50, worldTime: { tick: 24, day: 1, hour: 0 } });
    const next = diTrickleSubscriber(ctx, 1);
    const divineEvents = next.eventLog.filter(e => e.kind === 'DIVINE' && e.subtype === 'DI_GAINED');
    expect(divineEvents).toHaveLength(1);
    expect((divineEvents[0] as { diDelta: number }).diDelta).toBe(1);
  });
});
