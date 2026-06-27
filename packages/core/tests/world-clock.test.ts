import { describe, it, expect } from 'vitest';
import { WorldClock } from '../src/world/WorldClock.js';

describe('WorldClock', () => {
  it('24 step() calls from tick 0 produce day: 1, hour: 0', () => {
    const clock = new WorldClock();
    for (let i = 0; i < 24; i++) {
      clock.step();
    }
    const t = clock.worldTime;
    expect(t.tick).toBe(24);
    expect(t.day).toBe(1);
    expect(t.hour).toBe(0);
  });

  it('step() is deterministic — same sequence after reset', () => {
    const clock = new WorldClock();
    clock.step();
    clock.step();
    const t1 = { ...clock.worldTime };

    const clock2 = new WorldClock();
    clock2.step();
    clock2.step();
    expect(clock2.worldTime).toEqual(t1);
  });

  it('pausing and resuming does not shift worldTime.tick', () => {
    const clock = new WorldClock();
    clock.step();
    clock.step();
    const tickBefore = clock.worldTime.tick;
    clock.pause();
    clock.resume();
    expect(clock.worldTime.tick).toBe(tickBefore);
  });

  it('step() does not use real-time intervals — callable synchronously', () => {
    // If step() relied on setInterval it would not advance synchronously.
    const clock = new WorldClock();
    clock.step();
    expect(clock.worldTime.tick).toBe(1);
  });

  it('setSpeed changes the real-time interval rate (readable via currentSpeed)', () => {
    const clock = new WorldClock();
    expect(clock.currentSpeed).toBe(1);
    clock.setSpeed(5);
    expect(clock.currentSpeed).toBe(5);
    clock.setSpeed(20);
    expect(clock.currentSpeed).toBe(20);
  });

  it('tick listeners are called on each step', () => {
    const clock = new WorldClock();
    const ticks: number[] = [];
    clock.onTick((wt) => ticks.push(wt.tick));
    clock.step();
    clock.step();
    clock.step();
    expect(ticks).toEqual([1, 2, 3]);
  });

  it('day boundary occurs when hour transitions from 23 to 0', () => {
    const clock = new WorldClock();
    for (let i = 0; i < 23; i++) clock.step();
    expect(clock.worldTime.hour).toBe(23);
    clock.step();
    expect(clock.worldTime.hour).toBe(0);
    expect(clock.worldTime.day).toBe(1);
  });
});
