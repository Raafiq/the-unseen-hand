import { describe, it, expect } from 'vitest';
import { SimulationLoop } from '../src/world/SimulationLoop.js';
import { createSimulationContext } from '../src/world/SimulationContext.js';
import type { SimulationContext } from '../src/world/types.js';

describe('SimulationLoop', () => {
  it('24 sequential step() calls advance world time from day 0 to day 1', () => {
    const ctx = createSimulationContext('loop-test');
    const loop = new SimulationLoop(ctx);
    for (let i = 0; i < 24; i++) loop.step();
    expect(loop.context.worldTime.day).toBe(1);
    expect(loop.context.worldTime.hour).toBe(0);
  });

  it('step() does not fire real-time intervals — callable synchronously', () => {
    const ctx = createSimulationContext('sync-test');
    const loop = new SimulationLoop(ctx);
    loop.step();
    expect(loop.context.worldTime.tick).toBe(1);
  });

  it('subscriber order is stable: A, B, C always run A → B → C', () => {
    const ctx = createSimulationContext('order-test');
    const loop = new SimulationLoop(ctx);
    const order: string[] = [];

    loop.register((c) => { order.push('A'); return c; });
    loop.register((c) => { order.push('B'); return c; });
    loop.register((c) => { order.push('C'); return c; });

    loop.step();
    expect(order).toEqual(['A', 'B', 'C']);

    // Verify stable across multiple ticks
    order.length = 0;
    loop.step();
    expect(order).toEqual(['A', 'B', 'C']);
  });

  it('each subscriber receives the output of the previous subscriber', () => {
    const ctx = createSimulationContext('chain-test');
    const loop = new SimulationLoop(ctx);

    loop.register((c) => ({ ...c, divineInfluence: 10 }));
    loop.register((c) => {
      // Should see divineInfluence set to 10 by the previous subscriber
      expect(c.divineInfluence).toBe(10);
      return { ...c, divineInfluence: 20 };
    });

    loop.step();
    expect(loop.context.divineInfluence).toBe(20);
  });

  it('same seed + same commands replays identically after stop() / start()', () => {
    const seed = 'replay-test';

    const ctx1 = createSimulationContext(seed);
    const loop1 = new SimulationLoop(ctx1);
    loop1.register((c) => ({ ...c, divineInfluence: c.rng.next() * 100 }));
    loop1.step();
    loop1.step();
    const snapshot1 = loop1.context.divineInfluence;

    // Same setup, stop then start (reset)
    const ctx2 = createSimulationContext(seed);
    const loop2 = new SimulationLoop(ctx2);
    loop2.register((c) => ({ ...c, divineInfluence: c.rng.next() * 100 }));
    loop2.start();
    loop2.stop();
    loop2.step();
    loop2.step();
    expect(loop2.context.divineInfluence).toBe(snapshot1);
  });

  it('the time subscriber always advances worldTime on each tick', () => {
    const ctx = createSimulationContext('time-advance');
    const loop = new SimulationLoop(ctx);
    loop.step();
    expect(loop.context.worldTime.tick).toBe(1);
    loop.step();
    expect(loop.context.worldTime.tick).toBe(2);
  });
});
