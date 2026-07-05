/**
 * WorldClock — advances world time in discrete ticks.
 *
 * Spec: specs/behaviors/world-clock.md
 * 1 tick = 1 in-game hour. 24 ticks = 1 in-game day.
 * The clock is turn-paced: `step()` advances exactly one tick synchronously — there is no
 * real-time interval, no speed multiplier, and no paused state. Advancement is driven by
 * `SimulationLoop.proceed()` (a `PROCEED` command composes 8 `step()`-equivalents); the world
 * is simply halted between cycles.
 */
import type { WorldTime } from './types.js';
import { cycleOf } from './WorldTime.js';

export class WorldClock {
  private _worldTime: WorldTime = { tick: 0, day: 0, hour: 0, cycle: 'MORNING' };
  private _listeners: Array<(wt: WorldTime) => void> = [];

  get worldTime(): WorldTime {
    return this._worldTime;
  }

  onTick(listener: (wt: WorldTime) => void): void {
    this._listeners.push(listener);
  }

  step(): void {
    const tick = this._worldTime.tick + 1;
    const hour = tick % 24;
    this._worldTime = {
      tick,
      day: Math.floor(tick / 24),
      hour,
      cycle: cycleOf(hour),
    };
    for (const l of this._listeners) l(this._worldTime);
  }
}
