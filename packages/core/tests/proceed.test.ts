import { describe, it, expect, vi } from 'vitest';
import { SimulationLoop } from '../src/world/SimulationLoop.js';
import { createSimulationContext } from '../src/world/SimulationContext.js';
import { createScenario1Context } from '../src/scenarios/scenario1.js';
import type { WorldTime } from '../src/world/types.js';

describe('SimulationLoop.proceed', () => {
  it('one PROCEED from tick 0 advances worldTime one full cycle', () => {
    const loop = new SimulationLoop(createSimulationContext('proceed-1'));
    loop.proceed();
    expect(loop.context.worldTime).toMatchObject({
      tick: 8,
      day: 0,
      hour: 8,
      cycle: 'AFTERNOON',
    });
  });

  it('one PROCEED fires exactly 8 tick emissions', () => {
    const loop = new SimulationLoop(createSimulationContext('proceed-emit'));
    let ticks = 0;
    loop.register((c) => {
      ticks += 1;
      return c;
    });
    loop.proceed();
    expect(ticks).toBe(8);
  });

  it('three PROCEEDs from tick 0 land on day 1, morning', () => {
    const loop = new SimulationLoop(createSimulationContext('proceed-3'));
    loop.proceed();
    loop.proceed();
    loop.proceed();
    expect(loop.context.worldTime).toMatchObject({
      tick: 24,
      day: 1,
      hour: 0,
      cycle: 'MORNING',
    });
  });

  it('returns a digest covering exactly the 8 computed ticks, labelled with the computed cycle', () => {
    const loop = new SimulationLoop(createSimulationContext('proceed-digest'));
    const first = loop.proceed();
    expect(first).toEqual({ fromTick: 0, toTick: 8, day: 0, cycle: 'MORNING' });

    const third = (loop.proceed(), loop.proceed()); // second then third
    expect(third).toEqual({ fromTick: 16, toTick: 24, day: 0, cycle: 'NIGHT' });
  });

  it('halts between PROCEEDs — no ticks fire on an idle real-time span', () => {
    vi.useFakeTimers();
    try {
      const loop = new SimulationLoop(createSimulationContext('proceed-halt'));
      let ticks = 0;
      loop.register((c) => {
        ticks += 1;
        return c;
      });

      loop.proceed();
      expect(ticks).toBe(8);

      // The clock is command-driven: no interval should be scheduled, so letting a
      // large amount of real time pass must not advance the world at all.
      vi.advanceTimersByTime(60_000);
      expect(ticks).toBe(8);
      expect(loop.context.worldTime.tick).toBe(8);

      loop.proceed();
      expect(ticks).toBe(16);
    } finally {
      vi.useRealTimers();
    }
  });

  it('is deterministic — same seed + same PROCEED sequence yields identical time and events', () => {
    const run = () => {
      const loop = new SimulationLoop(createScenario1Context('proceed-determinism'));
      const times: WorldTime[] = [];
      for (let i = 0; i < 6; i++) {
        loop.proceed();
        times.push({ ...loop.context.worldTime });
      }
      return { times, events: loop.context.eventLog.map((e) => e.renderedText) };
    };

    const a = run();
    const b = run();
    expect(b.times).toEqual(a.times);
    expect(b.events).toEqual(a.events);
    // Sanity: the roster actually produced events, so this asserts something real.
    expect(a.events.length).toBeGreaterThan(0);
  });
});
